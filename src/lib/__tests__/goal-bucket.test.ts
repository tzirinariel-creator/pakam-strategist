import { describe, it, expect } from "vitest";
import { resolveGoalBucket } from "@/lib/goal-bucket";
import { CREDIT_REQUIREMENTS } from "@/lib/constants";
import type { CreditBreakdown } from "@/types/degree";

function bd(over: Partial<CreditBreakdown>): CreditBreakdown {
  return {
    total: 0, earned: 0, planned: 0, mandatory: 0, elective: 0, seminar: 0,
    practice: 0, byDiscipline: {}, focusArea: 0,
    focusAreaTarget: CREDIT_REQUIREMENTS.FOCUS_AREA_MIN,
    english: 0, englishCourseCount: 0, miluimExemption: 0, effectiveTotal: 0,
    ...over,
  };
}

describe("resolveGoalBucket", () => {
  it("maps the seminar-credits goal (He + En) to the seminar bucket", () => {
    const b = bd({ seminar: 4 });
    for (const goal of ["סמינרים", "נקודות זכות סמינריונים", "Seminar Credits"]) {
      const g = resolveGoalBucket(goal, b, true);
      expect(g).not.toBeNull();
      expect(g!.current).toBe(4);
      expect(g!.target).toBe(CREDIT_REQUIREMENTS.SEMINAR_TOTAL);
      expect(g!.met).toBe(false);
    }
  });

  it("does NOT mis-map 'seminar papers' / referat wording to the credits bucket", () => {
    const b = bd({});
    expect(resolveGoalBucket("עבודות סמינריוניות", b, true)).toBeNull();
    expect(resolveGoalBucket("Seminar Papers", b, true)).toBeNull();
    expect(resolveGoalBucket("רפרט סמינריון", b, true)).toBeNull();
  });

  it("english counts courses, focus honors a custom target", () => {
    const b = bd({ englishCourseCount: 1, focusArea: 30, focusAreaTarget: 56 });
    const en = resolveGoalBucket("דרישת אנגלית", b, true)!;
    expect(en.current).toBe(1);
    expect(en.unit).toBe("קורסים");
    const focus = resolveGoalBucket("תחום מיקוד", b, true)!;
    expect(focus.target).toBe(56);
  });

  it("returns null (no NaN gap-meter) when the lane's target is 0 — e.g. Law focusAreaMin=0", () => {
    const b = bd({ focusAreaTarget: 0 });
    expect(resolveGoalBucket("תחום מיקוד", b, true)).toBeNull();
  });

  it("unknown goals, null goal, and null breakdown all degrade to null", () => {
    expect(resolveGoalBucket("דרישה עתידית כלשהי", bd({}), true)).toBeNull();
    expect(resolveGoalBucket(null, bd({}), true)).toBeNull();
    expect(resolveGoalBucket("סמינרים", null, true)).toBeNull();
  });

  it("marks met=true when the bucket target is reached", () => {
    const b = bd({ mandatory: CREDIT_REQUIREMENTS.MANDATORY_TOTAL });
    expect(resolveGoalBucket("נקודות זכות חובה", b, true)!.met).toBe(true);
  });
});
