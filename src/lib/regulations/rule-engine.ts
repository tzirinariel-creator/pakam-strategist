// =========================================
// Regulation Rule Engine
// =========================================
// Orchestrates the execution of all 16 regulation rules
// and produces a RegulationSummary.

import type { Discipline } from "@/types/enums";
import type {
  UserCourseWithCourse,
  SeminarInfo,
} from "@/types/degree";
import type {
  RuleContext,
  RegulationSummary,
} from "@/types/regulation";
import type { ProgramDefinition } from "@/lib/programs/types";
import { calculateCredits } from "@/lib/credit-calculator";
import { calculateGrades } from "@/lib/grade-calculator";
import { prefersHigherGrade, type MiluimGroupKey } from "@/lib/miluim";
import { getActiveProgram } from "@/lib/programs/registry";
import { ALL_RULES, getAllRulesFor } from "./rules";

// -------------------------------------------------------------------
// Build seminars list from user courses
// -------------------------------------------------------------------

function extractSeminars(courses: UserCourseWithCourse[]): SeminarInfo[] {
  return courses
    .filter((uc) => uc.course.courseType === "SEMINAR")
    .map((uc) => ({
      userCourseId: uc.id,
      courseCode: uc.course.code,
      courseName: uc.course.nameHe,
      discipline: uc.disciplineOverride ?? uc.course.discipline,
      submissionType: uc.submissionType ?? uc.course.submissionType,
      plannedYear: uc.plannedYear,
      grade: uc.submissionGrade,
    }));
}

// -------------------------------------------------------------------
// Main engine function
// -------------------------------------------------------------------

/**
 * Optional student context for rules that depend on profile data beyond the
 * course list (English placement, current academic standing). All fields are
 * optional so existing callers keep working and the relevant rules stay neutral.
 */
export interface RegulationStudentContext {
  /** AMIRANT (English placement) score, 50–150, or null. */
  amirantScore?: number | null;
  /** #23 — English level declared directly (grade sheet / settings); overrides the score. */
  englishLevel?: string | null;
  /** Current academic year (1-based). */
  academicYear?: number;
  /** Current semester ("FALL" | "SPRING" | "SUMMER"). */
  currentSemester?: string;
  /** Current miluim group ("NONE" | "GROUP_A".."GROUP_G") — for binary-cap rules. */
  miluimGroup?: string | null;
  /** RAW stored miluim group — for the grade "higher counts" rule (see RuleContext). */
  gradeMiluimGroup?: string | null;
  /** Binary (pass/fail) conversions already used across the degree. */
  miluimBinaryUsed?: number;
  /** Credit exemptions (ש״ס) already used across the degree. */
  miluimCreditsUsed?: number;
}

/**
 * Run all regulation rules against the user's course data.
 *
 * @param userCourses      The user's full course list (with embedded Course data).
 * @param focusArea        The user's chosen focus-area discipline (or null).
 * @param miluimExemption  Credit exemption from military reserve service (default 0).
 * @param program          Optional ProgramDefinition; defaults to active program (PPE).
 * @param student          Optional student context (AMIRANT score, academic standing).
 * @returns                A RegulationSummary with all results and a compliance score.
 */
export function runRegulationEngine(
  userCourses: UserCourseWithCourse[],
  focusArea: Discipline | null,
  miluimExemption: number = 0,
  program?: ProgramDefinition,
  student?: RegulationStudentContext
): RegulationSummary {
  const programDef = program ?? getActiveProgram();

  // 1. Pre-compute credit and grade breakdowns (used by multiple rules).
  const creditCalc = calculateCredits(
    userCourses,
    focusArea,
    miluimExemption,
    programDef
  );
  // Grade rule uses the RAW stored group (gradeMiluimGroup) so this breakdown
  // matches the visible /record + /graduation GPA; falls back to miluimGroup for
  // callers that don't split the two.
  const gradeGroup = (student?.gradeMiluimGroup ?? student?.miluimGroup ?? "NONE") as MiluimGroupKey;
  const gradeBreakdown = calculateGrades(userCourses, {
    preferHigherGrade: prefersHigherGrade(gradeGroup),
  });
  const seminars = extractSeminars(userCourses);

  // 2. Build the context shared by all rules.
  const context: RuleContext = {
    userCourses,
    focusArea,
    currentYear: new Date().getFullYear(),
    creditBreakdown: creditCalc.breakdown,
    gradeBreakdown,
    seminars,
    programDefinition: programDef,
    amirantScore: student?.amirantScore ?? null,
    englishLevel: student?.englishLevel ?? null,
    academicYear: student?.academicYear,
    currentSemester: student?.currentSemester,
    miluimGroup: student?.miluimGroup ?? null,
    gradeMiluimGroup: student?.gradeMiluimGroup ?? student?.miluimGroup ?? null,
    miluimBinaryUsed: student?.miluimBinaryUsed,
    miluimCreditsUsed: student?.miluimCreditsUsed,
  };

  // 3. Execute every rule (discipline rules are per-program).
  const rules = program ? getAllRulesFor(program) : ALL_RULES;
  const results = rules.map((rule) => rule(context));

  // 4. Tally results.
  let passed = 0;
  let failed = 0;
  let warnings = 0;
  let info = 0;

  for (const r of results) {
    if (r.passed) {
      passed += 1;
    } else {
      switch (r.severity) {
        case "ERROR":
          failed += 1;
          break;
        case "WARNING":
          warnings += 1;
          break;
        case "INFO":
          info += 1;
          break;
      }
    }
  }

  // 5. Compliance vs. progress — two distinct ideas, never conflated.
  //
  // Compliance = is the student VIOLATING any hard rule? A violation is a rule
  // that FAILED with severity "ERROR". Not-yet-earned accumulation targets
  // (INFO) are normal mid-degree progress, NOT violations. A fresh student with
  // zero credits violates nothing, so they are fully compliant.
  const violations = results.filter(
    (r) => !r.passed && r.severity === "ERROR"
  ).length;
  const compliant = violations === 0;

  // Progress = how far toward graduation across the non-ERROR (accumulation /
  // progress) rules. A neutral "X of Y requirements met" figure, never pass/fail.
  const progressRules = results.filter((r) => r.severity !== "ERROR");
  const progressTotal = progressRules.length;
  const progressMet = progressRules.filter((r) => r.passed).length;

  // 6. Legacy compliance score: passed/total. Kept for backward-compat only —
  // the UI no longer uses it as the headline figure (see RegulationSummary).
  const totalRules = results.length;
  const complianceScore =
    totalRules > 0 ? Math.round((passed / totalRules) * 100) : 0;

  return {
    totalRules,
    passed,
    failed,
    warnings,
    info,
    results,
    complianceScore,
    violations,
    compliant,
    progressMet,
    progressTotal,
  };
}
