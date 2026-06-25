// =========================================
// Regulation Rules — generic compliance checks
// =========================================
// Each rule is a pure function that receives a RuleContext
// (which includes the active ProgramDefinition) and returns
// a RegulationResult.
//
// Discipline-specific credit rules are generated dynamically
// from the ProgramDefinition — no hardcoded discipline names.

import type { RuleContext, RegulationRule, RegulationResult } from "@/types/regulation";
import type { DisciplineDefinition, ProgramDefinition } from "@/lib/programs/types";
import { getActiveProgram } from "@/lib/programs/registry";
import { getDiscipline } from "@/lib/programs/types";

// -------------------------------------------------------------------
// Helper: build a RegulationResult
// -------------------------------------------------------------------

function result(
  ruleId: string,
  nameEn: string,
  nameHe: string,
  passed: boolean,
  severity: RegulationResult["severity"],
  messageEn: string,
  messageHe: string,
  details?: Record<string, unknown>,
  affectedCourseIds?: string[]
): RegulationResult {
  return {
    ruleId,
    ruleNameEn: nameEn,
    ruleNameHe: nameHe,
    severity,
    passed,
    messageEn,
    messageHe,
    details,
    affectedCourseIds,
  };
}

// -------------------------------------------------------------------
// PKM-001: Total credits >= program total
// -------------------------------------------------------------------

export const ruleTotalCredits: RegulationRule = (ctx: RuleContext) => {
  const current = ctx.creditBreakdown.total;
  const required = ctx.programDefinition.creditRequirements.total;
  const passed = current >= required;

  return result(
    "PKM-001",
    "Total Credits Requirement",
    "דרישת נקודות זכות כוללת",
    passed,
    "ERROR",
    passed
      ? `Total credits met: ${current}/${required} SH"S.`
      : `Total credits insufficient: ${current}/${required} SH"S. Need ${required - current} more.`,
    passed
      ? `דרישת ש"ס כוללת מתקיימת: ${current}/${required} ש"ס.`
      : `דרישת ש"ס כוללת לא מתקיימת: ${current}/${required} ש"ס. חסרות ${required - current} ש"ס.`,
    { current, required, deficit: Math.max(0, required - current) }
  );
};

// -------------------------------------------------------------------
// Parametric: Discipline credits rule factory
// -------------------------------------------------------------------
// Replaces the 5 hardcoded rules (PKM-002 through PKM-006).
// One factory function generates a rule for ANY discipline.

function createDisciplineCreditsRule(disc: DisciplineDefinition): RegulationRule {
  return (ctx: RuleContext) => {
    const current = ctx.creditBreakdown.byDiscipline[disc.id] ?? 0;
    const required = getDiscipline(ctx.programDefinition, disc.id)?.minCredits ?? 0;
    const passed = current >= required;

    // Skip disciplines with 0 required credits (e.g., GENERAL)
    if (required === 0) {
      return result(
        `DISC-${disc.id}`,
        `${disc.nameEn} Credits`,
        `נקודות זכות ב${disc.nameHe}`,
        true,
        "INFO",
        `No minimum credits required for ${disc.nameEn}.`,
        `אין דרישת מינימום ש"ס ב${disc.nameHe}.`,
        { current, required: 0, discipline: disc.id }
      );
    }

    return result(
      `DISC-${disc.id}`,
      `${disc.nameEn} Credits`,
      `נקודות זכות ב${disc.nameHe}`,
      passed,
      "ERROR",
      passed
        ? `${disc.nameEn} credits met: ${current}/${required} SH"S.`
        : `${disc.nameEn} credits insufficient: ${current}/${required} SH"S. Need ${required - current} more.`,
      passed
        ? `נקודות ${disc.nameHe} מתקיימות: ${current}/${required} ש"ס.`
        : `נקודות ${disc.nameHe} לא מספיקות: ${current}/${required} ש"ס. חסרות ${required - current} ש"ס.`,
      { current, required, discipline: disc.id, deficit: Math.max(0, required - current) }
    );
  };
}

/**
 * Generate discipline credit rules for a specific program.
 * Returns one rule per discipline that has a non-zero minCredits requirement.
 */
export function getDisciplineRulesFor(program?: ProgramDefinition): RegulationRule[] {
  const p = program ?? getActiveProgram();
  return p.disciplines
    .filter((d) => d.minCredits > 0)
    .map((d) => createDisciplineCreditsRule(d));
}

// Backwards-compatible module-level constant (always default program)
const disciplineRules: RegulationRule[] = getDisciplineRulesFor();

