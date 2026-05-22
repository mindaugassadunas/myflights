import { NextResponse } from "next/server";
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

  // Best-effort synchronous resolution. If OpenSky errors, the flight row
  // carries `resolutionStatus = 'failed' | 'no_coverage'` and a useful error
  // string — the UI shows that and a retry button.
  const resolved = await resolveFlight(flight);
  if (resolved.resolutionStatus === "resolved") {
    await fetchTrack(resolved.id);
  }
  const refreshed = await prisma.flight.findUnique({
    where: { id: resolved.id },
    include: flightInclude,
  });
  return NextResponse.json(refreshed, { status: 201 });
}
