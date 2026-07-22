// =========================================================================
// H1 — "משתמשי זהב": the safety net for the calculation core.
// =========================================================================
// Five synthetic student profiles with FULL assertions over the four engines:
// calculateCredits (every bucket), calculateGraduationScore, the regulation
// engine (checkCompliance = runRegulationEngine), and calculateHonestLoad.
// Every expected value is justified in a comment against the PPE regulations
// (docs/pakam-domain-rules-2026.md + tau-ppe-2025.ts, נכון לתשפ"ו).
// Any future change to the core is automatically tested against these five.

import { describe, it, expect } from "vitest";
import { calculateCredits } from "@/lib/credit-calculator";
import { calculateGraduationScore } from "@/lib/grade-calculator";
import { runRegulationEngine } from "@/lib/regulations/rule-engine";
import { calculateHonestLoad } from "@/lib/workload-calculator";
import type { UserCourseWithCourse } from "@/types/degree";
import type { RegulationSummary } from "@/types/regulation";

// ── Course-row builder (same shape the engines receive from Prisma) ──
let seq = 0;
function uc(
  status: string,
  opts: {
    credits?: number;
    courseType?: string;
    discipline?: string;
    grade?: number | null;
    courseId?: string;
    attemptNumber?: number;
    plannedYear?: number;
    plannedSemester?: string;
    isBinary?: boolean;
    isMandatory?: boolean;
    submissionType?: string | null;
    submissionGrade?: number | null;
    weeklyHours?: number;
  } = {}
): UserCourseWithCourse {
  seq += 1;
  const courseType = opts.courseType ?? "ELECTIVE";
  return {
    id: `uc-${seq}`,
    userId: "u",
    courseId: opts.courseId ?? `c-${seq}`,
    status,
    grade: opts.grade ?? null,
    plannedYear: opts.plannedYear ?? 1,
    plannedSemester: opts.plannedSemester ?? "FALL",
    attemptNumber: opts.attemptNumber ?? 1,
    isGradeImproved: false,
    isBinary: opts.isBinary ?? false,
    disciplineOverride: null,
    submissionType: opts.submissionType ?? null,
    submissionGrade: opts.submissionGrade ?? null,
    notes: null,
    selectedGroups: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    course: {
      id: opts.courseId ?? `c-${seq}`,
      code: `C-${seq}`,
      nameHe: "קורס",
      nameEn: "Course",
      discipline: opts.discipline ?? "GENERAL",
      courseType,
      credits: opts.credits ?? 4,
      isMandatory: opts.isMandatory ?? courseType === "MANDATORY",
      canCountAs: [],
      weeklyHours: opts.weeklyHours ?? 0,
      yearOffered: [1, 2, 3],
      semesterOffered: ["FALL", "SPRING"],
      prerequisites: [],
    },
  } as unknown as UserCourseWithCourse;
}

const rule = (s: RegulationSummary, id: string) => {
  const r = s.results.find((x) => x.ruleId === id);
  if (!r) throw new Error(`rule ${id} missing from engine output`);
  return r;
};

