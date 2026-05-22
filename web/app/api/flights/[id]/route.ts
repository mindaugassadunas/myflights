import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner, ApiError } from "@/lib/session";
import { flightInclude } from "@/lib/flights";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

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
    include: { ...flightInclude, track: true },
  });
  if (!flight) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(flight);
}

export async function DELETE(_req: Request, { params }: Params) {
  let owner;
  try {
    owner = await requireOwner();
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id } = await params;
  const result = await prisma.flight.deleteMany({ where: { id, userId: owner.id } });
  if (result.count === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
