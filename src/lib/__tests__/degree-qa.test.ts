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

  // ── Normalized matching (step 1) — these paraphrases dropped to the fallback
  // under the old plain-substring matcher; the normalizer now lands them. ──
  it("matches a credits question written with niqqud", () => {
    const a = answerDegreeQuestion("כַּמָּה שֵׂ״ס נִשְׁאֲרוּ לִי?", ctx({}));
    expect(a.text).toContain("54");
  });

  it("matches binary when written with hyphens instead of spaces", () => {
    const a = answerDegreeQuestion("עדיף לי עובר-לא-עובר בקורס הזה?", ctx({}));
    expect(a.text).toContain("עובר");
  });

  it("matches 'what's missing' written with a maqaf", () => {
    const a = answerDegreeQuestion(
      "מה־חסר לי לתואר?",
      ctx({ failedRules: [{ nameHe: "משפט", nameEn: "Law", deficit: 6 }] }),
    );
    expect(a.text).toContain("משפט");
  });

  it("gives concrete levers for 'how to improve my average'", () => {
    const a = answerDegreeQuestion("איך לשפר את הממוצע שלי?", ctx({ binaryRemaining: 3 }));
    expect(a.text).toMatch(/מנופים|בינארי|כבדים/);
    expect(a.text).toContain("3"); // binary conversions remaining
    expect(a.href).toBe("/graduation");
  });

  it("does not confuse 'what is my average' with the improve handler", () => {
    const a = answerDegreeQuestion("מה הממוצע שלי?", ctx({}));
    expect(a.text).toContain("84"); // the value, not improvement tips
    expect(a.text).not.toMatch(/מנופים/);
  });

  it("picks the more specific intent by score, not handler order", () => {
    // Mentions the average AND asks specifically about honors — the honors
    // handler's longer, more-specific key should win over a bare 'ממוצע' hit.
    const a = answerDegreeQuestion("עם הממוצע שלי יש לי סיכוי להצטיינות?", ctx({}));
    expect(a.text.toLowerCase()).toMatch(/הצטיינות|honors/);
  });
});
