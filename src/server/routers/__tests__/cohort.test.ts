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
  const insightReports: Array<{ insightId: string; userId: string }> = [];
  const planReports: Array<{ entryId: string; userId: string }> = [];
  let seq = 0;
  // Enforce the DB's @@unique per (item, reporter): a repeat report from the
  // same user throws P2002, exactly like Prisma against the real constraint.
  const p2002 = () => Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
  return {
    insights,
    entries,
    insightReports,
    planReports,
    // Echo the queried supabaseId as the row id, so distinct callers resolve to
    // distinct ctx.user.id values (distinct reporters).
    user: { findUnique: async ({ where }: { where: { supabaseId: string } }) => ({ ...USER, id: where.supabaseId, supabaseId: where.supabaseId }) },
    insightReport: {
      create: async ({ data }: { data: { insightId: string; userId: string } }) => {
        if (insightReports.some((r) => r.insightId === data.insightId && r.userId === data.userId)) throw p2002();
        insightReports.push(data);
        return data;
      },
      count: async ({ where }: { where: { insightId: string } }) =>
        insightReports.filter((r) => r.insightId === where.insightId).length,
    },
    planReport: {
      create: async ({ data }: { data: { entryId: string; userId: string } }) => {
        if (planReports.some((r) => r.entryId === data.entryId && r.userId === data.userId)) throw p2002();
        planReports.push(data);
        return data;
      },
      count: async ({ where }: { where: { entryId: string } }) =>
        planReports.filter((r) => r.entryId === where.entryId).length,
    },
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

function makeCaller(db: ReturnType<typeof makeDb>, supabaseId: string = USER.supabaseId) {
  const createCaller = createCallerFactory(cohortRouter);
  return createCaller({
    db: db as never,
    userId: supabaseId,
    session: { user: { id: supabaseId } } as never,
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

  it("3 DISTINCT reporters auto-hide a FOREIGN insight; self-reports are ignored", async () => {
    const db = makeDb();
    // A foreign-authored insight (not any reporter's).
    const foreign = { id: "00000000-0000-4000-8000-0000000000ff", userId: "someone-else", stage: "EXAMS", text: "x", status: "VISIBLE", reportCount: 0 };
    db.insights.push(foreign);
    await makeCaller(db, "rep-a").reportInsight({ id: foreign.id });
    await makeCaller(db, "rep-b").reportInsight({ id: foreign.id });
    expect(foreign.status).toBe("VISIBLE");
    expect(foreign.reportCount).toBe(2);
    await makeCaller(db, "rep-c").reportInsight({ id: foreign.id });
    expect(foreign.status).toBe("HIDDEN");
    expect(foreign.reportCount).toBe(3);

    // Self-report never counts.
    const owner = makeCaller(db, "self");
    await owner.contributeInsight({ stage: "GENERAL", text: "תובנה משלי כאן לבדיקה" });
    const mine = db.insights.find((i) => i.stage === "GENERAL")!;
    await owner.reportInsight({ id: mine.id as string });
    expect(mine.reportCount).toBe(0);
  });

  it("one account cannot mass-hide an insight: repeat reports are deduped (#audit-r1)", async () => {
    const db = makeDb();
    const foreign = { id: "00000000-0000-4000-8000-0000000000fe", userId: "someone-else", stage: "EXAMS", text: "x", status: "VISIBLE", reportCount: 0 };
    db.insights.push(foreign);
    const abuser = makeCaller(db, "abuser");
    await abuser.reportInsight({ id: foreign.id });
    await abuser.reportInsight({ id: foreign.id });
    await abuser.reportInsight({ id: foreign.id });
    expect(foreign.reportCount).toBe(1);
    expect(foreign.status).toBe("VISIBLE");
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

  it("gallery report: 3 distinct reporters hide an entry; one account can't (#audit-r1)", async () => {
    const db = makeDb();
    await makeCaller(db, "author").publishPlan({ title: "מסלול לדוגמה", token: TOKEN_A });
    const entry = db.entries[0]!;
    // One account spamming reports advances the count only once.
    const abuser = makeCaller(db, "g-abuser");
    await abuser.reportGalleryEntry({ id: entry.id as string });
    await abuser.reportGalleryEntry({ id: entry.id as string });
    expect(entry.reportCount).toBe(1);
    expect(entry.status).toBe("VISIBLE");
    // Two more distinct reporters push it over the threshold.
    await makeCaller(db, "g-b").reportGalleryEntry({ id: entry.id as string });
    await makeCaller(db, "g-c").reportGalleryEntry({ id: entry.id as string });
    expect(entry.reportCount).toBe(3);
    expect(entry.status).toBe("HIDDEN");
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
