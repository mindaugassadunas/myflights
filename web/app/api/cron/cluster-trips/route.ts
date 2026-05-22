import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rebuildTripsForOwner } from "@/lib/trips";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Vercel Cron handler. Rebuilds trip clusters for every user (in this
 * single-tenant build, just the owner). Idempotent: re-running starts from
 * a clean slate by detaching `tripId` on user flights and deleting
 * auto-generated trips, then re-clustering.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = req.headers.get("authorization") ?? "";
    if (header !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  const users = await prisma.user.findMany({ select: { id: true } });
  const results: { userId: string; trips: number; flights: number }[] = [];
  for (const u of users) {
    const r = await rebuildTripsForOwner(u.id);
    results.push({ userId: u.id, ...r });
  }
  return NextResponse.json({ results });
}
