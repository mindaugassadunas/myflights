import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Dev-mode user helper. MyFlights is multi-user in prod (anyone with Google
 * gets their own log) but local development without NEXTAUTH_SECRET still
 * needs *some* identity to scope flight rows by. We materialise a single
 * dev user keyed off OWNER_EMAIL (or `dev@localhost` if unset) so the
 * stack runs end-to-end without OAuth set up.
 *
 * In prod, requireOwner() reads the real NextAuth session and never
 * touches this code path.
 */

export const OWNER_EMAIL = (process.env.OWNER_EMAIL ?? "dev@localhost").toLowerCase().trim();

let cachedDevUserId: string | null = null;

export async function getOwnerId(): Promise<string> {
  if (cachedDevUserId) return cachedDevUserId;
  const user = await prisma.user.upsert({
    where: { email: OWNER_EMAIL },
    update: {},
    create: { email: OWNER_EMAIL, name: "Dev user" },
    select: { id: true },
  });
  cachedDevUserId = user.id;
  return user.id;
}

export function isAuthDisabled(): boolean {
  return !process.env.NEXTAUTH_SECRET;
}