// -------------------------------------------------------------------
// Focus area discipline >= focusAreaMin SH"S
// -------------------------------------------------------------------

export const ruleFocusAreaCredits: RegulationRule = (ctx: RuleContext) => {
  const required = ctx.programDefinition.creditRequirements.focusAreaMin;
  const focusArea = ctx.focusArea;

  if (!focusArea) {
    return result(
      "PKM-007",
      "Focus Area Credits",
      "נקודות תחום מיקוד",
      false,
      "WARNING",
      `No focus area selected. You must choose a focus area discipline to meet the ${required} SH"S requirement.`,
      `לא נבחר תחום מיקוד. עליך לבחור דיסציפלינת מיקוד כדי לעמוד בדרישת ${required} ש"ס.`,
      { current: 0, required, focusArea: null }
    );
  }

  const current = ctx.creditBreakdown.focusArea;
  const passed = current >= required;
  const disc = getDiscipline(ctx.programDefinition, focusArea);
  const disciplineNameEn = disc?.nameEn ?? focusArea;
  const disciplineNameHe = disc?.nameHe ?? focusArea;

  return result(
    "PKM-007",
    "Focus Area Credits",
    "נקודות תחום מיקוד",
    passed,
    "ERROR",
    passed
      ? `Focus area (${disciplineNameEn}) credits met: ${current}/${required} SH"S.`
      : `Focus area (${disciplineNameEn}) credits insufficient: ${current}/${required} SH"S. Need ${required - current} more.`,
    passed
      ? `נקודות תחום מיקוד (${disciplineNameHe}) מתקיימות: ${current}/${required} ש"ס.`
      : `נקודות תחום מיקוד (${disciplineNameHe}) לא מספיקות: ${current}/${required} ש"ס. חסרות ${required - current} ש"ס.`,
    { current, required, focusArea, deficit: Math.max(0, required - current) }
  );
};

// -------------------------------------------------------------------
// PKM-008: At least 3 seminar papers completed
// -------------------------------------------------------------------

export const ruleSeminarPapers: RegulationRule = (ctx: RuleContext) => {
  const required = ctx.programDefinition.seminarRequirements?.totalPapers ?? 0;

  // If this program has no seminar requirements, pass trivially
  if (required === 0) {
    return result(
      "PKM-008",
      "Seminar Papers",
      "עבודות סמינריוניות",
      true,
      "INFO",
      "No seminar paper requirements for this program.",
      "אין דרישת עבודות סמינריוניות בתוכנית זו.",
      { current: 0, required: 0 }
    );
  }

  const completedPapers = ctx.seminars.filter(
    (s) => s.submissionType === "PAPER" && s.grade !== null
  );
  const current = completedPapers.length;
  const passed = current >= required;

  return result(
    "PKM-008",
    "Seminar Papers",
    "עבודות סמינריוניות",
    passed,
    "ERROR",
    passed
      ? `Seminar papers requirement met: ${current}/${required} papers completed.`
      : `Seminar papers insufficient: ${current}/${required} completed. Need ${required - current} more.`,
    passed
      ? `דרישת עבודות סמינריוניות מתקיימת: ${current}/${required} עבודות הוגשו.`
      : `דרישת עבודות סמינריוניות לא מתקיימת: ${current}/${required} הוגשו. חסרות ${required - current} עבודות.`,
    { current, required, deficit: Math.max(0, required - current) },
    completedPapers.map((s) => s.userCourseId)
  );
};

// -------------------------------------------------------------------
// PKM-009: At least 1 referat completed
// -------------------------------------------------------------------

export const ruleReferat: RegulationRule = (ctx: RuleContext) => {
  const required = ctx.programDefinition.seminarRequirements?.referats ?? 0;

  // If this program has no referat requirements, pass trivially
  if (required === 0) {
    return result(
      "PKM-009",
      "Referat Requirement",
      "דרישת רפרט",
      true,
      "INFO",
      "No referat requirements for this program.",
      "אין דרישת רפרט בתוכנית זו.",
      { current: 0, required: 0 }
    );
  }

  const completedReferats = ctx.seminars.filter(
    (s) => s.submissionType === "REFERAT" && s.grade !== null
  );
  const current = completedReferats.length;
  const passed = current >= required;

  return result(
    "PKM-009",
    "Referat Requirement",
    "דרישת רפרט",
    passed,
    "ERROR",
    passed
      ? `Referat requirement met: ${current}/${required} referat(s) completed.`
      : `Referat requirement not met: ${current}/${required} completed. Need ${required - current} more.`,
    passed
      ? `דרישת רפרט מתקיימת: ${current}/${required} רפרט/ים הוגשו.`
      : `דרישת רפרט לא מתקיימת: ${current}/${required} הוגשו. חסר/ים ${required - current} רפרט/ים.`,
    { current, required, deficit: Math.max(0, required - current) },
    completedReferats.map((s) => s.userCourseId)
  );
};

