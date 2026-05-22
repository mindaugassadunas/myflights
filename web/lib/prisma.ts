import { PrismaClient } from "@prisma/client";

/**
 * Prisma client singleton. Next.js hot-reload would otherwise spawn a new
 * client per HMR cycle and exhaust Neon's connection limit fast.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
