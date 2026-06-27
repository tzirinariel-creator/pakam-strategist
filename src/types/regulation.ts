// =========================================
// Regulation Engine Types
// =========================================

import type { RuleSeverity, Discipline } from "./enums";
import type { UserCourseWithCourse, SeminarInfo, CreditBreakdown, GradeBreakdown } from "./degree";
import type { ProgramDefinition } from "@/lib/programs/types";

export interface RegulationResult {
  ruleId: string;          // "PKM-001", "DISC-PHILOSOPHY", etc.
  ruleNameEn: string;      // English rule name
  ruleNameHe: string;      // Hebrew rule name
  severity: RuleSeverity;  // ERROR | WARNING | INFO
  passed: boolean;
  messageEn: string;       // Human-readable English message
  messageHe: string;       // Human-readable Hebrew message
  details?: Record<string, unknown>; // Additional context (e.g., { current: 120, required: 150 })
  affectedCourseIds?: string[]; // Course IDs affected by this rule
}

export interface RuleContext {
  userCourses: UserCourseWithCourse[];
  focusArea: Discipline | null;
  currentYear: number;
  creditBreakdown: CreditBreakdown;
  gradeBreakdown: GradeBreakdown;
  seminars: SeminarInfo[];
  /** The active program definition — rules read thresholds from here. */
  programDefinition: ProgramDefinition;
  /**
   * Student's AMIRANT (English placement) score on the 50–150 scale, or null
   * if not provided. When null, English-level rules stay neutral. נכון לתשפ"ו.
   */
  amirantScore?: number | null;
  /** Student's current academic year (1-based) — used by deadline rules. */
  academicYear?: number;
  /** Student's current semester ("FALL" | "SPRING" | "SUMMER"). */
  currentSemester?: string;
}

export type RegulationRule = (context: RuleContext) => RegulationResult;

export interface RegulationSummary {
  totalRules: number;
  passed: number;
  failed: number;
  warnings: number;
  info: number;
  results: RegulationResult[];
  complianceScore: number; // 0-100
  courseCount?: number;     // number of courses the user has (added by router)
}