// =========================================================================
// G1 — שנה א׳ טרי: zero courses. The empty state must be calm and compliant.
// =========================================================================
describe("golden G1 — fresh year-1 student (0 courses)", () => {
  const credits = calculateCredits([], null);
  const grades = calculateGraduationScore([]);
  const summary = runRegulationEngine([], null, 0, undefined, {
    academicYear: 1,
    currentSemester: "FALL",
  });

  it("credits: every bucket is exactly 0", () => {
    // תקנון: 150 ש״ס לתואר — אבל סטודנט טרי פשוט עוד לא צבר; אפס בכל דלי.
    expect(credits.breakdown.total).toBe(0);
    expect(credits.breakdown.earned).toBe(0);
    expect(credits.breakdown.planned).toBe(0);
    expect(credits.breakdown.mandatory).toBe(0);
    expect(credits.breakdown.elective).toBe(0);
    expect(credits.breakdown.seminar).toBe(0);
    expect(credits.breakdown.practice).toBe(0);
    expect(credits.breakdown.effectiveTotal).toBe(0);
    expect(credits.focusAreaMet).toBe(false); // דרישת 60 ש״ס בתחום מיקוד — רחוקה
  });

  it("grades: no average, no score, honestly null (never 0)", () => {
    // כנות לפני הכול: אין ציונים ⇒ אין ממוצע — null, לא "0".
    expect(grades.courseAverage).toBeNull();
    expect(grades.weightedScore).toBeNull();
    expect(grades.totalGradedCourses).toBe(0);
  });

  it("compliance: a fresh student VIOLATES NOTHING (progress ≠ violation)", () => {
    // עקרון המנוע: יעדי-צבירה שלא הושגו הם INFO (התקדמות), לא הפרה.
    expect(summary.violations).toBe(0);
    expect(summary.compliant).toBe(true);
    // PKM-014: אין קורסים שנוסו ⇒ עובר. PKM-023: אין כישלון-כפול ⇒ עובר.
    expect(rule(summary, "PKM-014").passed).toBe(true);
    expect(rule(summary, "PKM-023").passed).toBe(true);
    // PKM-016/017 (שערי מעבר-שנה): בלי ציוני שנה א׳ — ניטרליים, עוברים.
    expect(rule(summary, "PKM-016").passed).toBe(true);
    expect(rule(summary, "PKM-017").passed).toBe(true);
    // PKM-021/022 (אנגלית): בלי ציון אמירנט ובלי רמה מוצהרת — ניטרליים.
    expect(rule(summary, "PKM-021").passed).toBe(true);
    expect(rule(summary, "PKM-022").passed).toBe(true);
    // PKM-007: לא נבחר תחום מיקוד — נדנוד (WARNING), לא הפרה.
    expect(rule(summary, "PKM-007").severity).toBe("WARNING");
  });

  it("honest load: empty semester = three zeros, label 'light'", () => {
    const load = calculateHonestLoad([]);
    expect(load.weeklyHours).toBe(0);
    expect(load.credits).toBe(0);
    expect(load.tightestExamGapDays).toBeNull(); // אין שני מבחנים ידועים ⇒ null, לא 0
    expect(load.label).toBe("light");
  });
});

