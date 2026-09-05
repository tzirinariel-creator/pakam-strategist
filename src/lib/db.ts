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
        // DATABASE_URL points at the Supabase pooler in TRANSACTION mode
        // (port 6543 + ?pgbouncer=true), verified on prod 5.9. The connection
        // returns to the pooler at the end of every transaction, so a warm
        // Vercel machine no longer OWNS its connections the way it did in
        // session mode (port 5432, where the whole project shared
        // pool_size: 15 and max: 5 across three warm machines exhausted it and
        // took production down — EMAXCONNSESSION).
        //
        // max: 2 was the emergency ceiling for that outage, and it outlived its
        // reason. Vercel serves one request per machine, but ONE request here
        // is the dashboard's batch of six tRPC procedures resolving
        // concurrently: at max: 2 their queries queued two at a time against a
        // database ~280ms away, and the batch measured 3.0s on prod while its
        // slowest single procedure measured 1.9s. That 1.1s gap is pure
        // queueing — and it is what pushed a cold first load past the
        // dashboard's "loading is slow" screen Ariel kept hitting (5.9).
        //
        // 6 covers the widest fan-out a single request makes, with headroom.
        adapter: new PrismaPg({
          connectionString,
          connectionTimeoutMillis: 10_000,
          idleTimeoutMillis: 10_000,
          max: 6,
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
