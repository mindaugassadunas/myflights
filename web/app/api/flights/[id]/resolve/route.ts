import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner, ApiError } from "@/lib/session";
import { fetchTrack, flightInclude, resolveFlight } from "@/lib/flights";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
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
    include: flightInclude,
  });
  if (!flight) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const resolved = await resolveFlight(flight);
  if (resolved.resolutionStatus === "resolved") {
    await fetchTrack(resolved.id);
  }

  const refreshed = await prisma.flight.findUnique({
    where: { id: resolved.id },
    include: { ...flightInclude, track: true },
  });
  return NextResponse.json(refreshed);
}
