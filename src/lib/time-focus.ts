// =========================================================================
// #10 (18:19) — the app adapts to the TIME OF YEAR. This pure selector picks
// the SINGLE most relevant action for the student right now, from the real
// academic-calendar phase + the student's own state. The dashboard renders
// it as a hero that changes with the season, instead of a fixed layout that
// buries exam planning mid-page during exam period.
// =========================================================================

import { getAcademicNow } from "@/lib/academic-calendar";
import { getBiddingTarget, isBiddingSeason } from "@/lib/bidding-target";
import {
  getBiddingPhase,
  isBiddingRelevant,
  hasCurrentBiddingCycle,
  type BiddingPhase,
} from "@/lib/bidding-calendar";

export type TimeFocusKind = "exams" | "grades" | "bidding" | "teaching" | "plan";

export interface TimeFocus {
  kind: TimeFocusKind;
  /** Where the primary CTA goes. */
  href: string;
  /** Days until the anchor event, when meaningful (exam / semester start). */
  days?: number;
  /** The REAL registration phase, when the bidding calendar covers `now`.
   *  Present only for kind === "bidding"; absent means we have no published
   *  round dates and the hero must fall back to window wording. */
  bidding?: BiddingPhase;
}

export interface TimeFocusInput {
  /** Days until the student's nearest upcoming exam, or null if none. */
  daysToNearestExam: number | null;
  /** True when a finished semester has ungraded courses (grades are arriving). */
  gradesPending: boolean;
  /** The student's degree-start anchor + stored year, for bidding derivation. */
  startYear: number | null | undefined;
  storedYear: number;
  now?: Date;
}

/**
 * The one thing that matters most right now. Priority ladder:
 *  1. An exam within ~30 days → plan studying (the most time-sensitive).
 *  2. Grades arriving for a finished semester → enter them.
 *  3. Registration — the PUBLISHED round dates first, the teaching-start
 *     window only as a fallback for cycles we have no dates for.
 *  4. Mid-teaching → your week (calendar).
 *  5. Otherwise → keep planning the degree.
 * Returns null when the calendar is stale (iron rule: no guessing off-calendar).
 *
 * WHY (3) changed: the ladder used to key bidding solely on `isBiddingSeason`
 * = "≤45 days to the next TEACHING start". For תשפ״ז that window opens 3.9.26,
 * but round 1 opens 7.9.26 and CLOSES 15.9.26 — so through all of August, with
 * the round three weeks out, the home screen said nothing about registration at
 * all, and the same window then kept claiming "bidding season" for the twelve
 * days AFTER round 2's results. Teaching-start was a proxy for a date we now
 * actually hold; the real one wins.
 */
export function getTimeFocus(input: TimeFocusInput): TimeFocus | null {
  const now = input.now ?? new Date();
  const acad = getAcademicNow(now);
  if (acad.isStale) return null;

  if (input.daysToNearestExam != null && input.daysToNearestExam <= 30) {
    return { kind: "exams", href: "/exam-planner", days: input.daysToNearestExam };
  }
  if (input.gradesPending) {
    return { kind: "grades", href: "/record?scan=1" };
  }
  const biddingTarget = getBiddingTarget(input.startYear, input.storedYear, now);
  // A student past year 3 has nothing left to register for — `getBiddingTarget`
  // returning null is that signal, and it must silence the ask either way.
  if (biddingTarget && isBiddingRelevant(now)) {
    const phase = getBiddingPhase(now);
    return {
      kind: "bidding",
      href: "/bidding",
      days: phase.daysUntil ?? undefined,
      bidding: phase,
    };
  }
  // The teaching-start window is a PROXY for dates we don't have. When we do
  // have them and they say the rounds are finished, the proxy must not
  // resurrect the ask — it would keep saying "bidding is near" for the twelve
  // days between round 2's results (6.10) and the year opening (18.10).
  if (isBiddingSeason(biddingTarget) && biddingTarget && !hasCurrentBiddingCycle(now)) {
    return { kind: "bidding", href: "/bidding", days: biddingTarget.daysUntilStart };
  }
  if (acad.phase === "teaching") {
    return { kind: "teaching", href: "/calendar" };
  }
  return { kind: "plan", href: "/planner" };
}
