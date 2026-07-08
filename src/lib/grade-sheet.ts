// =========================================
// Grade-sheet scanner — pure parsing + matching
// =========================================
// The vision model returns rows it READ off the student's grade sheet; this
// module validates them strictly and matches them to the user's own courses.
// Nothing here writes — applying is the student's explicit per-row choice,
// through the existing plan.updateCourse mutation (ownership + demo guards).

import { z } from "zod/v4";

/** One row as extracted by the model from the sheet image. */
export const extractedRowSchema = z.object({
  courseCode: z.string().max(30).nullable(),
  courseName: z.string().min(1).max(120),
  grade: z.number().min(0).max(100).nullable(),
  credits: z.number().min(0).max(20).nullable(),
  /** Binary pass marks like "עובר"/"פטור" come back as passText, not a grade. */
  passText: z.string().max(30).nullable(),
  /** "2025/1" — from the semester header line above the row's block. */
  semester: z.string().max(12).nullish(),
  /** The sheet prints *** in the grade column for enrolled-not-yet-graded. */
  inProgress: z.boolean().nullish(),
});

export const extractionSchema = z.object({
  rows: z.array(extractedRowSchema).max(80),
});

export type ExtractedRow = z.infer<typeof extractedRowSchema>;

// The teaching-mode column (ש' / ת' / ש'+ת' / שו"ת) sits right next to the
// course-name column on the sheet; when the model glues it onto the name we
// strip it — it is metadata, not part of any real course name. Quote marks
// vary by OCR (' ׳ ’ " ״), so match all of them.
const MODE_TOKEN = `(?:ש[׳'’]?\\+ת[׳'’]?|שו["״]ת|ש[׳'’]|ת[׳'’])`;
const MODE_AT_EDGES = new RegExp(`^${MODE_TOKEN}\\s+|\\s+${MODE_TOKEN}$`, "g");

