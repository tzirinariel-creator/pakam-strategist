/**
 * Grammatical "in N days" countdown for both languages — never the ungrammatical
 * "בעוד 1 ימים" / "in 1 days" near a boundary (audit 22.7).
 *   0 → today · 1 → in a day · 2 → in two days (Hebrew nicety) · else → in N days
 * The honest number is preserved; only the grammar around it changes.
 */
export function daysUntilLabel(days: number, isHe: boolean): string {
  if (isHe) {
    if (days <= 0) return "היום";
    if (days === 1) return "בעוד יום";
    if (days === 2) return "בעוד יומיים";
    return `בעוד ${days} ימים`;
  }
  if (days <= 0) return "today";
  if (days === 1) return "in 1 day";
  return `in ${days} days`;
}
