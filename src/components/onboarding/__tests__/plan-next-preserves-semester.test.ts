// =========================================================================
// "תכננו את הסמסטר הבא" must not delete the semester it opens (#23, #24)
// =========================================================================
// Ariel: "לדעתי תכננתי את הקורסים וזה נמחק משום מה" · "נראה שיש פה איזה באג
// רציני עם הסנכרון של התכנן".
//
// This is where courses were genuinely destroyed. Two functions answered the
// same question — "change which semester I am editing" — and one had drifted:
//
//   handleSwitchSemester: stores the current semester, STRIPS the target's
//     stale entry, RESTORES the target's saved courseIds.
//   handlePlanNext:       stores the current semester, advances the year, and
//     cleared the selection WITHOUT stripping or restoring.
//
// So the board then believed the target semester was empty. handleFinish
// rebuilds that semester from the board and drops the saved entry, and
// savePlan's reconcile deletes precisely what the payload omits. Everything the
// student had saved in that semester was deleted from the database — and since
// completedCourseIds still counted those courses, the mandatory pool filtered
// them out too, so the rebuilt entry could be empty and take the mandatory rows
// with it.
//
// The path is the default one: a mandatory-heavy semester opens on the summary
// screen, where "תכננו את הסמסטר הבא" is the filled primary button.

import { describe, it, expect } from "vitest";

type Sem = { year: number; semester: "FALL" | "SPRING"; courseIds: string[] };

/** The shared implementation both entry points now use. */
function switchSemester(
  state: { year: number; semester: "FALL" | "SPRING"; selected: string[]; saved: Sem[] },
  targetYear: number,
  targetSemester: "FALL" | "SPRING",
) {
  if (targetYear === state.year && targetSemester === state.semester) return state;
  const currentKey = `${state.year}-${state.semester}`;
  const targetKey = `${targetYear}-${targetSemester}`;
  const saved = [
    ...state.saved.filter((s) => `${s.year}-${s.semester}` !== targetKey && `${s.year}-${s.semester}` !== currentKey),
    { year: state.year, semester: state.semester, courseIds: [...state.selected] },
  ];
  const target = state.saved.find((s) => `${s.year}-${s.semester}` === targetKey);
  return { year: targetYear, semester: targetSemester, selected: target ? [...target.courseIds] : [], saved };
}

/** What handlePlanNext does now: compute the next term, then delegate. */
function planNext(state: Parameters<typeof switchSemester>[0]) {
  const nextYear = state.semester === "FALL" ? state.year : state.year + 1;
  const nextSemester = state.semester === "FALL" ? "SPRING" : "FALL";
  return switchSemester(state, nextYear, nextSemester as "FALL" | "SPRING");
}

/** The version that shipped, kept as the witness. */
function planNextOld(state: Parameters<typeof switchSemester>[0]) {
  const currentKey = `${state.year}-${state.semester}`;
  const saved = [
    ...state.saved.filter((s) => `${s.year}-${s.semester}` !== currentKey),
    { year: state.year, semester: state.semester, courseIds: [...state.selected] },
  ];
  const nextYear = state.semester === "FALL" ? state.year : state.year + 1;
  const nextSemester = state.semester === "FALL" ? "SPRING" : "FALL";
  return { year: nextYear, semester: nextSemester as "FALL" | "SPRING", selected: [], saved };
}

/** A student mid-way: year 2 fall open, year 2 spring already planned. */
const START = {
  year: 2,
  semester: "FALL" as const,
  selected: ["micro-b", "macro"],
  saved: [{ year: 2, semester: "SPRING" as const, courseIds: ["econometrics", "phil-19c", "elective-x"] }],
};

describe("advancing to the next semester restores what is already there", () => {
  it("loads the target semester's saved courses onto the board", () => {
    const after = planNext(START);
    expect(after.selected).toEqual(["econometrics", "phil-19c", "elective-x"]);
  });

  it("the witness: the old version opened it EMPTY", () => {
    expect(planNextOld(START).selected).toEqual([]);
  });

  it("does not leave a stale duplicate entry for the target", () => {
    // The stale entry is what handleFinish filtered out and replaced with the
    // empty board — the step that turned a wrong screen into a deletion.
    const after = planNext(START);
    const targetEntries = after.saved.filter((s) => s.year === 2 && s.semester === "SPRING");
    expect(targetEntries).toHaveLength(0); // it is now the OPEN semester, not a saved one
  });

  it("still stores the semester being left", () => {
    const after = planNext(START);
    const fall = after.saved.find((s) => s.year === 2 && s.semester === "FALL");
    expect(fall?.courseIds).toEqual(["micro-b", "macro"]);
  });

  it("advances the year only when leaving SPRING", () => {
    expect(planNext(START).year).toBe(2);
    expect(planNext({ ...START, semester: "SPRING" }).year).toBe(3);
  });

  it("nothing is lost across a full round trip", () => {
    // The end-to-end property: plan-next then switch back, and both semesters
    // still hold what the student put in them.
    const forward = planNext(START);
    const back = switchSemester(forward, 2, "FALL");
    expect(back.selected).toEqual(["micro-b", "macro"]);
    const spring = back.saved.find((s) => s.year === 2 && s.semester === "SPRING");
    expect(spring?.courseIds).toEqual(["econometrics", "phil-19c", "elective-x"]);
  });

  it("the witness, end to end: the old version lost the spring electives", () => {
    const forward = planNextOld(START);
    const spring = forward.saved.find((s) => s.year === 2 && s.semester === "SPRING");
    // The entry survives here, but the board is empty — and finishing now
    // rebuilds SPRING from that empty board and deletes the difference.
    expect(forward.selected).toEqual([]);
    expect(spring?.courseIds).toEqual(["econometrics", "phil-19c", "elective-x"]);
  });
});
