// =========================================================================
// Active assistant — action detection ("שסיימתי אנגלית… והוא אשכרה יעשה").
// =========================================================================
// Turns a natural sentence into a PROPOSED action card: "סיימתי מיקרו עם 88"
// → mark that plan row COMPLETED with grade 88; "תוסיף לי את כלכלת חינוך" →
// add the catalog course to the plan. DETECTION ONLY — nothing executes here.
// The constitution's no-silent-automation rule holds: the assistant renders a
// confirm card and the student clicks; the click calls the SAME tRPC
// mutations the record/planner use (ownership + demo guards included).
//
// Pure + unit-tested. Ambiguity is honest: two equally-good matches → null
// (the assistant answers normally and can ask which course was meant).

export interface PlanCourseLite {
  userCourseId: string;
  nameHe: string;
  status: string;
  courseType?: string | null;
}

export interface CatalogCourseLite {
  id: string;
  code: string;
  nameHe: string;
}

export type AssistantAction =
  | {
      type: "COMPLETE_COURSE";
      userCourseId: string;
      courseName: string;
      /** Extracted grade, or null when the sentence didn't carry one. */
      grade: number | null;
    }
  | { type: "ADD_COURSE"; courseId: string; courseName: string };

// Same normalization family as degree-qa: niqqud, punctuation, final letters.
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/־/g, " ")
    .replace(/[֑-ׇ]/g, "")
    .replace(/[׳״'"`]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/ך/g, "כ")
    .replace(/ם/g, "מ")
    .replace(/ן/g, "נ")
    .replace(/ף/g, "פ")
    .replace(/ץ/g, "צ")
    .replace(/\s+/g, " ")
    .trim();
}

const COMPLETE_INTENT = /(סיימתי|סגרתי|עברתי|קיבלתי בקורס|יש לי ציון|finished|passed|completed)/;
// NOTE: matched against NORMALIZED text — final letters are already folded
// (ף→פ, ם→מ …), so the patterns are written in folded form on purpose.
const ADD_INTENT = /(תוסיפ|הוסיפי|הוספ|תרשמו אותי|תרשומ אותי|אני רוצה לקחת|רוצה להוסיפ|בא לי לקחת|add course|sign me up|i want to take)/;

/** Cheap pre-check so the caller only fetches the catalog when relevant. */
export function hasAddIntent(text: string): boolean {
  return ADD_INTENT.test(normalize(text));
}

export function hasCompleteIntent(text: string): boolean {
  return COMPLETE_INTENT.test(normalize(text));
}

// Generic words that appear in half the catalog — matching on them alone
// would grab the wrong course.
const STOPWORDS = new Set([
  "מבוא", "של", "על", "עמ", "קורס", "שיעור", "המשכ", "לקחת", "רוצה", "אני",
  "את", "בקורס", "סיימתי", "עברתי", "קיבלתי", "ציונ", "תוסיפ", "הוספ", "לי",
  "the", "course", "intro", "to", "a", "b",
]);

/** Distinctive tokens of a course name (≥3 chars, not a stopword). */
function distinctiveTokens(name: string): string[] {
  return normalize(name)
    .split(" ")
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

// Hebrew ordinal course markers (מיקרו א׳/ב׳/ג׳). After normalize the geresh
// is stripped, so they survive as standalone single-char tokens — which
// distinctiveTokens (≥3 chars) THREW AWAY, making מיקרו-א׳ and מיקרו-ב׳ look
// identical. That let a "סיימתי מיקרו א׳" grab the wrong sibling (audit HIGH).
const HE_ORDINALS: Record<string, number> = { "א": 1, "ב": 2, "ג": 3, "ד": 4, a: 1, b: 2, c: 3, d: 4 };

/** The ordinal a name/sentence refers to (1–4), or null when none is present. */
function ordinalOf(normStr: string): number | null {
  for (const tok of normStr.split(" ")) {
    if (tok in HE_ORDINALS) return HE_ORDINALS[tok]!;
  }
  return null;
}

/** Score how well `text` references `name`: total chars of distinctive tokens
 *  found in the text. 0 = no match OR an ordinal conflict (א׳ vs ב׳). */
function matchScore(normText: string, name: string): number {
  const normName = normalize(name);
  const qOrd = ordinalOf(normText);
  const cOrd = ordinalOf(normName);
  // Query names a specific level and the course is a DIFFERENT level → not it.
  if (qOrd != null && cOrd != null && qOrd !== cOrd) return 0;
  let score = 0;
  for (const tok of distinctiveTokens(name)) {
    if (normText.includes(tok)) score += tok.length;
  }
  // Matching the requested ordinal is a strong, disambiguating signal.
  if (score > 0 && qOrd != null && cOrd === qOrd) score += 2;
  return score;
}

/** Extract a 0-100 grade from the sentence, if present. */
export function extractGrade(text: string): number | null {
  const norm = normalize(text);
  const m =
    norm.match(/(?:ציונ|עמ|קיבלתי|with|got|grade)\s+(\d{1,3})(?:\s|$)/) ??
    norm.match(/(?:^|\s)(\d{2,3})(?:\s|$)/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 0 && n <= 100 ? n : null;
}

/** Best single match, or null when nothing matches or two tie (ambiguous). */
function bestMatch<T>(normText: string, items: T[], nameOf: (t: T) => string): T | null {
  let best: T | null = null;
  let bestScore = 0;
  let tie = false;
  for (const item of items) {
    const score = matchScore(normText, nameOf(item));
    if (score > bestScore) {
      best = item;
      bestScore = score;
      tie = false;
    } else if (score === bestScore && score > 0) {
      tie = true;
    }
  }
  return bestScore > 0 && !tie ? best : null;
}

/**
 * Detect an actionable request. `plan` = the student's own rows (any status);
 * `catalog` = active catalog courses (only needed for ADD — pass [] when the
 * caller hasn't loaded it).
 */
export function detectAction(
  text: string,
  plan: PlanCourseLite[],
  catalog: CatalogCourseLite[],
): AssistantAction | null {
  const norm = normalize(text);

  if (COMPLETE_INTENT.test(norm)) {
    // Only rows that can BECOME completed — never re-complete a done course.
    const candidates = plan.filter(
      (c) => c.status === "IN_PROGRESS" || c.status === "PLANNED",
    );
    // "סיימתי אנגלית" — the English rows match by type, not just name.
    const englishAsk = /אנגלית|english/.test(norm);
    const pool = englishAsk
      ? candidates.filter(
          (c) => c.courseType === "ENGLISH" || /אנגלית|english/i.test(c.nameHe),
        )
      : candidates;
    const hit = englishAsk && pool.length === 1
      ? pool[0]!
      : bestMatch(norm, pool, (c) => c.nameHe);
    if (hit) {
      return {
        type: "COMPLETE_COURSE",
        userCourseId: hit.userCourseId,
        courseName: hit.nameHe,
        grade: extractGrade(text),
      };
    }
  }

  if (ADD_INTENT.test(norm) && catalog.length > 0) {
    // Don't propose adding a course that's already in the plan.
    const planNames = new Set(plan.map((c) => normalize(c.nameHe)));
    const addable = catalog.filter((c) => !planNames.has(normalize(c.nameHe)));
    const hit = bestMatch(norm, addable, (c) => c.nameHe);
    if (hit) {
      return { type: "ADD_COURSE", courseId: hit.id, courseName: hit.nameHe };
    }
  }

  return null;
}