// -------------------------------------------------------------------
// PKM-010: All mandatory courses completed
// -------------------------------------------------------------------

export const ruleMandatoryCourses: RegulationRule = (ctx: RuleContext) => {
  const mandatoryCourses = ctx.userCourses.filter(
    (uc) => uc.course.isMandatory
  );
  const incomplete = mandatoryCourses.filter(
    (uc) => uc.status !== "COMPLETED" && uc.status !== "EXEMPT"
  );
  const totalMandatory = mandatoryCourses.length;
  const completedCount = totalMandatory - incomplete.length;
  const passed = incomplete.length === 0 && totalMandatory > 0;

  // Special case: no mandatory courses in plan at all
  if (totalMandatory === 0) {
    return result(
      "PKM-010",
      "Mandatory Courses",
      "קורסי חובה",
      false,
      "WARNING",
      "No mandatory courses found in your plan. Make sure all required courses are added.",
      "לא נמצאו קורסי חובה בתוכנית שלך. ודא שכל קורסי החובה הוספו.",
      { total: 0, completed: 0, incomplete: 0 }
    );
  }

  return result(
    "PKM-010",
    "Mandatory Courses",
    "קורסי חובה",
    passed,
    passed ? "INFO" : "ERROR",
    passed
      ? `All ${totalMandatory} mandatory courses completed.`
      : `${completedCount}/${totalMandatory} mandatory courses completed. ${incomplete.length} remaining.`,
    passed
      ? `כל ${totalMandatory} קורסי החובה הושלמו.`
      : `${completedCount}/${totalMandatory} קורסי חובה הושלמו. נותרו ${incomplete.length} קורסים.`,
    { total: totalMandatory, completed: completedCount, incomplete: incomplete.length },
    incomplete.map((uc) => uc.id)
  );
};

// -------------------------------------------------------------------
// PKM-011: At least 2 law foundation courses completed
// -------------------------------------------------------------------

// NOTE: Law foundation is PPE-specific. For generic support, this threshold
// should move into ProgramDefinition. For now, it's safe because non-PPE
// programs won't have LAW_FOUNDATION courses, so the rule will pass trivially.
export const ruleLawFoundation: RegulationRule = (ctx: RuleContext) => {
  const required = 2;
  const lawFoundationCourses = ctx.userCourses.filter(
    (uc) => uc.course.courseType === "LAW_FOUNDATION"
  );
  const completed = lawFoundationCourses.filter(
    (uc) => uc.status === "COMPLETED" || uc.status === "EXEMPT"
  );
  const current = completed.length;
  const passed = current >= required;

  return result(
    "PKM-011",
    "Law Foundation Courses",
    "קורסי יסודות משפט",
    passed,
    "ERROR",
    passed
      ? `Law foundation requirement met: ${current}/${required} courses completed.`
      : `Law foundation courses insufficient: ${current}/${required} completed. Need ${required - current} more.`,
    passed
      ? `דרישת יסודות משפט מתקיימת: ${current}/${required} קורסים הושלמו.`
      : `דרישת יסודות משפט לא מתקיימת: ${current}/${required} הושלמו. חסרים ${required - current} קורסים.`,
    { current, required, deficit: Math.max(0, required - current) },
    // Only flag incomplete law foundation courses, not already-completed ones
    lawFoundationCourses
      .filter((uc) => uc.status !== "COMPLETED" && uc.status !== "EXEMPT")
      .map((uc) => uc.id)
  );
};

// -------------------------------------------------------------------
// PKM-012: English requirement — 2 courses taught IN English (any discipline)
// -------------------------------------------------------------------

