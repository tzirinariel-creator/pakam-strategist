// OPS3 — the moderation queue through the REAL admin router: a non-admin is
// rejected with FORBIDDEN before any handler runs, approve restores the review
// and wipes its reports, delete removes it permanently.

import { describe, it, expect } from "vitest";
import { createCallerFactory } from "@/server/trpc/init";
import { adminRouter } from "@/server/routers/admin";

const REVIEW_HIDDEN = {
  id: "11111111-1111-4111-8111-111111111111",
  courseCode: "1011-2103",
  cohortYear: 2024,
  workload: 4,
  difficulty: 5,
  verdict: "NOT_RECOMMEND",
  tip: "offensive text that got reported",
  tags: ["קשה"],
  status: "HIDDEN",
  reportCount: 3,
  createdAt: new Date("2026-06-01"),
  updatedAt: new Date("2026-06-02"),
};

const REVIEW_REPORTED = {
  id: "22222222-2222-4222-8222-222222222222",
  courseCode: "1041-1101",
  cohortYear: null,
  workload: 2,
  difficulty: 2,
  verdict: "RECOMMEND",
  tip: "perfectly fine review with one report",
  tags: [],
  status: "VISIBLE",
  reportCount: 1,
  createdAt: new Date("2026-06-03"),
  updatedAt: new Date("2026-06-04"),
};

const INSIGHT_HIDDEN = {
  id: "44444444-4444-4444-8444-444444444444",
  stage: "PLANNING",
  text: "reported insight",
  cohortYear: 2026,
  status: "HIDDEN",
  reportCount: 3,
  createdAt: new Date("2026-06-05"),
};

const PLAN_HIDDEN = {
  id: "55555555-5555-4555-8555-555555555555",
  title: "reported plan",
  cohortYear: 2026,
  status: "HIDDEN",
  reportCount: 3,
  createdAt: new Date("2026-06-06"),
};

