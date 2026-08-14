// =========================================================================
// Hebrew match-normalization — the one fold, for intent matching
// =========================================================================
// Three byte-identical copies of this lived in degree-qa.ts, ai/answer-router.ts
// and ai/action-router.ts, each with a comment noting it was a copy of the other
// two ("kept local so the two modules stay independent"). Independence is not
// worth it here: all three feed the SAME question through their own keyword
// tables, so the day one of them gained a fold the others didn't, the free
// engine and the router would start disagreeing about what a student asked —
// silently, and only for the phrasings that use the new mark.
//
// NOTE: this is deliberately NOT the app's only string normalizer, and the
// others are NOT duplicates of it:
//   • lib/grade-sheet.normalizeName    — fuzzy NAME matching against the catalog.
//     Strips BIDI controls (this one doesn't), keeps niqqud, keeps final letters,
//     and turns quotes into a SPACE rather than deleting them. Folding final
//     letters would collide real course names; it must stay separate.
//   • lib/hebrew-punct.normalizeHebrewPunct — the INVERSE operation. It ADDS
//     gershayim/geresh at the Prisma read layer so ש"ס renders as ש״ס.
//   • lib/course-color.normalizeCourseKey  — an A-Z0-9 key, not Hebrew at all.

/**
 * Fold the noise that trips plain substring matching, so paraphrases and typos
 * still land on the right intent: case, Hebrew niqqud/cantillation,
 * geresh/gershayim/quotes, any other punctuation, and final-letter forms
 * (ך/ם/ן/ף/ץ → base). Apply to BOTH the question and the keys, so e.g. "ש״ס",
 * "שס" and "ש\"ס" all match, and "עובר/לא-עובר" matches "עובר לא עובר".
 */
export function normalizeHebrewForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/־/g, " ") // Hebrew maqaf is a word joiner → space, not a mark to drop
    .replace(/[֑-ׇ]/g, "") // niqqud + cantillation marks
    .replace(/[׳״'"`]/g, "") // geresh / gershayim / quotes
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // any remaining punctuation → space
    .replace(/ך/g, "כ")
    .replace(/ם/g, "מ")
    .replace(/ן/g, "נ")
    .replace(/ף/g, "פ")
    .replace(/ץ/g, "צ")
    .replace(/\s+/g, " ")
    .trim();
}
