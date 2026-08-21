// =========================================================================
// The what-if sandbox — and the one property that makes it trustworthy
// =========================================================================
// Ariel asked for the מועד ב׳ question to be answerable: "כל מה שמישהו שצריך
// לדעת אם לגשת למועד ב או לא". A simulator that computes averages its own way
// would answer it with a number the rest of the app doesn't agree with — which
// is worse than not answering.
//
// So the load-bearing test is the FIRST one: with no overrides, the simulated
// figure must be bit-identical to the real one, because both go through
// calculateGrades. Everything else builds on that.
import { describe, it, expect } from "vitest";
import { simulate, applyOverrides, gradeNeededForTarget, gradeDistribution, clampGrade } from "@/lib/grade-simulator";
import { calculateGrades } from "@/lib/grade-calculator";
import type { UserCourseWithCourse } from "@/types/degree";

const c = (
  id: string, grade: number | null, credits: number,
  extra: Partial<{ isBinary: boolean; courseType: string; status: string }> = {},
): UserCourseWithCourse =>
  ({
    id,
    // canonicalAttempts groups retakes by courseId and ranks by attemptNumber —
    // both must be real per row, or two different courses collapse into one and
    // every assertion below silently measures the wrong thing. (They did, on the
    // first run: two courses became one and the average never moved.)
    courseId: id,
    attemptNumber: 1,
    grade, status: extra.status ?? "COMPLETED", isBinary: extra.isBinary ?? false,
    plannedYear: 1, plannedSemester: "FALL",
    course: { id, code: id, nameHe: id, credits, courseType: extra.courseType ?? "MANDATORY" },
  }) as unknown as UserCourseWithCourse;

// 90×4 + 80×2 = 520 over 6 credits → 86.666…
const PLAN = [c("a", 90, 4), c("b", 80, 2)];

describe("the sandbox agrees with the real app", () => {
  it("with NO overrides, simulated === current, exactly", () => {
    const r = simulate(PLAN, {});
    expect(r.simulated).toEqual(r.current);
    expect(r.simulated.courseAverage).toBe(calculateGrades(PLAN).courseAverage);
    expect(r.averageDelta).toBe(0);
  });

  it("never mutates the caller's courses", () => {
    const before = JSON.stringify(PLAN);
    simulate(PLAN, { a: { grade: 50 }, b: { included: false } });
    expect(JSON.stringify(PLAN)).toBe(before);
  });

  it("inherits the rules it never reimplemented — binary leaves the average", () => {
    const r = simulate(PLAN, { b: { isBinary: true } });
    // Only the 90 remains counted.
    expect(r.simulated.courseAverage).toBe(90);
  });
});

describe("changing a grade", () => {
  it("moves the average and reports the delta", () => {
    const r = simulate(PLAN, { b: { grade: 100 } });
    // 90×4 + 100×2 = 560 / 6 = 93.33
    expect(r.simulated.courseAverage).toBeCloseTo(93.33, 1);
    expect(r.averageDelta).toBeGreaterThan(6);
    expect(r.changedCount).toBe(1);
  });

  it("clamps a nudge to a real grade range", () => {
    expect(clampGrade(140)).toBe(100);
    expect(clampGrade(-20)).toBe(0);
    const r = simulate(PLAN, { b: { grade: 140 } });
    expect(r.simulated.courseAverage).toBeCloseTo(93.33, 1);
  });

  it("giving a grade to an ungraded course brings it INTO the average", () => {
    const withPending = [...PLAN, c("pending", null, 4, { status: "IN_PROGRESS" })];
    const before = simulate(withPending, {}).current.courseAverage!;
    const after = simulate(withPending, { pending: { grade: 100 } }).simulated.courseAverage!;
    expect(after).toBeGreaterThan(before);
  });

  it("counts an unchanged 'override' as no change", () => {
    expect(simulate(PLAN, { a: { grade: 90 } }).changedCount).toBe(0);
  });
});

describe("excluding a course", () => {
  it("removes it from the calculation and counts it", () => {
    const r = simulate(PLAN, { b: { included: false } });
    expect(r.simulated.courseAverage).toBe(90);
    expect(r.excludedCount).toBe(1);
    expect(r.changedCount).toBe(1);
  });
});

describe("gradeNeededForTarget — the מועד ב׳ question, answered", () => {
  it("finds the grade that reaches the target", () => {
    // Need the overall average at 90: 90×4 + x×2 = 90×6 → x = 90.
    expect(gradeNeededForTarget(PLAN, "b", 90)).toBe(90);
  });

  it("returns null when no legal grade can get there", () => {
    // Even a 100 on the 2-credit course only reaches ~93.3.
    expect(gradeNeededForTarget(PLAN, "b", 99)).toBeNull();
  });

  it("returns the floor when the target is already met", () => {
    expect(gradeNeededForTarget(PLAN, "b", 50)).toBe(0);
  });

  it("returns null for a course that isn't in the plan", () => {
    expect(gradeNeededForTarget(PLAN, "nope", 90)).toBeNull();
  });

  it("the answer it gives actually achieves the target", () => {
    // The property that matters: don't just trust the search, verify it.
    const needed = gradeNeededForTarget(PLAN, "b", 88)!;
    const got = simulate(PLAN, { b: { grade: needed } }).simulated.courseAverage!;
    expect(got).toBeGreaterThanOrEqual(88);
  });
});

describe("gradeDistribution", () => {
  it("buckets counted grades into bands", () => {
    const d = gradeDistribution([c("x", 95, 2), c("y", 85, 2), c("z", 55, 2)]);
    expect(d.find((b) => b.band === "90+")!.count).toBe(1);
    expect(d.find((b) => b.band === "80–89")!.count).toBe(1);
    expect(d.find((b) => b.band === "<60")!.count).toBe(1);
  });

  it("ignores courses that don't count toward the average", () => {
    const d = gradeDistribution([c("x", 95, 2), c("bin", 40, 2, { isBinary: true })]);
    expect(d.reduce((s, b) => s + b.count, 0)).toBe(1);
  });
});

describe("applyOverrides", () => {
  it("returns a new array and leaves untouched rows identical by reference", () => {
    const out = applyOverrides(PLAN, { b: { grade: 70 } });
    expect(out).not.toBe(PLAN);
    expect(out[0]).toBe(PLAN[0]); // untouched row not needlessly cloned
    expect(out[1]!.grade).toBe(70);
  });
});
