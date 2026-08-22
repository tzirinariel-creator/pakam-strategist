import type { RuleContext, RegulationRule } from "@/types/regulation";
import { result } from "./_result";
import { canonicalAttempts } from "@/lib/grade-calculator";
import { prefersHigherGrade, type MiluimGroupKey } from "@/lib/miluim";
import { isEnglishCourse } from "@/lib/english-standing";

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
  const candidates = ctx.userCourses.filter(
    (uc) =>
      uc.plannedYear === 1 &&
      uc.status === "COMPLETED" &&
      uc.grade !== null &&
      // Binary-converted courses are out of the GPA everywhere else — so they
      // must not count in the BLOCKING year-1→2 transition gate either. A
      // reservist who converts a weak year-1 course to protect standing would
      // otherwise be misled by a gate that still counts that grade.
      !uc.isBinary &&
      // English is excluded from EVERY degree average (owner-verified iron rule)
      // — it must not pollute this BLOCKING gate either.
      //
      // The intent above was right since 22.7; the test was the narrow one.
      // `courseType === "ENGLISH"` is a CATALOG flag, and no row a real student
      // owns carries it: the scanner and manual entry both write ELECTIVE
      // (plan.ts:443, 559, 665), and מתקדמים ב׳ — code 2171-9201, the row Ariel
      // reported four times — sits in the catalog as ELECTIVE too. So this
      // clause never fired for the people it was written for, and an English
      // grade was being averaged into a gate that BLOCKS continuation to year 2.
      //
      // `isEnglishCourse` is the one question the rest of the app asks, and it
      // is what grade-calculator.ts:88 was moved to on 21.8. This site was
      // missed then — the same "two functions, one question" miss, one file
      // over.
      !isEnglishCourse(uc.course) &&
      match(uc)
  );
  // Collapse a grade-improvement retake to the DETERMINING (last) sitting, so a
  // year-1 course retaken doesn't double-count its credits AND average both
  // grades in the BLOCKING gate — the exact #audit-r5/r6 fix applied to every
  // other average (grade/credit engines) but missing here until now.
  // The year-1→2 gate must honor the reservist "higher grade counts" rule too —
  // a B/C/G reservist's higher grade counts toward the 75/80 (Ariel 23.7). Use
  // the RAW group (gradeMiluimGroup), the SAME source the visible /record and
  // /graduation GPA use — so this BLOCKING gate can never average a different
  // number than the one the student stares at (audit 24.7).
  const courses = canonicalAttempts(candidates, {
    preferHigherGrade: prefersHigherGrade((ctx.gradeMiluimGroup ?? ctx.miluimGroup ?? "NONE") as MiluimGroupKey),
  });
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
  // Year-awareness (honesty): this is the year-1→2 gate, judged at year-1's END.
  // A student ALREADY in year 2+ has advanced → retrospective INFO. A student
  // STILL in year 1 hasn't finished it, so a partial sub-bar average is an EARLY
  // WARNING (amber, still improvable before year-end) — NEVER a present-tense red
  // "continuation blocked" ERROR on a mid-year student (launch audit 24.7).
  const advanced = (ctx.academicYear ?? 1) >= 2;
  const compliant = passed || advanced;
  const severity = compliant ? "INFO" : "WARNING";

  return result(
    "PKM-016",
    "Year Transition GPA",
    "ממוצע מעבר שנה",
    compliant,
    severity,
    passed
      ? `Year-1 average is ${average}, above the ${requiredGPA} required to advance to year 2.`
      : advanced
        ? `Your year-1 average was ${average}, below the nominal ${requiredGPA} year-1→2 bar — but you've already advanced, so this is for reference only.`
        : `Your year-1 average SO FAR is ${average}, below the ${requiredGPA} needed to advance — there's still time this year to raise it.`,
    passed
      ? `ממוצע שנה א׳ הוא ${average}, מעל ה-${requiredGPA} הנדרש למעבר לשנה ב׳.`
      : advanced
        ? `ממוצע שנה א׳ שלכם היה ${average}, מתחת ל-${requiredGPA} — סף המעבר לשנה ב׳. כבר עברתם לשנה ב׳, אז זה מוצג לרקע בלבד.`
        : `ממוצע שנה א׳ עד כה הוא ${average}, מתחת ל-${requiredGPA} הנדרש למעבר לשנה ב׳ — עדיין יש זמן השנה להעלות אותו.`,
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
  // Same year-awareness as PKM-016: a year-2+ student has already advanced, so
  // the core-GPA gate is retrospective INFO; a mid-year-1 student's partial
  // average is an early WARNING, never a present-tense red block (launch audit 24.7).
  const advanced = (ctx.academicYear ?? 1) >= 2;
  const compliant = passed || advanced;
  const severity = compliant ? "INFO" : "WARNING";

  return result(
    "PKM-017",
    "Year Transition Core GPA",
    "ממוצע מעבר שנה בקורסי הליבה",
    compliant,
    severity,
    passed
      ? `PPE-core year-1 average is ${average}, above the ${requiredMajorGPA} required to advance to year 2.`
      : advanced
        ? `Your PPE-core year-1 average was ${average}, below the nominal ${requiredMajorGPA} bar — but you've already advanced, so this is for reference only.`
        : `Your PPE-core year-1 average SO FAR is ${average}, below the ${requiredMajorGPA} needed to advance — there's still time this year to raise it.`,
    passed
      ? `ממוצע קורסי הליבה (פכ״מ ייעודי) בשנה א׳ הוא ${average}, מעל ה-${requiredMajorGPA} הנדרש למעבר לשנה ב׳.`
      : advanced
        ? `ממוצע קורסי הליבה (פכ״מ ייעודי) בשנה א׳ שלכם היה ${average}, מתחת ל-${requiredMajorGPA}. כבר עברתם לשנה ב׳, אז זה מוצג לרקע בלבד.`
        : `ממוצע קורסי הליבה (פכ״מ ייעודי) בשנה א׳ עד כה הוא ${average}, מתחת ל-${requiredMajorGPA} הנדרש למעבר לשנה ב׳ — עדיין יש זמן השנה להעלות אותו.`,
    { majorAverage: average, required: requiredMajorGPA, discipline: PPE_CORE_DISCIPLINE },
  );
};