// =========================================================================
// G2 — שנה א׳ סמסטר ב׳ (מקביל לגיליון האמיתי): סמסטר א׳ עם ציונים,
// סמסטר ב׳ בלימוד, אמירנט 120 (מתקדמים ב׳ — עדיין לא פטור).
// =========================================================================
describe("golden G2 — year-1 spring student (semester A graded, B in progress)", () => {
  const courses = [
    // ── סמסטר א׳, COMPLETED ──
    uc("COMPLETED", { credits: 4, courseType: "MANDATORY", discipline: "PHILOSOPHY", grade: 100, plannedYear: 1 }),
    uc("COMPLETED", { credits: 2, courseType: "MANDATORY", discipline: "PHILOSOPHY", grade: 83, plannedYear: 1 }),
    uc("COMPLETED", { credits: 5, courseType: "MANDATORY", discipline: "PPE_CORE", grade: 100, plannedYear: 1 }),
    uc("COMPLETED", { credits: 4, courseType: "MANDATORY", discipline: "POLITICAL_SCIENCE", grade: 95, plannedYear: 1 }),
    uc("COMPLETED", { credits: 2, courseType: "ELECTIVE", discipline: "GENERAL", grade: 92, plannedYear: 1 }),
    // ── סמסטר ב׳, IN_PROGRESS (כמו *** בגיליון) ──
    uc("IN_PROGRESS", { credits: 5, courseType: "MANDATORY", discipline: "PPE_CORE", plannedYear: 1, plannedSemester: "SPRING" }),
    uc("IN_PROGRESS", { credits: 5, courseType: "MANDATORY", discipline: "ECONOMICS", plannedYear: 1, plannedSemester: "SPRING" }),
    uc("IN_PROGRESS", { credits: 4, courseType: "MANDATORY", discipline: "LAW", plannedYear: 1, plannedSemester: "SPRING" }),
    uc("IN_PROGRESS", { credits: 4, courseType: "ENGLISH", discipline: "GENERAL", plannedYear: 1, plannedSemester: "SPRING" }),
  ];
  const credits = calculateCredits(courses, null);
  const grades = calculateGraduationScore(courses);
  const summary = runRegulationEngine(courses, null, 0, undefined, {
    amirantScore: 120, // 120–133 = מתקדמים ב׳ (AMIRNET_CONFIG) — לא פטור
    academicYear: 1,
    currentSemester: "SPRING",
  });

  it("credits: earned=17 (semester A), planned=18 (semester B), total=35", () => {
    // COMPLETED ⇒ earned: 4+2+5+4+2=17. IN_PROGRESS ⇒ planned (#31): 5+5+4+4=18.
    expect(credits.breakdown.earned).toBe(17);
    expect(credits.breakdown.planned).toBe(18);
    expect(credits.breakdown.total).toBe(35);
    // דלי חובה: כל קורסי ה-MANDATORY = 4+2+5+4 + 5+5+4 = 29.
    expect(credits.breakdown.mandatory).toBe(29);
    // בחירה: קורס הבחירה (2) + קורס התוכן באנגלית (4; Fix #3 — נספר כבחירה) = 6.
    expect(credits.breakdown.elective).toBe(6);
    // פר-דיסציפלינה (התקנון: פיל׳ 18 / כלכלה 27 / מדינה 15 / משפט 14 / ייעודי 13):
    expect(credits.breakdown.byDiscipline["PHILOSOPHY"]).toBe(6);
    expect(credits.breakdown.byDiscipline["PPE_CORE"]).toBe(10);
    expect(credits.breakdown.byDiscipline["POLITICAL_SCIENCE"]).toBe(4);
    expect(credits.breakdown.byDiscipline["ECONOMICS"]).toBe(5);
    expect(credits.breakdown.byDiscipline["LAW"]).toBe(4);
    // אנגלית: קורס תוכן אחד בדרך (on-track נספר לדרישת ה-2 של PKM-012).
    expect(credits.breakdown.englishCourseCount).toBe(1);
  });

  it("grades: credit-weighted average of semester A only = 1630/17", () => {
    // (100·4 + 83·2 + 100·5 + 95·4 + 92·2) / 17 = 1630/17 = 95.882…
    expect(grades.courseAverage).toBeCloseTo(1630 / 17, 6);
    expect(grades.totalGradedCourses).toBe(5);
    expect(grades.weightedScore).toBeNull(); // אין עדיין סמינרים/רפרט ⇒ אין ציון גמר
  });

  it("compliance: year gates pass, English deadline warns (not exempt), zero violations", () => {
    // PKM-016 (תקנון §2): ממוצע שנה א׳ 95.88 ≥ 75 ⇒ עובר.
    expect(rule(summary, "PKM-016").passed).toBe(true);
    // PKM-017 (תקנון §2): ממוצע פכ״מ-ייעודי שנה א׳ = 100 ≥ 80 ⇒ עובר.
    expect(rule(summary, "PKM-017").passed).toBe(true);
    // PKM-021: אמירנט 120 ⇒ מתקדמים ב׳ — מידע, לא חסימה.
    expect(rule(summary, "PKM-021").passed).toBe(true);
    // PKM-022: לא פטור (צריך 134+) ובתוך החלון (שנה א׳ סמסטר ב׳) ⇒ WARNING.
    const deadline = rule(summary, "PKM-022");
    expect(deadline.passed).toBe(false);
    expect(deadline.severity).toBe("WARNING");
    // PKM-012: קורס תוכן 1 מתוך 2 ⇒ עדיין לא עובר, אבל INFO (התקדמות).
    const english = rule(summary, "PKM-012");
    expect(english.passed).toBe(false);
    expect(english.severity).toBe("INFO");
    // אזהרת-אנגלית אינה הפרה: הסטודנט תקין.
    expect(summary.violations).toBe(0);
    expect(summary.compliant).toBe(true);
  });

  it("honest load: three verifiable numbers for semester B, exam crunch labeled", () => {
    // שלושה מספרים שהסטודנט יכול לאמת מול הגריד — לא "ציון קסם" (עקרון 1).
    // Pin `now` BEFORE both exam dates so the future-only filter keeps them
    // both (calculateHonestLoad excludes past exams). Without this the test
    // silently depends on the wall clock — it passed until the real date
    // crossed 2026-07-20, then the July-20 exam dropped out and the gap read
    // null. Deterministic now = one clean fix for a whole class of flakiness.
    const NOW_BEFORE_EXAMS = new Date("2026-07-01T00:00:00Z").getTime();
    const load = calculateHonestLoad([
      { credits: 5, sessions: [
        { dayOfWeek: "SUN", startTime: "10:00", endTime: "12:00" },
        { dayOfWeek: "TUE", startTime: "14:00", endTime: "16:00" },
      ], examDate: "2026-07-20" },
      { credits: 5, sessions: [
        { dayOfWeek: "MON", startTime: "09:00", endTime: "12:00" },
        { dayOfWeek: "WED", startTime: "10:00", endTime: "11:00" },
      ], examDate: "2026-07-22" },
      { credits: 4, sessions: [
        { dayOfWeek: "THU", startTime: "12:00", endTime: "15:00" },
      ] }, // בלי תאריך מבחן — לא מומצא, פשוט לא נספר בצפיפות
    ], NOW_BEFORE_EXAMS);
    expect(load.credits).toBe(14); // 5+5+4 — ניתן לאימות מול הרשימה
    expect(load.weeklyHours).toBe(11); // 4+4+3 שעות מגע אמיתיות מהמערכת
    expect(load.tightestExamGapDays).toBe(2); // 20.7 → 22.7
    expect(load.label).toBe("examCrunch"); // פער ≤ 3 ימים = הכאב הכי חד
  });
});

