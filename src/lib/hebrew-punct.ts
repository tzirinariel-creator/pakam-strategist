/**
 * Hebrew punctuation normalizer — the terminology rule (פכ״מ with gershayim,
 * never a straight quote) applied to DATA, not just our own strings.
 *
 * Course names arrive from TAU's ידיעון with ASCII quotes ("מתמטיקה לפכ"מ",
 * "מיקרו כלכלה ב'"). Our copy standard uses the real Hebrew marks: gershayim
 * (״, U+05F4) inside acronyms and geresh (׳, U+05F3) after ordinals. Rather
 * than fix 46 render sites (or mutate prod data), `prisma` normalizes
 * `Course.nameHe` at READ time via a result extension — one chokepoint, every
 * screen, zero writes (live-verify 13.7: "מתמטיקה לפכ"מ" next to פכ״מ).
 *
 * Safe by construction:
 * - `"` becomes ״ only BETWEEN two Hebrew letters (an acronym); quoted words
 *   keep their quotes (space on one side → no match).
 * - `'` becomes ׳ only AFTER a Hebrew letter (an ordinal/abbreviation).
 * - Scanner matching is unaffected — normalizeName() in grade-sheet.ts already
 *   strips both straight AND Hebrew marks before comparing.
 */

const HEB = "א-ת"; // א-ת

const ACRONYM_QUOTE = new RegExp(`(?<=[${HEB}])"(?=[${HEB}])`, "g");
const ORDINAL_APOSTROPHE = new RegExp(`(?<=[${HEB}])'`, "g");

export function normalizeHebrewPunct(s: string): string {
  if (!s || (!s.includes('"') && !s.includes("'"))) return s;
  return s.replace(ACRONYM_QUOTE, "״").replace(ORDINAL_APOSTROPHE, "׳");
}
