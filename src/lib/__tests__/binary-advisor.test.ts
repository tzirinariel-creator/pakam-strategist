// =========================================================================
// Binary-advisor ↔ dashboard GPA parity
// =========================================================================
// The advisor's "current average" and every "would raise it to X" must be the
// SAME number the dashboard / King / /record / /graduation show. Those all go
// through `calculateGrades` → `canonicalAttempts(rows.filter(countsTowardAverage))`.
// Until 14.8 this module hand-rolled the eligibility filter and skipped
// canonicalAttempts entirely, so for any student who retook a course the advisor
// computed over a DIFFERENT population than the rest of the app (audit deferred-1).
//
// Every expectation below is asserted against `calculateGrades` itself, so the
// two can never drift apart again without this file going red.
import { describe, it, expect } from "vitest";
import { weightedAverage, rankBinaryCandidates } from "@/lib/binary-advisor";
import { calculateGrades } from "@/lib/grade-calculator";
import type { UserCourseWithCourse } from "@/types/degree";

let seq = 0;
function uc(o: {
  grade?: number | null;
  credits?: number;
  courseId?: string;
  attemptNumber?: number;
  status?: string;
  isBinary?: boolean;
  courseType?: string;
  nameHe?: string;
}): UserCourseWithCourse {
  seq += 1;
  const courseId = o.courseId ?? `c-${seq}`;
  return {
    id: `u-${seq}`,
    courseId,
    status: o.status ?? "COMPLETED",
    grade: o.grade ?? null,
    attemptNumber: o.attemptNumber ?? 1,
    isBinary: o.isBinary ?? false,
    submissionType: null,
    submissionGrade: null,
    course: {
      id: courseId,
      code: `0000-${1000 + seq}`,
      nameHe: o.nameHe ?? "קורס",
      nameEn: null,
      courseType: o.courseType ?? "MANDATORY",
      credits: o.credits ?? 4,
    },
  } as unknown as UserCourseWithCourse;
}

/** The number the dashboard/King/record actually render, for the same rows. */
function dashboard(rows: UserCourseWithCourse[], preferHigherGrade = false) {
  return calculateGrades(rows, { preferHigherGrade }).courseAverage;
}

