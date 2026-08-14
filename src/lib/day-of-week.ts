// =========================================================================
// Days of the week — the complete, 0-based, Sunday-first map
// =========================================================================
// The audit counted a dozen day maps. Most of them are NOT duplicates and are
// deliberately left alone (see the note at the bottom); what belongs here is the
// one thing they all agreed on and kept re-deriving: the SUNDAY..SATURDAY enum
// ↔ the JS `Date.getDay()` index, 0-based, all seven days present.
//
// "All seven" is the point. Three of the copies stopped at FRIDAY and fell back
// to `?? 0`, which silently turned a SATURDAY row into SUNDAY — a wrong day
// rather than a missing one.

export const DAY_OF_WEEK_ORDER = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
] as const;

export type DayOfWeekName = (typeof DAY_OF_WEEK_ORDER)[number];

/** SUNDAY → 0 … SATURDAY → 6, matching `Date.prototype.getDay()`. */
export const DAY_OF_WEEK_INDEX: Record<string, number> = Object.fromEntries(
  DAY_OF_WEEK_ORDER.map((d, i) => [d, i]),
);

/** The JS day index of a day name, or `undefined` for anything unrecognised —
 *  so a caller has to say out loud what an unknown day should do. */
export function dayOfWeekIndex(day: string): number | undefined {
  return DAY_OF_WEEK_INDEX[day];
}

/** 0 → "SUNDAY" … 6 → "SATURDAY". The `Date.getDay()` direction. */
export function jsDayToDayOfWeek(jsDay: number): DayOfWeekName | undefined {
  return DAY_OF_WEEK_ORDER[jsDay];
}

const DAY_SHORT_HE: Record<string, string> = {
  SUNDAY: "א׳",
  MONDAY: "ב׳",
  TUESDAY: "ג׳",
  WEDNESDAY: "ד׳",
  THURSDAY: "ה׳",
  FRIDAY: "ו׳",
  SATURDAY: "ש׳",
};

const DAY_SHORT_EN: Record<string, string> = {
  SUNDAY: "Sun",
  MONDAY: "Mon",
  TUESDAY: "Tue",
  WEDNESDAY: "Wed",
  THURSDAY: "Thu",
  FRIDAY: "Fri",
  SATURDAY: "Sat",
};

/**
 * The SHORT day label — "א׳" / "Sun". The catalog modal and the onboarding
 * course popover each carried a byte-identical copy of this that stopped at
 * THURSDAY, so a Friday meeting rendered the raw enum "FRIDAY" inside a Hebrew
 * screen. Distinct from `group-options.dayNameFor`, which is the LONG Hebrew
 * form ("ראשון") — that is a different label, not a duplicate of this one.
 */
export function dayShortFor(day: string, isHe: boolean): string {
  return (isHe ? DAY_SHORT_HE[day] : DAY_SHORT_EN[day]) ?? day;
}

// -------------------------------------------------------------------
// Deliberately NOT merged into this module (they are not duplicates):
//   • weekly-timetable `DAY_MAP` and planner-conflicts `DAY_INDEX` stop at
//     FRIDAY because the GRID only has six columns — `TimeSlot["day"]` is typed
//     `0|1|2|3|4|5`. Their incompleteness is the type talking, not an omission.
//   • insights-bar's 5-day map and `dayNames` back a Sun–Thu heatmap.
//   • calendar-content's `DOW_TO_IDX` is 1-based, paired with label arrays that
//     carry a leading "" to match. Correct as a unit; wrong to half-merge.
//   • group-options `DAY_NAMES_HE/EN` (long He, short En), todays-classes
//     (long both), week-share `DAY_HE` ("יום א׳"), course-bubble (2-letter En),
//     ics-export `DAY_MAP` (RFC 5545 codes) and scraper `DAY_MAP` (Hebrew
//     letter → enum, ingest) are different VOCABULARIES for different surfaces.
// -------------------------------------------------------------------
