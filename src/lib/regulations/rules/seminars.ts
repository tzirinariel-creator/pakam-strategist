import type { RuleContext, RegulationRule } from "@/types/regulation";
import { result } from "./_result";

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
  // Distinct seminar COURSES — a resubmitted/retaken paper on the same course
  // must not count twice toward the 3-paper requirement (#audit-r6).
  const current = new Set(completedPapers.map((s) => s.courseCode)).size;
  const passed = current >= required;

  // Severity: the 3-seminar-paper requirement is graduation PROGRESS a student
  // earns over the degree, not a mid-degree compliance violation → INFO.
  return result(
    "PKM-008",
    "Seminar Papers",
    "עבודות סמינריוניות",
    passed,
    "INFO",
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

  // Severity: the referat is graduation PROGRESS, not a mid-degree violation → INFO.
  return result(
    "PKM-009",
    "Referat Requirement",
    "דרישת רפרט",
    passed,
    "INFO",
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
