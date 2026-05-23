/**
 * One-off cleanup: any flight currently marked `failed` gets re-flagged as
 * `no_coverage`. Run once after deciding to stop surfacing OpenSky transport
 * errors to the user (hyperscaler-IP throttling, timeouts, etc.). The
 * resolutionError text is cleared too so the "Resolution issue" panel
 * doesn't render.
 *
 *   cd web && npx tsx scripts/backfill-failed-to-no-coverage.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.flight.updateMany({
    where: { resolutionStatus: "failed" },
    data: {
      resolutionStatus: "no_coverage",
      resolutionError: null,
    },
  });
  console.log(`flipped ${result.count} failed flights → no_coverage`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
