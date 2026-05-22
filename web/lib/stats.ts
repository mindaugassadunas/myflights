import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Server helpers for the /stats and /records sections.
 *
 * Heavy aggregates are kept in raw SQL (faster, fewer round-trips); per-row
 * record lookups use the Prisma client for type safety.
 */

// ---------------------------------------------------------------------------
// Yearly totals
// ---------------------------------------------------------------------------

export type YearTotal = {
  year: number;
  flights: number;
  distanceKm: number;
  hours: number;
  co2Kg: number;
};

export async function getYearlyTotals(userId: string): Promise<YearTotal[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      year: number;
      flights: bigint;
      distance_km: number | null;
      duration_min: bigint | null;
      co2_kg: number | null;
    }>
  >`
    SELECT
      EXTRACT(YEAR FROM "date")::int AS year,
      COUNT(*)::bigint AS flights,
      COALESCE(SUM("distanceKm"), 0) AS distance_km,
      COALESCE(SUM("durationMin"), 0)::bigint AS duration_min,
      COALESCE(SUM("co2Kg"), 0) AS co2_kg
    FROM "flights"
    WHERE "userId" = ${userId}
      AND "resolutionStatus" IN ('resolved', 'no_coverage')
    GROUP BY EXTRACT(YEAR FROM "date")
    ORDER BY year ASC
  `;

  return rows.map((r) => ({
    year: r.year,
    flights: Number(r.flights),
    distanceKm: Number(r.distance_km ?? 0),
    hours: Number(r.duration_min ?? 0) / 60,
    co2Kg: Number(r.co2_kg ?? 0),
  }));
}

// ---------------------------------------------------------------------------
// Records & superlatives
// ---------------------------------------------------------------------------

export type FlightRecordRef = {
  flightId: string;
  label: string;
  detail: string;
  metric: string; // formatted value, e.g. "5,860 km"
};

export type RecordSet = {
  longestDistance: FlightRecordRef | null;
  shortestDistance: FlightRecordRef | null;
  busiestYear: { year: number; count: number; label: string } | null;
  longestGapDays: { days: number; from: string; to: string } | null;
};

export type TopList = {
  route: { dep: string; arr: string; count: number } | null;
  airline: { name: string; iata: string | null; icao: string | null; count: number } | null;
  aircraftType: { code: string; manufacturer: string | null; model: string | null; count: number } | null;
};

/**
 * "Most flown" trio — top route, top airline, top aircraft type.
 * Each is the leader by count of flights in the user's log. Returns null
 * entries when there's no data (e.g., no aircraft type ever set).
 */
export async function getTopList(userId: string): Promise<TopList> {
  const [routeRows, airlineRows, typeRows] = await Promise.all([
    prisma.$queryRaw<Array<{ dep: string; arr: string; count: bigint }>>`
      SELECT COALESCE(d.iata, d.icao) AS dep,
             COALESCE(a.iata, a.icao) AS arr,
             COUNT(*)::bigint AS count
      FROM "flights" f
      JOIN "airports" d ON d.id = f."depAirportId"
      JOIN "airports" a ON a.id = f."arrAirportId"
      WHERE f."userId" = ${userId}
        AND f."resolutionStatus" IN ('resolved', 'no_coverage')
      GROUP BY dep, arr
      ORDER BY count DESC
      LIMIT 1
    `,
    prisma.$queryRaw<Array<{ name: string; iata: string | null; icao: string | null; count: bigint }>>`
      SELECT a.name, a.iata, a.icao, COUNT(*)::bigint AS count
      FROM "flights" f
      JOIN "airlines" a ON a.id = f."airlineId"
      WHERE f."userId" = ${userId}
        AND f."resolutionStatus" IN ('resolved', 'no_coverage')
      GROUP BY a.id
      ORDER BY count DESC
      LIMIT 1
    `,
    prisma.$queryRaw<Array<{ code: string; manufacturer: string | null; model: string | null; count: bigint }>>`
      SELECT t."icaoCode" AS code,
             t.manufacturer,
             t.model,
             COUNT(*)::bigint AS count
      FROM "flights" f
      JOIN "aircraft_types" t ON t.id = f."aircraftTypeId"
      WHERE f."userId" = ${userId}
        AND f."resolutionStatus" IN ('resolved', 'no_coverage')
      GROUP BY t.id
      ORDER BY count DESC
      LIMIT 1
    `,
  ]);

  return {
    route: routeRows[0]
      ? { dep: routeRows[0].dep, arr: routeRows[0].arr, count: Number(routeRows[0].count) }
      : null,
    airline: airlineRows[0]
      ? {
          name: airlineRows[0].name,
          iata: airlineRows[0].iata,
          icao: airlineRows[0].icao,
          count: Number(airlineRows[0].count),
        }
      : null,
    aircraftType: typeRows[0]
      ? {
          code: typeRows[0].code,
          manufacturer: typeRows[0].manufacturer,
          model: typeRows[0].model,
          count: Number(typeRows[0].count),
        }
      : null,
  };
}

