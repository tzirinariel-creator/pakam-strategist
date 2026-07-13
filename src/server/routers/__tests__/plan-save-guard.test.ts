// QA 13.7 — savePlan must NEVER wipe the plan on an empty payload.
// The onboarding auto-save could send an empty courses[] (catalog not loaded →
// every planned courseId dropped); the old transaction deleted the
// PLANNED/IN_PROGRESS rows and wrote nothing, silently "succeeding" with a
// zero-course plan → empty dashboard + the 8x retry loop. The guard makes an
// empty save a NO-OP. This test locks that in.

import { describe, it, expect } from "vitest";
import { createCallerFactory } from "@/server/trpc/init";
import { planRouter } from "@/server/routers/plan";

const USER = { id: "user-1", supabaseId: "sb-1", email: "t@example.com" };
const COURSE_ID = "11111111-1111-4111-8111-111111111111";

function makeDb() {
  const calls = { deleteMany: 0, createMany: 0 };
  const tx = {
    userCourse: {
      deleteMany: async () => {
        calls.deleteMany++;
        return { count: 0 };
      },
      createMany: async ({ data }: { data: unknown[] }) => {
        calls.createMany++;
        return { count: data.length };
      },
    },
  };
  return {
    calls,
    user: { findUnique: async () => USER, upsert: async () => USER, create: async () => USER },
    userCourse: tx.userCourse,
    $transaction: async (fn: (t: typeof tx) => Promise<number>) => fn(tx),
  };
}

function makeCaller(db: ReturnType<typeof makeDb>) {
  const createCaller = createCallerFactory(planRouter);
  return createCaller({
    db: db as never,
    userId: USER.supabaseId,
    session: { user: { id: USER.supabaseId } } as never,
    supabase: {} as never,
    headers: new Headers(),
    loaders: undefined,
  });
}

describe("plan.savePlan — empty payload never wipes the plan (QA 13.7)", () => {
  it("an empty courses[] is a NO-OP: no deleteMany, no createMany", async () => {
    const db = makeDb();
    const caller = makeCaller(db);
    const r = await caller.savePlan({ courses: [] });
    expect(db.calls.deleteMany).toBe(0); // the existing plan is NOT wiped
    expect(db.calls.createMany).toBe(0);
    expect(r.savedCount).toBe(0);
  });

  it("a non-empty plan still replaces (delete + create)", async () => {
    const db = makeDb();
    const caller = makeCaller(db);
    const r = await caller.savePlan({
      courses: [{ courseId: COURSE_ID, plannedYear: 1, plannedSemester: "FALL" }],
    });
    expect(db.calls.deleteMany).toBe(1);
    expect(db.calls.createMany).toBe(1);
    expect(r.savedCount).toBe(1);
  });
});
