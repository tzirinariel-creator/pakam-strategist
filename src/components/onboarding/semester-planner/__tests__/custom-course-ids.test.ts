// #8 — the swap that decides whether a manually added course is SAVED or lost.
// A `custom-…` id survives to savePlan → the whole course is dropped (that was
// the bug: "קורס שאינו בקטלוג לא נשמר בתוכנית"). So this step is pinned down.

import { describe, it, expect } from "vitest";
import { applyResolvedCustomIds } from "../custom-course-ids";
import type { PlannedSemester } from "../index";

const REAL_ID = "11111111-1111-4111-8111-111111111111";

const semesters: PlannedSemester[] = [
  { year: 1, semester: "FALL", courseIds: ["catalog-1", "custom-abc"] },
  { year: 1, semester: "SPRING", courseIds: ["catalog-2"] },
];

describe("applyResolvedCustomIds", () => {
  it("replaces the client id with the persisted one, in place", () => {
    const res = applyResolvedCustomIds(semesters, {}, [
      { clientId: "custom-abc", courseId: REAL_ID },
    ]);

    expect(res.semesters[0]!.courseIds).toEqual(["catalog-1", REAL_ID]);
    // Untouched semesters keep their courses and their order.
    expect(res.semesters[1]!.courseIds).toEqual(["catalog-2"]);
  });

  it("carries the student's declaration onto the persisted id", () => {
    const res = applyResolvedCustomIds(
      semesters,
      { "custom-abc": "PHILOSOPHY", "catalog-1": "LAW" },
      [{ clientId: "custom-abc", courseId: REAL_ID }],
    );

    // The declaration must follow the course, or savePlan writes it against an
    // id that no longer exists and the student's answer is silently lost.
    expect(res.disciplineOverrides[REAL_ID]).toBe("PHILOSOPHY");
    expect(res.disciplineOverrides["custom-abc"]).toBeUndefined();
    expect(res.disciplineOverrides["catalog-1"]).toBe("LAW");
  });

  it("leaves an unresolved id alone (the caller reports it — never a silent drop)", () => {
    const res = applyResolvedCustomIds(semesters, { "custom-abc": "LAW" }, []);

    expect(res.semesters[0]!.courseIds).toContain("custom-abc");
    expect(res.disciplineOverrides["custom-abc"]).toBe("LAW");
  });

  it("does not mutate its inputs", () => {
    const input: PlannedSemester[] = [
      { year: 2, semester: "FALL", courseIds: ["custom-abc"] },
    ];
    applyResolvedCustomIds(input, {}, [{ clientId: "custom-abc", courseId: REAL_ID }]);
    expect(input[0]!.courseIds).toEqual(["custom-abc"]);
  });
});
