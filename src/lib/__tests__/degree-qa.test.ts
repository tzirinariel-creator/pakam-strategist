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

  it("routes a course-specific grade question to the honest record answer, NOT the average (#36)", () => {
    // "הציון שלי ב<קורס>" must beat the general "הציון שלי" under the
    // length-weighted matcher: no per-course grade is in the aggregate context,
    // so the King must send the student to /record and never guess a grade.
    const a = answerDegreeQuestion("מה הציון שלי בקורס מבוא לכלכלה?", ctx({}));
    expect(a.href).toBe("/record");
    expect(a.text).toContain("אני לא מנחש ציונים");
    expect(a.text).not.toContain("84"); // did not fall through to the average
  });

  it("overall / degree / year / general average questions return the REAL overall average (King-audit 22.7 regression fix)", () => {
    // Regression guard: round-1 keyed the greedy prefixes "הממוצע שלי ב" /
    // "average in". Hebrew ‏ב‏ is a one-letter preposition that glues to the next
    // word, so those swallowed legit overall-average questions and deflected them
    // to /record. All of these must now return the actual overall number (84).
    for (const q of [
      "מה הממוצע שלי בתואר?",
      "what is my average in the degree?",
      "מה הממוצע שלי בשנה הזאת?",
      "מה הממוצע הכללי שלי?",
    ]) {
      expect(answerDegreeQuestion(q, ctx({})).text).toContain("84");
    }
    // …while an UNAMBIGUOUSLY course-scoped average ("ממוצע בקורס X") still routes
    // to the honest record redirect — a single course has a grade, not an average.
    const c = answerDegreeQuestion("מה הממוצע בקורס מבוא לכלכלה?", ctx({}));
    expect(c.href).toBe("/record");
    expect(c.text).not.toContain("84");
  });

  it("explains binary and shows the remaining quota for a miluim student", () => {
    const a = answerDegreeQuestion("מה זה בינארי?", ctx({ binaryRemaining: 3 }));
    expect(a.text).toContain("עובר");
    expect(a.text).toContain("3");
    // 12.7 #28: the answer now routes to the record (where marking happens)
    expect(a.href).toBe("/record");
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

  it("prompts to add an English level when BOTH score and declared level are missing", () => {
    const a = answerDegreeQuestion("אנגלית", ctx({ amiramScore: null }));
    expect(a.text).toContain("אין רמת-אנגלית");
    expect(a.href).toBe("/settings");
  });

  // #23 — the DECLARED level (grade sheet) overrides the score everywhere:
  // with no score at all, a declared EXEMPT must answer "פטור" and must NOT
  // claim the Amiram is the source.
  it("honors a declared English level with no Amiram score (#23)", () => {
    const a = answerDegreeQuestion("אנגלית", ctx({ amiramScore: null, englishLevel: "EXEMPT" }));
    expect(a.text).toContain("פטור");
    expect(a.text).toContain("לפי הרמה מהגיליון");
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

  it("genders the English exemption answer by the student's gender", () => {
    const male = answerDegreeQuestion("מה הסטטוס באנגלית?", ctx({ amiramScore: 140, gender: "male" }));
    expect(male.text).toContain("אתה פטור");
    const female = answerDegreeQuestion("מה הסטטוס באנגלית?", ctx({ amiramScore: 140, gender: "female" }));
    expect(female.text).toContain("את פטורה");
    const unknown = answerDegreeQuestion("מה הסטטוס באנגלית?", ctx({ amiramScore: 140, gender: null }));
    expect(unknown.text).toContain("את/ה פטור/ה"); // neutral fallback
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

// ── 14.7 W1 — new plan-fact handlers (never invent a date; honest empties) ──
describe("W1 handlers — next exam / semester load / hardest / grade honesty", () => {
  const may = new Date("2026-05-01T00:00:00");
  const exam = (name: string, days: number, moed: "A" | "B" = "A") => ({
    nameHe: name, nameEn: name, date: new Date(may.getTime() + days * 86_400_000), moed,
  });

  it("H-NEXT-EXAM lists the soonest real dates, never a guess", () => {
    const a = answerDegreeQuestion("מתי המבחן הקרוב שלי?", ctx({
      now: may,
      upcomingExams: [exam("מיקרו", 10), exam("מאקרו", 3)],
    }));
    expect(a.matched).toBe(true);
    expect(a.text).toContain("מאקרו"); // soonest first (sorted by caller; handler shows as-given)
    expect(a.text).not.toMatch(/המצא|לא ידוע/);
  });

  it("H-NEXT-EXAM with no dates refuses to invent one", () => {
    const a = answerDegreeQuestion("מתי הבחינה הקרובה?", ctx({ upcomingExams: [] }));
    expect(a.text).toContain("שפורסמו");
    expect(a.text).toContain("לא ממציא");
  });

  it("'מתי מועד ב׳' still routes to the Moed-B handler (guard, not next-exam)", () => {
    const a = answerDegreeQuestion("מתי כדאי ללכת למועד ב׳?", ctx({ upcomingExams: [exam("מיקרו", 5)] }));
    expect(a.text).toContain("הציון האחרון קובע");
  });

  it("H-SEMESTER-LOAD counts credits + names, or says none", () => {
    const a = answerDegreeQuestion("מה אני לומד הסמסטר?", ctx({
      currentSemesterCourses: [
        { nameHe: "מיקרו", nameEn: "Micro", credits: 5 },
        { nameHe: "לוגיקה", nameEn: "Logic", credits: 4 },
      ],
    }));
    expect(a.text).toContain("2 קורסים");
    expect(a.text).toContain("9 ש״ס");
    const empty = answerDegreeQuestion("אילו קורסים יש לי הסמסטר?", ctx({ currentSemesterCourses: [] }));
    expect(empty.text).toContain("לא רשומים");
  });

  it("H-HARDEST names a source, or admits no data", () => {
    const a = answerDegreeQuestion("מה הקורס הכי קשה שנשאר לי?", ctx({
      // failRate is a 0-100 percentage (schema.prisma:184). 22 → "22% כישלון".
      hardestRemaining: { nameHe: "סטטיסטיקה", nameEn: "Stats", difficultyLevel: "hard", averageGrade: 69, failRate: 22 },
    }));
    expect(a.text).toContain("סטטיסטיקה");
    expect(a.text).toContain("ממוצע 69");
    // The fail-rate must render as-is (22%), NOT ×100 into a fabricated "2200%".
    expect(a.text).toContain("22% כישלון");
    expect(a.text).not.toContain("2200");
    expect(a.text).toContain("קטלוג");
    const none = answerDegreeQuestion("איזה קורס הכי קשה?", ctx({ hardestRemaining: null }));
    expect(none.text).toContain("אין לי נתוני-קושי");
  });

  it("final-grade is honest when no seminar is graded yet", () => {
    const a = answerDegreeQuestion("איך מחשבים את ציון הגמר?", ctx({ seminar: 0 }));
    expect(a.text).toContain("עדיין אי-אפשר");
    const withSem = answerDegreeQuestion("איך מחשבים את ציון הגמר?", ctx({ seminar: 8 }));
    expect(withSem.text).not.toContain("עדיין אי-אפשר");
  });
});

// ── #22 (13.8): "הממוצע הכללי שלך כרגע: —" ──
// An em-dash where a number belongs is a dead end: it reads as a broken field,
// not as an answer. A missing number is information — say it, and hand over the
// next step.
describe("year-transition answer with no grades recorded (#22)", () => {
  it("never prints a bare em-dash where the average should be", () => {
    const a = answerDegreeQuestion("מה תנאי מעבר שנה?", ctx({ courseAverage: null }));
    expect(a.text).not.toContain("כרגע: —");
    expect(a.text).not.toMatch(/[:：]\s*—\s*\.?$/);
  });

  it("says plainly that nothing is recorded yet, and offers the next step", () => {
    const a = answerDegreeQuestion("מה תנאי מעבר שנה?", ctx({ courseAverage: null }));
    expect(a.text).toContain("עוד לא שמורים ציונים");
    expect(a.href).toBe("/graduation");
    expect(a.cta).toBe("למחשבון הציונים");
  });

  it("still states the rule itself — warmth never costs the requirement", () => {
    const a = answerDegreeQuestion("מה תנאי מעבר שנה?", ctx({ courseAverage: null }));
    expect(a.text).toContain("75");
    expect(a.text).toContain("80");
  });

  it("with grades, quotes the real average and where it stands", () => {
    const above = answerDegreeQuestion("מה תנאי מעבר שנה?", ctx({ courseAverage: 84 }));
    expect(above.text).toContain("84.0");
    expect(above.text).toContain("מעל הסף הכללי");
    expect(above.text).not.toMatch(/— [^—]*—/); // no double-dash stutter (live QA 13.8)
    expect(above.href).toBeUndefined();
    const below = answerDegreeQuestion("מה תנאי מעבר שנה?", ctx({ courseAverage: 71.25 }));
    expect(below.text).toContain("71.3");
    expect(below.text).toContain("מתחת לסף הכללי");
  });

  it("English keeps the same honesty", () => {
    const a = answerDegreeQuestion("year transition", ctx({ courseAverage: null, isHe: false }));
    expect(a.text).toContain("no grades recorded yet");
    expect(a.text).not.toContain("—.");
  });
});

// ── #22 (13.8): a hello is not "לא בטוח שהבנתי" ──
describe("social talk (#22)", () => {
  it("answers a greeting warmly instead of listing capabilities", () => {
    const a = answerDegreeQuestion("ומה שלומך?", ctx({}));
    expect(a.matched).toBe(true);
    expect(a.text).toContain("תודה ששאלת");
    expect(a.text).not.toContain("לא בטוח שהבנתי");
    // …and it hands the turn straight back to the degree.
    expect(a.text).toMatch(/הסמסטר הקרוב|הש״ס שנשארו|הציונים/);
  });

  it("invents no data in the pleasantry", () => {
    const a = answerDegreeQuestion("בוקר טוב", ctx({ courseAverage: null }));
    expect(a.text).not.toMatch(/\d/);
  });

  it("acknowledges thanks distinctly", () => {
    expect(answerDegreeQuestion("תודה רבה", ctx({})).text).toContain("בשמחה");
  });

  it("does NOT swallow a real question that opens with a greeting", () => {
    const a = answerDegreeQuestion("בוקר טוב, כמה ש״ס נשארו לי?", ctx({}));
    expect(a.text).toContain("54");
  });

  it("does NOT swallow 'מה קורה אם…'", () => {
    const a = answerDegreeQuestion("מה קורה אם אני נכשל פעמיים באותו קורס?", ctx({}));
    expect(a.text).not.toContain("תודה ששאלת");
  });

  it("English greeting works too", () => {
    const a = answerDegreeQuestion("how are you", ctx({ isHe: false }));
    expect(a.text).toContain("thanks for asking");
  });
});

// Live QA (13.8) — two real defects found by asking the app real questions.
describe("bidding intent + the corrected overlap rule", () => {
  const c = ctx({});

  it("routes 'מתי נפתח מקצה הבידינג הראשון לשנה הבאה?' to BIDDING, not year-transition", () => {
    // "לשנה הבאה" used to be a year-transition key. The matcher is
    // length-weighted, so it out-scored "בידינג" (9 chars vs 6) and answered
    // with the 75/80 rule — the תשפ״ז bidding dates were unreachable by the
    // most natural phrasing.
    const a = answerDegreeQuestion("מתי נפתח מקצה הבידינג הראשון לשנה הבאה?", c);
    expect(a.text).not.toContain("75");
    expect(a.text).toMatch(/מכרז|בידינג/);
  });

  it("still routes a genuine year-transition question correctly", () => {
    const a = answerDegreeQuestion("מה תנאי מעבר שנה?", c);
    expect(a.text).toContain("75");
  });

  it("never states the round-2 displacement rule as if it applied within a round", () => {
    // The official תשפ״ז guidelines say two DIFFERENT things and the app had
    // collapsed them into one wrong absolute: within a round the HIGHER BID
    // wins ("השיבוץ ייעשה על פי הקורס בעל מספר הנקודות הגבוה יותר"); only in
    // round 2 does an overlapping course cancel a round-1 placement. A student
    // could have mis-registered on the strength of the old sentence.
    const a = answerDegreeQuestion("איך עובד הבידינג?", c);
    expect(a.text).not.toContain("מבטל את הקודם");
    expect(a.text).toMatch(/ניקוד הגבוה|הניקוד הגבוה/);
  });
});
