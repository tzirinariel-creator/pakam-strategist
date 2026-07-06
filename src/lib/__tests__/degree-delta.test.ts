import { describe, it, expect } from "vitest";
import { degreePct, diffBreakdown } from "@/lib/degree-delta";
import { CREDIT_REQUIREMENTS } from "@/lib/constants";
import type { CreditBreakdown } from "@/types/degree";

// Minimal valid breakdown builder — only the fields the delta logic reads.
function bd(over: Partial<CreditBreakdown>): CreditBreakdown {
  return {
    total: 0,
    earned: 0,
    planned: 0,
    mandatory: 0,
    elective: 0,
    seminar: 0,
    practice: 0,
    byDiscipline: {},
    focusArea: 0,
    focusAreaTarget: CREDIT_REQUIREMENTS.FOCUS_AREA_MIN,
    english: 0,
    englishCourseCount: 0,
    miluimExemption: 0,
    effectiveTotal: 0,
    ...over,
  };
}

describe("degreePct", () => {
  it("matches the DegreeStatus formula (round of effective/total)", () => {
    expect(degreePct(bd({ effectiveTotal: 75 }))).toBe(50); // 75/150
    expect(degreePct(bd({ effectiveTotal: 96 }))).toBe(64); // the demo user's number
  });

  it("clamps at 100 and handles null", () => {
    expect(degreePct(bd({ effectiveTotal: 999 }))).toBe(100);
    expect(degreePct(null)).toBe(0);
  });
});

describe("diffBreakdown", () => {
  it("names the % movement from server values", () => {
    const d = diffBreakdown(bd({ effectiveTotal: 82 }), bd({ effectiveTotal: 96 }));
    expect(d.fromPct).toBe(55);
    expect(d.toPct).toBe(64);
    expect(d.closedLaneHe).toBeNull();
  });

  it("detects a lane crossing unmet → met (seminars)", () => {
    const before = bd({ seminar: 8 });
    const after = bd({ seminar: CREDIT_REQUIREMENTS.SEMINAR_TOTAL });
    const d = diffBreakdown(before, after);
    expect(d.closedLaneHe).toBe("סמינרים");
    expect(d.closedLaneEn).toBe("seminars");
  });

  it("does NOT report a lane that was already met before", () => {
    const met = bd({ seminar: CREDIT_REQUIREMENTS.SEMINAR_TOTAL });
    const d = diffBreakdown(met, met);
    expect(d.closedLaneHe).toBeNull();
  });

  it("uses the after-snapshot's focusAreaTarget (miluim/program-specific)", () => {
    const before = bd({ focusArea: 55, focusAreaTarget: 56 });
    const after = bd({ focusArea: 56, focusAreaTarget: 56 });
    const d = diffBreakdown(before, after);
    expect(d.closedLaneHe).toBe("תחום מיקוד");
  });

  it("english lane counts courses, not credits", () => {
    const before = bd({ englishCourseCount: 1 });
    const after = bd({ englishCourseCount: CREDIT_REQUIREMENTS.ENGLISH_MIN_COURSES });
    expect(diffBreakdown(before, after).closedLaneHe).toBe("אנגלית");
  });

  it("null inputs degrade to 0% with no closed lane", () => {
    const d = diffBreakdown(null, null);
    expect(d.fromPct).toBe(0);
    expect(d.toPct).toBe(0);
    expect(d.closedLaneHe).toBeNull();
  });
});
