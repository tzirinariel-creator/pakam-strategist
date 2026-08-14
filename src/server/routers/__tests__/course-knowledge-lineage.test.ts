// The two reads השושלת needs, through the REAL router.
//
// 1. myReviewableCourses — the caller's own completed courses plus a "did I
//    already rate this" flag. This is the data the lineage's "start here" CTA
//    was missing: it told students to rate a finished course and linked to
//    /record, a page with no rating control on it (#31).
// 2. getCohortDigest.almostUnlocked — how far the file is from opening
//    something. It exists so an empty table reads as "N more reviews and it
//    opens" instead of "this is broken", and it must never move a bar: the
//    courses it counts are exactly the ones that are NOT in the digest.

import { describe, it, expect } from "vitest";
import { createCallerFactory } from "@/server/trpc/init";
import { courseKnowledgeRouter } from "@/server/routers/course-knowledge";
import { RATING_MIN_N } from "@/lib/k-anonymity";

const USER = { id: "sb-1", supabaseId: "sb-1", email: "t@example.com", startYear: 2024 };

type UC = { course: { code: string; nameHe: string; nameEn: string | null } };

function makeCaller(db: Record<string, unknown>) {
  const createCaller = createCallerFactory(courseKnowledgeRouter);
  return createCaller({
    db: db as never,
    userId: USER.supabaseId,
    session: { user: { id: USER.supabaseId } } as never,
    supabase: {} as never,
    headers: new Headers(),
    loaders: undefined,
  });
}

// ── myReviewableCourses ────────────────────────────────────────────────
describe("courseKnowledge.myReviewableCourses (#31 — the missing rating door)", () => {
  function makeDb(
    completed: UC[],
    myReviews: Array<{ courseCode: string }>,
    otherUsersReviews: Array<{ courseCode: string; userId: string }> = [],
  ) {
    return {
      user: { findUnique: async () => USER, upsert: async () => USER },
      userCourse: {
        findMany: async ({ where }: { where: { userId: string; status: string } }) => {
          expect(where.userId).toBe(USER.id);
          // The procedure must ask only for COMPLETED rows — rating a course
          // you haven't finished is rejected server-side anyway, so offering it
          // would be a button that can only fail.
          expect(where.status).toBe("COMPLETED");
          return completed;
        },
      },
      courseReview: {
        findMany: async ({ where }: { where: { userId: string } }) => {
          expect(where.userId).toBe(USER.id);
          return [
            ...myReviews,
            // Present in the table, belonging to somebody else: the filter is
            // by userId, so these must never mark a course as "mine, rated".
            ...otherUsersReviews.filter((r) => r.userId === USER.id),
          ];
        },
      },
    };
  }

  const MICRO: UC = { course: { code: "1011-2103", nameHe: "מיקרו א׳", nameEn: "Micro I" } };
  const STATS: UC = { course: { code: "0651-1005", nameHe: "סטטיסטיקה", nameEn: null } };

  it("returns every completed course with its own reviewed flag", async () => {
    const caller = makeCaller(makeDb([MICRO, STATS], [{ courseCode: "1011-2103" }]));
    const r = await caller.myReviewableCourses();
    expect(r.completedCount).toBe(2);
    expect(r.reviewedCount).toBe(1);
    expect(r.courses.find((c) => c.courseCode === "1011-2103")?.reviewed).toBe(true);
    expect(r.courses.find((c) => c.courseCode === "0651-1005")?.reviewed).toBe(false);
  });

  it("collapses a retaken course to ONE row — one course, one review", async () => {
    // contributeReview upserts on [userId, courseCode], so two attempts of the
    // same course are still a single thing to rate. Listing it twice would
    // invite the student to write the same review over itself.
    const caller = makeCaller(makeDb([MICRO, MICRO, MICRO], []));
    const r = await caller.myReviewableCourses();
    expect(r.courses).toHaveLength(1);
    expect(r.completedCount).toBe(1);
  });

  it("carries the English name only when there is one", async () => {
    const caller = makeCaller(makeDb([MICRO, STATS], []));
    const r = await caller.myReviewableCourses();
    expect(r.courses.find((c) => c.courseCode === "1011-2103")?.nameEn).toBe("Micro I");
    expect(r.courses.find((c) => c.courseCode === "0651-1005")?.nameEn).toBeNull();
  });

  it("never marks a course reviewed because SOMEBODY ELSE reviewed it", async () => {
    const caller = makeCaller(
      makeDb([MICRO], [], [{ courseCode: "1011-2103", userId: "someone-else" }]),
    );
    const r = await caller.myReviewableCourses();
    expect(r.reviewedCount).toBe(0);
    expect(r.courses[0]!.reviewed).toBe(false);
  });

  it("returns nothing at all for a student with no completed courses", async () => {
    const caller = makeCaller(makeDb([], []));
    const r = await caller.myReviewableCourses();
    expect(r.courses).toEqual([]);
    expect(r.completedCount).toBe(0);
    expect(r.reviewedCount).toBe(0);
  });

  it("leaks no identity — the payload carries course codes and names only", async () => {
    const caller = makeCaller(makeDb([MICRO], [{ courseCode: "1011-2103" }]));
    const r = await caller.myReviewableCourses();
    expect(JSON.stringify(r)).not.toContain(USER.id);
    expect(JSON.stringify(r)).not.toContain(USER.email);
  });
});

