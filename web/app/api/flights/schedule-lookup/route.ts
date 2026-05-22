import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner, ApiError } from "@/lib/session";
import { findAirportByCode } from "@/lib/airports";
import { aloftApi, AloftApiError } from "@/lib/aloft-api";

export const dynamic = "force-dynamic";

const Body = z.object({
  flightNumber: z.string().trim().min(3).max(10),
  date: z.iso.date(),
});

export async function POST(req: Request) {
  try {
    await requireOwner();
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  let result;
  try {
    result = await aloftApi.scheduleLookup({
      flight_number: parsed.data.flightNumber.toUpperCase().replace(/\s+/g, ""),
      date: parsed.data.date,
    });
  } catch (err) {
    if (err instanceof AloftApiError) {
      // Map FastAPI's reason codes to a stable web-facing shape. The UI
      // shows "couldn't find this flight — enter route manually" on
      // not_found and "schedule lookup unavailable" on the rest.
      return NextResponse.json(
        { error: err.reason, detail: err.detail },
        { status: err.status },
      );
    }
    throw err;
  }

  // Resolve the ICAO/IATA codes back to internal airport rows so the form
  // can drop them straight into AirportInput state. If our seed table is
  // missing the airport we still return the raw codes — the UI falls back
  // to the manual-route step in that case.
  const [dep, arr] = await Promise.all([
    pickAirport(result.dep_airport_icao, result.dep_airport_iata),
    pickAirport(result.arr_airport_icao, result.arr_airport_iata),
  ]);

  return NextResponse.json({
    flightNumber: result.flight_number,
    callsign: result.callsign,
    airlineIata: result.airline_iata,
    airlineIcao: result.airline_icao,
    depAirport: dep,
    arrAirport: arr,
    aircraftModel: result.aircraft_model,
    aircraftRegistration: result.aircraft_registration,
    scheduledDepUtc: result.scheduled_dep_utc,
    scheduledArrUtc: result.scheduled_arr_utc,
  });
}

async function pickAirport(icao: string | null, iata: string | null) {
  if (icao) {
    const row = await findAirportByCode(icao);
    if (row) return row;
  }
  if (iata) {
    const row = await findAirportByCode(iata);
    if (row) return row;
  }
  return null;
}
