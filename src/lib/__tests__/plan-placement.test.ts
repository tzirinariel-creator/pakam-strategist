import { describe, it, expect } from "vitest";
import { planPlacementIssues, suggestedSemester, type PlacementCourse } from "../plan-placement";

let n = 0;
const c = (over: Partial<PlacementCourse> = {}): PlacementCourse => {
  n++;
  return {
    userCourseId: `uc${n}`,
    code: `1000-00${n}`,
    nameHe: `קורס ${n}`,
    semesterOffered: ["FALL"],
    yearOffered: [1],
    plannedSemester: "FALL",
    plannedYear: 1,
    status: "PLANNED",
    isMandatory: false,
    ...over,
  };
};

describe("planPlacementIssues", () => {
  it("catches the real case: מיקרו א׳ parked in spring", () => {
    // 26 rows across real accounts looked like this after the 21.8 semester
    // correction — plans built against the old catalog.
    const issues = planPlacementIssues([
      c({ code: "1011-2103", nameHe: "מיקרו כלכלה א'", semesterOffered: ["FALL"], plannedSemester: "SPRING", isMandatory: true }),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.kind).toBe("wrong-semester");
    expect(suggestedSemester(issues[0]!)).toBe("FALL");
  });

  it("says nothing about a course that is where it belongs", () => {
    expect(planPlacementIssues([c()])).toEqual([]);
  });

  it("leaves finished courses alone", () => {
    // A completed course was taken when it was taken. Complaining about it is
    // noise about a decision that cannot be revisited.
    const done = c({ semesterOffered: ["FALL"], plannedSemester: "SPRING", status: "COMPLETED" });
    expect(planPlacementIssues([done])).toEqual([]);
  });

  it("treats an unknown timetable as unknown, not as a mismatch", () => {
    // Roughly a quarter of the catalog has no semester at all. Inventing a
    // complaint from missing data is how a checker becomes noise people learn
    // to dismiss.
    expect(planPlacementIssues([c({ semesterOffered: [], plannedSemester: "SPRING" })])).toEqual([]);
  });

  it("accepts a course genuinely given in both terms", () => {
    expect(planPlacementIssues([c({ semesterOffered: ["FALL", "SPRING"], plannedSemester: "SPRING" })])).toEqual([]);
  });

  it("puts mandatory courses first", () => {
    // A required course in the wrong term costs a semester; an elective
    // usually costs a swap.
    const issues = planPlacementIssues([
      c({ nameHe: "בחירה", semesterOffered: ["FALL"], plannedSemester: "SPRING" }),
      c({ nameHe: "חובה", semesterOffered: ["FALL"], plannedSemester: "SPRING", isMandatory: true }),
    ]);
    expect(issues[0]!.nameHe).toBe("חובה");
  });

  it("raises one issue per course, never two", () => {
    const issues = planPlacementIssues([
      c({ semesterOffered: ["FALL"], yearOffered: [1], plannedSemester: "SPRING", plannedYear: 3 }),
    ]);
    expect(issues).toHaveLength(1);
  });

  it("catches a wrong year on its own", () => {
    const issues = planPlacementIssues([c({ yearOffered: [2], plannedYear: 1 })]);
    expect(issues[0]!.kind).toBe("wrong-year");
    expect(suggestedSemester(issues[0]!)).toBeNull();
  });

  it("suggests nothing when the course runs in both terms", () => {
    const issues = planPlacementIssues([
      c({ semesterOffered: ["FALL", "SPRING"], yearOffered: [2], plannedYear: 1 }),
    ]);
    expect(suggestedSemester(issues[0]!)).toBeNull();
  });
});
