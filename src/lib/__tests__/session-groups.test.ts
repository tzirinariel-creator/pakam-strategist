// =========================================================================
// The ONE group rule (13.8). Ariel, on the planner: "כסטודנט היה לי קצת קשה
// לבחור קבוצה … לא היה לי אינטואיטיבי להבין איך אני בדיוק בוחר."
//
// Two failures sat behind that, and both are locked here:
//   1. A DEFAULT was rendered exactly like a DECISION. The app quietly kept the
//      first group alphabetically and then printed "תרגול · קבוצה 03" as fact,
//      with a ✓ in the picker. `resolveGroupSelections` now returns `chosen`
//      alongside the group, so every surface can tell the two apart.
//   2. The rule itself had three near-copies (planner grid, server, calendar)
//      that disagreed — so the week a student approved was not the week the
//      dashboard drew. There is one implementation now, and these are its terms.
// =========================================================================
import { describe, it, expect } from "vitest";
import {
  defaultedSessionTypes,
  filterSessionsByGroups,
  hasGroupChoice,
  resolveGroupSelections,
  savedGroupFor,
} from "@/lib/session-groups";

interface Row {
  id: string;
  sessionType: string;
  groupCode: string | null;
}

const rows: Row[] = [
  { id: "lec", sessionType: "lecture", groupCode: "01" }, // single group — not a choice
  { id: "t01", sessionType: "tutorial", groupCode: "01" },
  { id: "t02", sessionType: "tutorial", groupCode: "02" },
  { id: "t03", sessionType: "tutorial", groupCode: "03" },
  { id: "shared", sessionType: "lecture", groupCode: "ALL" }, // runs for everyone
];

describe("session-groups — default vs decision", () => {
  it("falls back to the first group alphabetically, and says it was OURS", () => {
    const [tutorial] = resolveGroupSelections(rows, {});
    expect(tutorial).toMatchObject({ sessionType: "tutorial", groupCode: "01", chosen: false });
    expect(tutorial!.options).toEqual(["01", "02", "03"]);
  });

  it("keeps the student's pick and marks it CHOSEN", () => {
    const [tutorial] = resolveGroupSelections(rows, { tutorial: "03" });
    expect(tutorial).toMatchObject({ groupCode: "03", chosen: true });
  });

  it("a saved group that no longer exists is a default again, not a silent lie", () => {
    // The catalog changed under a saved plan: group 09 is gone. We must fall
    // back AND admit that what's on the grid isn't what they picked.
    const [tutorial] = resolveGroupSelections(rows, { tutorial: "09" });
    expect(tutorial).toMatchObject({ groupCode: "01", chosen: false });
  });

  it("never treats a single-group type as a choice", () => {
    // Only `tutorial` is offered; `lecture` has one group + an ALL meeting.
    expect(resolveGroupSelections(rows, {}).map((r) => r.sessionType)).toEqual(["tutorial"]);
  });

  it("matches a pick saved under a different letter case", () => {
    // The catalog holds both "tutorial" and "TUTORIAL" rows; picks were saved
    // under whichever spelling the row carried, and the server looked them up
    // lowercased — so a pick saved as "TUTORIAL" used to be ignored server-side.
    expect(savedGroupFor({ TUTORIAL: "02" }, "tutorial")).toBe("02");
    const [tutorial] = resolveGroupSelections(rows, { TUTORIAL: "02" });
    expect(tutorial).toMatchObject({ groupCode: "02", chosen: true });
  });
});

describe("session-groups — the count that must be able to reach zero", () => {
  it("counts every undecided session type, and empties as the picks come in", () => {
    const twoChoices: Row[] = [
      ...rows,
      { id: "lab1", sessionType: "lab", groupCode: "A" },
      { id: "lab2", sessionType: "lab", groupCode: "B" },
    ];

    // Nothing picked → both types are still ours.
    expect(defaultedSessionTypes(twoChoices, {})).toEqual(["tutorial", "lab"]);
    // One picked → exactly one left.
    expect(defaultedSessionTypes(twoChoices, { tutorial: "02" })).toEqual(["lab"]);
    // Everything picked → ZERO. The summary's "בחרו את שלכם" nudge used to be
    // derived from the catalog instead, so it could never be satisfied: you
    // could choose every group and still be told to choose.
    expect(defaultedSessionTypes(twoChoices, { tutorial: "02", lab: "B" })).toEqual([]);
  });

  it("a course with nothing to choose never contributes to the count", () => {
    const single: Row[] = [{ id: "only", sessionType: "lecture", groupCode: "01" }];
    expect(hasGroupChoice(single)).toBe(false);
    expect(defaultedSessionTypes(single, {})).toEqual([]);
  });
});

describe("session-groups — which sessions the week actually contains", () => {
  it("keeps ALL meetings, single-group meetings, and one group of the rest", () => {
    expect(filterSessionsByGroups(rows, {}).map((r) => r.id)).toEqual(["lec", "t01", "shared"]);
    expect(filterSessionsByGroups(rows, { tutorial: "03" }).map((r) => r.id)).toEqual([
      "lec",
      "t03",
      "shared",
    ]);
  });

  it("treats a missing groupCode as group A rather than dropping the row", () => {
    const untagged: Row[] = [{ id: "x", sessionType: "seminar", groupCode: null }];
    expect(filterSessionsByGroups(untagged, {}).map((r) => r.id)).toEqual(["x"]);
  });
});