// =========================================================================
// G3 — שנה ב׳ מילואימניק (קבוצה C): פטור-ש״ס 4, המרה בינארית אחת.
// =========================================================================
describe("golden G3 — year-2 reservist (group C, 4-credit exemption, 1 binary)", () => {
  const courses = [
    uc("COMPLETED", { credits: 5, courseType: "MANDATORY", discipline: "ECONOMICS", grade: 88, plannedYear: 2, weeklyHours: 5 }),
    uc("COMPLETED", { credits: 4, courseType: "MANDATORY", discipline: "PHILOSOPHY", grade: 76, plannedYear: 2, weeklyHours: 4 }),
    // ההמרה הבינארית: הציון נשאר רשום אבל מסומן isBinary — מחוץ לממוצע.
    uc("COMPLETED", { credits: 5, courseType: "MANDATORY", discipline: "PPE_CORE", grade: 62, isBinary: true, plannedYear: 2, weeklyHours: 5 }),
    uc("COMPLETED", { credits: 4, courseType: "ELECTIVE", discipline: "GENERAL", grade: 90, plannedYear: 2, weeklyHours: 4 }),
    uc("COMPLETED", { credits: 4, courseType: "MANDATORY", discipline: "POLITICAL_SCIENCE", grade: 85, plannedYear: 2, weeklyHours: 4 }),
  ];
  const MILUIM_EXEMPTION = 4; // פטור ש״ס ממילואים (מתווה: עד 8/שנה, תקרת 10 לתואר)
  const credits = calculateCredits(courses, null, MILUIM_EXEMPTION);
  const grades = calculateGraduationScore(courses);
  const summary = runRegulationEngine(courses, null, MILUIM_EXEMPTION, undefined, {
    academicYear: 2,
    currentSemester: "FALL",
    miluimGroup: "GROUP_C",
    // The one binary conversion is the in-plan isBinary course above; the manual
    // "external" counter is 0 (audit 22.7 — the engine now counts in-plan
    // conversions + external, so setting BOTH would double-count the same one).
    miluimBinaryUsed: 0,
    amirantScore: 140, // פטור מאנגלית (≥134) — מילואימניק שסגר אנגלית
  });

  it("credits: exemption lifts effectiveTotal but not earned", () => {
    expect(credits.breakdown.earned).toBe(22); // 5+4+5+4+4 — כולל הקורס הבינארי
    expect(credits.breakdown.total).toBe(22);
    // המתווה: פטור-מילואים נספר ליעד ה-150 ⇒ effectiveTotal = 22+4 = 26.
    expect(credits.breakdown.effectiveTotal).toBe(26);
    expect(credits.breakdown.miluimExemption).toBe(4);
  });

  it("grades: the binary-converted course is OUT of the average, its credits stay IN", () => {
    // ממוצע = (88·5 + 76·4 + 90·4 + 85·4) / (5+4+4+4) = 1444/17 — בלי ה-62 הבינארי.
    expect(grades.courseAverage).toBeCloseTo(1444 / 17, 6);
    expect(grades.totalGradedCourses).toBe(4); // לא 5 — הבינארי מוחרג
  });

  it("compliance: PKM-001 uses effectiveTotal; binary caps within limits; English exempt", () => {
    // PKM-001 קורא effectiveTotal (26/150) — INFO, לא הפרה.
    const total = rule(summary, "PKM-001");
    expect(total.passed).toBe(false);
    expect(total.severity).toBe("INFO");
    expect(total.details?.current).toBe(26);
    // PKM-024 (מתווה §6): המרה 1 מתוך מכסת התואר (5 ל-BA) ⇒ בתקציב.
    const binaryCap = rule(summary, "PKM-024");
    expect(binaryCap.passed).toBe(true);
    expect(binaryCap.details?.used).toBe(1);
    // PKM-025 (מתווה §6): שעות בינאריות ~1/5 מ-22 שעות השנה = 20% ≤ 25% ⇒ שומר הצטיינות.
    expect(rule(summary, "PKM-025").passed).toBe(true);
    // PKM-021/022: אמירנט 140 ⇒ פטור, אין דדליין.
    expect(rule(summary, "PKM-021").passed).toBe(true);
    expect(rule(summary, "PKM-022").passed).toBe(true);
    expect(summary.violations).toBe(0);
    expect(summary.compliant).toBe(true);
  });
});

