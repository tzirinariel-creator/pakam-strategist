// Stage ב (approved) — insights + gallery through the REAL router: upsert
// semantics, moderation auto-hide at 3, one-gallery-entry-per-user.

import { describe, it, expect } from "vitest";
import { createCallerFactory } from "@/server/trpc/init";
import { cohortRouter } from "@/server/routers/cohort";
import { encodePlan } from "@/lib/plan-share";

const TOKEN_A = encodePlan([{ c: "1011-2103", y: 1, s: "FALL" }]);
const TOKEN_B = encodePlan([{ c: "0651-1003", y: 2, s: "SPRING" }]);

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
      findUnique: async ({ where }: { where: { id?: string; userId_stage?: { userId: string; stage: string } } }) => {
        if (where.userId_stage) {
          return (
            insights.find(
              (i) => i.userId === where.userId_stage!.userId && i.stage === where.userId_stage!.stage,
            ) ?? null
          );
        }
        return insights.find((i) => i.id === where.id) ?? null;
      },
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

  it("3 reports auto-hide a FOREIGN insight; self-reports are ignored", async () => {
    const db = makeDb();
    const caller = makeCaller(db);
    // A foreign-authored insight (not USER's).
    const foreign = { id: "00000000-0000-4000-8000-0000000000ff", userId: "someone-else", stage: "EXAMS", text: "x", status: "VISIBLE", reportCount: 0 };
    db.insights.push(foreign);
    await caller.reportInsight({ id: foreign.id });
    await caller.reportInsight({ id: foreign.id });
    expect(foreign.status).toBe("VISIBLE");
    await caller.reportInsight({ id: foreign.id });
    expect(foreign.status).toBe("HIDDEN");

    // Self-report never counts.
    await caller.contributeInsight({ stage: "GENERAL", text: "תובנה משלי כאן לבדיקה" });
    const mine = db.insights.find((i) => i.stage === "GENERAL")!;
    await caller.reportInsight({ id: mine.id as string });
    expect(mine.reportCount).toBe(0);
  });

  it("re-saving a HIDDEN insight does NOT un-hide it (no moderation bypass)", async () => {
    const db = makeDb();
    const caller = makeCaller(db);
    await caller.contributeInsight({ stage: "FOCUS", text: "טקסט מקורי לבדיקת הסתרה" });
    const row = db.insights[0]!;
    row.status = "HIDDEN";
    row.reportCount = 3;
    await caller.contributeInsight({ stage: "FOCUS", text: "מנסה להחזיר לגלוי עם טקסט אחר" });
    expect(row.status).toBe("HIDDEN");
    expect(row.reportCount).toBe(3);
    expect(row.text).toContain("להחזיר"); // text still updates
  });

  it("gallery: publishing again replaces my previous entry", async () => {
    const db = makeDb();
    const caller = makeCaller(db);
    await caller.publishPlan({ title: "שנה ב׳ מאוזנת", token: TOKEN_A });
    await caller.publishPlan({ title: "גרסה משופרת", token: TOKEN_B });
    expect(db.entries).toHaveLength(1);
    expect(db.entries[0]!.title).toBe("גרסה משופרת");
  });

  it("rejects a garbage plan token (no permanent broken entry)", async () => {
    const db = makeDb();
    const caller = makeCaller(db);
    await expect(caller.publishPlan({ title: "מסלול שבור", token: "AAAAAAAAAA" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.entries).toHaveLength(0);
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
