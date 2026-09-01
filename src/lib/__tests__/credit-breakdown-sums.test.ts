// =========================================================================
// A breakdown that does not sum to its own headline (#49)
// =========================================================================
// Ariel: "זה לא מגיע ל-150 אפילו.. אתה סגור על מה שכתוב כאן?"
//
// The overview card printed 150 as a headline over three cards reading
// 101 / 35 / 12 — which is 148. An app that cannot add its own four numbers is
// an app whose other numbers a student stops trusting, and every other number
// here is the point of the product.
//
// The 101 was not a typo. It is a deliberate, documented gate: the published
// catalog can only supply 101 mandatory credits, because 2 of the official 103
// belong to a PPE course TAU has announced but not published. Requiring 103
// would permanently red-flag a student who has done everything available.
//
// So there are two real numbers making two different claims, and the fix is to
// keep both: DISPLAY what the ידיעון publishes, GATE on what a student can
// actually earn, and say the difference out loud instead of dropping it.

import { describe, it, expect } from "vitest";
import { CREDIT_REQUIREMENTS } from "@/lib/constants";
import { getProgramById } from "@/lib/programs/registry";

describe("the displayed breakdown adds up to the displayed total", () => {
  it("official mandatory + electives + seminars === total", () => {
    const sum =
      CREDIT_REQUIREMENTS.MANDATORY_OFFICIAL +
      CREDIT_REQUIREMENTS.ELECTIVE_TOTAL +
      CREDIT_REQUIREMENTS.SEMINAR_TOTAL;
    expect(sum).toBe(CREDIT_REQUIREMENTS.TOTAL);
  });

  it("the witness: the GATE figure is what did not add up", () => {
    // Kept so the reason this test exists stays legible. If the unpublished
    // course ever ships, this difference goes to zero and the assertion below
    // becomes trivially true — which is the correct end state, not a failure.
    const gateSum =
      CREDIT_REQUIREMENTS.MANDATORY_TOTAL +
      CREDIT_REQUIREMENTS.ELECTIVE_TOTAL +
      CREDIT_REQUIREMENTS.SEMINAR_TOTAL;
    expect(CREDIT_REQUIREMENTS.TOTAL - gateSum).toBe(
      CREDIT_REQUIREMENTS.MANDATORY_UNPUBLISHED,
    );
  });

  it("the five discipline rows sum to the mandatory figure above them", () => {
    // The gap this test did NOT cover the first time. #49 was fixed at the top
    // of the overview card — 103 + 35 + 12 = 150 — while two sections down the
    // same card listed five disciplines adding to 87, sixteen short of the 103
    // they sit under. A test that checks only the headline lets the breakdown
    // beneath it drift, which is exactly what happened.
    const shown = getProgramById(null)
      .disciplines.filter((d) => d.id !== "GENERAL" && d.minCredits > 0)
      .reduce((sum, d) => sum + (d.officialMinCredits ?? d.minCredits), 0);
    expect(shown).toBe(CREDIT_REQUIREMENTS.MANDATORY_OFFICIAL);
  });

  it("every displayed discipline figure is at least its gate", () => {
    // The direction that would harm a student: displaying LESS than they are
    // actually checked against.
    for (const d of getProgramById(null).disciplines) {
      if (d.id === "GENERAL" || d.minCredits <= 0) continue;
      expect(d.officialMinCredits ?? d.minCredits).toBeGreaterThanOrEqual(d.minCredits);
    }
  });

  it("never gates on more than a student can actually earn", () => {
    // The reason the gate is 101. If this ever inverts, a student who has done
    // every published mandatory course is told they are short.
    expect(CREDIT_REQUIREMENTS.MANDATORY_TOTAL).toBeLessThanOrEqual(
      CREDIT_REQUIREMENTS.MANDATORY_OFFICIAL,
    );
  });

  it("the gap is stated, not implied", () => {
    // A difference the app knows about must be nameable, so the card can
    // explain it rather than leaving a student to notice the arithmetic.
    expect(
      CREDIT_REQUIREMENTS.MANDATORY_OFFICIAL - CREDIT_REQUIREMENTS.MANDATORY_TOTAL,
    ).toBe(CREDIT_REQUIREMENTS.MANDATORY_UNPUBLISHED);
  });
});
