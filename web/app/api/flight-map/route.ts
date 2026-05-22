import { NextResponse } from "next/server";
import { requireOwner, ApiError } from "@/lib/session";
import { getMapFlightFeatureCollection } from "@/lib/map-flights";

export const dynamic = "force-dynamic";

export async function GET() {
  let owner;
  try {
    owner = await requireOwner();
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  return NextResponse.json(await getMapFlightFeatureCollection(owner.id));
}
