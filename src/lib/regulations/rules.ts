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
import { getEnglishLevel, ENGLISH_CONFIG, GRADE_REQUIREMENTS } from "@/lib/constants";

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
  // Use effectiveTotal (includes the miluim/reserve-duty credit exemption) so this
  // matches the dashboard progress bar — the exemption counts toward the 150-credit total.
  const current = ctx.creditBreakdown.effectiveTotal;
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
// PKM-018: Mandatory credits >= program mandatory minimum (e.g. 103)
// -------------------------------------------------------------------
// VERIFIED נכון לתשפ"ו: 150 = 103 mandatory (incl. PPE seminar) + 12 seminars + 35 electives.

export const ruleMandatoryCredits: RegulationRule = (ctx: RuleContext) => {
  const required = ctx.programDefinition.creditRequirements.mandatoryCredits ?? 0;

  // Program doesn't model a mandatory-credit minimum → neutral pass.
  if (required === 0) {
    return result(
      "PKM-018",
      "Mandatory Credits",
      "נקודות זכות חובה",
      true,
      "INFO",
      "No mandatory-credit minimum defined for this program.",
      "אין דרישת מינימום ש\"ס חובה בתוכנית זו.",
      { current: 0, required: 0 }
    );
  }

  const current = ctx.creditBreakdown.mandatory;
  const passed = current >= required;

  return result(
    "PKM-018",
    "Mandatory Credits",
    "נקודות זכות חובה",
    passed,
    "ERROR",
    passed
      ? `Mandatory credits met: ${current}/${required} SH"S.`
      : `Mandatory credits insufficient: ${current}/${required} SH"S. Need ${required - current} more.`,
    passed
      ? `נקודות חובה מתקיימות: ${current}/${required} ש"ס. (נכון לתשפ"ו)`
      : `נקודות חובה לא מספיקות: ${current}/${required} ש"ס. חסרות ${required - current} ש"ס. (נכון לתשפ"ו)`,
    { current, required, deficit: Math.max(0, required - current) }
  );
};

// -------------------------------------------------------------------
// PKM-019: Seminar credits >= program seminar minimum (e.g. 12)
// -------------------------------------------------------------------
// Seminars are their OWN bucket — NOT counted as electives (domain rules §1).

export const ruleSeminarCredits: RegulationRule = (ctx: RuleContext) => {
  const required = ctx.programDefinition.creditRequirements.seminarCredits ?? 0;

  if (required === 0) {
    return result(
      "PKM-019",
      "Seminar Credits",
      "נקודות זכות סמינריונים",
      true,
      "INFO",
      "No seminar-credit minimum defined for this program.",
      "אין דרישת מינימום ש\"ס סמינריונים בתוכנית זו.",
      { current: 0, required: 0 }
    );
  }

  const current = ctx.creditBreakdown.seminar;
  const passed = current >= required;

  return result(
    "PKM-019",
    "Seminar Credits",
    "נקודות זכות סמינריונים",
    passed,
    "ERROR",
    passed
      ? `Seminar credits met: ${current}/${required} SH"S.`
      : `Seminar credits insufficient: ${current}/${required} SH"S. Need ${required - current} more.`,
    passed
      ? `נקודות סמינריונים מתקיימות: ${current}/${required} ש"ס. (נכון לתשפ"ו)`
      : `נקודות סמינריונים לא מספיקות: ${current}/${required} ש"ס. חסרות ${required - current} ש"ס. (נכון לתשפ"ו)`,
    { current, required, deficit: Math.max(0, required - current) }
  );
};

// -------------------------------------------------------------------
// PKM-020: Elective credits >= program elective minimum (e.g. 35)
// -------------------------------------------------------------------

