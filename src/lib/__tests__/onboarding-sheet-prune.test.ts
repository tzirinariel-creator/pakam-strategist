// =========================================================================
// A scanned grade sheet must survive the year/semester prune
// =========================================================================
// Ariel, 1.9: "העליתי בהתחלה סילבוס וזה פשוט לא עבר לכאן… הוא גם אומר שהשלמתי
// 5 אחוז על אף שהעליתי לו סילבוס בהתחלה עם קורסים עם ציון… באג רציני ומטריד."
//
// The wizard prunes assumed completions when the student changes their
// declared year, keeping only rows whose semester is already PAST. For a
// first-year that set is empty — there is no semester before year 1 semester
// A — so every row read off the official grade sheet failed the test and was
// dropped before the save. Zero COMPLETED rows reached the database, and the
// progress bar showed only the miluim exemption: 5%.
//
// This pins the RULE rather than the component: a row that came from the
// sheet is spared; a row we merely assumed is not. The wizard is a large
// stateful component, so the predicate is tested where it can be stated
// exactly.

import { describe, it, expect } from "vitest";

/** The prune, exactly as onboarding-wizard.tsx applies it. */
function prune(
  completed: Record<string, { plannedYear: number; plannedSemester: string }>,
  pastKeys: Set<string>,
  sheetCodes: Set<string>,
): string[] {
  const kept: string[] = [];
  for (const [code, cc] of Object.entries(completed)) {
    if (sheetCodes.has(code) || pastKeys.has(`${cc.plannedYear}-${cc.plannedSemester}`)) {
      kept.push(code);
    }
  }
  return kept.sort();
}

/** getPastSemesters, for the cases that matter here. */
const pastKeysFor = (year: number, semester: "FALL" | "SPRING") => {
  const order = ["1-FALL", "1-SPRING", "2-FALL", "2-SPRING", "3-FALL", "3-SPRING"];
  const i = order.indexOf(`${year}-${semester}`);
  return new Set(order.slice(0, Math.max(0, i)));
};

const scanned = {
  "1011-2103": { plannedYear: 1, plannedSemester: "FALL" },
  "0651-1005": { plannedYear: 1, plannedSemester: "FALL" },
  "1031-1108": { plannedYear: 1, plannedSemester: "FALL" },
};

describe("the grade sheet outranks the year the student typed", () => {
  it("keeps every scanned row for a first-year, where NO semester is past", () => {
    // This is the exact case that shipped broken. pastKeys is empty here.
    const past = pastKeysFor(1, "FALL");
    expect(past.size).toBe(0);

    const kept = prune(scanned, past, new Set(Object.keys(scanned)));
    expect(kept).toEqual(["0651-1005", "1011-2103", "1031-1108"]);
  });

  it("without the sheet marker, the same rows are all dropped", () => {
    // The old behaviour, kept as a witness: this is what 5% looked like.
    expect(prune(scanned, pastKeysFor(1, "FALL"), new Set())).toEqual([]);
  });

  it("still prunes rows we only ASSUMED, when the student lowers their year", () => {
    // The prune has a real job — this is it, and it must keep doing it.
    const assumed = {
      "1011-2101": { plannedYear: 2, plannedSemester: "FALL" },
      "1011-2103": { plannedYear: 1, plannedSemester: "FALL" },
    };
    // Student says they are in year 2 semester A: only year-1 rows are past.
    expect(prune(assumed, pastKeysFor(2, "FALL"), new Set())).toEqual(["1011-2103"]);
  });

  it("spares a scanned row even when it sits in a FUTURE semester", () => {
    // A sheet can list a course the student took out of the usual order. The
    // document is the fact; our placement guess is not.
    const odd = { "1011-2104": { plannedYear: 3, plannedSemester: "SPRING" } };
    expect(prune(odd, pastKeysFor(2, "FALL"), new Set(["1011-2104"]))).toEqual(["1011-2104"]);
  });

  it("drops everything when the student declares a fresh start", () => {
    // "fresh" clears sheetCodes, so nothing is protected any more — a student
    // starting over must not keep a previous upload's rows.
    expect(prune(scanned, pastKeysFor(1, "FALL"), new Set())).toEqual([]);
  });
});
