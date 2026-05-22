import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Airport lookups for autocomplete and form resolution. The seed table has
 * ~5k rows; we run a case-insensitive `contains` query bounded to 8 results.
 */

export type AirportHit = {
  id: string;
  icao: string | null;
  iata: string | null;
  name: string;
  municipality: string | null;
  isoCountry: string | null;
  latitude: number;
  longitude: number;
};

export async function searchAirports(query: string, limit = 8): Promise<AirportHit[]> {
  const q = query.trim();
  if (!q) return [];

  const upper = q.toUpperCase();
  // Exact code hit first (fast index) — IATA (3 chars) or ICAO (4 chars).
  if (q.length <= 4 && /^[A-Z]+$/i.test(q)) {
    const exact = await prisma.airport.findMany({
      where: { OR: [{ icao: upper }, { iata: upper }] },
      take: limit,
      select: airportSelect,
    });
    if (exact.length) return exact;
  }

  return prisma.airport.findMany({
    where: {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { municipality: { contains: q, mode: "insensitive" } },
        { icao: { startsWith: upper } },
        { iata: { startsWith: upper } },
      ],
    },
    take: limit,
    select: airportSelect,
    orderBy: { name: "asc" },
  });
}

export async function findAirportByCode(code: string): Promise<AirportHit | null> {
  const c = code.trim().toUpperCase();
  if (!c) return null;
  if (c.length === 4) {
    return prisma.airport.findFirst({ where: { icao: c }, select: airportSelect });
  }
  if (c.length === 3) {
    return prisma.airport.findFirst({ where: { iata: c }, select: airportSelect });
  }
  return prisma.airport.findFirst({
    where: { OR: [{ icao: c }, { iata: c }] },
    select: airportSelect,
  });
}

const airportSelect = {
  id: true,
  icao: true,
  iata: true,
  name: true,
  municipality: true,
  isoCountry: true,
  latitude: true,
  longitude: true,
} as const;
