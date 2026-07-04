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
});

export const extractionSchema = z.object({
  rows: z.array(extractedRowSchema).max(80),
});

export type ExtractedRow = z.infer<typeof extractedRowSchema>;

/** Parse the model's text output (may be wrapped in ```json fences). */
export function parseExtraction(text: string): ExtractedRow[] | null {
  const stripped = text.replace(/```json|```/g, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = extractionSchema.safeParse(JSON.parse(stripped.slice(start, end + 1)));
    return parsed.success ? parsed.data.rows : null;
  } catch {
    return null;
  }
}

/** Loose Hebrew-aware normalization for name matching. */
function normalizeName(s: string): string {
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

/** The vision system prompt — read ONLY what is on the sheet, never invent. */
export const GRADE_SHEET_SYSTEM = `אתה קורא גיליון ציונים של סטודנט מאוניברסיטת תל אביב (צילום או PDF).
חלץ אך ורק את מה שכתוב בתמונה — אל תמציא, אל תשלים ואל תנחש ציון שלא מופיע.
החזר JSON בלבד, בפורמט:
{"rows":[{"courseCode":"0651-1001" או null,"courseName":"שם הקורס","grade":85 או null,"credits":4 או null,"passText":"עובר" או null}]}
כללים: ציון הוא מספר 0-100 שמופיע במפורש; "עובר"/"נכשל"/"פטור" הולכים ל-passText ולא ל-grade.
קוד-קורס הוא בפורמט ספרות-מקף-ספרות אם מופיע. אם שדה לא ברור — null. אל תוסיף טקסט מחוץ ל-JSON.`;
