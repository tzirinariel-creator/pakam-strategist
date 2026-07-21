import { describe, it, expect } from "vitest";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

// The demo email must be set BEFORE importing the tRPC stack so the env-driven
// guard sees it. isDemoEmail reads process.env at call time, but we set it here
// up-front to keep the whole module consistent.
const DEMO_EMAIL = "demo@pakamon.dev";
process.env.NEXT_PUBLIC_DEMO_USER_EMAIL = DEMO_EMAIL;

import {
  createTRPCRouter,
  createCallerFactory,
  protectedProcedure,
} from "../init";
import { isDemoEmail } from "../demo";

// ───────────────────────────────────────────────────────────────────────────
// A minimal router built on the REAL protectedProcedure, so we exercise the
// actual enforceAuth middleware (which holds the demo read-only guard) rather
// than a reimplementation. One query (read) + one mutation (write).
// ───────────────────────────────────────────────────────────────────────────
const testRouter = createTRPCRouter({
  read: protectedProcedure.query(() => ({ ok: true as const })),
  write: protectedProcedure
    .input(z.object({ value: z.string() }).optional())
    .mutation(() => ({ ok: true as const })),
});

const createCaller = createCallerFactory(testRouter);

// Fake db whose user.findUnique returns a row with the given email — the
// enforceAuth middleware matches the demo account by this loaded email.
function makeCaller(email: string, supabaseId = "sb-test") {
  const db = {
    user: {
      findUnique: async () => ({
        id: "user-test",
        supabaseId,
        email,
        role: "user",
      }),
      create: async () => ({
        id: "user-test",
        supabaseId,
        email,
        role: "user",
      }),
    },
  };

  return createCaller({
    db: db as never,
    userId: supabaseId,
    session: { user: { id: supabaseId, email } } as never,
    supabase: {} as never,
    headers: new Headers(),
    loaders: undefined,
  });
}

describe("isDemoEmail", () => {
  it("matches the configured demo email case/space-insensitively", () => {
    expect(isDemoEmail(DEMO_EMAIL)).toBe(true);
    expect(isDemoEmail("  DEMO@Pakamon.DEV ")).toBe(true);
  });

  it("rejects non-demo and empty emails", () => {
    expect(isDemoEmail("real@student.example")).toBe(false);
    expect(isDemoEmail(null)).toBe(false);
    expect(isDemoEmail(undefined)).toBe(false);
    expect(isDemoEmail("")).toBe(false);
  });
});

describe("demo account is read-only (enforceAuth guard)", () => {
  it("BLOCKS mutations for the demo user with a FORBIDDEN TRPCError", async () => {
    const caller = makeCaller(DEMO_EMAIL);
    await expect(caller.write({ value: "x" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    // The message is client-displayable Hebrew copy.
    await expect(caller.write({ value: "x" })).rejects.toThrow(
      /חשבון הדגמה/,
    );
  });

  it("ALLOWS queries (reads) for the demo user", async () => {
    const caller = makeCaller(DEMO_EMAIL);
    await expect(caller.read()).resolves.toEqual({ ok: true });
  });
});

describe("real users are unaffected", () => {
  it("ALLOWS mutations for a normal user", async () => {
    const caller = makeCaller("real@student.example", "sb-real");
    await expect(caller.write({ value: "x" })).resolves.toEqual({ ok: true });
  });

  it("ALLOWS queries for a normal user", async () => {
    const caller = makeCaller("real@student.example", "sb-real");
    await expect(caller.read()).resolves.toEqual({ ok: true });
  });

  it("the thrown demo error is a real TRPCError instance", async () => {
    const caller = makeCaller(DEMO_EMAIL);
    await caller.write().catch((e) => {
      expect(e).toBeInstanceOf(TRPCError);
    });
  });
});
