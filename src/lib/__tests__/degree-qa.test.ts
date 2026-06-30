import { describe, it, expect } from "vitest";
import { answerDegreeQuestion, type QAContext } from "@/lib/degree-qa";

function ctx(over: Partial<QAContext>): QAContext {
  return {
    isHe: true,
    effectiveTotal: 96,
    earned: 75,
    planned: 13,
    miluimExemption: 8,
    mandatory: 80,
    elective: 8,
    seminar: 0,
    focusAreaCredits: 38,
    focusAreaTarget: 60,
    englishCourseCount: 3,
    courseAverage: 84,
    hasFocusArea: true,
    focusAreaNameHe: "כלכלה",
    focusAreaNameEn: "Economics",
    currentYear: 2,
    amiramScore: 133,
    miluimGroupName: "קבוצה C",
    binaryRemaining: 5,
    failedRules: [],
    seminarPlannedCount: 0,
    ...over,
  };
}

describe("answerDegreeQuestion", () => {
  it("answers remaining credits from the student's data", () => {
    const a = answerDegreeQuestion("כמה ש״ס נשארו לי?", ctx({}));
    expect(a.text).toContain("54"); // 150 - 96
  });

  it("reports the overall average", () => {
    const a = answerDegreeQuestion("מה הממוצע שלי?", ctx({}));
    expect(a.text).toContain("84");
  });

  it("explains binary and shows the remaining quota for a miluim student", () => {
    const a = answerDegreeQuestion("מה זה בינארי?", ctx({ binaryRemaining: 3 }));
    expect(a.text).toContain("עובר");
    expect(a.text).toContain("3");
    expect(a.href).toBe("/planner");
  });

  it("gives the Amiram placement for English questions", () => {
    const a = answerDegreeQuestion("מה הסטטוס באנגלית?", ctx({ amiramScore: 133 }));
    expect(a.text).toContain("מתקדמים ב׳");
  });

  it("surfaces the most pressing missing requirements", () => {
    const a = answerDegreeQuestion("מה חסר לי?", ctx({
      failedRules: [{ nameHe: "משפט", nameEn: "Law", deficit: 6 }],
    }));
    expect(a.text).toContain("משפט");
    expect(a.href).toBe("/regulations");
  });

  it("falls back with its capabilities when it doesn't understand", () => {
    const a = answerDegreeQuestion("מה השעה?", ctx({}));
    expect(a.text).toContain("אני יכול לעזור");
  });

  it("prompts to add an Amiram score when missing", () => {
    const a = answerDegreeQuestion("אנגלית", ctx({ amiramScore: null }));
    expect(a.text).toContain("לא הזנת");
    expect(a.href).toBe("/settings");
  });
});
