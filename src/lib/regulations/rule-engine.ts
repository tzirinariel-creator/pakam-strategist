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
 * Run all regulation rules against the user's course data.
 *
 * @param userCourses      The user's full course list (with embedded Course data).
 * @param focusArea        The user's chosen focus-area discipline (or null).
 * @param miluimExemption  Credit exemption from military reserve service (default 0).
 * @param program          Optional ProgramDefinition; defaults to active program (PPE).
 * @returns                A RegulationSummary with all results and a compliance score.
 */
export function runRegulationEngine(
  userCourses: UserCourseWithCourse[],
  focusArea: Discipline | null,
  miluimExemption: number = 0,
  program?: ProgramDefinition
): RegulationSummary {
  const programDef = program ?? getActiveProgram();

  // 1. Pre-compute credit and grade breakdowns (used by multiple rules).
  const creditCalc = calculateCredits(
    userCourses,
    focusArea,
    miluimExemption,
    programDef
  );
  const gradeBreakdown = calculateGrades(userCourses);
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

  // 5. Compliance score: percentage of rules that passed.
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
  };
}