export const ruleElectiveCredits: RegulationRule = (ctx: RuleContext) => {
  const required = ctx.programDefinition.creditRequirements.electiveCredits ?? 0;

  if (required === 0) {
    return result(
      "PKM-020",
      "Elective Credits",
      "נקודות זכות בחירה",
      true,
      "INFO",
      "No elective-credit minimum defined for this program.",
      "אין דרישת מינימום ש\"ס בחירה בתוכנית זו.",
      { current: 0, required: 0 }
    );
  }

  const current = ctx.creditBreakdown.elective;
  const passed = current >= required;

  return result(
    "PKM-020",
    "Elective Credits",
    "נקודות זכות בחירה",
    passed,
    "ERROR",
    passed
      ? `Elective credits met: ${current}/${required} SH"S.`
      : `Elective credits insufficient: ${current}/${required} SH"S. Need ${required - current} more.`,
    passed
      ? `נקודות בחירה מתקיימות: ${current}/${required} ש"ס. (נכון לתשפ"ו)`
      : `נקודות בחירה לא מספיקות: ${current}/${required} ש"ס. חסרות ${required - current} ש"ס. (נכון לתשפ"ו)`,
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
  // Must take 2 SEPARATE English content courses (domain rules §5). A single
  // multi-credit course does NOT satisfy this, so the requirement is on the
  // course COUNT — credits are not an alternative path.
  const passed = currentCourses >= minCourses;

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
// PKM-021: English LEVEL (preparatory) requirement from AMIRANT score
// -------------------------------------------------------------------
// Informational: reports the student's English level and how many LEVEL
// (preparatory) courses they still need based on the AMIRANT score. These
// LEVEL courses are PREPARATORY — NOT in the 150 credits and NOT in the
// final grade, and are SEPARATE from the 2 English CONTENT courses (PKM-012).
// נכון לתשפ"ו. Neutral (skipped) when the score is null.

export const ruleEnglishLevel: RegulationRule = (ctx: RuleContext) => {
  const info = getEnglishLevel(ctx.amirantScore ?? null);

  // No score → stay neutral, do not error.
  if (!info) {
    return result(
      "PKM-021",
      "English Level (AMIRANT)",
      "רמת אנגלית (אמירנט)",
      true,
      "INFO",
      "No AMIRANT score provided — English level cannot be determined.",
      "לא הוזן ציון אמירנט — לא ניתן לקבוע רמת אנגלית. (נכון לתשפ\"ו)",
      { amirantScore: null }
    );
  }

  const { level, nameHe, nameEn, levelCourses, isExempt, isRejected } = info;
  const score = ctx.amirantScore!;

  // טרום בסיסי (≤84): below TAU admission minimum — blocking (auto-rejection).
  if (isRejected) {
    return result(
      "PKM-021",
      "English Level (AMIRANT)",
      "רמת אנגלית (אמירנט)",
      false,
      "ERROR",
      `AMIRANT ${score} → ${nameEn} (pre-basic): below the admission minimum (auto-rejection). At least ${levelCourses} level courses would be required.`,
      `אמירנט ${score} → ${nameHe}: מתחת לרף הקבלה (דחייה אוטומטית). נדרשים לפחות ${levelCourses} קורסי רמה. (נכון לתשפ\"ו)`,
      { amirantScore: score, level, levelCourses, isExempt, isRejected }
    );
  }

  return result(
    "PKM-021",
    "English Level (AMIRANT)",
    "רמת אנגלית (אמירנט)",
    true,
    "INFO",
    isExempt
      ? `AMIRANT ${score} → ${nameEn}: exempt from level courses. The 2 English content courses still apply.`
      : `AMIRANT ${score} → ${nameEn}: ${levelCourses} preparatory level course(s) still needed (not counted in the 150 credits). The 2 English content courses still apply.`,
    isExempt
      ? `אמירנט ${score} → ${nameHe}: פטור מקורסי רמה. עדיין נדרשים 2 קורסי תוכן באנגלית. (נכון לתשפ\"ו)`
      : `אמירנט ${score} → ${nameHe}: נדרשים עוד ${levelCourses} קורסי רמה (לא נספרים ב-150 ש\"ס). עדיין נדרשים 2 קורסי תוכן באנגלית. (נכון לתשפ\"ו)`,
    { amirantScore: score, level, levelCourses, isExempt, isRejected }
  );
};

// -------------------------------------------------------------------
// PKM-022: Humanities English EXEMPTION deadline (BLOCKING)
// -------------------------------------------------------------------
// A student who is NOT exempt (score < 134) must reach exemption (פטור) by the
// END OF THE 2ND SEMESTER (year 1, semester B), else studies stop. We warn
// while still within the window and ERROR once past it without exemption.
// נכון לתשפ"ו. Neutral when the score is null or the student is exempt.

export const ruleEnglishExemptionDeadline: RegulationRule = (ctx: RuleContext) => {
  const info = getEnglishLevel(ctx.amirantScore ?? null);

  // No score → stay neutral.
  if (!info) {
    return result(
      "PKM-022",
      "English Exemption Deadline",
      "מועד אחרון לפטור באנגלית",
      true,
      "INFO",
      "No AMIRANT score provided — exemption deadline cannot be evaluated.",
      "לא הוזן ציון אמירנט — לא ניתן להעריך את המועד האחרון לפטור. (נכון לתשפ\"ו)",
      { amirantScore: null }
    );
  }

  // Already exempt → requirement satisfied.
  if (info.isExempt) {
    return result(
      "PKM-022",
      "English Exemption Deadline",
      "מועד אחרון לפטור באנגלית",
      true,
      "INFO",
      `Exempt from English (AMIRANT ${ctx.amirantScore}). No exemption deadline applies.`,
      `פטור מאנגלית (אמירנט ${ctx.amirantScore}). אין מועד אחרון רלוונטי. (נכון לתשפ\"ו)`,
      { amirantScore: ctx.amirantScore, level: info.level, isExempt: true }
    );
  }

  // Not exempt: must reach exemption by end of year-1 semester B.
  const deadlineYear = ENGLISH_CONFIG.EXEMPTION_DEADLINE_YEAR;       // 1
  const deadlineSem = ENGLISH_CONFIG.EXEMPTION_DEADLINE_SEMESTER;    // "SPRING"

  const year = ctx.academicYear;
  const sem = ctx.currentSemester;

  // Without academic standing we can only warn (cannot tell if past the deadline).
  if (year == null || !sem) {
    return result(
      "PKM-022",
      "English Exemption Deadline",
      "מועד אחרון לפטור באנגלית",
      false,
      "WARNING",
      `Not yet exempt in English (AMIRANT ${ctx.amirantScore}, ${info.nameEn}). You must reach exemption by the end of the 2nd semester (year 1, semester B) or studies stop.`,
      `עדיין לא הושג פטור באנגלית (אמירנט ${ctx.amirantScore}, ${info.nameHe}). יש להגיע לפטור עד סוף הסמסטר השני (שנה א׳, סמסטר ב׳) אחרת הלימודים נפסקים. (נכון לתשפ\"ו)`,
      { amirantScore: ctx.amirantScore, level: info.level, isExempt: false }
    );
  }

  // Compute whether we are PAST the deadline. Semester ordering: FALL < SPRING < SUMMER.
  const semRank: Record<string, number> = { FALL: 0, SPRING: 1, SUMMER: 2 };
  const deadlineRank = year > deadlineYear
    ? Infinity // any semester in a later year is already past
    : (semRank[deadlineSem] ?? 1);
  const currentRank = (semRank[sem] ?? 0);
  const pastDeadline =
    year > deadlineYear ||
    (year === deadlineYear && currentRank > (semRank[deadlineSem] ?? 1));

  if (pastDeadline) {
    return result(
      "PKM-022",
      "English Exemption Deadline",
      "מועד אחרון לפטור באנגלית",
      false,
      "ERROR",
      `Past the English exemption deadline (end of year 1, semester B) without exemption (AMIRANT ${ctx.amirantScore}, ${info.nameEn}). Studies are blocked until exemption is reached.`,
      `חלף המועד האחרון לפטור באנגלית (סוף שנה א׳, סמסטר ב׳) ללא פטור (אמירנט ${ctx.amirantScore}, ${info.nameHe}). הלימודים חסומים עד להשגת פטור. (נכון לתשפ\"ו)`,
      { amirantScore: ctx.amirantScore, level: info.level, isExempt: false, pastDeadline: true }
    );
  }

  // Still within the window → warn so the student acts in time.
  return result(
    "PKM-022",
    "English Exemption Deadline",
    "מועד אחרון לפטור באנגלית",
    false,
    "WARNING",
    `Not yet exempt in English (AMIRANT ${ctx.amirantScore}, ${info.nameEn}). Reach exemption by the end of the 2nd semester (year 1, semester B) — ${info.levelCourses} level course(s) needed — or studies stop.`,
    `עדיין לא הושג פטור באנגלית (אמירנט ${ctx.amirantScore}, ${info.nameHe}). יש להגיע לפטור עד סוף הסמסטר השני (שנה א׳, סמסטר ב׳) — נדרשים ${info.levelCourses} קורסי רמה — אחרת הלימודים נפסקים. (נכון לתשפ\"ו)`,
    { amirantScore: ctx.amirantScore, level: info.level, isExempt: false, pastDeadline: false, currentRank, deadlineRank }
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

  // Retakes are stored as separate UserCourse rows (attemptNumber), so count distinct
  // COURSES, not attempts. A course is "failed" only if none of its attempts passed —
  // otherwise a failed-then-passed course would register as a 50% failure rate by itself.
  const byCourse = new Map<
    string,
    { passed: boolean; failed: boolean; failedIds: string[] }
  >();
  for (const uc of ctx.userCourses) {
    if (
      uc.status !== "COMPLETED" &&
      uc.status !== "FAILED" &&
      uc.status !== "EXEMPT"
    ) {
      continue;
    }
    const entry = byCourse.get(uc.courseId) ?? {
      passed: false,
      failed: false,
      failedIds: [],
    };
    if (uc.status === "COMPLETED" || uc.status === "EXEMPT") entry.passed = true;
    if (uc.status === "FAILED") {
      entry.failed = true;
      entry.failedIds.push(uc.id);
    }
    byCourse.set(uc.courseId, entry);
  }

  const distinctCourses = [...byCourse.values()];
  const totalAttempted = distinctCourses.length;
  const failedOnly = distinctCourses.filter((c) => c.failed && !c.passed);
  const failedCount = failedOnly.length;
  const failedCourses = failedOnly.flatMap((c) => c.failedIds);

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
    failedCourses
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
// PKM-023: Second failure in the SAME course = cannot continue (BLOCKING)
// -------------------------------------------------------------------
// Domain rules §4: a student may retake a failed mandatory course once; a
// SECOND failure in the same course means they cannot continue in PPE. We
// group userCourses by courseId, count attempts with status FAILED, and ERROR
// when any course has ≥ MAX_FAILURES_SAME_COURSE (2) failed attempts.

export const ruleFailTwice: RegulationRule = (ctx: RuleContext) => {
  const maxFailures = GRADE_REQUIREMENTS.MAX_FAILURES_SAME_COURSE; // 2

  // Count FAILED attempts per course.
  const failuresByCourse = new Map<
    string,
    { count: number; courseCode: string; userCourseIds: string[] }
  >();

  for (const uc of ctx.userCourses) {
    if (uc.status !== "FAILED") continue;
    const entry = failuresByCourse.get(uc.courseId) ?? {
      count: 0,
      courseCode: uc.course.code,
      userCourseIds: [],
    };
    entry.count += 1;
    entry.userCourseIds.push(uc.id);
    failuresByCourse.set(uc.courseId, entry);
  }

  const violations = [...failuresByCourse.values()].filter(
    (e) => e.count >= maxFailures
  );
  const passed = violations.length === 0;
  const affectedIds = violations.flatMap((v) => v.userCourseIds);

  return result(
    "PKM-023",
    "Repeated Course Failure",
    "כישלון חוזר בקורס",
    passed,
    // Blocking: a second failure in the same course stops continuation.
    passed ? "INFO" : "ERROR",
    passed
      ? `No course has been failed ${maxFailures} or more times.`
      : `${violations.length} course(s) failed ${maxFailures}+ times — cannot continue in PPE: ${violations
          .map((v) => `${v.courseCode} (${v.count}×)`)
          .join(", ")}.`,
    passed
      ? `אין קורס שנכשל בו ${maxFailures} פעמים או יותר.`
      : `${violations.length} קורס/ים נכשלו ${maxFailures} פעמים או יותר — לא ניתן להמשיך בפכ"מ: ${violations
          .map((v) => `${v.courseCode} (${v.count} כשלונות)`)
          .join(", ")}.`,
    {
      maxFailures,
      violations: violations.map((v) => ({ courseCode: v.courseCode, failures: v.count })),
    },
    affectedIds
  );
};

// -------------------------------------------------------------------
// Year 1→2 transition gate helper
// -------------------------------------------------------------------
// The gate (domain rules §2) is evaluated ONLY over YEAR-1 courses:
//   • overall average ≥ 75 across all year-1 graded courses, AND
//   • average ≥ 80 across the year-1 PPE-dedicated (PPE_CORE) courses.
// Failing either is BLOCKING. We compute a credit-weighted average so the
// gate is not polluted by later years' transcripts.

/** Credit-weighted average over year-1 COMPLETED courses matching a filter. */
function year1WeightedAverage(
  ctx: RuleContext,
  match: (uc: RuleContext["userCourses"][number]) => boolean
): { average: number | null; courseCount: number } {
  const courses = ctx.userCourses.filter(
    (uc) =>
      uc.plannedYear === 1 &&
      uc.status === "COMPLETED" &&
      uc.grade !== null &&
      match(uc)
  );
  if (courses.length === 0) return { average: null, courseCount: 0 };

  let totalWeighted = 0;
  let totalCredits = 0;
  for (const uc of courses) {
    totalWeighted += uc.grade! * uc.course.credits;
    totalCredits += uc.course.credits;
  }
  if (totalCredits === 0) return { average: null, courseCount: courses.length };
  return {
    average: Math.round((totalWeighted / totalCredits) * 100) / 100,
    courseCount: courses.length,
  };
}

// -------------------------------------------------------------------
// PKM-016: Year 1→2 transition gate — overall year-1 average >= 75 (BLOCKING)
// -------------------------------------------------------------------

export const ruleYearTransitionGPA: RegulationRule = (ctx: RuleContext) => {
  const requiredGPA = ctx.programDefinition.creditRequirements.yearTransitionGpa;
  // Overall average across ALL year-1 graded courses (non-seminar — seminar
  // submission grades are weighted separately and don't carry a course grade).
  const { average } = year1WeightedAverage(
    ctx,
    (uc) => uc.course.courseType !== "SEMINAR"
  );

  if (average === null) {
    return result(
      "PKM-016",
      "Year Transition GPA",
      "ממוצע מעבר שנה",
      true,
      "INFO",
      "Year transition GPA cannot be checked yet. Enter year-1 course grades to see your standing.",
      "ממוצע מעבר שנה לא ניתן לבדיקה עדיין. הזינו ציוני קורסים משנה א׳ כדי לראות את מצבכם.",
      { courseAverage: null, required: requiredGPA }
    );
  }

  const passed = average >= requiredGPA;

  return result(
    "PKM-016",
    "Year Transition GPA",
    "ממוצע מעבר שנה",
    passed,
    // Blocking gate: a failure is an ERROR (continuation is blocked).
    passed ? "INFO" : "ERROR",
    passed
      ? `Year-1 average is ${average}, above the ${requiredGPA} required to advance to year 2.`
      : `Year-1 average is ${average}, below the ${requiredGPA} required to advance to year 2. This blocks continuation.`,
    passed
      ? `ממוצע שנה א׳ הוא ${average}, מעל ה-${requiredGPA} הנדרש למעבר לשנה ב׳.`
      : `ממוצע שנה א׳ הוא ${average}, מתחת ל-${requiredGPA} הנדרש למעבר לשנה ב׳. המעבר חסום.`,
    { courseAverage: average, required: requiredGPA }
  );
};

// -------------------------------------------------------------------
// PKM-017: Year 1→2 transition gate — PPE-core year-1 average >= 80 (BLOCKING)
// -------------------------------------------------------------------
// The 80 threshold is over the PPE-DEDICATED (PPE_CORE) courses, NOT the
// student's chosen focus area (domain rules §2).

const PPE_CORE_DISCIPLINE = "PPE_CORE";

export const ruleYearTransitionMajorGPA: RegulationRule = (ctx: RuleContext) => {
  const requiredMajorGPA = ctx.programDefinition.creditRequirements.yearTransitionMajorGpa;

  // Not all programs require a PPE-core GPA threshold
  if (!requiredMajorGPA) {
    return result(
      "PKM-017",
      "Year Transition Core GPA",
      "ממוצע מעבר שנה בקורסי הליבה",
      true,
      "INFO",
      "This program does not require a separate core GPA for year transition.",
      "תוכנית זו לא דורשת ממוצע ליבה נפרד למעבר שנה.",
    );
  }

  // Average over YEAR-1 PPE-dedicated (PPE_CORE) graded courses.
  const { average, courseCount } = year1WeightedAverage(
    ctx,
    (uc) => (uc.disciplineOverride ?? uc.course.discipline) === PPE_CORE_DISCIPLINE
  );

  if (average === null || courseCount === 0) {
    return result(
      "PKM-017",
      "Year Transition Core GPA",
      "ממוצע מעבר שנה בקורסי הליבה",
      true,
      "INFO",
      "No graded PPE-core courses in year 1 yet. This check applies once year-1 core grades are entered.",
      "אין עדיין ציונים בקורסי הליבה (פכ\"מ ייעודי) בשנה א׳. הבדיקה תיכנס לתוקף לאחר הזנת ציונים.",
      { majorAverage: null, required: requiredMajorGPA },
    );
  }

  const passed = average >= requiredMajorGPA;

  return result(
    "PKM-017",
    "Year Transition Core GPA",
    "ממוצע מעבר שנה בקורסי הליבה",
    passed,
    // Blocking gate: a failure is an ERROR (continuation is blocked).
    passed ? "INFO" : "ERROR",
    passed
      ? `PPE-core year-1 average is ${average}, above the ${requiredMajorGPA} required to advance to year 2.`
      : `PPE-core year-1 average is ${average}, below the ${requiredMajorGPA} required to advance to year 2. This blocks continuation.`,
    passed
      ? `ממוצע קורסי הליבה (פכ"מ ייעודי) בשנה א׳ הוא ${average}, מעל ה-${requiredMajorGPA} הנדרש למעבר לשנה ב׳.`
      : `ממוצע קורסי הליבה (פכ"מ ייעודי) בשנה א׳ הוא ${average}, מתחת ל-${requiredMajorGPA} הנדרש למעבר לשנה ב׳. המעבר חסום.`,
    { majorAverage: average, required: requiredMajorGPA, discipline: PPE_CORE_DISCIPLINE },
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
    ruleMandatoryCredits,
    ruleSeminarCredits,
    ruleElectiveCredits,
    ...getDisciplineRulesFor(program),
    ruleFocusAreaCredits,
    ruleSeminarPapers,
    ruleReferat,
    ruleMandatoryCourses,
    ruleLawFoundation,
    ruleEnglishRequirement,
    ruleEnglishLevel,
    ruleEnglishExemptionDeadline,
    ruleGraduationScore,
    ruleFailureRate,
    ruleMaxAttempts,
    ruleFailTwice,
    ruleYearTransitionGPA,
    ruleYearTransitionMajorGPA,
  ];
}

/** @deprecated Use getAllRulesFor(program) for per-user support. */
export const ALL_RULES: RegulationRule[] = [
  ruleTotalCredits,
  ruleMandatoryCredits,
  ruleSeminarCredits,
  ruleElectiveCredits,
  ...disciplineRules,        // dynamic — one per discipline with minCredits > 0
  ruleFocusAreaCredits,
  ruleSeminarPapers,
  ruleReferat,
  ruleMandatoryCourses,
  ruleLawFoundation,
  ruleEnglishRequirement,
  ruleEnglishLevel,
  ruleEnglishExemptionDeadline,
  ruleGraduationScore,
  ruleFailureRate,
  ruleMaxAttempts,
  ruleFailTwice,
  ruleYearTransitionGPA,
  ruleYearTransitionMajorGPA,
];
