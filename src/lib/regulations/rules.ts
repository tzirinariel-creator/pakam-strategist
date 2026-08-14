// =========================================
// Regulation Rules — generic compliance checks
// =========================================
// Each rule is a pure function that receives a RuleContext
// (which includes the active ProgramDefinition) and returns
// a RegulationResult.
//
// Discipline-specific credit rules are generated dynamically
// from the ProgramDefinition — no hardcoded discipline names.
//
// This file is a THIN BARREL: the rule implementations live in focused
// submodules under ./rules/*. It re-exports every rule (so no importer needs
// to change) and assembles the ordered aggregators (getAllRulesFor, ALL_RULES).

import type { ProgramDefinition } from "@/lib/programs/types";
import type { RegulationRule } from "@/types/regulation";

import {
  ruleTotalCredits,
  ruleMandatoryCredits,
  ruleSeminarCredits,
  ruleElectiveCredits,
  getDisciplineRulesFor,
  disciplineRules,
  ruleFocusAreaCredits,
} from "./rules/credits";
import { ruleSeminarPapers, ruleReferat, ruleSeminarMandatoryGate } from "./rules/seminars";
import { ruleMandatoryCourses, ruleLawFoundation } from "./rules/courses";
import {
  ruleEnglishRequirement,
  ruleEnglishLevel,
  ruleEnglishExemptionDeadline,
} from "./rules/english";
import {
  ruleGraduationScore,
  ruleFailureRate,
  ruleMaxAttempts,
  ruleFailTwice,
  ruleRetakeAdvisory,
} from "./rules/grades";
import {
  ruleYearTransitionGPA,
  ruleYearTransitionMajorGPA,
} from "./rules/year-transition";
import { ruleMiluimBinaryCap, ruleMiluimHonorsBinary } from "./rules/miluim";

// Re-export every rule (and getDisciplineRulesFor) so existing importers of
// "@/lib/regulations/rules" keep working unchanged.
export {
  ruleTotalCredits,
  ruleMandatoryCredits,
  ruleSeminarCredits,
  ruleElectiveCredits,
  getDisciplineRulesFor,
  ruleFocusAreaCredits,
  ruleSeminarPapers,
  ruleReferat,
  ruleSeminarMandatoryGate,
  ruleMandatoryCourses,
  ruleLawFoundation,
  ruleEnglishRequirement,
  ruleEnglishLevel,
  ruleEnglishExemptionDeadline,
  ruleGraduationScore,
  ruleFailureRate,
  ruleMaxAttempts,
  ruleFailTwice,
  ruleRetakeAdvisory,
  ruleYearTransitionGPA,
  ruleYearTransitionMajorGPA,
  ruleMiluimBinaryCap,
  ruleMiluimHonorsBinary,
};

// -------------------------------------------------------------------
// Export all rules as an ordered array
// -------------------------------------------------------------------

/**
 * Get all regulation rules for a specific program.
 * Discipline rules are generated dynamically from the program definition.
 */
export function getAllRulesFor(program?: ProgramDefinition): RegulationRule[] {
  return [
    ruleTotalCredits,
    ruleMandatoryCredits,
    ruleSeminarCredits,
    ruleElectiveCredits,
    ...getDisciplineRulesFor(program),
    ruleFocusAreaCredits,
    ruleSeminarPapers,
    ruleReferat,
    ruleSeminarMandatoryGate,
    ruleMandatoryCourses,
    ruleLawFoundation,
    ruleEnglishRequirement,
    ruleEnglishLevel,
    ruleEnglishExemptionDeadline,
    ruleGraduationScore,
    ruleFailureRate,
    ruleMaxAttempts,
    ruleFailTwice,
    ruleRetakeAdvisory,
    ruleYearTransitionGPA,
    ruleYearTransitionMajorGPA,
    ruleMiluimBinaryCap,
    ruleMiluimHonorsBinary,
  ];
}

/** @deprecated Use getAllRulesFor(program) for per-user support. */
export const ALL_RULES: RegulationRule[] = [
  ruleTotalCredits,
  ruleMandatoryCredits,
  ruleSeminarCredits,
  ruleElectiveCredits,
  ...disciplineRules,        // dynamic — one per discipline with minCredits > 0
  ruleFocusAreaCredits,
  ruleSeminarPapers,
  ruleReferat,
  ruleSeminarMandatoryGate,
  ruleMandatoryCourses,
  ruleLawFoundation,
  ruleEnglishRequirement,
  ruleEnglishLevel,
  ruleEnglishExemptionDeadline,
  ruleGraduationScore,
  ruleFailureRate,
  ruleMaxAttempts,
  ruleFailTwice,
  ruleRetakeAdvisory,
  ruleYearTransitionGPA,
  ruleYearTransitionMajorGPA,
  ruleMiluimBinaryCap,
  ruleMiluimHonorsBinary,
];
