import { NextResponse, after } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireOwner, ApiError } from "@/lib/session";
import {
  BadInput,
  FlightInput,
  createFlight,
  fetchTrack,
  flightInclude,
  resolveFlight,
} from "@/lib/flights";

export const dynamic = "force-dynamic";

const ListParams = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
  status: z.enum(["pending", "resolved", "no_coverage", "ambiguous", "failed"]).optional(),
});

export async function GET(req: Request) {
  let owner;
  try {
    owner = await requireOwner();
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const url = new URL(req.url);
  const parsed = ListParams.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_query", issues: parsed.error.issues }, { status: 400 });
  }
  const { limit, cursor, status } = parsed.data;
  const flights = await prisma.flight.findMany({
    where: { userId: owner.id, ...(status ? { resolutionStatus: status } : {}) },
    orderBy: [{ date: "desc" }, { firstSeenUtc: "desc" }, { createdAt: "desc" }],
    take: limit + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    include: flightInclude,
  });
  const hasMore = flights.length > limit;
  const items = hasMore ? flights.slice(0, limit) : flights;
  return NextResponse.json({
    items,
    nextCursor: hasMore ? items[items.length - 1].id : null,
  });
}

export async function POST(req: Request) {
  let owner;
  try {
    owner = await requireOwner();
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const body = await req.json().catch(() => null);
  const parsed = FlightInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  }

  let flight;
  try {
    flight = await createFlight(owner.id, parsed.data);
  } catch (err) {
    if (err instanceof BadInput) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  // Resolve against OpenSky after the response is sent. The flight row is
  // already created with status `pending`, distanceKm + durationMin
  // (haversine/estimate) and AeroDataBox metadata — that's already enough
  // for the detail page to render usefully. Resolution + track fetch are
  // best-effort: when they finish, the row flips to `resolved` or
  // `no_coverage` and a fresh page load shows the new status.
  //
  // Done with `after()` (Next.js 15) so the serverless function stays
  // alive until the background work completes even though the response
  // has already shipped.
  after(async () => {
    try {
      const resolved = await resolveFlight(flight);
      if (resolved.resolutionStatus === "resolved") {
        await fetchTrack(resolved.id);
      }
    } catch (err) {
      console.error("[flights] background resolve failed", err);
    }
  });

  return NextResponse.json(flight, { status: 201 });
}