export const ruleEnglishRequirement: RegulationRule = (ctx: RuleContext) => {
  const minCourses = ctx.programDefinition.creditRequirements.englishCourses;

  // If no English course requirement, pass trivially
  if (minCourses === 0) {
    return result(
      "PKM-012",
      "Courses in English",
      "קורסים באנגלית",
      true,
      "INFO",
      "No English course requirements for this program.",
      "אין דרישת קורסים באנגלית בתוכנית זו.",
      { currentCourses: 0, minCourses: 0 }
    );
  }

  const minCreditsPerCourse = 2; // universal: each English course must be ≥ 2 SH"S
  const minCredits = minCourses * minCreditsPerCourse;
  const currentCredits = ctx.creditBreakdown.english;
  const currentCourses = ctx.creditBreakdown.englishCourseCount;
  const passed = currentCourses >= minCourses || currentCredits >= minCredits;

  return result(
    "PKM-012",
    "Courses in English",
    "קורסים באנגלית",
    passed,
    "ERROR",
    passed
      ? `Requirement met: ${currentCourses} course(s) taught in English, ${currentCredits} credits.`
      : `Need ${minCourses} courses taught in English: have ${currentCourses}/${minCourses}, ${currentCredits}/${minCredits} credits.`,
    passed
      ? `דרישה מתקיימת: ${currentCourses} קורסים באנגלית, ${currentCredits} ש״ס.`
      : `נדרשים ${minCourses} קורסים באנגלית: יש ${currentCourses}/${minCourses}, ${currentCredits}/${minCredits} ש״ס.`,
    { currentCourses, minCourses, currentCredits, minCredits }
  );
};

// -------------------------------------------------------------------
// PKM-013: Graduation score >= 60 (passing grade)
// -------------------------------------------------------------------

export const ruleGraduationScore: RegulationRule = (ctx: RuleContext) => {
  const requiredScore = ctx.programDefinition.creditRequirements.graduationMinScore;
  const score = ctx.gradeBreakdown.weightedScore;

  if (score === null) {
    return result(
      "PKM-013",
      "Graduation Score",
      "ציון סיום",
      false,
      "WARNING",
      "Graduation score cannot be calculated yet. Complete all course grades, seminar papers, and referat.",
      "ציון הסיום לא ניתן לחישוב עדיין. השלם את כל ציוני הקורסים, עבודות הסמינריון והרפרט.",
      { score: null, required: requiredScore }
    );
  }

  const rounded = Math.round(score * 100) / 100;
  const passed = rounded >= requiredScore;

  return result(
    "PKM-013",
    "Graduation Score",
    "ציון סיום",
    passed,
    passed ? "INFO" : "ERROR",
    passed
      ? `Graduation score is ${rounded}, above the required ${requiredScore}.`
      : `Graduation score is ${rounded}, below the required ${requiredScore}.`,
    passed
      ? `ציון הסיום הוא ${rounded}, מעל הנדרש (${requiredScore}).`
      : `ציון הסיום הוא ${rounded}, מתחת לנדרש (${requiredScore}).`,
    { score: rounded, required: requiredScore }
  );
};

// -------------------------------------------------------------------
// PKM-014: No more than 30% of courses can be failed
// -------------------------------------------------------------------

export const ruleFailureRate: RegulationRule = (ctx: RuleContext) => {
  const maxFailureRate = ctx.programDefinition.creditRequirements.maxFailureRate;
  const allCourses = ctx.userCourses.filter(
    (uc) => uc.status === "COMPLETED" || uc.status === "FAILED"
  );
  const failedCourses = ctx.userCourses.filter((uc) => uc.status === "FAILED");
  const totalAttempted = allCourses.length;
  const failedCount = failedCourses.length;

  if (totalAttempted === 0) {
    return result(
      "PKM-014",
      "Failure Rate Limit",
      "מגבלת שיעור כישלון",
      true,
      "INFO",
      "No completed or failed courses yet.",
      "אין קורסים שהושלמו או נכשלו עדיין.",
      { failedCount: 0, totalAttempted: 0, failureRate: 0, maxFailureRate }
    );
  }

  const failureRate = failedCount / totalAttempted;
  const passed = failureRate <= maxFailureRate;
  const ratePercent = Math.round(failureRate * 100);

  return result(
    "PKM-014",
    "Failure Rate Limit",
    "מגבלת שיעור כישלון",
    passed,
    passed ? "INFO" : "WARNING",
    passed
      ? `Failure rate is ${ratePercent}% (${failedCount}/${totalAttempted}), within the ${Math.round(maxFailureRate * 100)}% limit.`
      : `Failure rate is ${ratePercent}% (${failedCount}/${totalAttempted}), exceeds the ${Math.round(maxFailureRate * 100)}% limit.`,
    passed
      ? `שיעור כישלון ${ratePercent}% (${failedCount}/${totalAttempted}), בטווח המותר של ${Math.round(maxFailureRate * 100)}%.`
      : `שיעור כישלון ${ratePercent}% (${failedCount}/${totalAttempted}), חורג מהמגבלה של ${Math.round(maxFailureRate * 100)}%.`,
    { failedCount, totalAttempted, failureRate: ratePercent, maxFailureRate: Math.round(maxFailureRate * 100) },
    failedCourses.map((uc) => uc.id)
  );
};