describe("weightedAverage == the canonical course average", () => {
  it("weights by ש״ס and skips binary courses", () => {
    const rows = [
      uc({ grade: 90, credits: 6 }),
      uc({ grade: 60, credits: 2 }),
      uc({ grade: 10, credits: 10, isBinary: true }), // excluded
    ];
    // (90*6 + 60*2) / 8 = 82.5
    expect(weightedAverage(rows)).toBeCloseTo(82.5);
    expect(weightedAverage(rows)).toBeCloseTo(dashboard(rows)!);
  });

  it("returns null with no countable rows", () => {
    expect(weightedAverage([])).toBeNull();
  });

  it("excludes SEMINAR and ENGLISH (owner-verified 4.7)", () => {
    const rows = [
      uc({ grade: 90, credits: 6 }),
      uc({ grade: 60, credits: 2 }),
      uc({ grade: 100, credits: 4, courseType: "SEMINAR" }),
      uc({ grade: 100, credits: 2, courseType: "ENGLISH" }),
    ];
    expect(weightedAverage(rows)).toBeCloseTo(82.5);
    expect(weightedAverage(rows)).toBeCloseTo(dashboard(rows)!);
  });

  // ---- The four populations the old hand-rolled filter got wrong ----

  it("RETAKE: counts the determining sitting ONCE, exactly like the dashboard", () => {
    const rows = [
      uc({ grade: 60, credits: 4, courseId: "X", attemptNumber: 1 }),
      uc({ grade: 90, credits: 4, courseId: "X", attemptNumber: 2 }), // determining
      uc({ grade: 80, credits: 3, courseId: "Y" }),
    ];
    // The pre-fix code averaged BOTH sittings and double-counted the ש״ס:
    //   (60*4 + 90*4 + 80*3) / 11 = 76.36…  ← wrong
    // The canonical answer keeps only attempt 2:
    //   (90*4 + 80*3) / 7 = 85.71…
    expect(weightedAverage(rows)).toBeCloseTo((90 * 4 + 80 * 3) / 7, 5);
    expect(weightedAverage(rows)).toBeCloseTo(dashboard(rows)!, 5);
    expect(weightedAverage(rows)).not.toBeCloseTo((60 * 4 + 90 * 4 + 80 * 3) / 11, 2);
  });

  it("RETAKE (B/C/G): honours preferHigherGrade the same way the dashboard does", () => {
    const rows = [
      uc({ grade: 95, credits: 4, courseId: "X", attemptNumber: 1 }),
      uc({ grade: 70, credits: 4, courseId: "X", attemptNumber: 2 }),
    ];
    expect(weightedAverage(rows, { preferHigherGrade: true })).toBeCloseTo(95);
    expect(weightedAverage(rows, { preferHigherGrade: true })).toBeCloseTo(
      dashboard(rows, true)!,
    );
    // A/NONE keep the LAST sitting.
    expect(weightedAverage(rows)).toBeCloseTo(70);
    expect(weightedAverage(rows)).toBeCloseTo(dashboard(rows)!);
  });

  it("FAILED then PASSED: only the passing sitting counts", () => {
    const rows = [
      uc({ grade: 45, credits: 4, courseId: "X", attemptNumber: 1, status: "FAILED" }),
      uc({ grade: 78, credits: 4, courseId: "X", attemptNumber: 2 }),
      uc({ grade: 88, credits: 4, courseId: "Y" }),
    ];
    expect(weightedAverage(rows)).toBeCloseTo(83);
    expect(weightedAverage(rows)).toBeCloseTo(dashboard(rows)!);
  });

  it("EXEMPT row carries no grade and never enters the average", () => {
    const rows = [
      uc({ grade: 90, credits: 4 }),
      uc({ grade: null, credits: 6, status: "EXEMPT", courseId: "E" }),
    ];
    expect(weightedAverage(rows)).toBeCloseTo(90);
    expect(weightedAverage(rows)).toBeCloseTo(dashboard(rows)!);
  });

  it("EXEMPT retake row cannot displace the graded sitting of the same course", () => {
    // canonicalAttempts prefers an EARNED row; an EXEMPT row is earned but has
    // no grade. Filtering by countsTowardAverage FIRST (as the dashboard does)
    // means the ungraded EXEMPT row is gone before the collapse — so the 88 is
    // kept. Collapsing first would have dropped the course from the average.
    const rows = [
      uc({ grade: 88, credits: 4, courseId: "X", attemptNumber: 1 }),
      uc({ grade: null, credits: 4, courseId: "X", attemptNumber: 2, status: "EXEMPT" }),
      uc({ grade: 60, credits: 4, courseId: "Y" }),
    ];
    expect(weightedAverage(rows)).toBeCloseTo(74);
    expect(weightedAverage(rows)).toBeCloseTo(dashboard(rows)!);
  });
});

