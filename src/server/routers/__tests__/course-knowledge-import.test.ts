// S1b — importMyGrades / withdrawMyContributions through the REAL router:
// idempotent import (determining attempt only, binary → null grade), and a
// full withdrawal that removes exactly the user's own points.

import { describe, it, expect } from "vitest";
import { createCallerFactory } from "@/server/trpc/init";
import { courseKnowledgeRouter } from "@/server/routers/course-knowledge";

const USER = { id: "user-1", supabaseId: "sb-1", email: "t@example.com", startYear: 2024 };

interface FakePoint {
  courseCode: string;
  grade: number | null;
  isBinary: boolean;
  cohortYear: number | null;
  source: string;
  dedupeHash: string;
}

function makeFakeDb(userCourses: Array<{ grade: number | null; isBinary: boolean; attemptNumber: number; status: string; course: { code: string } }>) {
  const points: FakePoint[] = [];
  const reviews: Array<{ userId: string }> = [{ userId: USER.id }, { userId: "someone-else" }];
  return {
    points,
    reviews,
    user: { findUnique: async () => USER, upsert: async () => USER },
    userCourse: {
      findMany: async ({ where }: { where: { status?: string } }) =>
        where.status ? userCourses.filter((c) => c.status === where.status) : userCourses,
    },
    courseGradePoint: {
      upsert: async ({ where, create, update }: { where: { dedupeHash: string }; create: FakePoint; update: Partial<FakePoint> }) => {
        const existing = points.find((p) => p.dedupeHash === where.dedupeHash);
        if (existing) Object.assign(existing, update);
        else points.push(create);
        return existing ?? create;
      },
      deleteMany: async ({ where }: { where: { dedupeHash: { in: string[] } } }) => {
        let count = 0;
        for (let i = points.length - 1; i >= 0; i--) {
          if (where.dedupeHash.in.includes(points[i]!.dedupeHash)) {
            points.splice(i, 1);
            count++;
          }
        }
        return { count };
      },
    },
    courseReview: {
      deleteMany: async ({ where }: { where: { userId: string } }) => {
        let count = 0;
        for (let i = reviews.length - 1; i >= 0; i--) {
          if (reviews[i]!.userId === where.userId) {
            reviews.splice(i, 1);
            count++;
          }
        }
        return { count };
      },
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };
}

function makeCaller(db: ReturnType<typeof makeFakeDb>) {
  const createCaller = createCallerFactory(courseKnowledgeRouter);
  return createCaller({
    db: db as never,
    userId: USER.supabaseId,
    session: { user: { id: USER.supabaseId } } as never,
    supabase: {} as never,
    headers: new Headers(),
  });
}

const COURSES = [
  // A retaken course: attempt 2 (85) must win over attempt 1 (60).
  { grade: 60, isBinary: false, attemptNumber: 1, status: "COMPLETED", course: { code: "1011-2103" } },
  { grade: 85, isBinary: false, attemptNumber: 2, status: "COMPLETED", course: { code: "1011-2103" } },
  // A binary conversion: the point must carry NO numeric grade.
  { grade: 62, isBinary: true, attemptNumber: 1, status: "COMPLETED", course: { code: "0651-1005" } },
  // Not completed → never exported.
  { grade: null, isBinary: false, attemptNumber: 1, status: "IN_PROGRESS", course: { code: "0618-1032" } },
];

describe("courseKnowledge.importMyGrades (S1b)", () => {
  it("imports one anonymous point per course — determining attempt, binary stays gradeless", async () => {
    const db = makeFakeDb(COURSES);
    const caller = makeCaller(db);
    const r = await caller.importMyGrades();
    expect(r.imported).toBe(2); // two distinct completed courses
    const micro = db.points.find((p) => p.courseCode === "1011-2103")!;
    expect(micro.grade).toBe(85); // the retake, not the 60
    const stats = db.points.find((p) => p.courseCode === "0651-1005")!;
    expect(stats.grade).toBeNull(); // binary → no numeric grade leaves the account
    expect(stats.isBinary).toBe(true);
    // No userId anywhere on the stored points — anonymity by construction.
    for (const p of db.points) expect(JSON.stringify(p)).not.toContain(USER.id);
  });

  it("is idempotent — importing twice keeps one point per course", async () => {
    const db = makeFakeDb(COURSES);
    const caller = makeCaller(db);
    await caller.importMyGrades();
    await caller.importMyGrades();
    expect(db.points.length).toBe(2);
  });

  it("withdrawMyContributions removes the user's points + reviews, nobody else's", async () => {
    const db = makeFakeDb(COURSES);
    const caller = makeCaller(db);
    await caller.importMyGrades();
    const r = await caller.withdrawMyContributions();
    expect(r.pointsRemoved).toBe(2);
    expect(r.reviewsRemoved).toBe(1); // only the user's own review
    expect(db.points.length).toBe(0);
    expect(db.reviews).toEqual([{ userId: "someone-else" }]);
  });
});

// ── S3 — getForCourses: one batched aggregate, thresholds enforced ──
describe("courseKnowledge.getForCourses (S3)", () => {
  function makeReadDb(reviews: Array<{ courseCode: string; verdict: string | null; workload: number | null; difficulty: number | null }>) {
    return {
      user: { findUnique: async () => USER, upsert: async () => USER },
      courseReview: { findMany: async () => reviews },
    };
  }

  it("tags only courses past the k-anonymity bar with ≥60% recommend", async () => {
    const db = makeReadDb([
      // A: 3 raters, all recommend → revealed, share 1.0
      { courseCode: "A", verdict: "RECOMMEND", workload: 3, difficulty: 3 },
      { courseCode: "A", verdict: "RECOMMEND", workload: 2, difficulty: 2 },
      { courseCode: "A", verdict: "RECOMMEND", workload: 4, difficulty: 4 },
      // B: only 2 raters → below bar, nothing revealed
      { courseCode: "B", verdict: "RECOMMEND", workload: 3, difficulty: 3 },
      { courseCode: "B", verdict: "RECOMMEND", workload: 3, difficulty: 3 },
    ]);
    const createCaller = createCallerFactory(courseKnowledgeRouter);
    const caller = createCaller({ db: db as never, userId: USER.supabaseId, session: { user: { id: USER.supabaseId } } as never, supabase: {} as never, headers: new Headers() });
    const r = await caller.getForCourses({ courseCodes: ["A", "B", "C"] });
    expect(r["A"]).toEqual({ n: 3, revealed: true, recommendShare: 1 });
    expect(r["B"]!.revealed).toBe(false);
    expect(r["B"]!.recommendShare).toBeNull();
    expect(r["C"]).toEqual({ n: 0, revealed: false, recommendShare: null }); // no data — honest empty
  });
});
