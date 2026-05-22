/**
 * One-off backfill for existing flights:
 *   1. Fill `distanceKm` from haversine over the linked airports
 *      (every row where it's null — we always have airports).
 *   2. Fill `durationMin` with the cruise-speed estimate where the row
 *      doesn't already have one. We never clobber an existing duration
 *      (those came from OpenSky or AeroDataBox and are more accurate).
 *
 * The new createFlight already seeds both fields for fresh additions —
 * this catches the historic backlog.
 *
 *   cd web && npx tsx scripts/backfill-distance-duration.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Inlined from lib/flights.ts so this script can run outside Next.js
// (the lib module imports `server-only` which errors under plain tsx).
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371.0088;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dphi = toRad(lat2 - lat1);
  const dlam = toRad(lon2 - lon1);
  const a = Math.sin(dphi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlam / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function estimateDurationMin(distanceKm: number): number {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 0;
  return Math.round((distanceKm / 800) * 60 + 30);
}

async function main() {
  const flights = await prisma.flight.findMany({
    select: {
      id: true,
      distanceKm: true,
      durationMin: true,
      depAirport: { select: { latitude: true, longitude: true } },
      arrAirport: { select: { latitude: true, longitude: true } },
    },
  });

  let filledDist = 0;
  let filledDur = 0;
  for (const f of flights) {
    const update: { distanceKm?: number; durationMin?: number } = {};
    const dist = f.distanceKm ?? haversineKm(
      f.depAirport.latitude, f.depAirport.longitude,
      f.arrAirport.latitude, f.arrAirport.longitude,
    );
    if (f.distanceKm == null) {
      update.distanceKm = dist;
      filledDist += 1;
    }
    if (f.durationMin == null && dist > 0) {
      update.durationMin = estimateDurationMin(dist);
      filledDur += 1;
    }
    if (Object.keys(update).length > 0) {
      await prisma.flight.update({ where: { id: f.id }, data: update });
    }
  }

  console.log(
    `backfilled: ${filledDist} distance, ${filledDur} duration (over ${flights.length} flights)`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
