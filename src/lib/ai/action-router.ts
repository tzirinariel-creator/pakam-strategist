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
  | { type: "ADD_COURSE"; courseId: string; courseName: string }
  | {
      /** "סיימתי קורס אנגלית מתקדמים ב׳" with no English row in the plan —
       *  the real meaning is a LEVEL change: passing the level course moves
       *  the student up (מתקדמים ב׳ course → exemption). Proposed as an
       *  explicit englishLevel update, never written silently. */
      type: "SET_ENGLISH_LEVEL";
      level: "EXEMPT" | "ADVANCED_B" | "ADVANCED_A";
      levelNameHe: string;
    }
  /** "תוריד את מיקרו מהתוכנית" → remove the PLANNED row (never a completed
   *  course — that's a record edit, a different, heavier action). */
  | { type: "DROP_COURSE"; userCourseId: string; courseName: string }
  /** "נכשלתי במיקרו" → mark the row FAILED. Kept distinct from COMPLETE so the
   *  "לא עברתי" negation can never be misread as a pass (would be a lie). */
  | { type: "MARK_FAILED"; userCourseId: string; courseName: string }
  /** "תעביר את מיקרו לסמסטר ב׳ / לשנה ג׳" → move the row. Only fires with an
   *  ABSOLUTE target (semester א/ב/קיץ and/or year 1–4); relative targets like
   *  "הסמסטר הבא" need current-semester context we don't have here → skipped. */
  | {
      type: "MOVE_COURSE";
      userCourseId: string;
      courseName: string;
      plannedYear?: number;
      plannedSemester?: "FALL" | "SPRING" | "SUMMER";
      targetLabel: string;
    };

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
const ADD_INTENT = /(תוסיפ|הוסיפי|הוספ|תרשמו אותי|תרשומ אותי|אני רוצה לקחת|רוצה להוסיפ|בא לי לקחת|אעשה|אקח|מתכננ לקחת|add course|sign me up|i want to take|planning to take)/;
// Destructive-ish verbs. Each still renders a CONFIRM card — nothing here runs.
const DROP_INTENT = /(תוריד|תורידי|הורד|תסיר|תסירי|הסר|תמחק|תמחקי|מחק|תוציא|הוצא|לבטל את|drop|remove|delete)/;
// FAIL must be tested BEFORE complete: COMPLETE_INTENT contains "עברתי", which
// also appears inside "לא עברתי" — so a failure sentence would otherwise be
// misread as a pass. NEGATED_PASS below re-guards the complete branch too.
const FAIL_INTENT = /(נכשלתי|נפלתי ב|לא עברתי|רפתי|failed|flunked|didnt pass|did not pass)/;
const MOVE_INTENT = /(תעביר|תעבירי|העבר|תזיז|תזיזי|הזז|move|reschedule|push .* to)/;
// A pass sentence that is actually a NEGATION — "לא עברתי", "לא סיימתי".
const NEGATED_PASS = /(לא עברתי|לא סיימתי|לא סגרתי|didnt pass|did not pass|didnt finish)/;

/** Parse an ABSOLUTE move target (semester and/or year) from the sentence.
 *  Relative targets ("הסמסטר הבא") return nothing for both — the caller then
 *  proposes no move (we can't resolve "next" without the current semester). */
