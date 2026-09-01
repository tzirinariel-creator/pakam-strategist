// =========================================================================
// "מה עוד יש כאן" — the features a student never finds on their own
// =========================================================================
// Ariel, more times than any other note, and again on 1.9:
//
//   "מפריע לי מאוד מאוד מאוד מאוד וביקשתי את זה עשרות פעמים — שמרגיש לי
//    שהסטודנט לא מספיק נחשף לכל הפיצרים והאופציות. בתור סטודנט מתחיל נגיד —
//    לא הייתי יודע שיש דבר כזה תכנון מבחנים."
//
//   "סיימתי את כל ההגדרות וכו — ולא התנסיתי במלך. לא התנסיתי בפיצרים
//    מעניינים. לא התנסיתי בתכנון מבחנים. בקיצור אני לא מספיק מכיר ויכול
//    לנצל את האפליקציה במיטבה."
//
// This is NOT the first-week checklist in getting-started.ts. That one covers
// the things a student MUST do for the app to work at all — plan, grades,
// focus area — and it is finished after a week. This covers what the app can
// do that they have no way of discovering: a screen they never scrolled to
// exists, for them, only if something says so.
//
// TWO RULES, because a "discover our features" list is otherwise just an ad.
//
// 1. ORDERED BY THE CALENDAR, not by our enthusiasm. Bidding opens on 7.9;
//    for the fortnight around it, the bidding screen is the only entry worth
//    leading with, and the study planner is noise. In late January it is the
//    other way round. The order is derived from the same academic clock the
//    rest of the app runs on, so this surface can never be excited about the
//    wrong thing.
//
// 2. A "tried it" tick MUST come from a real trace. We do not log screen
//    views, so for most entries we simply do not claim to know — and an entry
//    with nothing to check is shown without a tick rather than with a false
//    one. Marking something done that the student never did is the fastest way
//    to make the whole list untrustworthy.

export type FeatureId =
  | "bidding"
  | "examPlanner"
  | "king"
  | "simulator"
  | "cohort"
  | "lineage"
  | "calendarSync"
  | "miluim";

export interface FeatureDiscoveryInput {
  /** Days until the bidding round opens; null when there is no live cycle. */
  daysToBidding: number | null;
  /** Days until the student's nearest exam; null when none is known. */
  daysToNearestExam: number | null;
  /** A generated study plan exists — the exam planner has really been used. */
  hasStudyPlan: boolean;
  /** The student has contributed to the cohort file. */
  hasCohortContribution: boolean;
  /** Google Calendar is connected. */
  calendarConnected: boolean;
  /** Any grade at all — the simulator has nothing to work on without one. */
  hasAnyGrade: boolean;
  /** Reservist — the miluim entitlements screen is only relevant to some. */
  isReservist: boolean;
}

export interface FeatureEntry {
  id: FeatureId;
  href: string;
  /**
   * True only when a real trace says so. `null` means "we do not track this"
   * — rendered as no tick at all, never as a cross.
   */
  tried: boolean | null;
  /** Why it is worth their time RIGHT NOW, when the calendar makes it urgent. */
  urgentDays?: number;
}

/**
 * The features worth showing, most relevant first.
 *
 * Entries a student cannot use yet are dropped rather than shown greyed out: a
 * disabled row still costs a line of attention and teaches nothing.
 */
export function featureDiscovery(input: FeatureDiscoveryInput): FeatureEntry[] {
  const out: FeatureEntry[] = [];

  // Bidding — only while a round is actually near. Outside that window this
  // entry disappears entirely rather than sitting there out of season.
  if (input.daysToBidding != null && input.daysToBidding <= 21) {
    out.push({ id: "bidding", href: "/bidding", tried: null, urgentDays: input.daysToBidding });
  }

  // The exam planner — the single feature Ariel names as undiscoverable.
  if (input.daysToNearestExam != null) {
    out.push({
      id: "examPlanner",
      href: "/exam-planner",
      tried: input.hasStudyPlan,
      ...(input.daysToNearestExam <= 45 ? { urgentDays: input.daysToNearestExam } : {}),
    });
  } else {
    out.push({ id: "examPlanner", href: "/exam-planner", tried: input.hasStudyPlan });
  }

  // The advisor. No trace to read — we do not store conversations — so no tick.
  out.push({ id: "king", href: "/mentor", tried: null });

  // The simulator needs at least one grade to say anything.
  if (input.hasAnyGrade) {
    out.push({ id: "simulator", href: "/graduation", tried: null });
  }

  out.push({ id: "cohort", href: "/cohort", tried: input.hasCohortContribution });
  out.push({ id: "lineage", href: "/lineage", tried: null });
  out.push({ id: "calendarSync", href: "/calendar", tried: input.calendarConnected });

  if (input.isReservist) {
    out.push({ id: "miluim", href: "/miluim", tried: null });
  }

  // Urgent first, closest deadline leading; then anything not yet tried; then
  // the rest. Something with a date on it always outranks something without.
  return out.sort((a, b) => {
    const aUrgent = a.urgentDays ?? Infinity;
    const bUrgent = b.urgentDays ?? Infinity;
    if (aUrgent !== bUrgent) return aUrgent - bUrgent;
    const aDone = a.tried === true ? 1 : 0;
    const bDone = b.tried === true ? 1 : 0;
    return aDone - bDone;
  });
}

/** How many entries the student has a recorded trace of using. */
export function triedCount(entries: FeatureEntry[]): { tried: number; knowable: number } {
  const knowable = entries.filter((e) => e.tried !== null);
  return { tried: knowable.filter((e) => e.tried === true).length, knowable: knowable.length };
}
