// =========================================
// Credit Calculation Engine
// =========================================
// Pure function that computes a full CreditBreakdown
// from the user's course list, respecting discipline
// overrides, cross-discipline attribution, and
// program-specific credit requirements.
//
// Data-driven: reads discipline list and requirements
// from ProgramDefinition (via getActiveProgram()).

import type { Discipline, CourseStatus } from "@/types/enums";
import type {
  UserCourseWithCourse,
  CreditBreakdown,
  DisciplineCredits,
} from "@/types/degree";
import { getActiveProgram, type ProgramDefinition } from "@/lib/programs/registry";

// Practice ("משלב עשייה") credit caps (domain rules §1):
// each practice course grants at most PRACTICE_COURSE_MAX_CREDITS regardless of
// actual credits, and the practice total is capped at PRACTICE_TOTAL_MAX.
const PRACTICE_COURSE_MAX_CREDITS = 4;
const PRACTICE_TOTAL_MAX = 8;

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

/** Statuses that count toward earned / planned credits. */
const COUNTABLE_STATUSES: CourseStatus[] = ["COMPLETED", "PLANNED"];

/**
 * Get all discipline IDs from a program.
 */
function getAllDisciplines(program: ProgramDefinition): string[] {
  return program.disciplines.map((d) => d.id);
}

/**
 * Create an empty DisciplineCredits record with 0 for each discipline.
 * Dynamically populated from ProgramDefinition.
 */
function emptyDisciplineCredits(program: ProgramDefinition): DisciplineCredits {
  const credits: DisciplineCredits = {};
  for (const id of getAllDisciplines(program)) {
    credits[id] = 0;
  }
  return credits;
}

/**
 * Determine which discipline a course should be attributed to.
 *
 * Priority:
 *  1. disciplineOverride on the UserCourse (user explicitly reassigned it)
 *  2. The course's own primary discipline
 */
function resolvedDiscipline(uc: UserCourseWithCourse): Discipline {
  return uc.disciplineOverride ?? uc.course.discipline;
}

// -------------------------------------------------------------------
// Public types returned alongside the CreditBreakdown
// -------------------------------------------------------------------

export interface DisciplineRequirementStatus {
  discipline: Discipline;
  earned: number;
  required: number;
  met: boolean;
}

export interface CreditCalculationResult {
  breakdown: CreditBreakdown;
  /** Per-discipline requirement status (only disciplines with minCredits > 0). */
  disciplineStatus: DisciplineRequirementStatus[];
  /** Whether the focus-area target is met. */
  focusAreaMet: boolean;
  /** Credits that come from COMPLETED courses only. */
  earnedCredits: number;
  /** Credits that come from PLANNED courses only. */
  plannedCredits: number;
  /** Total countable credits (earned + planned). */
  totalCredits: number;
}

// -------------------------------------------------------------------
// Main calculation
// -------------------------------------------------------------------

/**
 * Calculate a full credit breakdown from an array of UserCourseWithCourse.
 *
 * @param courses           The user's full course list (with embedded Course data).
 * @param focusArea         The user's chosen focus-area discipline (or null).
 * @param miluimExemption   Credit exemption from miluim service (default 0).
 * @param programDef        Optional program definition. Falls back to default (PPE).
 */
export function calculateCredits(
  courses: UserCourseWithCourse[],
  focusArea: Discipline | null,
  miluimExemption: number = 0,
  programDef?: ProgramDefinition
): CreditCalculationResult {
  const program = programDef ?? getActiveProgram();

  // 1. Filter to countable courses only.
  const countable = courses.filter((uc) =>
    COUNTABLE_STATUSES.includes(uc.status)
  );

  // 2. Accumulate credits per discipline.
  const byDiscipline = emptyDisciplineCredits(program);
  let mandatory = 0;
  let elective = 0;
  let practice = 0;
  let englishCredits = 0;
  let englishCourseCount = 0;
  let earnedCredits = 0;
  let plannedCredits = 0;

  for (const uc of countable) {
    const { course } = uc;
    const discipline = resolvedDiscipline(uc);

    // Effective credits that count toward the degree. For practice
    // ("משלב עשייה") courses each course grants at most 4 ש"ז regardless of its
    // actual credits, and the practice TOTAL is capped at 8 ש"ז (domain rules §1).
    let credits = course.credits;
    if (course.courseType === "PRACTICE") {
      const perCourse = Math.min(credits, PRACTICE_COURSE_MAX_CREDITS);
      const remainingCap = Math.max(0, PRACTICE_TOTAL_MAX - practice);
      credits = Math.min(perCourse, remainingCap);
      practice += credits;
    }

    // Attribute to the resolved discipline bucket (capped value for practice).
    byDiscipline[discipline] = (byDiscipline[discipline] ?? 0) + credits;

    // Course-type buckets.
    switch (course.courseType) {
      case "MANDATORY":
      case "LAW_FOUNDATION":
        mandatory += credits;
        break;
      case "ELECTIVE":
      case "SEMINAR":
        elective += credits;
        break;
      case "PRACTICE":
        // practice total already accumulated above (with caps applied).
        break;
      case "ENGLISH":
        englishCredits += credits;
        englishCourseCount += 1;
        break;
    }

    // Earned vs planned (capped value for practice).
    if (uc.status === "COMPLETED") {
      earnedCredits += credits;
    } else {
      plannedCredits += credits;
    }
  }

  const totalCredits = earnedCredits + plannedCredits;

  // 3. Focus area credits: sum of credits in the chosen focus-area discipline.
  const focusAreaCredits = focusArea ? (byDiscipline[focusArea] ?? 0) : 0;
  const focusAreaTarget = program.creditRequirements.focusAreaMin;

  // 4. Build the CreditBreakdown (matches the type in degree.ts).
  const effectiveTotal = totalCredits + miluimExemption;
  const breakdown: CreditBreakdown = {
    total: totalCredits,
    earned: earnedCredits,
    planned: plannedCredits,
    mandatory,
    elective,
    practice,
    byDiscipline,
    focusArea: focusAreaCredits,
    focusAreaTarget,
    english: englishCredits,
    englishCourseCount,
    miluimExemption,
    effectiveTotal,
  };

  // 5. Per-discipline requirement status (only disciplines with min > 0).
  const disciplineStatus: DisciplineRequirementStatus[] = program.disciplines
    .filter((d) => d.minCredits > 0)
    .map((d) => {
      const earned = byDiscipline[d.id] ?? 0;
      const required = d.minCredits;
      return {
        discipline: d.id,
        earned,
        required,
        met: earned >= required,
      };
    });

  // 6. Focus-area met flag.
  const focusAreaMet = focusAreaCredits >= focusAreaTarget;

  return {
    breakdown,
    disciplineStatus,
    focusAreaMet,
    earnedCredits,
    plannedCredits,
    totalCredits,
  };
}

// -------------------------------------------------------------------
// Utility: determine valid discipline options for a course
// -------------------------------------------------------------------

/**
 * Return the list of disciplines a course may legally be counted toward.
 * Always includes the course's primary discipline, plus any entries in
 * `canCountAs`.
 */
export function allowedDisciplines(course: {
  discipline: Discipline;
  canCountAs: Discipline[];
}): Discipline[] {
  const set = new Set<Discipline>([course.discipline, ...course.canCountAs]);
  return Array.from(set);
}