function parseMoveTarget(normText: string): {
  plannedSemester?: "FALL" | "SPRING" | "SUMMER";
  plannedYear?: number;
  label: string;
} {
  let plannedSemester: "FALL" | "SPRING" | "SUMMER" | undefined;
  let plannedYear: number | undefined;
  const labelParts: string[] = [];
  // Semester: "סמסטר א/ראשון/fall" · "סמסטר ב/שני/spring" · "קיץ/summer".
  if (/(סמסטר א|סמסטר ראשונ|semester a|fall)/.test(normText)) {
    plannedSemester = "FALL";
    labelParts.push("סמסטר א׳");
  } else if (/(סמסטר ב|סמסטר שני|semester b|spring)/.test(normText)) {
    plannedSemester = "SPRING";
    labelParts.push("סמסטר ב׳");
  } else if (/(קיצ|summer)/.test(normText)) {
    plannedSemester = "SUMMER";
    labelParts.push("סמסטר קיץ");
  }
  // Year: "שנה א/ב/ג/ד" or "שנה 1-4" or "year 1-4".
  const yearWord = normText.match(/שנה ([אבגד1234])/) ?? normText.match(/year ([1234])/);
  if (yearWord) {
    const map: Record<string, number> = { א: 1, ב: 2, ג: 3, ד: 4, "1": 1, "2": 2, "3": 3, "4": 4 };
    plannedYear = map[yearWord[1]!];
    if (plannedYear) labelParts.push(`שנה ${["", "א׳", "ב׳", "ג׳", "ד׳"][plannedYear]}`);
  }
  return { plannedSemester, plannedYear, label: labelParts.join(", ") };
}

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
export function detectActions(
  text: string,
  plan: PlanCourseLite[],
  catalog: CatalogCourseLite[],
): AssistantAction[] {
  const norm = normalize(text);
  const actions: AssistantAction[] = [];

  // A row the student can still act on (not already earned/failed).
  const activeRows = plan.filter(
    (c) => c.status === "IN_PROGRESS" || c.status === "PLANNED",
  );

  // FAIL first — its "לא עברתי" would otherwise trip COMPLETE_INTENT's "עברתי".
  if (FAIL_INTENT.test(norm)) {
    const hit = bestMatch(norm, activeRows, (c) => c.nameHe);
    if (hit) {
      actions.push({ type: "MARK_FAILED", userCourseId: hit.userCourseId, courseName: hit.nameHe });
    }
  }

  if (COMPLETE_INTENT.test(norm) && !NEGATED_PASS.test(norm) && !actions.some((a) => a.type === "MARK_FAILED")) {
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
      actions.push({
        type: "COMPLETE_COURSE",
        userCourseId: hit.userCourseId,
        courseName: hit.nameHe,
        grade: extractGrade(text),
      });
    } else if (englishAsk) {
      // No English row in the plan (the real 12.7 failure): "סיימתי קורס
      // אנגלית מתקדמים ב׳" means the LEVEL course was passed → the student
      // moved up. Passing מתקדמים ב׳ grants exemption; passing מתקדמים א׳
      // moves to מתקדמים ב׳. Detect the named level and propose the update.
      if (/מתקדמימ ב|advanced b/.test(norm)) {
        actions.push({ type: "SET_ENGLISH_LEVEL", level: "EXEMPT", levelNameHe: "מתקדמים ב׳" });
      } else if (/מתקדמימ א|advanced a/.test(norm)) {
        actions.push({ type: "SET_ENGLISH_LEVEL", level: "ADVANCED_B", levelNameHe: "מתקדמים א׳" });
      }
    }
  }

  // DROP — remove a PLANNED/IN_PROGRESS row from the plan. Not for completed
  // courses (that's an academic-record edit, deliberately not one-tap here).
  if (DROP_INTENT.test(norm) && !actions.length) {
    const hit = bestMatch(norm, activeRows, (c) => c.nameHe);
    if (hit) {
      actions.push({ type: "DROP_COURSE", userCourseId: hit.userCourseId, courseName: hit.nameHe });
    }
  }

  // MOVE — reschedule a row to an ABSOLUTE target (semester/year). No target
  // parsed (or only "next semester") → propose nothing; the King asks instead.
  if (MOVE_INTENT.test(norm) && !actions.length) {
    const target = parseMoveTarget(norm);
    if (target.plannedSemester || target.plannedYear) {
      const hit = bestMatch(norm, activeRows, (c) => c.nameHe);
      if (hit) {
        actions.push({
          type: "MOVE_COURSE",
          userCourseId: hit.userCourseId,
          courseName: hit.nameHe,
          ...(target.plannedYear ? { plannedYear: target.plannedYear } : {}),
          ...(target.plannedSemester ? { plannedSemester: target.plannedSemester } : {}),
          targetLabel: target.label,
        });
      }
    }
  }

  if (ADD_INTENT.test(norm) && catalog.length > 0) {
    // Don't propose adding a course that's already in the plan, and never a
    // course we JUST proposed completing (one sentence, two intents).
    const planNames = new Set(plan.map((c) => normalize(c.nameHe)));
    const addable = catalog.filter((c) => !planNames.has(normalize(c.nameHe)));
    const hit = bestMatch(norm, addable, (c) => c.nameHe);
    if (hit && !actions.some((a) => a.type === "COMPLETE_COURSE" && normalize(a.courseName) === normalize(hit.nameHe))) {
      actions.push({ type: "ADD_COURSE", courseId: hit.id, courseName: hit.nameHe });
    }
  }

  // Two proposals max — a chat message with a wall of cards stops being a chat.
  return actions.slice(0, 2);
}
