import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Single-tenant helper. Aloft is built for one user — the owner. In prod the
 * owner signs in via NextAuth and User is populated by the adapter. In dev
 * (no NEXTAUTH_SECRET), we materialise an owner row on demand so the API
 * can be exercised without going through Google OAuth.
 */

export const OWNER_EMAIL = (process.env.OWNER_EMAIL ?? "").toLowerCase().trim();

let cachedOwnerId: string | null = null;

export async function getOwnerId(): Promise<string> {
  if (cachedOwnerId) return cachedOwnerId;
  if (!OWNER_EMAIL) {
    throw new Error("OWNER_EMAIL is not configured");
  }
  const user = await prisma.user.upsert({
    where: { email: OWNER_EMAIL },
    update: {},
    create: { email: OWNER_EMAIL, name: "Owner" },
    select: { id: true },
  });
  cachedOwnerId = user.id;
  return user.id;
}

export function isAuthDisabled(): boolean {
  return !process.env.NEXTAUTH_SECRET;
}
