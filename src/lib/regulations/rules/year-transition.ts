import type { RuleContext, RegulationRule } from "@/types/regulation";
import { result } from "./_result";

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
      // Binary-converted courses are out of the GPA everywhere else — so they
      // must not count in the BLOCKING year-1→2 transition gate either. A
      // reservist who converts a weak year-1 course to protect standing would
      // otherwise be misled by a gate that still counts that grade.
      !uc.isBinary &&
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
      "אין עדיין ציונים בקורסי הליבה (פכ״מ ייעודי) בשנה א׳. הבדיקה תיכנס לתוקף לאחר הזנת ציונים.",
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
      ? `ממוצע קורסי הליבה (פכ״מ ייעודי) בשנה א׳ הוא ${average}, מעל ה-${requiredMajorGPA} הנדרש למעבר לשנה ב׳.`
      : `ממוצע קורסי הליבה (פכ״מ ייעודי) בשנה א׳ הוא ${average}, מתחת ל-${requiredMajorGPA} הנדרש למעבר לשנה ב׳. המעבר חסום.`,
    { majorAverage: average, required: requiredMajorGPA, discipline: PPE_CORE_DISCIPLINE },
  );
};
