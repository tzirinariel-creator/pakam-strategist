// =========================================================================
// Local-midnight day math — the exam-planner / skyline / xlsx convention
// =========================================================================
// These read a Date by its HOST-LOCAL components on purpose. That is not an
// oversight and it is NOT a rival of lib/civil-day — the two are a pair:
//
//   • `civil-day` answers "what day is it for the student in Israel", and its
//     `israelCivilDate()` exists precisely to hand these helpers a Date whose
//     local Y/M/D already equal the Israel civil date, so the same day keys come
//     out on a UTC server as on the student's phone.
//   • these helpers then do the arithmetic and the grid keys.
//
// A local key is required here, not optional: a local-midnight Date serialized
// through `toISOString()` rolls back a day for Israel (UTC+2/+3), which silently
// moved study blocks one column off their exam.
//
// Four byte-identical copies of `startOfDay`/`addDays` and six near-identical
// `dayKey`s exist across the exam-planner surfaces. The two in `src/lib` now
// live here; the rest sit under `src/components/exam-planner/**`, which another
// workstream owns — they should be pointed here when that settles.

/** The same instant, snapped back to LOCAL midnight of its own day. */
export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** `n` days later (or earlier), at LOCAL midnight. */
export function addDays(d: Date, n: number): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() + n);
  return x;
}

/**
 * "2026-08-15" from a Date's LOCAL components — never `toISOString()`, which is
 * UTC and rolls a local-midnight Israeli date back to the previous day.
 */
export function dayKey(d: Date): string {
  const x = startOfDay(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

/** Whole days from `a` to `b`, both snapped to local midnight first. */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86_400_000);
}
