import "server-only";
import type { Aircraft, AircraftType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { flightInclude, type FlightWithRelations } from "@/lib/flights";

/**
 * Server helpers for the /aircraft index and /aircraft/[icao24] profile.
 *
 * Aircraft are first-class because the same airframe (`icao24`) can appear
 * across multiple resolved flights — that recurrence is the entire point of
 * the same-tail-detection feature.
 */

export type SameTailGroup = {
  icao24: string;
  registration: string | null;
  typeCode: string | null;
  manufacturer: string | null;
  model: string | null;
  operator: string | null;
  flightCount: number;
  firstDate: Date;
  lastDate: Date;
};

export async function sameTailGroups(userId: string): Promise<SameTailGroup[]> {
  // Aggregate in SQL: group by icao24 having count >= 2. We left-join the
  // aircraft + aircraft_types tables to pull static metadata once.
  const rows = await prisma.$queryRaw<
    Array<{
      icao24: string;
      flight_count: bigint;
      first_date: Date;
      last_date: Date;
      registration: string | null;
      typeCode: string | null;
      manufacturer: string | null;
      model: string | null;
      operator: string | null;
    }>
  >`
    SELECT
      f."icao24" AS icao24,
      COUNT(*)::bigint AS flight_count,
      MIN(f."date") AS first_date,
      MAX(f."date") AS last_date,
      a."registration",
      a."typeCode",
      at."manufacturer",
      at."model",
      a."operator"
    FROM "flights" f
    LEFT JOIN "aircraft" a ON a."icao24" = f."icao24"
    LEFT JOIN "aircraft_types" at ON at."icaoCode" = a."typeCode"
    WHERE f."userId" = ${userId}
      AND f."icao24" IS NOT NULL
    GROUP BY f."icao24", a."registration", a."typeCode", at."manufacturer", at."model", a."operator"
    HAVING COUNT(*) >= 2
    ORDER BY flight_count DESC, last_date DESC
  `;

  return rows.map((r) => ({
    icao24: r.icao24,
    registration: r.registration,
    typeCode: r.typeCode,
    manufacturer: r.manufacturer,
    model: r.model,
    operator: r.operator,
    flightCount: Number(r.flight_count),
    firstDate: r.first_date,
    lastDate: r.last_date,
  }));
}

export type AircraftProfile = {
  icao24: string;
  aircraft: (Aircraft & { type: AircraftType | null }) | null;
  flights: FlightWithRelations[];
};

export async function aircraftProfile(
  userId: string,
  icao24: string,
): Promise<AircraftProfile | null> {
  const normalised = icao24.toLowerCase().trim();
  if (!/^[0-9a-f]{6}$/.test(normalised)) return null;

  const [aircraft, flights] = await Promise.all([
    prisma.aircraft.findUnique({
      where: { icao24: normalised },
    }),
    prisma.flight.findMany({
      where: { userId, icao24: normalised },
      orderBy: { date: "desc" },
      include: flightInclude,
    }),
  ]);

  // We need the AircraftType. Fetch separately since Aircraft has no FK to
  // it any more (see migrations/drop_aircraft_typecode_fk).
  let type: AircraftType | null = null;
  if (aircraft?.typeCode) {
    type = await prisma.aircraftType.findUnique({
      where: { icaoCode: aircraft.typeCode },
    });
  }

  if (!aircraft && flights.length === 0) return null;

  return {
    icao24: normalised,
    aircraft: aircraft ? { ...aircraft, type } : null,
    flights,
  };
}
