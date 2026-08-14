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
import { ENGLISH_CONFIG } from "@/lib/constants";
import { canonicalAttempts } from "@/lib/grade-calculator";

// Practice ("משלב עשייה") credit caps (domain rules §1):
// each practice course grants at most PRACTICE_COURSE_MAX_CREDITS regardless of
// actual credits, and the practice total is capped at PRACTICE_TOTAL_MAX.
const PRACTICE_COURSE_MAX_CREDITS = 4;
const PRACTICE_TOTAL_MAX = 8;

// LAW_FOUNDATION basket cap (domain rules §9b):
// The law division (חטיבה במשפטים) is 14 ש"ז = 1411-9107 (4, fixed) + 1411-9240
// (2, fixed) + EXACTLY 8 ש"ז "pick any two" from the 10-course LAW_FOUNDATION
// basket. Only the FIRST 8 completed/planned basket credits count toward the
// `mandatory` bucket; any beyond 8 fall through to the `elective` bucket.
const LAW_FOUNDATION_MANDATORY_CAP = 8;

// Minimum credits for ONE of the 2 required English CONTENT courses (domain
// rules §5: "each ≥ 2 credits"). Mirrored by
// CREDIT_REQUIREMENTS.ENGLISH_MIN_CREDITS_PER_COURSE.
const ENGLISH_MIN_CREDITS_PER_COURSE = 2;

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

/** Statuses that count toward earned / planned credits.
 *  - COMPLETED / EXEMPT → earned (the requirement is satisfied).
 *  - PLANNED / IN_PROGRESS → planned (on-track, not yet earned).
 *  Previously IN_PROGRESS and EXEMPT contributed ZERO, so a student mid-semester
 *  or with an exempt/transfer course saw under-counted credits in the "My status"
 *  hero and false "still missing" regulation results (#31). FAILED stays out. */
