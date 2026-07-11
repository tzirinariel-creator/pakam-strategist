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
  return {
    reviews,
    reports,
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
});
