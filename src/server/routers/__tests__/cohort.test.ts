// Stage ב (approved) — insights + gallery through the REAL router: upsert
// semantics, moderation auto-hide at 3, one-gallery-entry-per-user.

import { describe, it, expect } from "vitest";
import { createCallerFactory } from "@/server/trpc/init";
import { cohortRouter } from "@/server/routers/cohort";

const USER = { id: "u1", supabaseId: "sb1", email: "t@example.com", startYear: 2025 };

function makeDb() {
  const insights: Array<Record<string, unknown>> = [];
  const entries: Array<Record<string, unknown>> = [];
  let seq = 0;
  return {
    insights,
    entries,
    user: { findUnique: async () => USER },
    cohortInsight: {
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        insights.filter((i) =>
          where.status ? i.status === where.status : where.userId ? i.userId === where.userId : true,
        ),
      findUnique: async ({ where }: { where: { id: string } }) =>
        insights.find((i) => i.id === where.id) ?? null,
      upsert: async ({ where, create, update }: { where: { userId_stage: { userId: string; stage: string } }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const found = insights.find(
          (i) => i.userId === where.userId_stage.userId && i.stage === where.userId_stage.stage,
        );
        if (found) {
          Object.assign(found, update);
          return found;
        }
        const row = { id: `00000000-0000-4000-8000-00000000000${++seq}`, status: "VISIBLE", reportCount: 0, ...create };
        insights.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = insights.find((i) => i.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
      deleteMany: async ({ where }: { where: { userId: string; stage: string } }) => {
        for (let i = insights.length - 1; i >= 0; i--) {
          if (insights[i]!.userId === where.userId && insights[i]!.stage === where.stage) insights.splice(i, 1);
        }
        return { count: 1 };
      },
    },
    sharedPlanEntry: {
      findMany: async () => entries.filter((e) => e.status === "VISIBLE"),
      findUnique: async ({ where }: { where: { id: string } }) => entries.find((e) => e.id === where.id) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `00000000-0000-4000-8000-00000000001${++seq}`, status: "VISIBLE", reportCount: 0, ...data };
        entries.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = entries.find((e) => e.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
      deleteMany: async ({ where }: { where: { userId: string } }) => {
        for (let i = entries.length - 1; i >= 0; i--) {
          if (entries[i]!.userId === where.userId) entries.splice(i, 1);
        }
        return { count: 1 };
      },
    },
  };
}

function makeCaller(db: ReturnType<typeof makeDb>) {
  const createCaller = createCallerFactory(cohortRouter);
  return createCaller({
    db: db as never,
    userId: USER.supabaseId,
    session: { user: { id: USER.supabaseId } } as never,
    supabase: {} as never,
    headers: new Headers(),
    loaders: undefined,
  });
}

describe("cohort router (stage ב)", () => {
  it("contribute is an upsert: second write REPLACES, resets moderation", async () => {
    const db = makeDb();
    const caller = makeCaller(db);
    await caller.contributeInsight({ stage: "BIDDING", text: "אל תבזבזו נקודות על קורס עם קבוצה אחת" });
    // Simulate reports, then re-contribute — the new text starts clean.
    db.insights[0]!.reportCount = 2;
    await caller.contributeInsight({ stage: "BIDDING", text: "טקסט חדש לגמרי אחרי עריכה" });
    expect(db.insights).toHaveLength(1);
    expect(db.insights[0]!.text).toContain("חדש");
    expect(db.insights[0]!.reportCount).toBe(0);
    expect(db.insights[0]!.cohortYear).toBe(2025);
  });

  it("3 reports auto-hide an insight", async () => {
    const db = makeDb();
    const caller = makeCaller(db);
    await caller.contributeInsight({ stage: "EXAMS", text: "תתחילו ללמוד שבועיים לפני, באמת" });
    const id = db.insights[0]!.id as string;
    await caller.reportInsight({ id });
    await caller.reportInsight({ id });
    expect(db.insights[0]!.status).toBe("VISIBLE");
    await caller.reportInsight({ id });
    expect(db.insights[0]!.status).toBe("HIDDEN");
  });

  it("gallery: publishing again replaces my previous entry", async () => {
    const db = makeDb();
    const caller = makeCaller(db);
    await caller.publishPlan({ title: "שנה ב׳ מאוזנת", token: "abc12345" });
    await caller.publishPlan({ title: "גרסה משופרת", token: "def45678" });
    expect(db.entries).toHaveLength(1);
    expect(db.entries[0]!.title).toBe("גרסה משופרת");
  });

  it("listInsights only returns VISIBLE rows", async () => {
    const db = makeDb();
    const caller = makeCaller(db);
    await caller.contributeInsight({ stage: "GENERAL", text: "תובנה גלויה לכולם כאן" });
    db.insights[0]!.status = "HIDDEN";
    const rows = await caller.listInsights();
    expect(rows).toHaveLength(0);
  });
});