// ── getCohortDigest.almostUnlocked ─────────────────────────────────────
describe("courseKnowledge.getCohortDigest — the unlock distance", () => {
  function rated(courseCode: string, n: number) {
    return Array.from({ length: n }, () => ({
      courseCode,
      workload: 3,
      difficulty: 3,
      verdict: "RECOMMEND",
      tip: null,
      tags: [],
      createdAt: new Date(),
      cohortYear: 2023,
    }));
  }

  function makeDigestDb(reviews: ReturnType<typeof rated>) {
    return {
      user: { findUnique: async () => USER, upsert: async () => USER },
      courseReview: { findMany: async () => reviews },
      courseGradePoint: { findMany: async () => [] },
      course: {
        findMany: async () =>
          [...new Set(reviews.map((r) => r.courseCode))].map((code) => ({
            code,
            nameHe: `קורס ${code}`,
            nameEn: null,
            discipline: "ECONOMICS",
            courseType: "ELECTIVE",
          })),
      },
    };
  }

  it("counts the courses under the bar and the reviews that would open them", async () => {
    // A: 1 review (2 short) · B: 2 reviews (1 short) · C: at the bar → open.
    const caller = makeCaller(
      makeDigestDb([...rated("A", 1), ...rated("B", 2), ...rated("C", RATING_MIN_N)]),
    );
    const d = await caller.getCohortDigest();
    expect(d.almostUnlocked.courses).toBe(2);
    expect(d.almostUnlocked.reviewsNeeded).toBe(
      RATING_MIN_N - 1 + (RATING_MIN_N - 2),
    );
  });

  it("counts nothing when the file is empty — no invented queue", async () => {
    const caller = makeCaller(makeDigestDb([]));
    const d = await caller.getCohortDigest();
    expect(d.almostUnlocked).toEqual({ courses: 0, reviewsNeeded: 0 });
  });

  it("counts nothing when every course already cleared the bar", async () => {
    const caller = makeCaller(makeDigestDb([...rated("A", RATING_MIN_N + 4)]));
    const d = await caller.getCohortDigest();
    expect(d.almostUnlocked).toEqual({ courses: 0, reviewsNeeded: 0 });
  });

  // The guard that matters: the unlock distance is a reason to cross the bar,
  // never a way around it. A course it counts must still be absent from the
  // digest, with no name, no average and no rating anywhere in the payload.
  it("never reveals a course it counts — the bar does not move", async () => {
    const caller = makeCaller(
      makeDigestDb([...rated("BELOW", RATING_MIN_N - 1), ...rated("OPEN", RATING_MIN_N)]),
    );
    const d = await caller.getCohortDigest();
    expect(d.almostUnlocked.courses).toBe(1);
    expect(d.courses.map((c) => c.courseCode)).toEqual(["OPEN"]);
    expect(JSON.stringify(d.courses)).not.toContain("BELOW");
  });
});
