// P4 (note 35) — semester-type awareness: a typical year-1 (mandatory-heavy)
// semester defaults to the confirm-first flow; an elective-heavy one doesn't.

import { describe, it, expect } from "vitest";
import { mandatoryShare, isMandatoryHeavy, MANDATORY_HEAVY_SHARE } from "@/lib/semester-type";

const m = (credits: number) => ({ credits, courseType: "MANDATORY" });
const e = (credits: number) => ({ credits, courseType: "ELECTIVE" });

describe("semester-type awareness (P4)", () => {
  it("a typical year-1 semester (all mandatory) is heavy → confirm-first", () => {
    expect(isMandatoryHeavy([m(4), m(2), m(5), m(4), m(2)])).toBe(true);
    expect(mandatoryShare([m(4), m(2)])).toBe(1);
  });

  it("an elective-heavy semester (like the demo's year 2+) is NOT heavy → building mode", () => {
    // 9 mandatory of 21 total = ~0.43 < 0.7
    expect(isMandatoryHeavy([m(5), m(4), e(4), e(4), e(4)])).toBe(false);
  });

  it("the threshold is strict: exactly 70% mandatory does NOT trigger confirm-first", () => {
    // 7 of 10 = 0.7 exactly → not > 0.7.
    expect(mandatoryShare([m(7), e(3)])).toBeCloseTo(MANDATORY_HEAVY_SHARE, 10);
    expect(isMandatoryHeavy([m(7), e(3)])).toBe(false);
  });

  it("an empty semester is never 'heavy' (no auto-summary while loading)", () => {
    expect(isMandatoryHeavy([])).toBe(false);
    expect(mandatoryShare([])).toBe(0);
  });

  it("isMandatory flag counts like courseType MANDATORY (mandatory seminars)", () => {
    expect(isMandatoryHeavy([{ credits: 4, isMandatory: true, courseType: "SEMINAR" }])).toBe(true);
  });
});
