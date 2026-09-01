import type { RuleContext, RegulationRule } from "@/types/regulation";
import type { DisciplineDefinition, ProgramDefinition } from "@/lib/programs/types";
import { getActiveProgram } from "@/lib/programs/registry";
import { getDiscipline } from "@/lib/programs/types";
import { degreeProgress } from "@/lib/degree-progress";
import { result } from "./_result";

// -------------------------------------------------------------------
// PKM-001: Total credits >= program total
// -------------------------------------------------------------------

export const ruleTotalCredits: RegulationRule = (ctx: RuleContext) => {
  const required = ctx.programDefinition.creditRequirements.total;
  // ONE definition of degree progress (src/lib/degree-progress.ts): the credits
  // a student HOLDS = earned (COMPLETED/EXEMPT) + the miluim credit exemption.
  //
  // This rule used to report `effectiveTotal`, which folds PLANNED courses in.
  // A student who had laid out their whole degree read "104/150 ש״ס" here and
  // "78/150" on the dashboard, both labelled degree progress — and, worse, a
  // student with 150 PLANNED and nothing finished was told the total-credit
  // requirement "מתקיימת". Planned credits graduate nobody: the verdict and the
  // headline number are now the SECURED figure, and the projection is still
  // reported — under a label that says it includes planned courses.
  const p = degreeProgress(ctx.creditBreakdown, required);
  const current = p.secured;
  const passed = current >= required;
  const deficit = p.remaining;

  // Severity: a credit-ACCUMULATION target is PROGRESS, not a compliance
  // VIOLATION. A mid-degree student simply hasn't earned the credits yet, so
  // an unmet total is INFO (a progress target), never a red ERROR. ERROR is
  // reserved for genuine violations (fail-twice, the 75/80 year gate, the
  // English-exemption deadline).
  const plannedNoteEn =
    p.planned > 0 ? ` Including planned courses: ${p.projected}/${required}.` : "";
  const plannedNoteHe =
    p.planned > 0 ? ` כולל הקורסים המתוכננים: ${p.projected}/${required}.` : "";

  return result(
    "PKM-001",
    "Total Credits Requirement",
    "דרישת ש״ס כוללת",
    passed,
    "INFO",
    passed
      ? `Total credits met: ${current}/${required} SH"S earned.`
      : `Total credits insufficient: ${current}/${required} SH"S earned. Need ${deficit} more.${plannedNoteEn}`,
    passed
      ? `דרישת ש״ס כוללת מתקיימת: ${current}/${required} ש״ס שנצברו.`
      : `דרישת ש״ס כוללת לא מתקיימת: ${current}/${required} ש״ס שנצברו. חסרות ${deficit} ש״ס.${plannedNoteHe}`,
    {
      current,
      required,
      deficit,
      // The decomposition, so no consumer (UI, the King) has to guess which
      // definition `current` is.
      earned: p.earned,
      planned: p.planned,
      miluimExemption: p.miluimExemption,
      projected: p.projected,
    }
  );
};

// -------------------------------------------------------------------
// PKM-018: Mandatory credits >= program mandatory minimum (101)
// -------------------------------------------------------------------
// Official נכון לתשפ"ו: 150 = 103 mandatory (incl. PPE seminar) + 12 seminars +
// 35 electives. The mandatory minimum is pinned to 101 (the published catalog's
// 89 MANDATORY + 4 PPE seminar + 8 LAW_FOUNDATION basket); the last 2 ש"ז is an
// unpublished future PPE course (see tau-ppe-2025.ts). Severity is INFO — an
// unmet mandatory-credit total is mid-degree PROGRESS, not a violation.

