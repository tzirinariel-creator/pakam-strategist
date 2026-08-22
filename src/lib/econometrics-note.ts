// =========================================================================
// אקונומטריקה יישומית — the one course requirement we hold, said where it acts
// =========================================================================
// Ariel, 22.8: "לא התייחסת במתכנן לסיפור של האקונומטריקה היישומית וחבל."
//
// He is right, and the mistake is a placement one rather than a content one. I
// put the secretariat's rule on "מה אחרי התואר" — a screen you reach AFTER the
// plan is built. The rule's whole value is that it changes what you put in the
// plan, so it has to appear while the plan is still open.
//
// What the rule actually says (PPE secretariat, August 2026):
//
//   ביה״ס לכלכלה ידרוש כדרישת קדם לקורסים מתקדמים בכלכלה ולסמינרים בביה״ס
//   לכלכלה את השלמת הקורס 10112116 אקונומטריקה יישומית בסמסטר ב׳ של שנה ב׳
//   או בשנה ג׳. […] הקורס אינו חובה למי שלא מתעתד.ת לקחת קורסים מתקדמים
//   בביה״ס ו/או להמשיך לתואר שני בכלכלה.
//
// Two halves, and the second half is the one an app usually drops. It is NOT a
// requirement for most of the cohort. So this never says "you must" — it says
// what the school requires, of whom, and leaves the student to know which they
// are. That is also why the course stays an ELECTIVE in the catalog.
//
// It stays quiet once the course is in the plan, and once it can no longer be
// taken. A note that keeps talking after you have acted on it is how a person
// learns to stop reading notes.

export const ECONOMETRICS_CODE = "1011-2116";

export interface EconometricsPlanRow {
  code: string;
  status: string;
  plannedYear: number;
}

export interface EconometricsNote {
  /** True once the student already holds or plans the course — nothing to say. */
  satisfied: boolean;
  /** The last year in which taking it still satisfies the school's window. */
  lastUsefulYear: 3;
  /** Their current year, for phrasing the urgency honestly. */
  currentYear: number;
}

/**
 * Whether the planner should raise the econometrics note, and in what state.
 *
 * Returns null when there is nothing worth saying: the course is already in
 * the plan (in any status — completed, planned or in progress), or the window
 * the secretariat names has passed, in which case the note would only be a
 * reproach about a decision that can no longer be made.
 */
export function econometricsNote(
  rows: readonly EconometricsPlanRow[],
  currentYear: number,
): EconometricsNote | null {
  const normalise = (c: string) => c.replace(/-/g, "");
  const target = normalise(ECONOMETRICS_CODE);

  const held = rows.some(
    (r) => normalise(r.code) === target && r.status !== "DROPPED" && r.status !== "FAILED",
  );
  if (held) return null;

  // The school's window is "year 2 semester B, or year 3". Past that, saying
  // it is not advice any more.
  if (currentYear > 3) return null;

  return { satisfied: false, lastUsefulYear: 3, currentYear };
}
