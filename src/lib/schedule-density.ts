// =========================================
// Schedule density — the "צפוף" insight math (Q10, note 12)
// =========================================
// The planner's "יום X צפוף — N שעות כמעט-רצופות" line quotes a NUMBER about
// the student's real week. The number must come from the actual timetable
// heatmap, and the tip must fire only past a real threshold — never as vibes.
// Pure and unit-tested; the insights bar consumes this instead of inlining it.

/** Hours ≥ this back-to-back on one day → the "packed day" tip fires. */
export const DENSE_DAY_THRESHOLD_HOURS = 4;

/** Longest run of consecutive busy hour-slots in one day's heatmap row. */
export function maxConsecutiveBusyHours(dayRow: readonly number[]): number {
  let run = 0;
  let max = 0;
  for (const slot of dayRow) {
    if (slot > 0) {
      run += 1;
      if (run > max) max = run;
    } else {
      run = 0;
    }
  }
  return max;
}

/**
 * The first day (index into the heatmap) whose longest busy run crosses the
 * threshold, with the REAL computed hour count — or null when no day is dense.
 * The quoted number is exactly this `hours`; the UI must not restate it.
 */
export function findDenseDay(
  weekHeatmap: readonly (readonly number[])[],
  threshold: number = DENSE_DAY_THRESHOLD_HOURS,
): { dayIndex: number; hours: number } | null {
  for (let d = 0; d < weekHeatmap.length; d++) {
    const hours = maxConsecutiveBusyHours(weekHeatmap[d] ?? []);
    if (hours >= threshold) return { dayIndex: d, hours };
  }
  return null;
}
