import "server-only";
import { z } from "zod";
import type { Flight, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { findAirportByCode } from "@/lib/airports";
import { aloftApi, AloftApiError } from "@/lib/aloft-api";

/**
 * Business logic for creating and resolving flights. Routes stay thin —
 * they validate input, call into these helpers, and serialise.
 */

export const FlightInput = z.object({
  date: z.iso.date(), // "YYYY-MM-DD"
  depAirport: z.string().min(2).max(4),
  arrAirport: z.string().min(2).max(4),
  callsign: z.string().min(2).max(10).optional(),
  registration: z.string().min(2).max(12).optional(),
  aircraftTypeCode: z.string().min(2).max(4).optional(),
  seat: z.string().max(10).optional(),
  notes: z.string().max(2000).optional(),
  // Optional scheduled times from AeroDataBox. When supplied, we seed
  // durationMin from them at create time so the user sees a duration even
  // when OpenSky has no ADS-B coverage for the flight. Accept any ISO-ish
  // string — createFlight's `new Date()` parse + finite-check rejects
  // anything malformed without erroring the whole request.
  scheduledDepUtc: z.string().optional(),
  scheduledArrUtc: z.string().optional(),
}).refine(
  (v) => Boolean(v.callsign || v.registration),
  { message: "callsign or registration is required", path: ["callsign"] },
);

export type FlightInputType = z.infer<typeof FlightInput>;

export type FlightWithRelations = Prisma.FlightGetPayload<{
  include: {
    depAirport: true;
    arrAirport: true;
    airline: true;
    aircraftType: true;
    aircraft: true;
  };
}>;

export const flightInclude = {
  depAirport: true,
  arrAirport: true,
  airline: true,
  aircraftType: true,
  aircraft: true,
} satisfies Prisma.FlightInclude;

/**
 * Slim shape used by the Log list. Each `include: true` on flightInclude is
 * a follow-up `IN (...)` query; the card only reads a handful of columns, so
 * we project just those to keep the list fast.
 */
export const flightCardSelect = {
  id: true,
  date: true,
  callsign: true,
  durationMin: true,
  resolutionStatus: true,
  depAirport: { select: { iata: true, icao: true } },
  arrAirport: { select: { iata: true, icao: true } },
  aircraftType: { select: { icaoCode: true } },
} satisfies Prisma.FlightSelect;

export type FlightCardRow = Prisma.FlightGetPayload<{ select: typeof flightCardSelect }>;

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createFlight(
  userId: string,
  input: FlightInputType,
): Promise<FlightWithRelations> {
  const dep = await findAirportByCode(input.depAirport);
  if (!dep) throw new BadInput(`unknown departure airport: ${input.depAirport}`);
  const arr = await findAirportByCode(input.arrAirport);
  if (!arr) throw new BadInput(`unknown arrival airport: ${input.arrAirport}`);

  const aircraftType = input.aircraftTypeCode
    ? await prisma.aircraftType.findUnique({ where: { icaoCode: input.aircraftTypeCode.toUpperCase() } })
    : null;

  // Try to auto-link the airline. The input could be an ADS-B callsign
  // ("DLH892" → ICAO prefix "DLH") OR an IATA flight number
  // ("LH892" → IATA prefix "LH" → ICAO "DLH"). Try both.
  let airlineId: string | null = null;
  if (input.callsign) {
    const trimmed = input.callsign.trim().toUpperCase();
    const icaoPrefix = trimmed.slice(0, 3);
    let airline = await prisma.airline.findUnique({ where: { icao: icaoPrefix } });
    if (!airline) {
      const parsed = parseIataFlightNumber(trimmed);
      if (parsed) {
        airline = await prisma.airline.findFirst({ where: { iata: parsed.iata } });
      }
    }
    airlineId = airline?.id ?? null;
  }

  // Seed distance from haversine + duration from scheduled times so the
  // log/stats show usable numbers even when OpenSky has no ADS-B coverage
  // for this flight. resolveFlight refines both later when it succeeds,
  // and fetchTrack tightens distance further once we have waypoints.
  const distanceKm = haversineKm(
    dep.latitude, dep.longitude,
    arr.latitude, arr.longitude,
  );
  let durationMin: number | null = null;
  if (input.scheduledDepUtc && input.scheduledArrUtc) {
    const dep_t = new Date(input.scheduledDepUtc).getTime();
    const arr_t = new Date(input.scheduledArrUtc).getTime();
    if (Number.isFinite(dep_t) && Number.isFinite(arr_t) && arr_t > dep_t) {
      durationMin = Math.round((arr_t - dep_t) / 60000);
    }
  }
  // No real source? Fall back to a distance-based estimate so old or
  // manual-route flights still contribute to lifetime hours. OpenSky's
  // observed window overwrites this if resolution succeeds.
  if (durationMin === null && distanceKm > 0) {
    durationMin = estimateDurationMin(distanceKm);
  }

  return prisma.flight.create({
    data: {
      userId,
      date: new Date(`${input.date}T00:00:00Z`),
      callsign: input.callsign?.trim().toUpperCase() ?? null,
      registration: input.registration?.trim().toUpperCase() ?? null,
      depAirportId: dep.id,
      arrAirportId: arr.id,
      airlineId,
      aircraftTypeId: aircraftType?.id ?? null,
      seat: input.seat ?? null,
      notes: input.notes ?? null,
      distanceKm,
      durationMin,
      source: "manual",
    },
    include: flightInclude,
  });
}

// ---------------------------------------------------------------------------
// Resolve
// ---------------------------------------------------------------------------

export async function resolveFlight(flight: FlightWithRelations): Promise<FlightWithRelations> {
  // Mark in-flight so concurrent triggers (UI + cron) don't double-call OpenSky.
  await prisma.flight.update({
    where: { id: flight.id },
    data: {
      resolutionAttempts: { increment: 1 },
    },
  });

  const dateStr = flight.date.toISOString().slice(0, 10);

  try {
    const result = flight.callsign
      ? await resolveByFlightInput(flight, dateStr)
      : await aloftApi.resolveTail({
          registration: flight.registration!,
          date: dateStr,
        });

    // Link the aircraft row + chase the type through to aircraft_types so we
    // can compute CO₂ at resolve time. The aircraft DB is seeded from
    // OpenSky's aircraft registry; absent rows get null linkage (the
    // dashboards handle that).
    const aircraft = await prisma.aircraft.findUnique({ where: { icao24: result.icao24 } });
    let aircraftTypeId = flight.aircraftTypeId;
    let typeFuelBurn = flight.aircraftType?.fuelBurnPerHourKg ?? null;
    let typeSeats = flight.aircraftType?.seatsTypical ?? null;
    if (aircraft?.typeCode && !aircraftTypeId) {
      const aircraftType = await prisma.aircraftType.findUnique({
        where: { icaoCode: aircraft.typeCode },
      });
      if (aircraftType) {
        aircraftTypeId = aircraftType.id;
        typeFuelBurn = aircraftType.fuelBurnPerHourKg;
        typeSeats = aircraftType.seatsTypical;
      }
    }

    const firstSeen = new Date(result.first_seen_utc);
    const lastSeen = new Date(result.last_seen_utc);

    // Best-available numbers at resolution time: great-circle distance from
    // the booked endpoints and duration from the OpenSky time window. The
    // track fetcher refines `distanceKm` later if we actually get waypoints.
    const distanceKm = haversineKm(
      flight.depAirport.latitude, flight.depAirport.longitude,
      flight.arrAirport.latitude, flight.arrAirport.longitude,
    );
    const durationMin = Math.max(
      0,
      Math.round((lastSeen.getTime() - firstSeen.getTime()) / 60000),
    );

    const co2Kg = typeFuelBurn && typeSeats
      ? computeCo2Kg(durationMin, typeFuelBurn, typeSeats)
      : null;

    return await prisma.flight.update({
      where: { id: flight.id },
      data: {
        icao24: result.icao24,
        callsign: result.callsign ?? flight.callsign,
        firstSeenUtc: firstSeen,
        lastSeenUtc: lastSeen,
        distanceKm,
        durationMin,
        co2Kg,
        aircraftId: aircraft?.id ?? null,
        aircraftTypeId: aircraftTypeId ?? flight.aircraftTypeId,
        resolutionStatus: "resolved",
        resolutionError: null,
        resolvedAt: new Date(),
      },
      include: flightInclude,
    });
  } catch (err) {
    const status = mapResolutionStatus(err);
    const detail = err instanceof AloftApiError ? (err.detail ?? err.reason) : String(err);
    return prisma.flight.update({
      where: { id: flight.id },
      data: {
        resolutionStatus: status,
        resolutionError: detail.slice(0, 1000),
      },
      include: flightInclude,
    });
  }
}

export async function fetchTrack(flightId: string): Promise<void> {
  try {
    await aloftApi.fetchTrack(flightId);
  } catch (err) {
    // The FastAPI side already wrote a no_coverage or failed status if
    // applicable. We swallow here so a missing track doesn't break the API
    // response — the caller already has the flight row.
    if (err instanceof AloftApiError) return;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class BadInput extends Error {}

/**
 * Resolve a flight that was logged with a "what's on the ticket" identifier
 * — could be an IATA flight number (`BT961`, `LH892`) or an actual ADS-B
 * callsign (`BTI98T`, `DLH3KH`).
 *
 * Strategy:
 *   1. If the input parses as `[2 chars][1-5 digits]` AND we know the
 *      airline's ICAO from the seeded `airlines` table, try the smart path
 *      — query the route's departures and pick by callsign prefix. This
 *      works for recoded airlines (airBaltic, LH Group, KLM on some
 *      routes) that won't match by direct callsign.
 *   2. Otherwise (or if smart returns no_match), fall back to direct
 *      callsign matching — the existing behaviour, which handles airlines
 *      that don't recode (Ryanair, easyJet, SAS, LOT, Finnair) and also
 *      handles users who already know the real ADS-B callsign.
 */
async function resolveByFlightInput(
  flight: FlightWithRelations,
  dateStr: string,
) {
  const callsign = flight.callsign!;
  const parsed = parseIataFlightNumber(callsign);

  if (parsed) {
    const airline = await prisma.airline.findFirst({
      where: { iata: parsed.iata },
      select: { icao: true },
    });
    if (airline?.icao) {
      try {
        return await aloftApi.resolveSmart({
          airline_icao: airline.icao,
          flight_digits: parsed.digits,
          date: dateStr,
          dep_airport:
            flight.depAirport.icao ?? flight.depAirport.iata ?? "",
          arr_airport:
            flight.arrAirport.icao ?? flight.arrAirport.iata ?? undefined,
        });
      } catch (err) {
        if (!(err instanceof AloftApiError) || err.reason !== "no_match") {
          throw err;
        }
        // Smart path returned no_match — fall through to direct-callsign
        // matching, which works for airlines that don't recode.
      }
    }
  }

  return aloftApi.resolveCallsign({
    callsign,
    date: dateStr,
    dep_airport: flight.depAirport.icao ?? flight.depAirport.iata ?? undefined,
    arr_airport: flight.arrAirport.icao ?? flight.arrAirport.iata ?? undefined,
  });
}

/**
 * Parse an input that *might* be an IATA flight number. Returns null if it
 * doesn't look like one — letting the caller fall back to treating the
 * input as a direct ADS-B callsign.
 *
 * Accepts: `BT961`, `BT 961`, `bt961`, `KL1057`, `LH123A` (suffix letter).
 * Rejects: `BTI98T`, `DLH3KH` (those are 3-letter ICAO callsigns).
 */
export function parseIataFlightNumber(input: string): {
  iata: string;
  digits: string;
} | null {
  const cleaned = input.trim().toUpperCase().replace(/\s+/g, "");
  // IATA prefix: 2 chars (most are 2 letters; a few use letter+digit like
  // "B6" JetBlue, "U2" easyJet). Followed by 1-5 digits, optional single
  // suffix letter ("123A" for some Lufthansa routings).
  const m = /^([A-Z][A-Z0-9])(\d{1,5})[A-Z]?$/.exec(cleaned);
  if (!m) return null;
  return { iata: m[1], digits: m[2] };
}

function mapResolutionStatus(err: unknown): Flight["resolutionStatus"] {
  if (err instanceof AloftApiError && err.reason === "ambiguous") {
    return "ambiguous";
  }
  // Everything else — no OpenSky match, registration not in our DB,
  // upstream timeouts (typical for hyperscaler IPs hitting OpenSky),
  // 5xx errors, network failures, JSON parse errors — degrades to
  // `no_coverage`. The flight still has a usable distance, duration,
  // and great-circle line on the map; we just don't have an ADS-B
  // trace for it. Better than surfacing scary `ConnectTimeout` stack
  // traces under a "Failed" badge.
  return "no_coverage";
}

/**
 * Per-passenger CO₂ in kg. Uses the standard aviation-industry convention:
 *   fuel_kg × 3.16 (jet-A to CO₂ molar ratio) × RFI / seats_typical
 * RFI = 2.7 accounts for non-CO₂ radiative forcing (contrails, NOx).
 */
export function computeCo2Kg(
  durationMin: number,
  fuelBurnPerHourKg: number,
  seatsTypical: number,
  rfi = 2.7,
): number {
  if (!durationMin || !fuelBurnPerHourKg || !seatsTypical) return 0;
  const fuelKg = fuelBurnPerHourKg * (durationMin / 60);
  return (fuelKg * 3.16 * rfi) / seatsTypical;
}

/**
 * Estimate duration from great-circle distance when no schedule or
 * observation data exists. Uses a typical jetliner cruise of 800 km/h
 * with a flat 30-minute taxi/climb/descent buffer — within ~10% of real
 * block times for most commercial flights.
 */
export function estimateDurationMin(distanceKm: number): number {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 0;
  return Math.round((distanceKm / 800) * 60 + 30);
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371.0088;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dphi = toRad(lat2 - lat1);
  const dlam = toRad(lon2 - lon1);
  const a = Math.sin(dphi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlam / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
