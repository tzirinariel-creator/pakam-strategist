// =========================================
// ?goal → requirement-bucket resolution (the home→planner intent bridge)
// =========================================
// The home's "המצב שלי" hero sends the top unmet requirement NAME as ?goal=…;
// the semester editor resolves it to the live bucket so the focus banner shows
// a real gap-meter ("סמינרים — 0/12") instead of echoing a string. Heuristic by
// design (the goal is a display name, not an id) — so the matching is guarded:
// a zero/missing target returns null (no NaN meters, e.g. Law students with
// focusAreaMin=0), and "seminar PAPERS" wording never mis-maps to the seminar
// CREDITS bucket. Pure + unit-tested.

import { CREDIT_REQUIREMENTS } from "@/lib/constants";
import type { CreditBreakdown } from "@/types/degree";

export type GoalBucket = { current: number; target: number; unit: string; met: boolean };

export function resolveGoalBucket(
  goal: string | null,
  breakdown: CreditBreakdown | null | undefined,
  isHe: boolean,
): GoalBucket | null {
  if (!goal || !breakdown) return null;
  const sas = isHe ? "ש״ס" : "cr.";
  // Case-insensitive matching — rule names arrive capitalized in English
  // ("Seminar Papers"), and a case-sensitive exclusion would silently fail.
  const g = goal.toLowerCase();
  const has = (...terms: string[]) => terms.some((t) => g.includes(t.toLowerCase()));
  // A zero (or missing) target — e.g. a Law student has focusAreaMin=0 — has no
  // meaningful gap-meter, so return null and let the plain banner show instead
  // (prevents a NaN% width and a bogus "0/0 ✓").
  const mk = (current: number, target: number, unit: string): GoalBucket | null =>
    target > 0 ? { current, target, unit, met: current >= target } : null;
  // Seminar CREDITS — but NOT the separate "seminar papers"/"referat" rule, which
  // also contains "סמינר" (a URL-crafted goal could otherwise mis-map).
  if (has("סמינר", "Seminar", "seminar") && !has("עבודות", "רפרט", "paper", "referat"))
    return mk(breakdown.seminar, CREDIT_REQUIREMENTS.SEMINAR_TOTAL, sas);
  if (has("אנגלית", "English", "english"))
    return mk(breakdown.englishCourseCount, CREDIT_REQUIREMENTS.ENGLISH_MIN_COURSES, isHe ? "קורסים" : "courses");
  if (has("מיקוד", "ריכוז", "focus", "התמחות"))
    // ?? (not ||): an EXPLICIT focusAreaTarget of 0 (a program with no focus
    // requirement) must stay 0 so mk() returns null — not fall back to 60.
    return mk(breakdown.focusArea, breakdown.focusAreaTarget ?? CREDIT_REQUIREMENTS.FOCUS_AREA_MIN, sas);
  if (has("חובה", "Mandatory", "mandatory")) return mk(breakdown.mandatory, CREDIT_REQUIREMENTS.MANDATORY_TOTAL, sas);
  if (has("בחירה", "Elective", "elective")) return mk(breakdown.elective, CREDIT_REQUIREMENTS.ELECTIVE_TOTAL, sas);
  return null;
}
