import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    // Return a client that will fail gracefully — allows build to succeed
    // without DB connection (useful for CI/build time)
    return new PrismaClient({
      adapter: new PrismaPg({ connectionString: "postgresql://placeholder:5432/placeholder" }),
    });
  }

  const adapter = new PrismaPg({
    connectionString,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    max: 5,
  });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