// =========================================================================
// G4 — שנה ג׳ לקראת סיום: 3 עבודות סמינריוניות + רפרט ⇒ יש ציון-גמר משוקלל.
// =========================================================================
describe("golden G4 — year-3 finishing student (seminars + referat)", () => {
  const courses = [
    // קורסים רגילים עם ציונים (משקל שווה ⇒ ממוצע 90):
    uc("COMPLETED", { credits: 5, courseType: "MANDATORY", discipline: "ECONOMICS", grade: 88, plannedYear: 3 }),
    uc("COMPLETED", { credits: 5, courseType: "ELECTIVE", discipline: "ECONOMICS", grade: 92, plannedYear: 3 }),
    // 3 סמינרים לא-חובה עם עבודה (PAPER) — דלי הסמינרים (יעד 12 ש״ס; תקנון §1):
    uc("COMPLETED", { credits: 4, courseType: "SEMINAR", discipline: "PHILOSOPHY", submissionType: "PAPER", submissionGrade: 90, plannedYear: 3 }),
    uc("COMPLETED", { credits: 4, courseType: "SEMINAR", discipline: "ECONOMICS", submissionType: "PAPER", submissionGrade: 85, plannedYear: 3 }),
    uc("COMPLETED", { credits: 4, courseType: "SEMINAR", discipline: "POLITICAL_SCIENCE", submissionType: "PAPER", submissionGrade: 95, plannedYear: 3 }),
    // סמינר פכ״מ החובה (0651-3001) עם הרפרט — נספר בדלי החובה, לא בדלי הסמינרים:
    uc("COMPLETED", { credits: 4, courseType: "SEMINAR", discipline: "PPE_CORE", isMandatory: true, submissionType: "REFERAT", submissionGrade: 88, plannedYear: 3 }),
  ];
  const credits = calculateCredits(courses, "ECONOMICS");
  const grades = calculateGraduationScore(courses);
  const summary = runRegulationEngine(courses, "ECONOMICS", 0, undefined, {
    academicYear: 3,
    currentSemester: "SPRING",
    amirantScore: 140,
  });

  it("credits: seminar bucket 12 (electives), the MANDATORY PPE seminar goes to mandatory", () => {
    // תקנון §9b: סמינר החובה הוא חלק מ-103 החובה — לא מ-12 ש״ס הסמינרים.
    expect(credits.breakdown.seminar).toBe(12);
    expect(credits.breakdown.mandatory).toBe(5 + 4); // מנדטורי רגיל 5 + סמינר חובה 4
    // תחום מיקוד כלכלה: 5+5+4 (סמינר כלכלה) = 14 מתוך יעד 60.
    expect(credits.breakdown.focusArea).toBe(14);
    expect(credits.focusAreaMet).toBe(false);
  });

  it("grades: the weighted graduation score = 0.78·course + 0.18·papers + 0.04·referat", () => {
    // תקנון (נוסחת ציון-הגמר): קורסים 78% + עבודות סמינריוניות 18% + רפרט 4%.
    expect(grades.courseAverage).toBeCloseTo(90, 6); // (88·5+92·5)/10
    expect(grades.seminarPaperAverage).toBeCloseTo(90, 6); // (90+85+95)/3
    expect(grades.referatGrade).toBe(88);
    expect(grades.weightedScore).toBeCloseTo(0.78 * 90 + 0.18 * 90 + 0.04 * 88, 6); // 89.92
  });

  it("compliance: 3 papers + 1 referat met; graduation score above 60", () => {
    // PKM-008: 3 עבודות סמינריוניות (קורסים שונים) ⇒ עובר.
    expect(rule(summary, "PKM-008").passed).toBe(true);
    // PKM-009: רפרט אחד ⇒ עובר.
    expect(rule(summary, "PKM-009").passed).toBe(true);
    // PKM-019: 12/12 ש״ס סמינרים ⇒ עובר.
    expect(rule(summary, "PKM-019").passed).toBe(true);
    // PKM-013: ציון גמר 89.92 ≥ 60 ⇒ עובר.
    expect(rule(summary, "PKM-013").passed).toBe(true);
    expect(summary.violations).toBe(0);
    expect(summary.compliant).toBe(true);
  });
});