export const ruleMandatoryCredits: RegulationRule = (ctx: RuleContext) => {
  const required = ctx.programDefinition.creditRequirements.mandatoryCredits ?? 0;

  // Program doesn't model a mandatory-credit minimum → neutral pass.
  if (required === 0) {
    return result(
      "PKM-018",
      "Mandatory Credits",
      "ש״ס חובה",
      true,
      "INFO",
      "No mandatory-credit minimum defined for this program.",
      "אין דרישת מינימום ש״ס חובה בתוכנית זו.",
      { current: 0, required: 0 }
    );
  }

  const current = ctx.creditBreakdown.mandatory;
  const passed = current >= required;

  // #49. This screen prints PKM-001 as "/150" a few rows above, so a student can
  // add the buckets and find they do not reach it. The gap is real and it is
  // ours to explain, not to hide: the ידיעון publishes a larger mandatory
  // figure than the active catalog can currently supply, and we check against
  // what they can actually earn. Said here, once, where the smaller number is
  // printed.
  const official = ctx.programDefinition.creditRequirements.officialMandatoryCredits ?? required;
  const officialNote =
    official > required
      ? ` (הידיעון מפרסם ${official} ש״ס חובה; ${official - required} מהן עדיין בלי קורס פעיל בקטלוג, אז אנחנו בודקים אתכם מול ${required}.)`
      : " (נכון לתשפ״ו)";

  return result(
    "PKM-018",
    "Mandatory Credits",
    "ש״ס חובה",
    passed,
    "INFO",
    passed
      ? `Mandatory credits met: ${current}/${required} SH"S.`
      : `Mandatory credits insufficient: ${current}/${required} SH"S. Need ${required - current} more.`,
    passed
      ? `נקודות חובה מתקיימות: ${current}/${required} ש״ס.${officialNote}`
      : `נקודות חובה לא מספיקות: ${current}/${required} ש״ס. חסרות ${required - current} ש״ס.${officialNote}`,
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
      "ש״ס סמינריונים",
      true,
      "INFO",
      "No seminar-credit minimum defined for this program.",
      "אין דרישת מינימום ש״ס סמינריונים בתוכנית זו.",
      { current: 0, required: 0 }
    );
  }

  const current = ctx.creditBreakdown.seminar;
  const passed = current >= required;

  return result(
    "PKM-019",
    "Seminar Credits",
    "ש״ס סמינריונים",
    passed,
    "INFO",
    passed
      ? `Seminar credits met: ${current}/${required} SH"S.`
      : `Seminar credits insufficient: ${current}/${required} SH"S. Need ${required - current} more.`,
    passed
      ? `נקודות סמינריונים מתקיימות: ${current}/${required} ש״ס. (נכון לתשפ״ו)`
      : `נקודות סמינריונים לא מספיקות: ${current}/${required} ש״ס. חסרות ${required - current} ש״ס. (נכון לתשפ״ו)`,
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
      "ש״ס בחירה",
      true,
      "INFO",
      "No elective-credit minimum defined for this program.",
      "אין דרישת מינימום ש״ס בחירה בתוכנית זו.",
      { current: 0, required: 0 }
    );
  }

  const current = ctx.creditBreakdown.elective;
  const passed = current >= required;

  return result(
    "PKM-020",
    "Elective Credits",
    "ש״ס בחירה",
    passed,
    "INFO",
    passed
      ? `Elective credits met: ${current}/${required} SH"S.`
      : `Elective credits insufficient: ${current}/${required} SH"S. Need ${required - current} more.`,
    passed
      ? `נקודות בחירה מתקיימות: ${current}/${required} ש״ס. (נכון לתשפ״ו)`
      : `נקודות בחירה לא מספיקות: ${current}/${required} ש״ס. חסרות ${required - current} ש״ס. (נכון לתשפ״ו)`,
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
        `ש״ס ב${disc.nameHe}`,
        true,
        "INFO",
        `No minimum credits required for ${disc.nameEn}.`,
        `אין דרישת מינימום ש״ס ב${disc.nameHe}.`,
        { current, required: 0, discipline: disc.id }
      );
    }

    // Severity: a per-discipline credit target is mid-degree PROGRESS, not a
    // compliance VIOLATION — INFO, never a red ERROR.
    return result(
      `DISC-${disc.id}`,
      `${disc.nameEn} Credits`,
      `ש״ס ב${disc.nameHe}`,
      passed,
      "INFO",
      passed
        ? `${disc.nameEn} credits met: ${current}/${required} SH"S.`
        : `${disc.nameEn} credits insufficient: ${current}/${required} SH"S. Need ${required - current} more.`,
      passed
        ? `נקודות ${disc.nameHe} מתקיימות: ${current}/${required} ש״ס.`
        : `נקודות ${disc.nameHe} לא מספיקות: ${current}/${required} ש״ס. חסרות ${required - current} ש״ס.`,
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
export const disciplineRules: RegulationRule[] = getDisciplineRulesFor();

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
      `לא נבחר תחום מיקוד. עליך לבחור דיסציפלינת מיקוד כדי לעמוד בדרישת ${required} ש״ס.`,
      { current: 0, required, focusArea: null }
    );
  }

  const current = ctx.creditBreakdown.focusArea;
  const passed = current >= required;
  const disc = getDiscipline(ctx.programDefinition, focusArea);
  const disciplineNameEn = disc?.nameEn ?? focusArea;
  const disciplineNameHe = disc?.nameHe ?? focusArea;

  // Severity: once a focus area is chosen, reaching its 60-ש"ז target is
  // mid-degree PROGRESS, not a violation — INFO, never a red ERROR. (The
  // no-focus-selected branch above stays WARNING: choosing a focus is an
  // actionable nudge, not accumulated progress.)
  return result(
    "PKM-007",
    "Focus Area Credits",
    "נקודות תחום מיקוד",
    passed,
    "INFO",
    passed
      ? `Focus area (${disciplineNameEn}) credits met: ${current}/${required} SH"S.`
      : `Focus area (${disciplineNameEn}) credits insufficient: ${current}/${required} SH"S. Need ${required - current} more.`,
    passed
      ? `נקודות תחום מיקוד (${disciplineNameHe}) מתקיימות: ${current}/${required} ש״ס.`
      : `נקודות תחום מיקוד (${disciplineNameHe}) לא מספיקות: ${current}/${required} ש״ס. חסרות ${required - current} ש״ס.`,
    { current, required, focusArea, deficit: Math.max(0, required - current) }
  );
};
