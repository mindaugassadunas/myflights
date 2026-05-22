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
    const id = await getOwnerId();
    return { id, email: process.env.OWNER_EMAIL ?? "" };
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