function makeFakeDb(opts: { role: string }) {
  const reviews = [
    { ...REVIEW_HIDDEN },
    { ...REVIEW_REPORTED },
  ];
  const reports = [
    { reviewId: REVIEW_HIDDEN.id, userId: "r1" },
    { reviewId: REVIEW_HIDDEN.id, userId: "r2" },
    { reviewId: REVIEW_HIDDEN.id, userId: "r3" },
    { reviewId: REVIEW_REPORTED.id, userId: "r1" },
  ];
  const insights = [{ ...INSIGHT_HIDDEN }];
  const insightReports = [
    { insightId: INSIGHT_HIDDEN.id, userId: "r1" },
    { insightId: INSIGHT_HIDDEN.id, userId: "r2" },
    { insightId: INSIGHT_HIDDEN.id, userId: "r3" },
  ];
  const plans = [{ ...PLAN_HIDDEN }];
  const planReports = [
    { entryId: PLAN_HIDDEN.id, userId: "r1" },
    { entryId: PLAN_HIDDEN.id, userId: "r2" },
    { entryId: PLAN_HIDDEN.id, userId: "r3" },
  ];
  return {
    reviews,
    reports,
    insights,
    insightReports,
    plans,
    planReports,
    user: {
      findUnique: async () => ({
        id: "admin-1",
        supabaseId: "sb-admin",
        email: "owner@example.com",
        role: opts.role,
      }),
    },
    course: {
      findMany: async ({ where }: { where: { code: { in: string[] } } }) =>
        [{ code: "1011-2103", nameHe: "מבוא לכלכלה" }].filter((c) =>
          where.code.in.includes(c.code),
        ),
    },
    courseReview: {
      findMany: async () =>
        reviews.filter((r) => r.status === "HIDDEN" || r.reportCount > 0),
      findUnique: async ({ where }: { where: { id: string } }) =>
        reviews.find((r) => r.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const r = reviews.find((x) => x.id === where.id)!;
        Object.assign(r, data);
        return r;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const i = reviews.findIndex((r) => r.id === where.id);
        const [removed] = reviews.splice(i, 1);
        // FK cascade: reports go with the review.
        for (let j = reports.length - 1; j >= 0; j--) {
          if (reports[j]!.reviewId === where.id) reports.splice(j, 1);
        }
        return removed;
      },
    },
    reviewReport: {
      deleteMany: async ({ where }: { where: { reviewId: string } }) => {
        let count = 0;
        for (let j = reports.length - 1; j >= 0; j--) {
          if (reports[j]!.reviewId === where.reviewId) {
            reports.splice(j, 1);
            count++;
          }
        }
        return { count };
      },
    },
    cohortInsight: {
      findMany: async () => insights.filter((i) => i.status === "HIDDEN" || i.reportCount > 0),
      findUnique: async ({ where }: { where: { id: string } }) =>
        insights.find((i) => i.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const i = insights.find((x) => x.id === where.id)!;
        Object.assign(i, data);
        return i;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const idx = insights.findIndex((i) => i.id === where.id);
        const [removed] = insights.splice(idx, 1);
        for (let j = insightReports.length - 1; j >= 0; j--) {
          if (insightReports[j]!.insightId === where.id) insightReports.splice(j, 1);
        }
        return removed;
      },
    },
    insightReport: {
      deleteMany: async ({ where }: { where: { insightId: string } }) => {
        let count = 0;
        for (let j = insightReports.length - 1; j >= 0; j--) {
          if (insightReports[j]!.insightId === where.insightId) {
            insightReports.splice(j, 1);
            count++;
          }
        }
        return { count };
      },
    },
    sharedPlanEntry: {
      findMany: async () => plans.filter((p) => p.status === "HIDDEN" || p.reportCount > 0),
      findUnique: async ({ where }: { where: { id: string } }) =>
        plans.find((p) => p.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const p = plans.find((x) => x.id === where.id)!;
        Object.assign(p, data);
        return p;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const idx = plans.findIndex((p) => p.id === where.id);
        const [removed] = plans.splice(idx, 1);
        for (let j = planReports.length - 1; j >= 0; j--) {
          if (planReports[j]!.entryId === where.id) planReports.splice(j, 1);
        }
        return removed;
      },
    },
    planReport: {
      deleteMany: async ({ where }: { where: { entryId: string } }) => {
        let count = 0;
        for (let j = planReports.length - 1; j >= 0; j--) {
          if (planReports[j]!.entryId === where.entryId) {
            planReports.splice(j, 1);
            count++;
          }
        }
        return { count };
      },
    },
  };
}

function makeCaller(db: ReturnType<typeof makeFakeDb>) {
  const createCaller = createCallerFactory(adminRouter);
  return createCaller({
    db: db as never,
    userId: "sb-admin",
    session: { user: { id: "sb-admin", email: "owner@example.com" } } as never,
    supabase: {} as never,
    headers: new Headers(),
    loaders: undefined,
  });
}

