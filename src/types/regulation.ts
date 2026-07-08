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
  /**
   * #23 — English level declared directly (grade sheet / settings), e.g.
   * "ADVANCED_B". When present it OVERRIDES amirantScore in the English rules,
   * because the grade sheet prints the level with no number.
   */
  englishLevel?: string | null;
  /** Student's current academic year (1-based) — used by deadline rules. */
  academicYear?: number;
  /** Student's current semester ("FALL" | "SPRING" | "SUMMER"). */
  currentSemester?: string;
  /**
   * Current miluim group ("NONE" | "GROUP_A".."GROUP_G"). Optional so existing
   * callers stay valid; used by the binary-cap rules (PKM-024/025).
   */
  miluimGroup?: string | null;
  /** Binary (pass/fail) conversions already used across the degree. */
  miluimBinaryUsed?: number;
  /** Credit exemptions (ש"ס) already used across the degree. */
  miluimCreditsUsed?: number;
}

export type RegulationRule = (context: RuleContext) => RegulationResult;

export interface RegulationSummary {
  totalRules: number;
  passed: number;
  failed: number;
  warnings: number;
  info: number;
  results: RegulationResult[];
  /**
   * Legacy passed/total ratio (0-100). Kept for backward-compat only.
   * Do NOT use as a headline "compliance" figure — a mid-degree student with
   * zero violations still has many not-yet-earned INFO progress targets, which
   * drags this far below 100 and frames normal progress as failure.
   * Use `compliant` / `violations` for compliance and `progressMet` /
   * `progressTotal` for degree progress instead.
   */
  complianceScore: number; // 0-100
  /**
   * Count of REAL rule violations: rules that FAILED with severity "ERROR".
   * Accumulation / progress targets (INFO) are NOT violations.
   */
  violations: number;
  /** True when the student is violating no hard rules (violations === 0). */
  compliant: boolean;
  /**
   * Degree-progress numerator: non-ERROR rules currently satisfied. This is a
   * neutral "how far toward graduation" figure, never a pass/fail score.
   */
  progressMet: number;
  /** Degree-progress denominator: total non-ERROR (progress/accumulation) rules. */
  progressTotal: number;
  courseCount?: number;     // number of courses the user has (added by router)
}
