// =========================================================================
// #10 (18:19) — the app adapts to the TIME OF YEAR. This pure selector picks
// the SINGLE most relevant action for the student right now, from the real
// academic-calendar phase + the student's own state. The dashboard renders
// it as a hero that changes with the season, instead of a fixed layout that
// buries exam planning mid-page during exam period.
// =========================================================================

import { getAcademicNow } from "@/lib/academic-calendar";
import { getBiddingTarget, isBiddingSeason } from "@/lib/bidding-target";

export type TimeFocusKind = "exams" | "grades" | "bidding" | "teaching" | "plan";

export interface TimeFocus {
  kind: TimeFocusKind;
  /** Where the primary CTA goes. */
  href: string;
  /** Days until the anchor event, when meaningful (exam / semester start). */
  days?: number;
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
 *  3. Bidding season (≤45d to next teaching) → finalize the plan / check clashes.
 *  4. Mid-teaching → your week (calendar).
 *  5. Otherwise → keep planning the degree.
 * Returns null when the calendar is stale (iron rule: no guessing off-calendar).
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
  if (isBiddingSeason(biddingTarget) && biddingTarget) {
    return { kind: "bidding", href: "/planner", days: biddingTarget.daysUntilStart };
  }
  if (acad.phase === "teaching") {
    return { kind: "teaching", href: "/calendar" };
  }
  return { kind: "plan", href: "/planner" };
}
