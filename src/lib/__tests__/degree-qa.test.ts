import { describe, it, expect } from "vitest";
import { answerDegreeQuestion, type QAContext } from "@/lib/degree-qa";
import { GRADE_WEIGHTS, SEMINAR_REQUIREMENTS } from "@/lib/constants";

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

  it("forecasts graduation from remaining credits", () => {
    const a = answerDegreeQuestion("מתי אסיים את התואר?", ctx({})); // effectiveTotal 96 → 54 left → ~3 sem
    expect(a.text).toContain("54");
    expect(a.text).toMatch(/סמסטרים/);
  });

  it("gives concrete levers for 'how to improve my average'", () => {
    const a = answerDegreeQuestion("איך לשפר את הממוצע שלי?", ctx({ binaryRemaining: 3 }));
    expect(a.text).toMatch(/מנופים|בינארי|כבדים/);
    expect(a.text).toContain("3"); // binary conversions remaining
    expect(a.href).toBe("/graduation");
  });

  it("does NOT offer the binary lever to a non-reservist (audit HIGH #2)", () => {
    // A non-miluim student whose binaryRemaining is the universal BA fallback
    // of 5 must not be told he has miluim pass/fail conversions.
    const a = answerDegreeQuestion(
      "איך לשפר את הממוצע שלי?",
      ctx({ miluimGroupName: null, binaryRemaining: 5 }),
    );
    expect(a.text).not.toMatch(/בינארי|pass\/fail/);
    expect(a.text).toMatch(/כבדים|מנופים/); // still gives the non-miluim levers
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

  it("states the seminar weight from program config, not a hard-coded 18%", () => {
    const a = answerDegreeQuestion("כמה סמינרים אני צריך?", ctx({ seminar: 0 }));
    const pct = Math.round(GRADE_WEIGHTS.SEMINAR_PAPERS * 100);
    expect(a.text).toContain(`${pct}%`);
    expect(a.text).toContain(`${SEMINAR_REQUIREMENTS.PAPERS} עבודות`);
  });

  it("explains bidding as mechanism + the overlap trap, never predicting points", () => {
    const a = answerDegreeQuestion("איך עובד הבידינג?", ctx({}));
    expect(a.text).toContain("מכרז");
    expect(a.text).toMatch(/חופף|מבטל/); // the trap
    // must NOT invent how many points a course "needs"
    expect(a.text).not.toMatch(/צריך\s*\d+\s*נקודות/);
    expect(a.text).not.toMatch(/כדאי להשקיע\s*\d+/);
  });

  it("answers remaining MANDATORY credits from the student's data", () => {
    const a = answerDegreeQuestion("כמה חובה נשאר לי?", ctx({ mandatory: 60 }));
    expect(a.text).toContain("חובה");
    expect(a.text).toContain("60");
  });

  it("explains Moed B and warns the last grade counts", () => {
    const a = answerDegreeQuestion("מתי כדאי ללכת למועד ב׳?", ctx({}));
    expect(a.text).toMatch(/מועד ב|האחרון קובע/);
    expect(a.href).toBe("/exam-planner");
  });

  it("explains the final-grade formula from config weights", () => {
    const a = answerDegreeQuestion("איך מחשבים ציון גמר?", ctx({}));
    const semPct = Math.round(GRADE_WEIGHTS.SEMINAR_PAPERS * 100);
    expect(a.text).toContain(`${semPct}%`);
    expect(a.text).toMatch(/רפרט|משוקלל/);
  });

  it("tells an exempt student English does not affect the average", () => {
    const a = answerDegreeQuestion("מה הסטטוס שלי באנגלית?", ctx({ amiramScore: 140 }));
    expect(a.text).toMatch(/פטור/);
    expect(a.text).toMatch(/לא משפיע/);
  });

  it("tells a non-exempt student English does NOT count toward the average (#36, owner-verified)", () => {
    const a = answerDegreeQuestion("מה הסטטוס שלי באנגלית?", ctx({ amiramScore: 100 }));
    expect(a.text).toMatch(/אינו נכנס לממוצע|לא משפיע/);
    expect(a.text).not.toMatch(/נספר בממוצע/);
  });

  it("routes 'נקודות זכות' to credits, not to the bidding handler", () => {
    const a = answerDegreeQuestion("כמה נקודות זכות יש לי?", ctx({}));
    expect(a.text).not.toContain("מכרז");
  });

  it("does not force a bare 'פטור' question into the miluim non-sequitur", () => {
    // A non-miluim student asking generally about an exemption must NOT get
    // "you haven't set miluim service" — the bare 'פטור' key was over-broad.
    const a = answerDegreeQuestion("מה הפטור שלי?", ctx({ miluimGroupName: undefined }));
    expect(a.text).not.toContain("לא הגדרת שירות מילואים");
  });
});