// -------------------------------------------------------------------
// PKM-015: Maximum 3 attempts per course
// -------------------------------------------------------------------

export const ruleMaxAttempts: RegulationRule = (ctx: RuleContext) => {
  const maxAttempts = ctx.programDefinition.creditRequirements.maxExamAttempts;

  // Group courses by courseId and find the max attempt number
  const attemptMap = new Map<string, { maxAttempt: number; courseCode: string; userCourseIds: string[] }>();

  for (const uc of ctx.userCourses) {
    const existing = attemptMap.get(uc.courseId);
    if (existing) {
      existing.maxAttempt = Math.max(existing.maxAttempt, uc.attemptNumber);
      existing.userCourseIds.push(uc.id);
    } else {
      attemptMap.set(uc.courseId, {
        maxAttempt: uc.attemptNumber,
        courseCode: uc.course.code,
        userCourseIds: [uc.id],
      });
    }
  }

  const violations: { courseCode: string; attempts: number; userCourseIds: string[] }[] = [];

  for (const [, entry] of attemptMap) {
    if (entry.maxAttempt > maxAttempts) {
      violations.push({
        courseCode: entry.courseCode,
        attempts: entry.maxAttempt,
        userCourseIds: entry.userCourseIds,
      });
    }
  }

  const passed = violations.length === 0;
  const affectedIds = violations.flatMap((v) => v.userCourseIds);

  return result(
    "PKM-015",
    "Maximum Attempts Per Course",
    "מספר ניסיונות מרבי לקורס",
    passed,
    passed ? "INFO" : "ERROR",
    passed
      ? `All courses are within the ${maxAttempts}-attempt limit.`
      : `${violations.length} course(s) exceed the ${maxAttempts}-attempt limit: ${violations.map((v) => `${v.courseCode} (${v.attempts} attempts)`).join(", ")}.`,
    passed
      ? `כל הקורסים בטווח המותר של ${maxAttempts} ניסיונות.`
      : `${violations.length} קורס/ים חורגים ממגבלת ${maxAttempts} ניסיונות: ${violations.map((v) => `${v.courseCode} (${v.attempts} ניסיונות)`).join(", ")}.`,
    { maxAttempts, violations: violations.map((v) => ({ courseCode: v.courseCode, attempts: v.attempts })) },
    affectedIds
  );
};

// -------------------------------------------------------------------
// PKM-016: Year transition GPA >= 75 (overall course average)
// -------------------------------------------------------------------

export const ruleYearTransitionGPA: RegulationRule = (ctx: RuleContext) => {
  const requiredGPA = ctx.programDefinition.creditRequirements.yearTransitionGpa;
  const courseAvg = ctx.gradeBreakdown.courseAverage;

  if (courseAvg === null) {
    return result(
      "PKM-016",
      "Year Transition GPA",
      "ממוצע מעבר שנה",
      true,
      "INFO",
      "Year transition GPA cannot be checked yet. Enter course grades to see your standing.",
      "ממוצע מעבר שנה לא ניתן לבדיקה עדיין. הזינו ציוני קורסים כדי לראות את מצבכם.",
      { courseAverage: null, required: requiredGPA }
    );
  }

  const rounded = Math.round(courseAvg * 100) / 100;
  const passed = rounded >= requiredGPA;

  return result(
    "PKM-016",
    "Year Transition GPA",
    "ממוצע מעבר שנה",
    passed,
    passed ? "INFO" : "WARNING",
    passed
      ? `Course average is ${rounded}, above the ${requiredGPA} required for year transition.`
      : `Course average is ${rounded}, below the ${requiredGPA} required for year transition. Improve grades to advance.`,
    passed
      ? `ממוצע הקורסים ${rounded}, מעל ה-${requiredGPA} הנדרש למעבר שנה.`
      : `ממוצע הקורסים ${rounded}, מתחת ל-${requiredGPA} הנדרש למעבר שנה. שפרו ציונים כדי להתקדם.`,
    { courseAverage: rounded, required: requiredGPA }
  );
};