/** Parse the model's text output (may be wrapped in ```json fences). */
export function parseExtraction(text: string): ExtractedRow[] | null {
  const stripped = text.replace(/```json|```/g, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  // TAU zero-pads grades to three digits (089 = 89). If the model echoes the
  // padding, `"grade":089` is invalid JSON and would kill the WHOLE scan —
  // strip leading zeros on the grade field only (course codes are quoted).
  const jsonText = stripped
    .slice(start, end + 1)
    .replace(/("grade"\s*:\s*)0+(\d)/g, "$1$2");
  try {
    const parsed = extractionSchema.safeParse(JSON.parse(jsonText));
    if (!parsed.success) return null;
    return parsed.data.rows.map((r) => ({
      ...r,
      courseName:
        r.courseName.replace(MODE_AT_EDGES, "").replace(MODE_AT_EDGES, "").trim() ||
        r.courseName,
    }));
  } catch {
    return null;
  }
}

/** Loose Hebrew-aware normalization for name matching. Exported so the
 *  onboarding catalog-matcher shares the exact same normalization. */
export function normalizeName(s: string): string {
  return s
    .replace(/["'׳״־׳״-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export interface UserCourseLite {
  userCourseId: string;
  courseCode: string;
  nameHe: string;
  currentGrade: number | null;
  status: string;
  /** COURSE type — drives the honest pass bar (ENGLISH passes at 70, not 60). */
  courseType?: string;
}

export interface MatchedRow extends ExtractedRow {
  match: UserCourseLite | null;
  /**
   * How confident the match is:
   * - "code"  = exact course-code match (high confidence)
   * - "name"  = exact normalized-name match (high confidence)
   * - "fuzzy" = risky substring/superset name collision — MUST be confirmed by
   *   the student, never auto-applied (a truncated OCR name like an intro
   *   course can otherwise bind to its advanced variant and overwrite it)
   * - "none"  = no match; student picks manually.
   */
  matchKind: "code" | "name" | "fuzzy" | "none";
  /** True when the sheet's grade differs from what's already recorded. */
  changesGrade: boolean;
  /**
   * More than one of the student's courses could be this row (a retake sharing
   * a code, or several names colliding on the fragment). Even with a match set,
   * the UI must NOT auto-apply an ambiguous row.
   */
  ambiguous: boolean;
  /**
   * Safe to pre-select for one-click apply: a high-confidence, unambiguous
   * match that actually changes the grade. Fuzzy/ambiguous rows are false.
   */
  autoApplySafe: boolean;
}

export function matchExtractedToCourses(
  rows: ExtractedRow[],
  userCourses: UserCourseLite[],
): MatchedRow[] {
  // Group by code so retakes (same code appearing twice) are detected, not
  // silently collapsed to whichever course happened to be last in the list.
  const byCode = new Map<string, UserCourseLite[]>();
  for (const c of userCourses) {
    const key = c.courseCode.replace(/\s/g, "");
    if (!key) continue;
    const list = byCode.get(key);
    if (list) list.push(c);
    else byCode.set(key, [c]);
  }
  const withNorm = userCourses.map((c) => ({ c, norm: normalizeName(c.nameHe) }));

  return rows.map((r) => {
    let match: UserCourseLite | null = null;
    let matchKind: MatchedRow["matchKind"] = "none";
    let ambiguous = false;

    if (r.courseCode) {
      const hits = byCode.get(r.courseCode.replace(/\s/g, ""));
      if (hits && hits.length > 0) {
        // Retake: prefer the not-yet-graded instance, but flag it so the
        // student confirms which sitting the grade belongs to.
        match = hits.find((h) => h.currentGrade == null) ?? hits[0]!;
        matchKind = "code";
        ambiguous = hits.length > 1;
      }
    }
    if (!match) {
      const norm = normalizeName(r.courseName);
      if (norm.length >= 4) {
        const exact = withNorm.filter((x) => x.norm === norm);
        if (exact.length >= 1) {
          match = exact[0]!.c;
          matchKind = "name";
          ambiguous = exact.length > 1; // two courses with the same name
        } else if (norm.length >= 8) {
          // Only allow a substring/superset match when it is LONG (short
          // fragments like "מבוא" collide with everything) and UNAMBIGUOUS
          // (exactly one candidate). Even then it is "fuzzy" — never auto-applied.
          const contains = withNorm.filter(
            (x) => x.norm.includes(norm) || norm.includes(x.norm),
          );
          if (contains.length === 1) {
            match = contains[0]!.c;
            matchKind = "fuzzy";
          } else if (contains.length > 1) {
            ambiguous = true; // multiple plausible courses → force manual choice
          }
        }
      }
    }

    const changesGrade = match != null && r.grade != null && match.currentGrade !== r.grade;
    return {
      ...r,
      match,
      matchKind,
      changesGrade,
      ambiguous,
      autoApplySafe:
        changesGrade && !ambiguous && (matchKind === "code" || matchKind === "name"),
    };
  });
}

/**
 * The vision system prompt — read ONLY what is on the sheet, never invent.
 * Written against the REAL TAU "אישור קורסים וציונים" layout (verified on an
 * actual transcript, July 2026): RTL table, zero-padded grades, *** for
 * in-progress, a teaching-mode column that must not leak into names.
 */
export const GRADE_SHEET_SYSTEM = `אתה קורא "אישור קורסים וציונים" רשמי של אוניברסיטת תל אביב (צילום או PDF, עברית, כיוון ימין-לשמאל).

מבנה המסמך:
- כותרות-סמסטר בצורת: שנה"ל תש… סמסטר YYYY/N (למשל "סמסטר 2025/1"). כל שורות הקורסים שמתחת שייכות לסמסטר הזה, עד לכותרת-הסמסטר הבאה.
- בטבלת הקורסים, סדר העמודות מימין לשמאל: מס' קורס (בפורמט NNNN-NNNN) · שם הקורס · ציון קובע · אופן הוראה · שעות סמס' · משקל · הערות.
- עמודת "ציון קובע" מודפסת בריפוד אפסים לשלוש ספרות: 089 פירושו 89, 096 פירושו 96. החזר תמיד את המספר האמיתי (89) בלי אפס מוביל.
- *** בעמודת הציון = הקורס עדיין בלימוד ואין לו ציון. אל תמציא ציון: grade=null ו-inProgress=true.
- עמודת "אופן הוראה" מכילה קיצורים כמו ש', ת', ש'+ת', שו"ת — זה סוג השיעור, לא חלק משם הקורס. לעולם אל תכלול אותם ב-courseName.
- גם עמודת "הערות" (למשל "לא לשקלול") אינה חלק משם הקורס.
- דלג על שורות שאינן קורסים: "ממוצע משוקלל…", "ממוצע בחוג", "דרישות כלל אוניברסיטאיות", "מפתח סימולי…", "סיכום מצב לימודים", כותרות עמוד וכותרות הטבלה עצמן.

החזר JSON בלבד, בפורמט:
{"rows":[{"courseCode":"0651-1001" או null,"courseName":"שם הקורס","grade":89 או null,"credits":4 או null,"passText":"עובר" או null,"semester":"2025/1" או null,"inProgress":false}]}

כללים:
- חלץ אך ורק את מה שכתוב במסמך — אל תמציא, אל תשלים ואל תנחש ציון שלא מופיע.
- כל שורת קורס בטבלה חייבת להופיע ב-rows — כולל ציונים נמוכים, קורסי-פטור וקורסים בלימוד. אל תדלג על אף קורס.
- "עובר"/"נכשל"/"פטור" הולכים ל-passText ולא ל-grade.
- credits = עמודת "משקל".
- אם שדה לא ברור — null. אל תוסיף שום טקסט מחוץ ל-JSON.`;

// =========================================================================
// Course-lifecycle helpers (#22/#25/#30) — pure, shared by the /record
// scanner and the onboarding catalog match. Every status the scanner would
// write is decided HERE, so it can be DECLARED to the student before applying
// (the "no silent automation" rule of #30).
// =========================================================================

import { ENGLISH_CONFIG, CREDIT_REQUIREMENTS } from "@/lib/constants";

export type ApplyDecision = {
  grade: number | null;
  status: "COMPLETED" | "FAILED" | "EXEMPT";
};

/**
 * Exactly what would be written if this row were applied — or null when the
 * row is not applicable (no match, or a still-in-progress *** row). ENGLISH
 * courses pass at 70, everything else at 60, so a 65 in English is honestly
 * FAILED instead of a silent COMPLETED (adversarial-critique core fix).
 */
export function decideApplication(row: MatchedRow): ApplyDecision | null {
  if (!row.match) return null;
  if (row.grade != null) {
    const bar =
      row.match.courseType === "ENGLISH"
        ? ENGLISH_CONFIG.COURSE_PASSING_GRADE
        : CREDIT_REQUIREMENTS.PASSING_GRADE;
    return { grade: row.grade, status: row.grade >= bar ? "COMPLETED" : "FAILED" };
  }
  if (row.passText) {
    if (row.passText.includes("פטור")) return { grade: null, status: "EXEMPT" };
    if (row.passText.includes("נכשל")) return { grade: null, status: "FAILED" };
    return { grade: null, status: "COMPLETED" }; // "עובר"
  }
  return null; // *** in-progress — nothing to apply
}

/** The honest pass bar for a row's course type — for the declaration chip. */
export function passBarFor(courseType: string | undefined): number {
  return courseType === "ENGLISH"
    ? ENGLISH_CONFIG.COURSE_PASSING_GRADE
    : CREDIT_REQUIREMENTS.PASSING_GRADE;
}

/**
 * "2025/1" → { plannedYear, plannedSemester }. Ranks the sheet's OWN semester
 * headers chronologically — the earliest year block = year 1 — so placement
 * never depends on guessing which calendar year maps to which study year.
 */
export function mapSheetSemesters(
  rows: ExtractedRow[],
): Map<string, { plannedYear: number; plannedSemester: "FALL" | "SPRING" | "SUMMER" }> {
  const keys = Array.from(
    new Set(
      rows
        .map((r) => r.semester)
        .filter((s): s is string => !!s && /^\d{4}\/\d$/.test(s)),
    ),
  );
  const parsed = keys
    .map((k) => ({ k, y: Number(k.split("/")[0]), n: Number(k.split("/")[1]) }))
    .sort((a, b) => a.y - b.y || a.n - b.n);
  const years = Array.from(new Set(parsed.map((p) => p.y))).sort((a, b) => a - b);
  const map = new Map<
    string,
    { plannedYear: number; plannedSemester: "FALL" | "SPRING" | "SUMMER" }
  >();
  for (const p of parsed) {
    map.set(p.k, {
      plannedYear: Math.min(3, years.indexOf(p.y) + 1), // YEAR_CONFIG knows 1-3
      plannedSemester: p.n === 2 ? "SPRING" : p.n === 3 ? "SUMMER" : "FALL",
    });
  }
  return map;
}

/** English level from a sheet's "אנגלית: <רמה>-מיון" line, or null. */
export function mapEnglishLevelLabel(
  label: string | null | undefined,
): "EXEMPT" | "ADVANCED_B" | "ADVANCED_A" | "BASIC" | "PRE_BASIC" | null {
  if (!label) return null;
  const s = label.replace(/["'׳״’]/g, "");
  if (s.includes("פטור")) return "EXEMPT";
  if (s.includes("מתקדמים ב")) return "ADVANCED_B";
  if (s.includes("מתקדמים א")) return "ADVANCED_A";
  if (s.includes("טרום")) return "PRE_BASIC";
  if (s.includes("בסיסי")) return "BASIC";
  return null;
}

export interface CatalogLite {
  code: string;
  nameHe: string;
}

/** Match scanned rows to catalog courses (for onboarding) — code first, then
 *  normalized name; null when neither hits. */
export function matchExtractedToCatalog<T extends CatalogLite>(
  rows: ExtractedRow[],
  catalog: T[],
): { row: ExtractedRow; course: T | null }[] {
  const byCode = new Map(catalog.map((c) => [c.code.replace(/\s/g, ""), c]));
  const byName = new Map(catalog.map((c) => [normalizeName(c.nameHe), c]));
  return rows.map((row) => {
    const code = row.courseCode?.replace(/\s/g, "");
    const course =
      (code && byCode.get(code)) || byName.get(normalizeName(row.courseName)) || null;
    return { row, course };
  });
}
