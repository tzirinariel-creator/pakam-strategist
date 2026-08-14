// =========================================================================
// Degree progress — THE one place "X / 150" is defined
// =========================================================================
// There are two legitimate ways to count how far a student is through the
// degree, and the app used to compute BOTH under the same label:
//
//   • SECURED  = earned (COMPLETED + EXEMPT) + the miluim credit exemption.
//                Credits the student ALREADY HAS. This is what the dashboard
//                hero and the planner rail call "הושלמו" / "% מהתואר".
//   • PROJECTED= secured + planned (PLANNED + IN_PROGRESS) — i.e. the
//                breakdown's `effectiveTotal`. What the degree WILL look like
//                if every planned course is passed.
//
// Both are true; only one of them is "degree progress". A student who had
// planned their whole degree saw the planner/regulations report 104/150 and
// the dashboard 78/150, both labelled degree progress — the same number-with-
// two-meanings defect the owner has caught three times.
//
// RULE FOR EVERY CALLER: the bare label ("X/150", "Y% מהתואר", "התקדמת ל-Z%")
// belongs to SECURED. A projected figure may be shown, but only with a label
// that says so out loud ("כולל המתוכננים", "התוכנית מכסה").
//
// Pure, no I/O, no React — so the server rules, the client hero and the AI
// context all read the identical arithmetic.

import { CREDIT_REQUIREMENTS } from "@/lib/constants";
import type { CreditBreakdown } from "@/types/degree";

/** The subset of CreditBreakdown this module needs — so callers can pass a
 *  partial snapshot (tests, the delta narrative) without faking every field. */
export type CreditProgressInput = Pick<
  CreditBreakdown,
  "earned" | "planned" | "miluimExemption"
> &
  Partial<Pick<CreditBreakdown, "effectiveTotal">>;

export interface DegreeProgress {
  /** The program's total-credit target (150 for PPE). */
  target: number;
  /** Credits from COMPLETED / EXEMPT courses. */
  earned: number;
  /** Credits from PLANNED / IN_PROGRESS courses — NOT yet held. */
  planned: number;
  /** Miluim (reserve-duty) credit exemption actually granted. */
  miluimExemption: number;
  /** earned + miluimExemption — the credits the student ALREADY HAS.
   *  THE definition behind every unqualified "X/150" and "Y% מהתואר". */
  secured: number;
  /** secured + planned (= breakdown.effectiveTotal) — the projection if every
   *  planned course is passed. NEVER label this "degree progress" on its own. */
  projected: number;
  /** secured / target as a 0–100 integer. The one degree percentage. */
  pct: number;
  /** projected / target as a 0–100 integer. Always needs a "including planned"
   *  label next to it. */
  projectedPct: number;
  /** target − secured, floored at 0: credits still to EARN. */
  remaining: number;
}

function toPct(value: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, Math.round((value / target) * 100));
}

/**
 * Derive every degree-progress number from a credit breakdown.
 *
 * @param b       A CreditBreakdown (or the earned/planned/exemption subset).
 *                `null` yields an all-zero progress rather than throwing, so a
 *                still-loading surface renders 0% instead of NaN.
 * @param target  Program total; defaults to the active program's (150 for PPE).
 */
export function degreeProgress(
  b: CreditProgressInput | null | undefined,
  target: number = CREDIT_REQUIREMENTS.TOTAL,
): DegreeProgress {
  const earned = b?.earned ?? 0;
  const planned = b?.planned ?? 0;
  const miluimExemption = b?.miluimExemption ?? 0;
  const secured = earned + miluimExemption;
  // Prefer the engine's own effectiveTotal when present (it is the same sum,
  // and staying with it keeps this module byte-consistent with the breakdown
  // even if the engine ever starts capping something); otherwise derive it.
  const projected = b?.effectiveTotal ?? secured + planned;

  return {
    target,
    earned,
    planned,
    miluimExemption,
    secured,
    projected,
    pct: toPct(secured, target),
    projectedPct: toPct(projected, target),
    remaining: Math.max(0, target - secured),
  };
}

/**
 * The ONE degree percentage: credits already held, over the program target.
 * Identical to what <DegreeStatus> renders as the hero's super-number.
 */
export function degreeCompletionPct(
  b: CreditProgressInput | null | undefined,
  target?: number,
): number {
  return degreeProgress(b, target).pct;
}

/**
 * Credits the student already holds (earned + miluim exemption) — the number
 * that belongs next to an unqualified "/150".
 */
export function securedCredits(b: CreditProgressInput | null | undefined): number {
  return (b?.earned ?? 0) + (b?.miluimExemption ?? 0);
}