// -------------------------------------------------------------------
// PKM-017: Year transition major GPA >= 80 (focus area average)
// -------------------------------------------------------------------

export const ruleYearTransitionMajorGPA: RegulationRule = (ctx: RuleContext) => {
  const requiredMajorGPA = ctx.programDefinition.creditRequirements.yearTransitionMajorGpa;

  // Not all programs require a major-specific GPA threshold
  if (!requiredMajorGPA) {
    return result(
      "PKM-017",
      "Year Transition Major GPA",
      "ממוצע מעבר שנה בהתמחות",
      true,
      "INFO",
      "This program does not require a separate major GPA for year transition.",
      "תוכנית זו לא דורשת ממוצע התמחות נפרד למעבר שנה.",
    );
  }

  if (!ctx.focusArea) {
    return result(
      "PKM-017",
      "Year Transition Major GPA",
      "ממוצע מעבר שנה בהתמחות",
      true,
      "INFO",
      "No focus area selected. Major GPA check will apply once you choose a focus area.",
      "לא נבחר תחום התמחות. בדיקת ממוצע ההתמחות תיכנס לתוקף לאחר בחירת תחום.",
    );
  }

  // Compute focus-area GPA from completed courses in the focus discipline
  const focusCourses = ctx.userCourses.filter((uc) => {
    const discipline = uc.disciplineOverride ?? uc.course.discipline;
    return discipline === ctx.focusArea && uc.status === "COMPLETED" && uc.grade !== null;
  });

  if (focusCourses.length === 0) {
    return result(
      "PKM-017",
      "Year Transition Major GPA",
      "ממוצע מעבר שנה בהתמחות",
      true,
      "INFO",
      "No graded courses in focus area yet. Major GPA check will apply once grades are entered.",
      "אין עדיין ציונים בתחום ההתמחות. הבדיקה תיכנס לתוקף לאחר הזנת ציונים.",
    );
  }

  // Credit-weighted average
  let totalWeighted = 0;
  let totalCredits = 0;
  for (const uc of focusCourses) {
    totalWeighted += uc.grade! * uc.course.credits;
    totalCredits += uc.course.credits;
  }
  const majorAvg = Math.round((totalWeighted / totalCredits) * 100) / 100;
  const passed = majorAvg >= requiredMajorGPA;

  return result(
    "PKM-017",
    "Year Transition Major GPA",
    "ממוצע מעבר שנה בהתמחות",
    passed,
    passed ? "INFO" : "WARNING",
    passed
      ? `Focus area average is ${majorAvg}, above the ${requiredMajorGPA} required for year transition.`
      : `Focus area average is ${majorAvg}, below the ${requiredMajorGPA} required for year transition.`,
    passed
      ? `ממוצע ההתמחות ${majorAvg}, מעל ה-${requiredMajorGPA} הנדרש למעבר שנה.`
      : `ממוצע ההתמחות ${majorAvg}, מתחת ל-${requiredMajorGPA} הנדרש למעבר שנה. שפרו ציונים בקורסי ההתמחות.`,
    { majorAverage: majorAvg, required: requiredMajorGPA, focusArea: ctx.focusArea },
  );
};

// -------------------------------------------------------------------
// Export all rules as an ordered array
// -------------------------------------------------------------------

/**
 * Get all regulation rules for a specific program.
 * Discipline rules are generated dynamically from the program definition.
 */
export function getAllRulesFor(program?: ProgramDefinition): RegulationRule[] {
  return [
    ruleTotalCredits,
    ...getDisciplineRulesFor(program),
    ruleFocusAreaCredits,
    ruleSeminarPapers,
    ruleReferat,
    ruleMandatoryCourses,
    ruleLawFoundation,
    ruleEnglishRequirement,
    ruleGraduationScore,
    ruleFailureRate,
    ruleMaxAttempts,
    ruleYearTransitionGPA,
    ruleYearTransitionMajorGPA,
  ];
}

/** @deprecated Use getAllRulesFor(program) for per-user support. */
export const ALL_RULES: RegulationRule[] = [
  ruleTotalCredits,
  ...disciplineRules,        // dynamic — one per discipline with minCredits > 0
  ruleFocusAreaCredits,
  ruleSeminarPapers,
  ruleReferat,
  ruleMandatoryCourses,
  ruleLawFoundation,
  ruleEnglishRequirement,
  ruleGraduationScore,
  ruleFailureRate,
  ruleMaxAttempts,
  ruleYearTransitionGPA,
  ruleYearTransitionMajorGPA,
];
