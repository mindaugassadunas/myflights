import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner, ApiError } from "@/lib/session";
import { aloftApi, AloftApiError } from "@/lib/aloft-api";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/flights/[id]/track
 *
 * If the track exists in our DB, return it from there. Otherwise call the
 * FastAPI fetcher (which also stores it) and return the result.
 */
export async function GET(_req: Request, { params }: Params) {
  let owner;
  try {
    owner = await requireOwner();
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id } = await params;
  const flight = await prisma.flight.findFirst({
    where: { id, userId: owner.id },
    include: { track: true },
  });
  if (!flight) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (flight.track) {
    return NextResponse.json({
      flight_id: flight.id,
      icao24: flight.icao24,
      point_count: flight.track.pointCount,
      distance_km: flight.distanceKm,
      duration_min: flight.durationMin,
      waypoints: flight.track.waypoints,
      gaps: flight.track.gaps,
      great_circle: flight.track.greatCircle,
      fetched_at: flight.track.fetchedAt.toISOString(),
    });
  }

  if (!flight.icao24 || !flight.firstSeenUtc) {
    return NextResponse.json(
      { error: "not_resolved", message: "flight has not been resolved yet" },
      { status: 409 },
    );
  }

  try {
    const result = await aloftApi.fetchTrack(flight.id);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AloftApiError) {
      return NextResponse.json(
        { error: err.reason, detail: err.detail },
        { status: err.status >= 400 && err.status < 600 ? err.status : 502 },
      );
    }
    throw err;
  }
}
