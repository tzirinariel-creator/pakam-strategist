import { describe, it, expect } from "vitest";
import { DIRECTIONS, directionById, signalsFor, SIGNAL_LABELS, type StudentFacts } from "../future-plans";

const FACTS: StudentFacts = {
  average: 87.4,
  focusArea: "ECONOMICS",
  englishRemaining: 0,
  englishExempt: false,
  seminarsCompleted: 1,
  quantitativeCredits: 22,
  creditsCompleted: 60,
};

describe("future plans", () => {
  it("never states a requirement of any programme", () => {
    // The whole design constraint: this app does not know what TAU's economics
    // MA, a foreign university, or the Ministry of Finance actually require.
    // A number presented as a bar would be invented, and a student would plan
    // two years around it.
    const prose = DIRECTIONS.flatMap((d) => [d.he, d.en, d.whyHe, d.whyEn]).join(" ");
    expect(prose).not.toMatch(/\b(8[0-9]|9[0-9]|100)\b/); // no threshold numbers
    expect(prose).not.toMatch(/דורש|נדרש ממוצע|requires a|minimum of/);
  });

  it("reports the student's own numbers, unjudged", () => {
    const econ = directionById("econ-masters")!;
    const s = signalsFor(econ, FACTS);
    expect(s.find((x) => x.id === "average")!.valueHe).toBe("87.4");
    // "in-progress", never "good" or "bad" — there is no bar to judge against.
    expect(s.find((x) => x.id === "average")!.state).toBe("in-progress");
  });

  it("says when a focus area fits the direction", () => {
    const econ = directionById("econ-masters")!;
    expect(signalsFor(econ, FACTS).find((x) => x.id === "focusArea")!.valueHe).toBe("מתאים לכיוון");
    const law = directionById("law")!;
    // Law implies no particular focus, so it never claims a fit.
    expect(law.suggestsFocus).toBeNull();
  });

  it("is honest about what it does not know", () => {
    const blank: StudentFacts = {
      average: null, focusArea: null, englishRemaining: null,
      englishExempt: false, seminarsCompleted: 0, quantitativeCredits: 0, creditsCompleted: 0,
    };
    const s = signalsFor(directionById("abroad")!, blank);
    expect(s.find((x) => x.id === "average")!.valueHe).toBe("עוד אין ציונים");
    expect(s.find((x) => x.id === "english")!.valueHe).toBe("לא ידוע");
    expect(s.every((x) => x.state !== "done")).toBe(true);
  });

  it("credits a finished English track without calling it exemption", () => {
    const s = signalsFor(directionById("abroad")!, FACTS);
    const eng = s.find((x) => x.id === "english")!;
    expect(eng.valueHe).toBe("קורסי הרמה הושלמו");
    expect(eng.valueHe).not.toContain("פטור");
    expect(eng.state).toBe("done");
  });

  it("offers 'not decided' as a real answer", () => {
    const u = directionById("undecided")!;
    expect(u).not.toBeNull();
    expect(u.signals.length).toBeGreaterThan(0);
  });

  it("labels every signal it can emit", () => {
    for (const d of DIRECTIONS) {
      for (const sig of d.signals) expect(SIGNAL_LABELS[sig]).toBeTruthy();
    }
  });
});
