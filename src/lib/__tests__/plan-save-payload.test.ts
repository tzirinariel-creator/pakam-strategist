// #8 — the last gate before a course is saved.
//
// The bug this pins: a course the student added by hand is registered as a real
// Course row moments before the save, so it is NOT in the catalog and NOT yet in
// the cached plan. A payload built by "is it in the course list?" drops exactly
// that course — which is how "קורס שאינו בקטלוג לא נשמר בתוכנית" happened.

import { describe, it, expect } from "vitest";
import { buildSavePlanPayload, type PlannedSemesterLike } from "@/lib/plan-save-payload";

const CATALOG_ID = "11111111-1111-4111-8111-111111111111";
// A course registered seconds ago: a real id, absent from every client-side list.
const JUST_REGISTERED_ID = "22222222-2222-4222-9222-222222222222";

const semesters: PlannedSemesterLike[] = [
  { year: 1, semester: "FALL", courseIds: [CATALOG_ID, JUST_REGISTERED_ID] },
];

const codeById = new Map([[CATALOG_ID, "0618-2033"]]); // the new course is missing on purpose

describe("buildSavePlanPayload", () => {
  it("keeps a just-registered course the catalog has never heard of", () => {
    const { courses, droppedIds } = buildSavePlanPayload(semesters, codeById, {}, {});

    expect(droppedIds).toEqual([]);
    expect(courses.map((c) => c.courseId)).toEqual([CATALOG_ID, JUST_REGISTERED_ID]);
  });

  it("carries the student's declaration into the payload", () => {
    const { courses } = buildSavePlanPayload(semesters, codeById, {}, {
      [JUST_REGISTERED_ID]: "PHILOSOPHY",
    });

    const added = courses.find((c) => c.courseId === JUST_REGISTERED_ID);
    expect(added?.disciplineOverride).toBe("PHILOSOPHY");
    // No declaration → the key is absent, so savePlan writes null (not a guess).
    expect(courses.find((c) => c.courseId === CATALOG_ID)).not.toHaveProperty(
      "disciplineOverride",
    );
  });

  it("drops an UNregistered client id — and REPORTS it, never silently", () => {
    const withClientId: PlannedSemesterLike[] = [
      { year: 2, semester: "SPRING", courseIds: [CATALOG_ID, "custom-abc"] },
    ];

    const { courses, droppedIds } = buildSavePlanPayload(withClientId, codeById, {}, {});

    // It has to go — savePlan rejects the WHOLE payload over one bad id.
    expect(courses.map((c) => c.courseId)).toEqual([CATALOG_ID]);
    // …but the caller is handed it, so the student gets told.
    expect(droppedIds).toEqual(["custom-abc"]);
  });

  it("keeps session-group choices, looked up by course code", () => {
    const { courses } = buildSavePlanPayload(
      semesters,
      codeById,
      { "0618-2033": { tutorial: "B" } },
      {},
    );

    expect(courses.find((c) => c.courseId === CATALOG_ID)?.selectedGroups).toEqual({
      tutorial: "B",
    });
    // A course with no known code simply carries no groups (it has none).
    expect(
      courses.find((c) => c.courseId === JUST_REGISTERED_ID),
    ).not.toHaveProperty("selectedGroups");
  });
});
