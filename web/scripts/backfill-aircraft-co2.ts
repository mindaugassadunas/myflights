/**
 * One-off backfill for existing flights:
 *   1. Link `aircraftId` from `aircraft` via `icao24`
 *   2. Link `aircraftTypeId` from `aircraft_types` via `aircraft.typeCode`
 *   3. Compute and persist `co2Kg` via fuel-burn × RFI / seats
 *
 * Run after seeding sample flights or after a schema change that adds
 * the co2/type links.
 *
 *   cd web && npx tsx scripts/backfill-aircraft-co2.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function computeCo2Kg(
  durationMin: number,
  fuelBurnPerHourKg: number,
  seatsTypical: number,
  rfi = 2.7,
): number {
  if (!durationMin || !fuelBurnPerHourKg || !seatsTypical) return 0;
  const fuelKg = fuelBurnPerHourKg * (durationMin / 60);
  return (fuelKg * 3.16 * rfi) / seatsTypical;
}

async function main() {
  const flights = await prisma.flight.findMany({
    where: {
      icao24: { not: null },
      OR: [{ aircraftId: null }, { aircraftTypeId: null }, { co2Kg: null }],
    },
    select: { id: true, icao24: true, durationMin: true, aircraftId: true, aircraftTypeId: true },
  });

  console.log(`scanning ${flights.length} flights for backfill`);

  let updated = 0;
  for (const f of flights) {
    if (!f.icao24) continue;
    const aircraft = await prisma.aircraft.findUnique({
      where: { icao24: f.icao24 },
      select: { id: true, typeCode: true },
    });
    let aircraftTypeId: string | null = f.aircraftTypeId;
    let fuelBurnPerHourKg: number | null = null;
    let seatsTypical: number | null = null;

    if (aircraft?.typeCode) {
      const type = await prisma.aircraftType.findUnique({
        where: { icaoCode: aircraft.typeCode },
      });
      if (type) {
        aircraftTypeId = type.id;
        fuelBurnPerHourKg = type.fuelBurnPerHourKg;
        seatsTypical = type.seatsTypical;
      }
    }

    const co2Kg =
      fuelBurnPerHourKg && seatsTypical && f.durationMin
        ? computeCo2Kg(f.durationMin, fuelBurnPerHourKg, seatsTypical)
        : null;

    await prisma.flight.update({
      where: { id: f.id },
      data: {
        aircraftId: aircraft?.id ?? f.aircraftId,
        aircraftTypeId: aircraftTypeId ?? f.aircraftTypeId,
        co2Kg,
      },
    });
    updated += 1;
  }

  console.log(`updated ${updated} flights`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
