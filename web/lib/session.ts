import "server-only";
import { getOwnerId, isAuthDisabled } from "@/lib/owner";

export type CurrentUser = { id: string; email: string };

/**
 * Returns the user for the active request, or null if not signed in.
 *
 * In dev mode (NEXTAUTH_SECRET unset) we materialise the OWNER_EMAIL user so
 * routes that need a user_id can work without sign-in. In prod, the request
 * must carry a valid NextAuth session for the owner.
 */
export async function requireOwner(): Promise<CurrentUser> {
  if (isAuthDisabled()) {
    // In auth-disabled dev mode the owner is identified by OWNER_EMAIL.
    // If that's not configured (typical first-deploy slip on Railway) we
    // treat it as unauthorized rather than leaking the raw config error,
    // so the page redirects to /login and the user gets a clean prompt.
    try {
      const id = await getOwnerId();
      return { id, email: process.env.OWNER_EMAIL ?? "" };
    } catch {
      throw new ApiError(401, "unauthorized");
    }
  }
  const { auth } = await import("@/lib/auth");
  const session = await auth();
  if (!session?.user?.id) {
    throw new ApiError(401, "unauthorized");
  }
  return { id: session.user.id, email: session.user.email ?? "" };
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * Page-level variant: like requireOwner(), but on auth failure it
 * redirects to /login instead of throwing. Use this from RSC pages so
 * the user lands on a clean sign-in screen rather than an error toast
 * or a Next.js error boundary. Re-throws non-auth errors so real
 * problems still surface.
 */
export async function requireOwnerOrRedirect(): Promise<CurrentUser> {
  try {
    return await requireOwner();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      const { redirect } = await import("next/navigation");
      redirect("/login");
    }
    throw err;
  }
}
