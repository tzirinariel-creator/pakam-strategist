import type { RuleContext, RegulationRule } from "@/types/regulation";
import { result } from "./_result";
import { heNoun } from "@/lib/he-count";

// -------------------------------------------------------------------
// PKM-027: seminars require a passing grade in ALL mandatory courses
// -------------------------------------------------------------------
// docs/pakam-domain-rules-2026.md §9b, quoting the ידיעון verbatim:
//   "דרישת קדם לכל הסמינרים: ציון עובר בכל קורסי החובה"
// and calling it out as "a real gate (distinct from the per-course prereq
// exemption)". PPE students are exempt from per-course prerequisites — this is
// the ONE prerequisite that binds them, and until now the app stated it
// nowhere. Worse, a planning tip said the opposite ("plan seminars early — not
// because of prerequisites"), so a student could put a seminar in year 2 with
// nothing anywhere telling them the מזכירות will not register them for it.
//
// Severity is INFO, never ERROR/WARNING: an unmet structural requirement is
// mid-degree PROGRESS in this codebase's severity philosophy, and this rule is
// derived from what the student has ENTERED — a thin course history must never
// manufacture a red block. It stays silent (neutral pass) when the student has
// no seminar in their plan at all.

export const ruleSeminarMandatoryGate: RegulationRule = (ctx: RuleContext) => {
  const seminarRows = ctx.userCourses.filter(
    (uc) => uc.course.courseType === "SEMINAR",
  );

  // No seminar anywhere in the plan → nothing to say. Never invent a gate for
  // a student who hasn't reached seminars yet.
  if (seminarRows.length === 0) {
    return result(
      "PKM-027",
      "Seminar Gate — mandatory courses passed",
      "תנאי קדם לסמינרים — קורסי חובה",
      true,
      "INFO",
      "No seminars in your plan yet. Seminars require a passing grade in every mandatory course before registration.",
      "אין עדיין סמינרים בתוכנית. הרישום לסמינר דורש ציון עובר בכל קורסי החובה. (נכון לתשפ״ו)",
      { seminars: 0, mandatoryCreditsCurrent: ctx.creditBreakdown.mandatory },
    );
  }

  // Same predicate PKM-010 uses for "all mandatory courses completed": every
  // mandatory row the student added is COMPLETED/EXEMPT, AND the accumulated
  // mandatory credits reached the program minimum (so a plan holding 2 of ~27
  // mandatory courses can't read as "done").
  const mandatoryRows = ctx.userCourses.filter((uc) => uc.course.isMandatory);
  const openMandatory = mandatoryRows.filter(
    (uc) => uc.status !== "COMPLETED" && uc.status !== "EXEMPT",
  );
  const required = ctx.programDefinition.creditRequirements.mandatoryCredits ?? 0;
  const current = ctx.creditBreakdown.mandatory;
  const creditsMet = required === 0 || current >= required;
  const gateMet = openMandatory.length === 0 && creditsMet;
  const short = Math.max(0, required - current);

  if (gateMet) {
    return result(
      "PKM-027",
      "Seminar Gate — mandatory courses passed",
      "תנאי קדם לסמינרים — קורסי חובה",
      true,
      "INFO",
      "Every mandatory course is passed — the seminar registration requirement is met.",
      "כל קורסי החובה עברו — תנאי הקדם לרישום לסמינרים מתקיים. (נכון לתשפ״ו)",
      { seminars: seminarRows.length, mandatoryCreditsCurrent: current, mandatoryCreditsRequired: required },
    );
  }

  return result(
    "PKM-027",
    "Seminar Gate — mandatory courses passed",
    "תנאי קדם לסמינרים — קורסי חובה",
    false,
    "INFO",
    `Seminars require a passing grade in EVERY mandatory course before registration. By what's recorded here you still have ${short} mandatory SH"S open${openMandatory.length > 0 ? ` and ${openMandatory.length} mandatory course(s) not yet passed` : ""} — plan the seminar for after them, or check your standing with the department office.`,
    `הרישום לסמינר דורש ציון עובר בכל קורסי החובה. לפי מה שרשום כאן נותרו ${short} ש״ס חובה${openMandatory.length > 0 ? ` ו-${openMandatory.length} קורסי חובה שטרם עברו` : ""} — כדאי לתכנן את הסמינר אחריהם, או לבדוק את המצב מול המזכירות. (נכון לתשפ״ו)`,
    {
      seminars: seminarRows.length,
      mandatoryCreditsCurrent: current,
      mandatoryCreditsRequired: required,
      openMandatoryCourses: openMandatory.length,
      deficit: short,
    },
    seminarRows.map((uc) => uc.id),
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
      ? `דרישת רפרט מתקיימת: ${current}/${heNoun(required, "רפרט", "רפרטים")} הוגשו.`
      : `דרישת רפרט לא מתקיימת: ${current}/${required} הוגשו. חסרים ${heNoun(required - current, "רפרט", "רפרטים")}.`,
    { current, required, deficit: Math.max(0, required - current) },
    completedReferats.map((s) => s.userCourseId)
  );
};
