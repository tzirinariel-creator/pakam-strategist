// =========================================================================
// Things that are only true near the END of the degree
// =========================================================================
// From Ariel's conversation with טל, the PPE secretary — the person students
// actually go to. Three of her points are about TIMING, which the app had no
// concept of: it either said a thing always, or never.
//
//   1. "לגבי ה-8 ש״ס פטור … כן צריך להזכיר לה על זה לקראת סוף התואר"
//      The miluim credit exemption is not applied for you. Somebody has to ask
//      the secretariat for it, and the natural moment is near the end — which
//      is exactly when a student has stopped thinking about miluim paperwork.
//
//   2. "עדיף לשים בינאריים רק בסוף התואר כי יש איזושהי מכסה"
//      Binary conversions are capped. Spending one in year 1 on a course you
//      would have been fine about is a slot you cannot get back in year 3.
//
//   3. Honours is decided around March, against a cohort — see honors.ts notes.
//
// None of these are regulations we can quote a clause for, so nothing here is
// stated as a rule. They are *reminders to ask*, attributed to the secretariat,
// with the decision left where it belongs.
//
// Pure and injectable so the timing is testable rather than clock-dependent.

export interface DegreePosition {
  /** 1..3 for PPE. */
  currentYear: number;
  /** Total credits earned so far. */
  creditsEarned: number;
  /** The degree total (150 for PPE). */
  creditsRequired: number;
}

/** PPE is three years; "the end" starts when year 3 does, or at 75% of credits
 *  for anyone off the standard track (repeaters, part-timers, returning
 *  students) — whichever comes first. Credits are the more honest signal, the
 *  year is the one a first-year student recognises. */
export const END_OF_DEGREE_CREDIT_FRACTION = 0.75;

export function isNearEndOfDegree(p: DegreePosition): boolean {
  if (p.creditsRequired <= 0) return false;
  const byCredits = p.creditsEarned / p.creditsRequired >= END_OF_DEGREE_CREDIT_FRACTION;
  return p.currentYear >= 3 || byCredits;
}

export interface MiluimExemptionReminder {
  show: boolean;
  /** ש״ס the student is eligible for and has not used. Never invented: the
   *  caller passes what the miluim model already computed. */
  unusedCredits: number;
}

/**
 * Remind about the unclaimed miluim credit exemption — but only near the end,
 * and only when there is something left to claim.
 *
 * Deliberately NOT shown from year 1: a reminder that fires for two years
 * straight is furniture, and this one needs to land as an action.
 */
export function miluimExemptionReminder(
  position: DegreePosition,
  opts: { eligibleCredits: number; usedCredits: number },
): MiluimExemptionReminder {
  const unused = Math.max(0, opts.eligibleCredits - opts.usedCredits);
  return { show: unused > 0 && isNearEndOfDegree(position), unusedCredits: unused };
}

export type BinaryTimingAdvice = "hold" | "reasonable" | "no-quota-left";

/**
 * Should this student be spending a binary conversion NOW?
 *
 * טל's guidance is that the quota is finite and the end of the degree is when
 * you know which course actually needs it. So early in the degree the app says
 * "hold" — advice, with her reasoning attached — rather than blocking anything.
 * The student can still convert; they just get told what they are spending.
 */
export function binaryTimingAdvice(
  position: DegreePosition,
  opts: { remaining: number },
): BinaryTimingAdvice {
  if (opts.remaining <= 0) return "no-quota-left";
  return isNearEndOfDegree(position) ? "reasonable" : "hold";
}
