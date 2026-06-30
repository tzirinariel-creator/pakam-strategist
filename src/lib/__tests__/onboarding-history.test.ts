import { describe, it, expect } from "vitest";
import {
  getPastSemesters,
  buildDefaultCompleted,
} from "@/components/onboarding/step-history";
import type { CourseWithSchedule } from "@/lib/plan-generator";

// Minimal course factory — only the fields the placement/pre-check logic reads.
function course(
  code: string,
  opts: {
    mandatory?: boolean;
    years: number[];
    sems: ("FALL" | "SPRING")[];
    credits?: number;
  }
): CourseWithSchedule {
  return {
    code,
    nameHe: code,
    nameEn: code,
    courseType: opts.mandatory ? "MANDATORY" : "ELECTIVE",
    isMandatory: opts.mandatory ?? false,
    credits: opts.credits ?? 4,
    yearOffered: opts.years,
    semesterOffered: opts.sems,
    discipline: "ECONOMICS",
    canCountAs: [],
  } as unknown as CourseWithSchedule;
}

// A small PPE-shaped catalog: year-1 mandatory split across both semesters
// (mirrors the real fixture where year-1 has FALL-only AND SPRING-only courses),
// a year-2 mandatory, and an elective.
const CATALOG: CourseWithSchedule[] = [
  course("Y1-FALL-A", { mandatory: true, years: [1], sems: ["FALL"], credits: 4 }),
  course("Y1-FALL-B", { mandatory: true, years: [1], sems: ["FALL"], credits: 2 }),
  course("Y1-SPRING-A", { mandatory: true, years: [1], sems: ["SPRING"], credits: 5 }),
  course("Y1-SPRING-B", { mandatory: true, years: [1], sems: ["SPRING"], credits: 3 }),
  course("Y2-FALL", { mandatory: true, years: [2], sems: ["FALL"], credits: 6 }),
  course("ELECTIVE-Y1", { mandatory: false, years: [1], sems: ["FALL"], credits: 4 }),
];

describe("getPastSemesters", () => {
  it("returns nothing for a fresh year-1 FALL student", () => {
    expect(getPastSemesters(1, "FALL")).toHaveLength(0);
  });

  it("returns both year-1 semesters for a year-2 FALL starter", () => {
    expect(getPastSemesters(2, "FALL")).toEqual([
      { year: 1, semester: "FALL" },
      { year: 1, semester: "SPRING" },
    ]);
  });

  it("returns all four prior semesters for a year-3 FALL starter (#6)", () => {
    expect(getPastSemesters(3, "FALL")).toEqual([
      { year: 1, semester: "FALL" },
      { year: 1, semester: "SPRING" },
      { year: 2, semester: "FALL" },
      { year: 2, semester: "SPRING" },
    ]);
  });
});

describe("buildDefaultCompleted (mid-degree pre-check, #18)", () => {
  it("pre-checks nothing for a fresh year-1 FALL student", () => {
    expect(buildDefaultCompleted(CATALOG, 1, "FALL")).toEqual({});
  });

  it("pre-checks ALL year-1 mandatory — FALL *and* SPRING — for a year-2 starter", () => {
    const completed = buildDefaultCompleted(CATALOG, 2, "FALL");
    const codes = Object.keys(completed).sort();
    // The SPRING-only courses must be included — this is the exact #18 gap
    // ("was never asked about year-1 spring").
    expect(codes).toEqual(["Y1-FALL-A", "Y1-FALL-B", "Y1-SPRING-A", "Y1-SPRING-B"]);
  });

  it("places each pre-checked course in its natural semester, with no grade", () => {
    const completed = buildDefaultCompleted(CATALOG, 2, "FALL");
    expect(completed["Y1-SPRING-A"]).toMatchObject({
      courseCode: "Y1-SPRING-A",
      plannedYear: 1,
      plannedSemester: "SPRING",
      grade: null, // grades stay null so GPA is never over-claimed
    });
  });

  it("does NOT pre-check the current/future year's mandatory or any elective", () => {
    const completed = buildDefaultCompleted(CATALOG, 2, "FALL");
    expect(completed["Y2-FALL"]).toBeUndefined(); // current semester, not past
    expect(completed["ELECTIVE-Y1"]).toBeUndefined(); // electives aren't auto-claimed
  });

  it("pre-checks year-1 AND year-2 mandatory for a year-3 starter (#6)", () => {
    const completed = buildDefaultCompleted(CATALOG, 3, "FALL");
    expect(Object.keys(completed).sort()).toEqual([
      "Y1-FALL-A",
      "Y1-FALL-B",
      "Y1-SPRING-A",
      "Y1-SPRING-B",
      "Y2-FALL",
    ]);
  });
});