// =========================================================================
// G5 — חוזר על קורס: נכשל פעם אחת ועבר בניסיון שני; וגם התרחיש החוסם
// של כישלון כפול באותו קורס (תקנון §4).
// =========================================================================
describe("golden G5 — retaker (failed once, passed on attempt 2)", () => {
  const courses = [
    uc("FAILED", { courseId: "retake", credits: 4, courseType: "MANDATORY", discipline: "ECONOMICS", grade: 55, attemptNumber: 1, plannedYear: 1 }),
    uc("COMPLETED", { courseId: "retake", credits: 4, courseType: "MANDATORY", discipline: "ECONOMICS", grade: 78, attemptNumber: 2, plannedYear: 1 }),
    uc("COMPLETED", { credits: 4, courseType: "MANDATORY", discipline: "PHILOSOPHY", grade: 82, plannedYear: 1 }),
  ];
  const credits = calculateCredits(courses, null);
  const grades = calculateGraduationScore(courses);
  const summary = runRegulationEngine(courses, null, 0, undefined, {
    academicYear: 2,
    currentSemester: "FALL",
    amirantScore: 140,
  });

  it("credits: the retaken course counts ONCE (8 total, not 12)", () => {
    // FAILED מחוץ לצבירה; שני נסיונות = קורס אחד (canonicalAttempts, #audit-r5).
    expect(credits.breakdown.total).toBe(8);
    expect(credits.breakdown.earned).toBe(8);
    expect(credits.breakdown.byDiscipline["ECONOMICS"]).toBe(4);
  });

  it("grades: only the determining (last) attempt is averaged — TAU counts the last grade", () => {
    // ממוצע = (78·4 + 82·4) / 8 = 80 — הכישלון (55) לא נספר פעמיים ולא בכלל.
    expect(grades.courseAverage).toBeCloseTo(80, 6);
    expect(grades.totalGradedCourses).toBe(2);
  });

  it("compliance: one failure then a pass violates nothing", () => {
    // PKM-023 (תקנון §4): כישלון אחד + מעבר ⇒ אין כישלון-כפול.
    expect(rule(summary, "PKM-023").passed).toBe(true);
    // PKM-014: קורס שנכשל-ואז-עבר איננו "קורס כשלון" ⇒ שיעור כישלון 0%.
    const failRate = rule(summary, "PKM-014");
    expect(failRate.passed).toBe(true);
    expect(failRate.details?.failedCount).toBe(0);
    // PKM-015: 2 נסיונות ≤ מקסימום 3 ⇒ עובר.
    expect(rule(summary, "PKM-015").passed).toBe(true);
    // PKM-016: ממוצע שנה א׳ 80 ≥ 75 ⇒ שער המעבר פתוח.
    expect(rule(summary, "PKM-016").passed).toBe(true);
    expect(summary.violations).toBe(0);
    expect(summary.compliant).toBe(true);
  });

  it("BLOCKING variant: a SECOND failure in the same course is a real violation", () => {
    // תקנון §4: כישלון שני באותו קורס = אי-המשכה בפכ״מ ⇒ ERROR ⇒ לא-תקין.
    const twiceFailed = [
      uc("FAILED", { courseId: "dbl", credits: 4, courseType: "MANDATORY", discipline: "ECONOMICS", grade: 50, attemptNumber: 1, plannedYear: 1 }),
      uc("FAILED", { courseId: "dbl", credits: 4, courseType: "MANDATORY", discipline: "ECONOMICS", grade: 58, attemptNumber: 2, plannedYear: 1 }),
    ];
    const s = runRegulationEngine(twiceFailed, null, 0, undefined, {
      academicYear: 2,
      currentSemester: "FALL",
    });
    const failTwice = rule(s, "PKM-023");
    expect(failTwice.passed).toBe(false);
    expect(failTwice.severity).toBe("ERROR");
    expect(s.violations).toBeGreaterThanOrEqual(1);
    expect(s.compliant).toBe(false);
  });
});
