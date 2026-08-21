import type { RuleContext, RegulationRule } from "@/types/regulation";
import { result } from "./_result";
import { heNoun } from "@/lib/he-count";

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

  // Fix #7: "all mandatory courses completed" must reflect the CANONICAL
  // requirement, not merely the mandatory rows the student happened to add.
  // A student who adds + completes 2 of ~27 mandatory courses has NOT finished
  // the mandatory load — so this rule cannot go green while the mandatory-credit
  // total (PKM-018) is still below the program target. We gate the pass on BOTH:
  //   (a) every mandatory row the student added is COMPLETED/EXEMPT, AND
  //   (b) the accumulated mandatory credits have reached the program minimum.
  const mandatoryCreditsRequired =
    ctx.programDefinition.creditRequirements.mandatoryCredits ?? 0;
  const mandatoryCreditsCurrent = ctx.creditBreakdown.mandatory;
  const creditsMet =
    mandatoryCreditsRequired === 0 ||
    mandatoryCreditsCurrent >= mandatoryCreditsRequired;

  // Special case: no mandatory courses in plan at all
  if (totalMandatory === 0) {
    return result(
      "PKM-010",
      "Mandatory Courses",
      "קורסי חובה",
      false,
      "WARNING",
      "No mandatory courses found in your plan. Make sure all required courses are added.",
      "לא נמצאו קורסי חובה בתוכנית שלכם. ודאו שכל קורסי החובה הוספו.",
      { total: 0, completed: 0, incomplete: 0, mandatoryCreditsCurrent, mandatoryCreditsRequired }
    );
  }

  const allRowsComplete = incomplete.length === 0;
  const passed = allRowsComplete && creditsMet;

  // Distinguish the two ways the requirement can be unmet for a clear message:
  // rows still in progress, vs. rows all complete but the mandatory-credit
  // target not yet reached (i.e. required mandatory courses are simply missing
  // from the plan).
  const creditsShort = Math.max(0, mandatoryCreditsRequired - mandatoryCreditsCurrent);

  let messageEn: string;
  let messageHe: string;
  if (passed) {
    messageEn = `All mandatory courses completed (${mandatoryCreditsCurrent}/${mandatoryCreditsRequired} SH"S).`;
    messageHe = `כל קורסי החובה הושלמו (${mandatoryCreditsCurrent}/${mandatoryCreditsRequired} ש״ס).`;
  } else if (!allRowsComplete) {
    messageEn = `${completedCount}/${totalMandatory} added mandatory courses completed. ${incomplete.length} remaining.`;
    messageHe = `${completedCount}/${totalMandatory} מקורסי החובה שנוספו הושלמו. נותרו ${heNoun(incomplete.length, "קורס", "קורסים")}.`;
  } else {
    messageEn = `Added mandatory courses are complete, but required mandatory courses are still missing: ${mandatoryCreditsCurrent}/${mandatoryCreditsRequired} SH"S (${creditsShort} short).`;
    messageHe = `קורסי החובה שנוספו הושלמו, אך עדיין חסרים קורסי חובה נדרשים: ${mandatoryCreditsCurrent}/${mandatoryCreditsRequired} ש״ס (חסרות ${creditsShort}).`;
  }

  // Severity: an unmet mandatory requirement is mid-degree PROGRESS (courses not
  // yet taken/completed), not a compliance VIOLATION → INFO, never a red ERROR.
  return result(
    "PKM-010",
    "Mandatory Courses",
    "קורסי חובה",
    passed,
    "INFO",
    messageEn,
    messageHe,
    {
      total: totalMandatory,
      completed: completedCount,
      incomplete: incomplete.length,
      mandatoryCreditsCurrent,
      mandatoryCreditsRequired,
      creditsMet,
    },
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
  // Count DISTINCT courses — a single law-basket course retaken to improve its
  // grade creates a second COMPLETED row and must not satisfy "take 2" alone
  // (mirrors PKM-014/015 and the credit engine's collapse, #audit-r6).
  const current = new Set(completed.map((uc) => uc.courseId)).size;
  const passed = current >= required;

  // Severity: "take 2 from the law basket" is a structural PROGRESS target a
  // student fulfills over the degree, not a mid-degree violation → INFO.
  return result(
    "PKM-011",
    "Law Foundation Courses",
    "קורסי יסודות משפט",
    passed,
    "INFO",
    passed
      ? `Law foundation requirement met: ${current}/${required} courses completed.`
      : `Law foundation courses insufficient: ${current}/${required} completed. Need ${required - current} more.`,
    // "2/קורס אחד הושלמו" is what the count helper produced inside a FRACTION:
    // the numerator and denominator are two halves of one number, and a word
    // cannot stand in for one of them. Said as a sentence instead — and the
    // deficit verb agrees with its own count ("חסר קורס אחד", not "חסרים").
    passed
      ? `דרישת יסודות משפט מתקיימת: ${current} מתוך ${required} הושלמו.`
      : `דרישת יסודות משפט לא מתקיימת: ${current} מתוך ${required} הושלמו. ${
          required - current === 1 ? "חסר קורס אחד" : `חסרים ${required - current} קורסים`
        }.`,
    { current, required, deficit: Math.max(0, required - current) },
    // Only flag incomplete law foundation courses, not already-completed ones
    lawFoundationCourses
      .filter((uc) => uc.status !== "COMPLETED" && uc.status !== "EXEMPT")
      .map((uc) => uc.id)
  );
};
