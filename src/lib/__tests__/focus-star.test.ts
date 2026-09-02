// =========================================================================
// #13 — the catalog star must agree with the rest of the app
// =========================================================================
// Measured on the live catalog, 2.9: 123 of 304 active courses carry no
// discipline, 61 of the 67 seminars among them — faithful to a ידיעון that
// files seminars by credit count ("סמינר 4 ש״ס"), not by field. The field is
// a per-student fact ("סמינר בתחום המיקוד בו תוגש עבודה סמינריונית"), which
// is why the app stores an override. The credit calculator honoured it and
// the catalog did not.

import { describe, it, expect } from "vitest";
import { isFocusCourse, effectiveDiscipline } from "@/lib/focus-star";

// A real philosophy seminar the ידיעון files under "סמינר 4 ש״ס".
const SEMINAR = "0618-3896";
// A course the catalog itself already tags.
const TAGGED = "0618-2200";

describe("the star follows the student, not only the catalog", () => {
  it("stars what the catalog already tags with the focus area", () => {
    expect(isFocusCourse(TAGGED, "PHILOSOPHY", "PHILOSOPHY")).toBe(true);
  });

  it("leaves an unassigned seminar unstarred — we genuinely do not know yet", () => {
    // Not a bug: guessing here would be inventing a fact about the student.
    expect(isFocusCourse(SEMINAR, null, "PHILOSOPHY")).toBe(false);
  });

  it("stars that same seminar once the student has assigned it", () => {
    // This is the case that shipped broken: counted on the record screen,
    // unstarred in the catalog.
    expect(isFocusCourse(SEMINAR, null, "PHILOSOPHY", { [SEMINAR]: "PHILOSOPHY" })).toBe(true);
  });

  it("does not star an assignment pointing at a different field", () => {
    expect(isFocusCourse(SEMINAR, null, "PHILOSOPHY", { [SEMINAR]: "POLITICAL_SCIENCE" })).toBe(false);
  });

  it("lets the student's assignment override the catalog's own tag", () => {
    // The student writes the paper in political science; the catalog guessed
    // philosophy from the department. The student is the authority.
    expect(effectiveDiscipline(TAGGED, "PHILOSOPHY", { [TAGGED]: "POLITICAL_SCIENCE" }))
      .toBe("POLITICAL_SCIENCE");
    expect(isFocusCourse(TAGGED, "PHILOSOPHY", "PHILOSOPHY", { [TAGGED]: "POLITICAL_SCIENCE" }))
      .toBe(false);
  });

  it("stars nothing at all before a focus area is chosen", () => {
    // An override without a focus area must not light anything up.
    expect(isFocusCourse(SEMINAR, null, null, { [SEMINAR]: "PHILOSOPHY" })).toBe(false);
    expect(isFocusCourse(TAGGED, "PHILOSOPHY", undefined)).toBe(false);
  });

  it("survives an empty or missing override map", () => {
    expect(isFocusCourse(TAGGED, "PHILOSOPHY", "PHILOSOPHY", {})).toBe(true);
    expect(isFocusCourse(TAGGED, "PHILOSOPHY", "PHILOSOPHY", null)).toBe(true);
  });
});