const COUNTABLE_STATUSES: CourseStatus[] = ["COMPLETED", "PLANNED", "IN_PROGRESS", "EXEMPT"];

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
 *  2. A mandatory law-division course whose primary discipline is mis-tagged
 *     non-LAW but which carries LAW in `canCountAs` defaults to LAW. This is the
 *     case for 1411-9240 (משפט וכלכלה, 2 ש"ז): it sits in the 14-ש"ז law division
 *     (domain rules §9b) but the catalog tags it ECONOMICS with canCountAs:['LAW'].
 *     Without this, DISC-LAW under-counts (12 instead of 14) and ECONOMICS
 *     over-counts. The user can still override either way.
 *  3. The course's own primary discipline.
 */
function resolvedDiscipline(uc: UserCourseWithCourse): Discipline {
  if (uc.disciplineOverride) return uc.disciplineOverride;
  const { course } = uc;
  if (
    course.isMandatory &&
    course.discipline !== "LAW" &&
    (course.canCountAs ?? []).includes("LAW" as Discipline)
  ) {
    return "LAW" as Discipline;
  }
  return course.discipline;
}

/**
 * Does an ENGLISH content course count toward the PKM-012 "2 English content
 * courses" requirement?
 *
 * The humanities faculty (where PPE sits) sets the English passing grade at
 * ENGLISH_CONFIG.COURSE_PASSING_GRADE (70) — higher than the 60 used elsewhere.
 * A COMPLETED English course graded BELOW that bar was failed against the
 * humanities standard and must NOT count. But a course the student merely
 * planned or is taking (and hasn't been graded yet) is still on-track and DOES
 * count, so we don't scare students for coursework in progress.
 *
 * Rule:
 *  - Not yet graded (PLANNED / IN_PROGRESS, or no grade recorded) → counts.
 *  - COMPLETED with grade >= COURSE_PASSING_GRADE (70)            → counts.
 *  - COMPLETED with grade <  COURSE_PASSING_GRADE (70)            → does NOT count.
 */
function englishContentCourseCounts(uc: UserCourseWithCourse): boolean {
  // Still on track: not finished, so no grade to judge against the bar yet.
  if (uc.status !== "COMPLETED") return true;
  // Completed but no grade recorded → treat as on-track (don't penalize).
  if (uc.grade == null) return true;
  // Completed and graded → must clear the humanities English passing grade.
  return uc.grade >= ENGLISH_CONFIG.COURSE_PASSING_GRADE;
}

/**
 * Does this English course count toward the PKM-012 "2 English CONTENT courses"
 * requirement?
 *
 * Two conditions, and they are NOT the same question:
 *  1. It must not have been failed against the humanities bar
 *     (englishContentCourseCounts above).
 *  2. Domain rules §5 (double-verified): each of the two content courses must
 *     carry AT LEAST 2 credits ("all coursework in English, each ≥ 2 credits").
 *     A 1-credit English workshop a student typed in themselves is real credit
 *     toward the 150 — so its credits still bucket normally — but it does not
 *     satisfy one of the two required content courses, and telling a student it
 *     does would send them into their final year one course short of a
 *     requirement they cannot finish the degree without.
 */
function countsTowardEnglishRequirement(uc: UserCourseWithCourse): boolean {
  return (
    englishContentCourseCounts(uc) &&
    uc.course.credits >= ENGLISH_MIN_CREDITS_PER_COURSE
  );
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

  // 1. Filter to countable courses, then collapse retakes to the determining
  // attempt so a grade-improvement retake (two COMPLETED rows for one course)
  // doesn't double-count its credits into the total/discipline/earned (#audit-r5).
  const countable = canonicalAttempts(
    courses.filter((uc) => COUNTABLE_STATUSES.includes(uc.status))
  );

  // 2. Accumulate credits per discipline.
  const byDiscipline = emptyDisciplineCredits(program);
  let mandatory = 0;
  let elective = 0;
  let seminar = 0;
  let practice = 0;
  let lawFoundationMandatory = 0; // running LAW_FOUNDATION credits applied to `mandatory` (capped at 8)
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

    // A failed English CONTENT course (COMPLETED below the humanities 70 bar) is a
    // failed course: it must count toward NO bucket — not the discipline, focus
    // area, elective, or earned credits — mirroring how other FAILED courses are
    // dropped from `countable`. Zero its credits here so they can't leak into the
    // totals; PKM-012 still reports the English requirement unmet (#audit-r2).
    // On-track English (planned / in-progress / ungraded / passed) is unaffected.
    if (course.courseType === "ENGLISH" && !englishContentCourseCounts(uc)) {
      credits = 0;
    }

    // Attribute to the resolved discipline bucket (capped value for practice).
    byDiscipline[discipline] = (byDiscipline[discipline] ?? 0) + credits;

    // Course-type buckets.
    switch (course.courseType) {
      case "MANDATORY":
        mandatory += credits;
        break;
      case "LAW_FOUNDATION": {
        // Fix #1 (domain rules §9b): the law division counts EXACTLY 8 ש"ז from
        // the LAW_FOUNDATION basket ("pick any two 4-credit courses"). Only the
        // first 8 completed/planned basket credits land in `mandatory`; anything
        // beyond 8 falls through to `elective` (it still earns credit, just not
        // as a mandatory requirement). Without this cap the uncapped basket both
        // under-counts (a student who takes <2) and over-counts (a student who
        // takes >2) the mandatory bucket.
        const room = Math.max(0, LAW_FOUNDATION_MANDATORY_CAP - lawFoundationMandatory);
        const toMandatory = Math.min(credits, room);
        mandatory += toMandatory;
        lawFoundationMandatory += toMandatory;
        const overflow = credits - toMandatory;
        if (overflow > 0) elective += overflow;
        break;
      }
      case "ELECTIVE":
        elective += credits;
        break;
      case "SEMINAR":
        // Fix #2 (domain rules §9b): a MANDATORY seminar (the PPE seminar,
        // 0651-3001) is part of the 103 mandatory credits, so it counts toward
        // the `mandatory` bucket — NOT the 12-credit seminar bucket. Every other
        // (non-mandatory) seminar stays in the seminar bucket, which targets 12.
        if (course.isMandatory) {
          mandatory += credits;
        } else {
          seminar += credits;
        }
        break;
      case "PRACTICE":
        // "משלב עשייה" courses ARE electives (domain rules §1 calls them
        // "Practice/משלב עשייה **electives**", and the 150 has exactly three
        // buckets: 103 mandatory + 12 seminars + 35 electives — there is no
        // fourth). Their capped credits therefore belong in `elective`; the
        // `practice` counter stays as the sub-total that enforces the two caps
        // (≤4 per course, ≤8 across the degree — CREDIT_REQUIREMENTS
        // .PRACTICE_ELECTIVE_MAX names it an ELECTIVE max for this reason).
        // Until now they landed in NO course-type bucket at all, so a student
        // on the practice track saw their elective progress 8 ש״ס short
        // everywhere (PKM-020, the dashboard bucket, the King) and would take
        // two courses they had already covered. The credits were never lost
        // from `total` — only from the bucket that decides "what's left".
        elective += credits;
        break;
      case "ENGLISH":
        // Fix #3 (reconciliation): the 2 English CONTENT courses are part of the
        // 150 and previously belonged to NO course-type bucket, so the buckets
        // could never sum back to 150. Attribute their credits to `elective` so
        // mandatory+seminar+elective(+practice) reconciles to the total.
        elective += credits;
        // PKM-012 separately counts English CONTENT courses for the grade-aware
        // "2 courses" requirement. A COMPLETED English course graded below the
        // humanities passing bar (70) was failed and must NOT count; planned /
        // in-progress / ungraded courses still count (on-track). This count is
        // kept INDEPENDENT of the elective bucketing above (don't break PKM-012),
        // and additionally requires the §5 per-course 2-credit floor.
        if (countsTowardEnglishRequirement(uc)) {
          englishCredits += credits;
          englishCourseCount += 1;
        }
        break;
    }

    // Earned vs planned (capped value for practice). COMPLETED + EXEMPT are
    // EARNED (requirement satisfied); PLANNED + IN_PROGRESS are on-track but not
    // yet earned. EXEMPT is still excluded from the GPA (grade-calculator only
    // counts COMPLETED courses that carry a grade), so this lifts credits without
    // touching the average.
    if (uc.status === "COMPLETED" || uc.status === "EXEMPT") {
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
    seminar,
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
