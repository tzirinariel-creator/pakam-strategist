import { describe, it, expect } from "vitest";
import { weightedAverage, rankBinaryCandidates, type GradedCourseLite } from "@/lib/binary-advisor";

function course(over: Partial<GradedCourseLite>): GradedCourseLite {
  return {
    userCourseId: over.userCourseId ?? Math.random().toString(36).slice(2),
    nameHe: "קורס",
    code: "0000-0000",
    grade: 80,
    credits: 4,
    isBinary: false,
    courseType: null,
    ...over,
  };
}

describe("weightedAverage", () => {
  it("weights by credits and skips binary courses", () => {
    const avg = weightedAverage([
      course({ grade: 90, credits: 6 }),
      course({ grade: 60, credits: 2 }),
      course({ grade: 10, credits: 10, isBinary: true }), // excluded
    ]);
    // (90*6 + 60*2) / 8 = 660/8 = 82.5
    expect(avg).toBeCloseTo(82.5);
  });

  it("returns null with no graded credits", () => {
    expect(weightedAverage([])).toBeNull();
  });
});

describe("rankBinaryCandidates", () => {
  const COURSES = [
    course({ userCourseId: "hi", nameHe: "גבוה", grade: 95, credits: 4 }),
    course({ userCourseId: "lo", nameHe: "נמוך", grade: 62, credits: 6 }),
    course({ userCourseId: "mid", nameHe: "בינוני", grade: 78, credits: 4 }),
  ];

  it("ranks the low-grade heavy course first, with the exact new average", () => {
    const { current, candidates } = rankBinaryCandidates(COURSES, 3);
    // current = (95*4+62*6+78*4)/14 = (380+372+312)/14 = 1064/14 = 76
    expect(current).toBeCloseTo(76);
    expect(candidates[0]?.course.userCourseId).toBe("lo");
    // without "lo": (380+312)/8 = 86.5 → delta +10.5
    expect(candidates[0]?.newAverage).toBeCloseTo(86.5);
    expect(candidates[0]?.delta).toBeCloseTo(10.5);
    // converting the 95 would LOWER the average → never offered
    expect(candidates.some((c) => c.course.userCourseId === "hi")).toBe(false);
  });

  it("offers nothing without quota", () => {
    expect(rankBinaryCandidates(COURSES, 0).candidates).toHaveLength(0);
  });

  it("never offers seminars, failed courses, or already-binary courses", () => {
    const { candidates } = rankBinaryCandidates(
      [
        ...COURSES,
        course({ userCourseId: "sem", grade: 61, credits: 4, courseType: "SEMINAR" }),
        course({ userCourseId: "fail", grade: 40, credits: 4 }),
        course({ userCourseId: "bin", grade: 61, credits: 4, isBinary: true }),
      ],
      5,
    );
    const ids = candidates.map((c) => c.course.userCourseId);
    expect(ids).not.toContain("sem");
    expect(ids).not.toContain("fail");
    expect(ids).not.toContain("bin");
  });
});
