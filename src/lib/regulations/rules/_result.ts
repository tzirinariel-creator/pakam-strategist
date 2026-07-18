import type { RegulationResult } from "@/types/regulation";

// -------------------------------------------------------------------
// Helper: build a RegulationResult
// -------------------------------------------------------------------

export function result(
  ruleId: string,
  nameEn: string,
  nameHe: string,
  passed: boolean,
  severity: RegulationResult["severity"],
  messageEn: string,
  messageHe: string,
  details?: Record<string, unknown>,
  affectedCourseIds?: string[]
): RegulationResult {
  return {
    ruleId,
    ruleNameEn: nameEn,
    ruleNameHe: nameHe,
    severity,
    passed,
    messageEn,
    messageHe,
    details,
    affectedCourseIds,
  };
}
