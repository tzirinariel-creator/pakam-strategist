import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { normalizeHebrewPunct } from "@/lib/hebrew-punct";

/**
 * Wrap ANY PrismaClient with the app's read-time result extensions. Standalone
 * scripts that build their own client (scripts/sync-local.ts) use this so they
 * see the same normalized data as the app.
 */
export function extendDb(base: PrismaClient) {
  return base.$extends({
    result: {
      course: {
        nameHe: {
          needs: { nameHe: true },
          compute: (course) => normalizeHebrewPunct(course.nameHe),
        },
      },
    },
  });
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;

  const base = connectionString
    ? new PrismaClient({
        // DATABASE_URL points at the Supabase pooler in SESSION mode (port
        // 5432), where the whole project shares pool_size: 15 and a connection
        // is held for as long as the client holds it. Every warm Vercel machine
        // therefore owns `max` connections outright. At max: 5, three warm
        // machines exhausted the pool and took production down (5.9, error
        // EMAXCONNSESSION) — a redeploy recycled the machines and restored it.
        // Vercel serves one request per machine at a time, so a small pool is
        // enough; 2 leaves room for the parallel queries inside a single
        // request while letting ~7 machines coexist instead of 3.
        // The real fix is transaction mode (port 6543 + ?pgbouncer=true), which
        // returns the connection after each transaction. That is an infra
        // change Ariel asked to make while awake — see docs/משימות-בקרה.md.
        adapter: new PrismaPg({
          connectionString,
          connectionTimeoutMillis: 10_000,
          idleTimeoutMillis: 10_000,
          max: 2,
        }),
        log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
      })
    : // No DATABASE_URL — a client that fails gracefully, so builds/CI succeed
      new PrismaClient({
        adapter: new PrismaPg({ connectionString: "postgresql://placeholder:5432/placeholder" }),
      });

  // Course names arrive from the ידיעון with ASCII quotes (מתמטיקה לפכ"מ);
  // the app's terminology standard is gershayim (פכ״מ). Normalizing at READ
  // time fixes every screen at one chokepoint without touching prod data.
  return extendDb(base);
}

/** The app-wide Prisma client type (extended — do NOT annotate as PrismaClient). */
export type Db = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as {
  prisma: Db | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