describe("rankBinaryCandidates", () => {
  const COURSES = [
    uc({ courseId: "hi", nameHe: "גבוה", grade: 95, credits: 4 }),
    uc({ courseId: "lo", nameHe: "נמוך", grade: 62, credits: 6 }),
    uc({ courseId: "mid", nameHe: "בינוני", grade: 78, credits: 4 }),
  ];
  const idOf = (courseId: string) => COURSES.find((c) => c.courseId === courseId)!.id;

  it("ranks the low-grade heavy course first, with the exact new average", () => {
    const { current, candidates } = rankBinaryCandidates(COURSES, 3);
    // current = (95*4 + 62*6 + 78*4) / 14 = 1064/14 = 76
    expect(current).toBeCloseTo(76);
    expect(candidates[0]?.course.userCourseId).toBe(idOf("lo"));
    // without "lo": (380+312)/8 = 86.5 → delta +10.5
    expect(candidates[0]?.newAverage).toBeCloseTo(86.5);
    expect(candidates[0]?.delta).toBeCloseTo(10.5);
    // converting the 95 would LOWER the average → never offered
    expect(candidates.some((c) => c.course.userCourseId === idOf("hi"))).toBe(false);
  });

  it("the promised newAverage IS what the dashboard shows after the conversion", () => {
    const { candidates } = rankBinaryCandidates(COURSES, 3);
    for (const c of candidates) {
      const afterConversion = COURSES.map((row) =>
        row.id === c.course.userCourseId ? { ...row, isBinary: true } : row,
      );
      expect(c.newAverage).toBeCloseTo(dashboard(afterConversion)!, 5);
    }
  });

  it("offers nothing without quota", () => {
    expect(rankBinaryCandidates(COURSES, 0).candidates).toHaveLength(0);
  });

  it("never offers seminars, failed courses, already-binary or not-yet-graded courses", () => {
    const rows = [
      ...COURSES,
      uc({ courseId: "sem", grade: 61, credits: 4, courseType: "SEMINAR" }),
      uc({ courseId: "fail", grade: 40, credits: 4, status: "FAILED" }),
      uc({ courseId: "bin", grade: 61, credits: 4, isBinary: true }),
      uc({ courseId: "plan", grade: null, credits: 4, status: "PLANNED" }),
      uc({ courseId: "eng", grade: 71, credits: 4, courseType: "ENGLISH" }),
    ];
    const ids = rankBinaryCandidates(rows, 9).candidates.map((c) => c.course.userCourseId);
    for (const id of ["sem", "fail", "bin", "plan", "eng"]) {
      expect(ids).not.toContain(rows.find((r) => r.courseId === id)!.id);
    }
  });

  it("RETAKE after a fail: offers the DETERMINING sitting, never the superseded one", () => {
    const rows = [
      uc({ courseId: "X", grade: 45, credits: 6, attemptNumber: 1, status: "FAILED" }),
      uc({ courseId: "X", grade: 62, credits: 6, attemptNumber: 2 }), // determining
      uc({ courseId: "Y", grade: 95, credits: 4 }),
    ];
    const { current, candidates } = rankBinaryCandidates(rows, 3);
    // The dashboard's number, not a double-counted one.
    expect(current).toBeCloseTo(dashboard(rows)!, 5);
    expect(current).toBeCloseTo((62 * 6 + 95 * 4) / 10, 5);
    expect(candidates).toHaveLength(1);
    // The offered row is attempt 2 — attempt 1 is FAILED and never in the pool.
    expect(candidates[0]!.course.userCourseId).toBe(rows[1]!.id);
    expect(candidates[0]!.course.grade).toBe(62);
    // And the promised number is what the dashboard will show afterwards.
    const after = rows.map((r) => (r.id === rows[1]!.id ? { ...r, isBinary: true } : r));
    expect(candidates[0]!.newAverage).toBeCloseTo(dashboard(after)!, 5);
    expect(candidates[0]!.newAverage).toBeCloseTo(95, 5);
  });

  it("GRADE-IMPROVEMENT retake: the promise still equals what the app will show", () => {
    // Both sittings are COMPLETED+graded, so `isBinary` on the determining row
    // does NOT remove the course from the average — the canonical engine falls
    // back to attempt 1's grade (isBinary is stored per ROW, not per course).
    // That is the app's engine-wide behaviour, not this module's: the advisor's
    // job is to promise the number the student will actually see, and here that
    // number is LOWER than today's, so the course is honestly not offered.
    const rows = [
      uc({ courseId: "X", grade: 62, credits: 6, attemptNumber: 1 }),
      uc({ courseId: "X", grade: 65, credits: 6, attemptNumber: 2 }), // determining
      uc({ courseId: "Y", grade: 95, credits: 4 }),
    ];
    const { current, candidates } = rankBinaryCandidates(rows, 3);
    expect(current).toBeCloseTo(dashboard(rows)!, 5);
    expect(current).toBeCloseTo((65 * 6 + 95 * 4) / 10, 5);
    const after = rows.map((r) => (r.id === rows[1]!.id ? { ...r, isBinary: true } : r));
    expect(dashboard(after)).toBeCloseTo((62 * 6 + 95 * 4) / 10, 5); // goes DOWN
    expect(candidates).toHaveLength(0);
  });
});
