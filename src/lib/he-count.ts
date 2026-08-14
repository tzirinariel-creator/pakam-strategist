// =========================================================================
// Counting in Hebrew — the "1 קורסים" family
// =========================================================================
// Every count in this app was written as `{n} קורסים`, which is right for
// every value of n except the one a student hits constantly. Hebrew does not
// count like that: at one, the digit becomes a word and the noun (and any verb
// after it) goes singular.
//
//   "1 קורסים בלי שעות ידועות לא נספרו"   ← what shipped
//   "קורס אחד בלי שעות ידועות לא נספר"     ← what a person writes
//
// Ariel's note #6 is exactly this: "ששום דבר לא שבור, ושהם לא מטא". A template
// that only ever imagined the plural reads as a machine filling a slot, which
// is the same complaint in a different costume.
//
// This is deliberately NOT an Intl.PluralRules wrapper. Hebrew's rule isn't the
// interesting part — the interesting part is that the caller has to supply BOTH
// phrasings, because the singular is usually a different sentence, not the
// plural with a letter removed ("לא נספרו" → "לא נספר", "3 ימים" → "יום אחד").
// Forcing both at the call site is the point.

/**
 * Pick the phrasing that matches the count.
 *
 * ```ts
 * heCount(n, { one: "קורס אחד לא נספר", many: `${n} קורסים לא נספרו` })
 * ```
 *
 * Zero takes `many` — "0 קורסים" is correct Hebrew, and a `zero` phrasing is
 * usually a different sentence entirely (an empty state), which belongs to the
 * caller's branching, not here.
 */
export function heCount(n: number, forms: { one: string; many: string }): string {
  return n === 1 ? forms.one : forms.many;
}

/**
 * The common shape: a noun that just needs its singular and plural, with the
 * number spelled as a word at one.
 *
 * ```ts
 * heNoun(1, "קורס", "קורסים")  // "קורס אחד"
 * heNoun(3, "קורס", "קורסים")  // "3 קורסים"
 * ```
 *
 * The number is returned as a plain string. Callers rendering into RTL JSX must
 * still put it through <Bidi> — this helper decides WORDS, never direction.
 */
export function heNoun(n: number, singular: string, plural: string): string {
  return n === 1 ? `${singular} אחד` : `${n} ${plural}`;
}

/** Feminine nouns take "אחת": heNounF(1, "שורה", "שורות") → "שורה אחת". */
export function heNounF(n: number, singular: string, plural: string): string {
  return n === 1 ? `${singular} אחת` : `${n} ${plural}`;
}

/**
 * A list of Hebrew items, joined the way Hebrew joins a list: commas, then a
 * single "ו" before the last one.
 *
 * `["ראשון","שני","חמישי"].join(" ו")` produced "ראשון ושני וחמישי" on the
 * planner — a chain of vavs no one writes. Two items take just the "ו".
 */
export function heList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  return `${items.slice(0, -1).join(", ")} ו${items[items.length - 1]}`;
}

/** The English counterpart, so a bilingual call site reads symmetrically. */
export function enList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