export async function getRecords(userId: string): Promise<RecordSet> {
  const where = {
    userId,
    resolutionStatus: { in: ["resolved" as const, "no_coverage" as const] },
  };

  const [longest, shortest, byYear, gapRow] = await Promise.all([
    prisma.flight.findFirst({
      where: { ...where, distanceKm: { not: null, gt: 0 } },
      orderBy: { distanceKm: "desc" },
      include: { depAirport: true, arrAirport: true },
    }),
    prisma.flight.findFirst({
      where: { ...where, distanceKm: { not: null, gt: 0 } },
      orderBy: { distanceKm: "asc" },
      include: { depAirport: true, arrAirport: true },
    }),
    prisma.$queryRaw<Array<{ year: number; count: bigint }>>`
      SELECT EXTRACT(YEAR FROM "date")::int AS year, COUNT(*)::bigint AS count
      FROM "flights"
      WHERE "userId" = ${userId}
        AND "resolutionStatus" IN ('resolved', 'no_coverage')
      GROUP BY year
      ORDER BY count DESC, year DESC
      LIMIT 1
    `,
    prisma.$queryRaw<Array<{ days: number; from_date: Date; to_date: Date }>>`
      WITH ordered AS (
        SELECT "date",
               LAG("date") OVER (ORDER BY "date") AS prev_date
        FROM "flights"
        WHERE "userId" = ${userId}
          AND "resolutionStatus" IN ('resolved', 'no_coverage')
      )
      SELECT EXTRACT(DAY FROM ("date" - prev_date))::int AS days,
             prev_date AS from_date,
             "date"   AS to_date
      FROM ordered
      WHERE prev_date IS NOT NULL
      ORDER BY ("date" - prev_date) DESC
      LIMIT 1
    `,
  ]);

  const route = (f: { depAirport: { iata: string | null; icao: string | null }; arrAirport: { iata: string | null; icao: string | null } }) =>
    `${f.depAirport.iata ?? f.depAirport.icao} → ${f.arrAirport.iata ?? f.arrAirport.icao}`;

  return {
    longestDistance: longest
      ? {
          flightId: longest.id,
          label: "Longest by distance",
          detail: route(longest),
          metric: `${Math.round(longest.distanceKm!).toLocaleString()} km`,
        }
      : null,
    shortestDistance: shortest
      ? {
          flightId: shortest.id,
          label: "Shortest by distance",
          detail: route(shortest),
          metric: `${Math.round(shortest.distanceKm!).toLocaleString()} km`,
        }
      : null,
    busiestYear: byYear[0]
      ? {
          year: byYear[0].year,
          count: Number(byYear[0].count),
          label: `${Number(byYear[0].count)} flights in ${byYear[0].year}`,
        }
      : null,
    longestGapDays: gapRow[0]
      ? {
          days: gapRow[0].days,
          from: gapRow[0].from_date.toISOString().slice(0, 10),
          to: gapRow[0].to_date.toISOString().slice(0, 10),
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Equivalents
// ---------------------------------------------------------------------------

export type Equivalent = { label: string; value: string };

export function getEquivalents(distanceKm: number, co2Kg: number): Equivalent[] {
  const out: Equivalent[] = [];

  // Earth's circumference at the equator ≈ 40,075 km.
  if (distanceKm > 0) {
    const laps = distanceKm / 40075;
    out.push({
      label: "Times around Earth",
      value: laps < 1 ? laps.toFixed(2) : laps.toFixed(1),
    });
  }

  // EU average car emits ~190 g CO₂/km (2024 official figure).
  if (co2Kg > 0) {
    const carKm = (co2Kg / 0.190);
    out.push({
      label: "Equivalent car · km",
      value: Math.round(carKm).toLocaleString(),
    });
  }

  // World per-capita emissions ≈ 4.7 t CO₂ / year (Our World in Data 2023).
  if (co2Kg > 0) {
    const citizenYears = co2Kg / 4700;
    out.push({
      label: "Avg citizen-years of footprint",
      value: citizenYears < 1 ? citizenYears.toFixed(2) : citizenYears.toFixed(1),
    });
  }

  // A mature tree sequesters ~22 kg CO₂/year. Tonnes/22 → tree-years to offset.
  if (co2Kg > 0) {
    const treeYears = co2Kg / 22;
    out.push({
      label: "Tree-years to offset",
      value: Math.round(treeYears).toLocaleString(),
    });
  }

  return out;
}