describe("admin moderation (OPS3)", () => {
  it("rejects a non-admin with FORBIDDEN on every moderation procedure", async () => {
    const caller = makeCaller(makeFakeDb({ role: "user" }));
    await expect(caller.getModerationQueue()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      caller.approveReview({ reviewId: REVIEW_HIDDEN.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller.deleteReview({ reviewId: REVIEW_HIDDEN.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns hidden + reported reviews with resolved course names, no user identity", async () => {
    const caller = makeCaller(makeFakeDb({ role: "admin" }));
    const queue = await caller.getModerationQueue();

    expect(queue).toHaveLength(2);
    const hidden = queue.find((r) => r.id === REVIEW_HIDDEN.id)!;
    expect(hidden.courseName).toBe("מבוא לכלכלה");
    expect(hidden.status).toBe("HIDDEN");
    // Course without a DB row still shows, name null (code shown instead).
    const reported = queue.find((r) => r.id === REVIEW_REPORTED.id)!;
    expect(reported.courseName).toBeNull();
    // Anonymous cohort wisdom: moderation must not leak the author.
    expect(hidden).not.toHaveProperty("userId");
    expect(hidden).not.toHaveProperty("user");
  });

  it("approve restores visibility and wipes the report slate", async () => {
    const db = makeFakeDb({ role: "admin" });
    const caller = makeCaller(db);

    await caller.approveReview({ reviewId: REVIEW_HIDDEN.id });

    const review = db.reviews.find((r) => r.id === REVIEW_HIDDEN.id)!;
    expect(review.status).toBe("VISIBLE");
    expect(review.reportCount).toBe(0);
    expect(db.reports.filter((r) => r.reviewId === REVIEW_HIDDEN.id)).toHaveLength(0);
    // The other review's report is untouched.
    expect(db.reports.filter((r) => r.reviewId === REVIEW_REPORTED.id)).toHaveLength(1);
  });

  it("delete removes the review permanently; unknown id → NOT_FOUND", async () => {
    const db = makeFakeDb({ role: "admin" });
    const caller = makeCaller(db);

    const result = await caller.deleteReview({ reviewId: REVIEW_HIDDEN.id });
    expect(result.deleted).toBe(true);
    expect(db.reviews.find((r) => r.id === REVIEW_HIDDEN.id)).toBeUndefined();

    await expect(
      caller.deleteReview({ reviewId: "33333333-3333-4333-8333-333333333333" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  // Regression for the per-reporter dedup fast-follow: approve must wipe the
  // InsightReport/PlanReport rows too, not just reset reportCount — otherwise
  // the old reporters stay "already reported" forever (unique constraint) and
  // a single fresh report would bounce reportCount back up from the stale rows.
  it("moderateCohortInsight approve restores visibility and wipes InsightReport rows", async () => {
    const db = makeFakeDb({ role: "admin" });
    const caller = makeCaller(db);

    await caller.moderateCohortInsight({ id: INSIGHT_HIDDEN.id, action: "approve" });

    const insight = db.insights.find((i) => i.id === INSIGHT_HIDDEN.id)!;
    expect(insight.status).toBe("VISIBLE");
    expect(insight.reportCount).toBe(0);
    expect(db.insightReports.filter((r) => r.insightId === INSIGHT_HIDDEN.id)).toHaveLength(0);
  });

  it("moderateCohortInsight delete removes the insight and its reports; unknown id → NOT_FOUND", async () => {
    const db = makeFakeDb({ role: "admin" });
    const caller = makeCaller(db);

    const result = await caller.moderateCohortInsight({ id: INSIGHT_HIDDEN.id, action: "delete" });
    expect((result as { deleted: boolean }).deleted).toBe(true);
    expect(db.insights.find((i) => i.id === INSIGHT_HIDDEN.id)).toBeUndefined();

    await expect(
      caller.moderateCohortInsight({ id: "66666666-6666-4666-8666-666666666666", action: "approve" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("moderateCohortPlan approve restores visibility and wipes PlanReport rows", async () => {
    const db = makeFakeDb({ role: "admin" });
    const caller = makeCaller(db);

    await caller.moderateCohortPlan({ id: PLAN_HIDDEN.id, action: "approve" });

    const plan = db.plans.find((p) => p.id === PLAN_HIDDEN.id)!;
    expect(plan.status).toBe("VISIBLE");
    expect(plan.reportCount).toBe(0);
    expect(db.planReports.filter((r) => r.entryId === PLAN_HIDDEN.id)).toHaveLength(0);
  });

  it("moderateCohortPlan delete removes the entry and its reports; unknown id → NOT_FOUND", async () => {
    const db = makeFakeDb({ role: "admin" });
    const caller = makeCaller(db);

    const result = await caller.moderateCohortPlan({ id: PLAN_HIDDEN.id, action: "delete" });
    expect((result as { deleted: boolean }).deleted).toBe(true);
    expect(db.plans.find((p) => p.id === PLAN_HIDDEN.id)).toBeUndefined();

    await expect(
      caller.moderateCohortPlan({ id: "77777777-7777-4777-8777-777777777777", action: "approve" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects a non-admin on cohort moderation procedures too", async () => {
    const caller = makeCaller(makeFakeDb({ role: "user" }));
    await expect(caller.getCohortModerationQueue()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller.moderateCohortInsight({ id: INSIGHT_HIDDEN.id, action: "approve" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller.moderateCohortPlan({ id: PLAN_HIDDEN.id, action: "approve" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
