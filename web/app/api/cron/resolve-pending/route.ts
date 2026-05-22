import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchTrack, flightInclude, resolveFlight } from "@/lib/flights";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Vercel Cron handler. Picks up pending or recently-failed flights and runs
 * them through the resolver. Capped at 5 per invocation so a single run
 * can't burn the daily OpenSky credit budget.
 *
 * In prod the route must be reachable by Vercel only; we check the
 * `Authorization` header for `Bearer ${CRON_SECRET}` if it's set.
 */

const BATCH = 5;
const MAX_ATTEMPTS = 3;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = req.headers.get("authorization") ?? "";
    if (header !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const candidates = await prisma.flight.findMany({
    where: {
      resolutionStatus: { in: ["pending", "failed"] },
      resolutionAttempts: { lt: MAX_ATTEMPTS },
    },
    orderBy: { createdAt: "asc" },
    take: BATCH,
    include: flightInclude,
  });

  const results: { id: string; status: string }[] = [];
  for (const flight of candidates) {
    const resolved = await resolveFlight(flight);
    if (resolved.resolutionStatus === "resolved") {
      await fetchTrack(resolved.id);
    }
    results.push({ id: resolved.id, status: resolved.resolutionStatus });
  }

  return NextResponse.json({ processed: results });
}
