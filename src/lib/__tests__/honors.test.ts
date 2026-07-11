// Note #25 — distance-to-honors math: credit-weighted yearly average with the
// SAME exclusions as the degree GPA (binary + English out, retakes resolved).

import { describe, it, expect } from "vitest";
import { computeHonorsDistance, HONORS_YEARLY_BAR } from "@/lib/honors";
import type { UserCourseWithCourse } from "@/types/degree";

let seq = 0;
function uc(over: {
  plannedYear?: number;
  status?: string;
  grade?: number | null;
  credits?: number;
  courseType?: string;
  attemptNumber?: number;
  isBinary?: boolean;
  courseId?: string;
}): UserCourseWithCourse {
  seq += 1;
  const courseId = over.courseId ?? `h-${seq}`;
  return {
    id: `uch-${seq}`,
    courseId,
    plannedYear: over.plannedYear ?? 2,
    status: over.status ?? "COMPLETED",
    grade: over.grade ?? null,
    attemptNumber: over.attemptNumber ?? 1,
    isBinary: over.isBinary ?? false,
    course: {
      id: courseId,
      courseType: over.courseType ?? "MANDATORY",
      credits: over.credits ?? 3,
    },
  } as unknown as UserCourseWithCourse;
}

describe("computeHonorsDistance", () => {
  it("credit-weighted yearly average + gap to the 95 bar", () => {
    const d = computeHonorsDistance(
      [
        uc({ grade: 90, credits: 4 }), // 360
        uc({ grade: 100, credits: 2 }), // 200
      ],
      2,
    );
    // (360+200)/6 = 93.33 → gap ≈ 1.67
    expect(d.yearlyAverage).toBeCloseTo(93.33, 1);
    expect(d.gap).toBeCloseTo(HONORS_YEARLY_BAR - 93.33, 1);
    expect(d.credits).toBe(6);
  });

  it("excludes other years, binary, English and ungraded rows", () => {
    const d = computeHonorsDistance(
      [
        uc({ grade: 96, credits: 3 }), // counts
        uc({ grade: 100, credits: 5, plannedYear: 1 }), // other year
        uc({ grade: 100, credits: 5, isBinary: true }), // binary out
        uc({ grade: 100, credits: 5, courseType: "ENGLISH" }), // English out
        uc({ grade: null, credits: 5 }), // no grade
      ],
      2,
    );
    expect(d.courseCount).toBe(1);
    expect(d.yearlyAverage).toBe(96);
    expect(d.gap).toBe(0); // at/above the bar
  });

  it("retake: the determining attempt wins, not both", () => {
    const d = computeHonorsDistance(
      [
        uc({ grade: 60, credits: 3, courseId: "R", attemptNumber: 1, status: "FAILED" }),
        uc({ grade: 95, credits: 3, courseId: "R", attemptNumber: 2 }),
      ],
      2,
    );
    expect(d.courseCount).toBe(1);
    expect(d.yearlyAverage).toBe(95);
  });

  it("no graded courses → honest null, no invented average", () => {
    const d = computeHonorsDistance([uc({ grade: null })], 2);
    expect(d.yearlyAverage).toBeNull();
    expect(d.gap).toBeNull();
  });
});
