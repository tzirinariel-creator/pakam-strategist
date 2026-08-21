import { describe, it, expect } from "vitest";
import { gradeLevers, leverSummary } from "../grade-levers";
import type { UserCourseWithCourse } from "@/types/degree";

let n = 0;
const c = (grade: number | null, credits = 4, over: Record<string, unknown> = {}) => {
  n++;
  return {
    id: `uc${n}`,
    // canonicalAttempts collapses by courseId — omitting it makes every
    // fixture row look like the same course. This has bitten three files now.
    courseId: `c${n}`,
    status: grade == null ? "PLANNED" : "COMPLETED",
    grade,
    isBinary: false,
    attemptNumber: 1,
    course: {
      id: `c${n}`, code: `1000-00${n}`, nameHe: `קורס ${n}`,
      courseType: "ELECTIVE", credits, discipline: "ECONOMICS",
    },
    ...over,
  } as unknown as UserCourseWithCourse;
};

describe("gradeLevers", () => {
  it("ranks courses by how much they actually move the average", () => {
    const weak = c(60, 6);          // low grade, heavy — the biggest lever
    const mild = c(88, 2);          // near the assumed grade, light
    const rest = [c(90), c(90), c(90)];
    const levers = gradeLevers([weak, mild, ...rest], { keepsHigherGrade: false });
    expect(levers[0]!.userCourseId).toBe(weak.id);
    expect(levers[0]!.upside).toBeGreaterThan(levers[1]!.upside);
  });

  it("leaves out a course that is already good enough", () => {
    // A zero-upside row is noise dressed as advice.
    const strong = c(98);
    const levers = gradeLevers([strong, c(90), c(90)], { keepsHigherGrade: false });
    expect(levers.find((l) => l.userCourseId === strong.id)).toBeUndefined();
  });

  it("reports how little each course actually carries", () => {
    // The number that keeps the ranking honest: most levers are 2-4%.
    const target = c(70, 4);
    const rest = Array.from({ length: 9 }, () => c(90, 4));
    const levers = gradeLevers([target, ...rest], { keepsHigherGrade: false });
    expect(levers[0]!.weightPct).toBeCloseTo(10, 0);
  });

  it("does not assume a perfect score", () => {
    // An upside computed from 100 ranks courses by distance from perfection
    // rather than by what they can realistically move.
    const levers = gradeLevers([c(70), c(90), c(90)], { keepsHigherGrade: false });
    expect(levers[0]!.assumedGrade).toBe(95);
    expect(levers[0]!.assumedGrade).not.toBe(100);
  });

  it("respects a custom assumption", () => {
    const levers = gradeLevers([c(70), c(90)], { keepsHigherGrade: false, assumedGrade: 85 });
    expect(levers[0]!.assumedGrade).toBe(85);
  });

  it("never counts an English course as a lever", () => {
    // It cannot move the degree average at all — offering it as one would be
    // advice to study for nothing.
    const eng = c(60, 4, {
      course: { id: "ce", code: "2171-9201", nameHe: "מתקדמים ב' חוצה דיצפלינות בין תחומי", courseType: "ELECTIVE", credits: 4, discipline: "GENERAL" },
      courseId: "ce",
    });
    const levers = gradeLevers([eng, c(90), c(90)], { keepsHigherGrade: false });
    expect(levers.find((l) => l.courseCode === "2171-9201")).toBeUndefined();
  });

  it("tells a retake apart from a course not yet graded", () => {
    const done = c(70);
    const planned = c(null);
    const levers = gradeLevers([done, planned, c(90), c(90)], { keepsHigherGrade: false });
    expect(levers.find((l) => l.userCourseId === done.id)!.kind).toBe("retake");
    expect(levers.find((l) => l.userCourseId === planned.id)?.kind).toBe("upcoming");
  });

  it("returns nothing when nothing counts yet", () => {
    expect(gradeLevers([c(null)], { keepsHigherGrade: false })).toEqual([]);
    expect(gradeLevers([], { keepsHigherGrade: false })).toEqual([]);
  });
});

describe("leverSummary", () => {
  it("gives the best lever and the total reachable movement", () => {
    // The honest headline for most students is that even doing EVERYTHING
    // moves the average by very little.
    const levers = gradeLevers([c(70), c(80), c(90), c(90)], { keepsHigherGrade: false });
    const s = leverSummary(levers)!;
    expect(s.best.upside).toBe(levers[0]!.upside);
    expect(s.totalUpside).toBeGreaterThanOrEqual(s.best.upside);
  });

  it("says nothing when there is nothing to say", () => {
    expect(leverSummary([])).toBeNull();
  });
});
