import { NextResponse } from "next/server";
import { requireOwner, ApiError } from "@/lib/session";
import { searchAirports } from "@/lib/airports";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireOwner();
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const hits = await searchAirports(q, 8);
  return NextResponse.json({ results: hits });
}
