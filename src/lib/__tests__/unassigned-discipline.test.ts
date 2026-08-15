// The 60-ש״ס focus meter cannot be reached while 48% of the catalog is tagged
// GENERAL. Ariel's call was to ASK the student rather than infer the field from
// the course-code prefix — they know which field their seminar was written in,
// and a guess written into 24 real records is not a casual thing.
import { describe, it, expect } from "vitest";
import {
  summarizeUnassigned, isUnassigned, effectiveDiscipline, type AssignableCourse,
} from "@/lib/unassigned-discipline";

const c = (o: Partial<AssignableCourse> & { courseCode: string }): AssignableCourse => ({
  userCourseId: o.courseCode, nameHe: o.courseCode, credits: 2, discipline: "GENERAL",
  status: "COMPLETED", ...o,
});

describe("effectiveDiscipline / isUnassigned", () => {
  it("the student's own answer beats the catalog", () => {
    expect(effectiveDiscipline(c({ courseCode: "x", discipline: "GENERAL", disciplineOverride: "ECONOMICS" }))).toBe("ECONOMICS");
    expect(isUnassigned(c({ courseCode: "x", discipline: "GENERAL", disciplineOverride: "ECONOMICS" }))).toBe(false);
  });

  it("GENERAL and a missing discipline both count as unassigned", () => {
    expect(isUnassigned(c({ courseCode: "x", discipline: "GENERAL" }))).toBe(true);
    expect(isUnassigned(c({ courseCode: "x", discipline: null }))).toBe(true);
  });

  it("a real discipline is not unassigned", () => {
    expect(isUnassigned(c({ courseCode: "x", discipline: "PHILOSOPHY" }))).toBe(false);
  });
});

describe("summarizeUnassigned", () => {
  it("leads with CREDITS, because that is the consequence", () => {
    const s = summarizeUnassigned([
      c({ courseCode: "a", credits: 4 }),
      c({ courseCode: "b", credits: 2 }),
      c({ courseCode: "d", credits: 3, discipline: "ECONOMICS" }),
    ]);
    expect(s.credits).toBe(6);
    expect(s.courses).toHaveLength(2);
  });

  it("separates credits ALREADY EARNED — the loss that is real today", () => {
    const s = summarizeUnassigned([
      c({ courseCode: "a", credits: 4, status: "COMPLETED" }),
      c({ courseCode: "b", credits: 5, status: "PLANNED" }),
    ]);
    expect(s.credits).toBe(9);
    expect(s.completedCredits).toBe(4);
  });

  it("asks about completed courses first, then the heaviest", () => {
    const s = summarizeUnassigned([
      c({ courseCode: "planned-big", credits: 6, status: "PLANNED" }),
      c({ courseCode: "done-small", credits: 2, status: "COMPLETED" }),
      c({ courseCode: "done-big", credits: 4, status: "COMPLETED" }),
    ]);
    expect(s.courses.map((x) => x.courseCode)).toEqual(["done-big", "done-small", "planned-big"]);
  });

  it("counts seminars — the ידיעון says they ARE in-field", () => {
    const s = summarizeUnassigned([
      c({ courseCode: "a", isSeminar: true }),
      c({ courseCode: "b" }),
      c({ courseCode: "s2", isSeminar: true, discipline: "LAW" }), // already assigned
    ]);
    expect(s.seminarCount).toBe(1);
  });

  it("is empty and silent when everything is already assigned", () => {
    const s = summarizeUnassigned([c({ courseCode: "a", discipline: "PHILOSOPHY" })]);
    expect(s.courses).toEqual([]);
    expect(s.credits).toBe(0);
  });

  it("never counts a course the student has already answered for", () => {
    // The whole point: once they tell us, we stop nagging.
    const s = summarizeUnassigned([c({ courseCode: "a", credits: 4, disciplineOverride: "ECONOMICS" })]);
    expect(s.credits).toBe(0);
  });
});
