import "server-only";
import { prisma } from "@/lib/prisma";
import { flightsToFeatureCollection } from "@/lib/geojson";

export async function getMapFlightFeatureCollection(userId: string) {
  const flights = await prisma.flight.findMany({
    where: {
      userId,
      resolutionStatus: { in: ["resolved", "no_coverage"] },
    },
    include: {
      depAirport: true,
      arrAirport: true,
      track: true,
      airline: true,
      aircraftType: true,
    },
    orderBy: { date: "desc" },
    take: 5000,
  });

  return flightsToFeatureCollection(flights);
}
