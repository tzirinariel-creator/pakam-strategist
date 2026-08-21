import { describe, it, expect } from "vitest";
import { yearAtAGlance, yearPlanAsText } from "../year-at-a-glance";
import type { UserCourseWithCourse } from "@/types/degree";

let n = 0;
const c = (
  term: "FALL" | "SPRING",
  credits: number,
  over: Record<string, unknown> = {},
) => {
  n++;
  return {
    id: `uc${n}`, courseId: `c${n}`,
    status: "PLANNED", grade: null, isBinary: false, attemptNumber: 1,
    plannedYear: 2, plannedSemester: term,
    course: {
      id: `c${n}`, code: `1000-00${n}`, nameHe: `קורס ${n}`,
      courseType: "ELECTIVE", credits, discipline: "ECONOMICS", isMandatory: false,
    },
    ...over,
  } as unknown as UserCourseWithCourse;
};

describe("yearAtAGlance", () => {
  it("totals BOTH terms — the number the round is really about", () => {
    const p = yearAtAGlance([c("FALL", 6), c("FALL", 4), c("SPRING", 5)], 2);
    expect(p.fall.credits).toBe(10);
    expect(p.spring.credits).toBe(5);
    expect(p.totalCredits).toBe(15);
    expect(p.totalCourses).toBe(3);
  });

  it("ignores other years", () => {
    const p = yearAtAGlance([c("FALL", 6), c("FALL", 4, { plannedYear: 3 })], 2);
    expect(p.totalCourses).toBe(1);
  });

  it("leaves out courses that are not up for registration", () => {
    // Listing a course you already passed on a bidding screen invites bidding
    // for something you already hold.
    const p = yearAtAGlance(
      [c("FALL", 6), c("FALL", 4, { status: "COMPLETED", grade: 90 }), c("FALL", 3, { status: "EXEMPT" })],
      2,
    );
    expect(p.totalCourses).toBe(1);
  });

  it("separates the part that is not a choice", () => {
    const p = yearAtAGlance(
      [c("FALL", 6, { course: { id: "m", code: "0651-1001", nameHe: "חובה", courseType: "MANDATORY", credits: 6, discipline: "PPE", isMandatory: true } }), c("FALL", 4)],
      2,
    );
    expect(p.fall.mandatoryCredits).toBe(6);
    expect(p.fall.credits).toBe(10);
  });

  it("reads heaviest first", () => {
    // On a bidding screen the big commitments should be read before the
    // two-credit electives.
    const p = yearAtAGlance([c("FALL", 2), c("FALL", 6), c("FALL", 4)], 2);
    expect(p.fall.courses.map((x) => x.credits)).toEqual([6, 4, 2]);
  });

  it("flags a term with nothing in it", () => {
    expect(yearAtAGlance([c("FALL", 6)], 2).hasEmptyTerm).toBe(true);
    expect(yearAtAGlance([c("FALL", 6), c("SPRING", 4)], 2).hasEmptyTerm).toBe(false);
  });
});

describe("yearPlanAsText", () => {
  it("leads each line with the CODE, which is what you type to bid", () => {
    const p = yearAtAGlance([c("FALL", 6), c("SPRING", 4)], 2);
    const txt = yearPlanAsText(p, true);
    expect(txt.split("\n").find((l) => l.includes("קורס"))).toMatch(/^\d{4}-\d{4}/);
    expect(txt).toContain("סה״כ");
  });

  it("says a term is empty rather than omitting it", () => {
    const txt = yearPlanAsText(yearAtAGlance([c("FALL", 6)], 2), true);
    expect(txt).toContain("ריק");
  });

  it("never mentions bidding points", () => {
    // TAU does not publish the quota; this project never guesses one.
    const txt = yearPlanAsText(yearAtAGlance([c("FALL", 6), c("SPRING", 4)], 2), true);
    expect(txt).not.toMatch(/נקוד|points/);
  });
});
