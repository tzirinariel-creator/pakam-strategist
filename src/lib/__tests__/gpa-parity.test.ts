// Launch-blocker A1: the client "Overall GPA" on /graduation must match the
// server course-average for a student who RETOOK a course to improve — both
// must collapse retakes to the determining (last) sitting.
import { describe, it, expect } from "vitest";
import { calculateGrades, countsTowardAverage, canonicalAttempts } from "@/lib/grade-calculator";
import type { UserCourseWithCourse } from "@/types/degree";

let seq = 0;
function uc(o: { grade: number; credits?: number; courseId?: string; attemptNumber?: number; status?: string }): UserCourseWithCourse {
  seq += 1;
  const courseId = o.courseId ?? `p-${seq}`;
  return {
    id: `u-${seq}`, courseId, status: o.status ?? "COMPLETED", grade: o.grade,
    attemptNumber: o.attemptNumber ?? 1, isBinary: false, submissionType: null, submissionGrade: null,
    course: { id: courseId, courseType: "MANDATORY", credits: o.credits ?? 3 },
  } as unknown as UserCourseWithCourse;
}

/** Mirror of the client overallGpa computation (post-fix). */
function clientOverall(rows: UserCourseWithCourse[]): number {
  const completed = canonicalAttempts(rows.filter(countsTowardAverage));
  const cr = completed.reduce((s, c) => s + c.course.credits, 0);
  const w = completed.reduce((s, c) => s + (c.grade ?? 0) * c.course.credits, 0);
  return cr > 0 ? w / cr : 0;
}

describe("GPA parity (A1) — retake must not double-count", () => {
  it("client overall == server course-average with a grade-improvement retake", () => {
    const rows = [
      uc({ grade: 60, credits: 4, courseId: "X", attemptNumber: 1, status: "FAILED" }),
      uc({ grade: 90, credits: 4, courseId: "X", attemptNumber: 2 }), // the sitting that counts
      uc({ grade: 80, credits: 3, courseId: "Y" }),
    ];
    const server = calculateGrades(rows).courseAverage;
    const client = clientOverall(rows);
    expect(client).toBeCloseTo(server!, 5);
    // sanity: not the double-counted value (which would drag it down toward 60)
    expect(client).toBeCloseTo((90 * 4 + 80 * 3) / 7, 5);
  });
});
