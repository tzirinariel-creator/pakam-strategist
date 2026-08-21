import { describe, it, expect } from "vitest";
import { englishPlannerSignal } from "../english-planner-signal";

const ARIEL = {
  nameHe: "מתקדמים ב' חוצה דיצפלינות בין תחומי",
  courseCode: "2171-9201",
  grade: 90,
  status: "COMPLETED",
};

describe("englishPlannerSignal", () => {
  it("knows Ariel finished the level track", () => {
    // The fourth report of this. The chain was already correct; the planner
    // simply never asked.
    const s = englishPlannerSignal("ADVANCED_B", null, [ARIEL]);
    expect(s.kind).toBe("level-track-done");
    expect(s.remaining).toBe(0);
    expect(s.passed).toBe(1);
  });

  it("works from the course NAME alone, with no code", () => {
    const { courseCode: _drop, ...noCode } = ARIEL;
    expect(englishPlannerSignal("ADVANCED_B", null, [noCode]).kind).toBe("level-track-done");
  });

  it("still reports what is owed when nothing was passed", () => {
    const s = englishPlannerSignal("ADVANCED_B", null, []);
    expect(s.kind).toBe("level-courses-left");
    expect(s.remaining).toBeGreaterThan(0);
    expect(s.passed).toBe(0);
  });

  it("says nothing at all when the placement is unknown", () => {
    // A confident "0 left" for a student we know nothing about is worse than
    // silence, so the caller renders nothing on this.
    expect(englishPlannerSignal(null, null, []).kind).toBe("unknown");
    expect(englishPlannerSignal(null, null, [ARIEL]).kind).toBe("unknown");
  });

  it("reports an exempt student as exempt", () => {
    expect(englishPlannerSignal("EXEMPT", null, []).kind).toBe("exempt");
  });

  it("lets a declared level beat an amiram score", () => {
    // englishLevel from the sheet wins — the rule the rest of the app obeys.
    expect(englishPlannerSignal("EXEMPT", 100, []).kind).toBe("exempt");
  });

  it("does not credit a failing English grade", () => {
    // English passes at 70, not 60.
    const s = englishPlannerSignal("ADVANCED_B", null, [{ ...ARIEL, grade: 65 }]);
    expect(s.passed).toBe(0);
    expect(s.kind).toBe("level-courses-left");
  });
});
