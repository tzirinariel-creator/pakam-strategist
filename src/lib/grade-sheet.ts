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
  /** exact code match beats a name match; none = student picks manually. */
  matchKind: "code" | "name" | "none";
  /** True when the sheet's grade differs from what's already recorded. */
  changesGrade: boolean;
}

export function matchExtractedToCourses(
  rows: ExtractedRow[],
  userCourses: UserCourseLite[],
): MatchedRow[] {
  const byCode = new Map(userCourses.map((c) => [c.courseCode.replace(/\s/g, ""), c]));
  const withNorm = userCourses.map((c) => ({ c, norm: normalizeName(c.nameHe) }));

  return rows.map((r) => {
    let match: UserCourseLite | null = null;
    let matchKind: MatchedRow["matchKind"] = "none";

    if (r.courseCode) {
      const hit = byCode.get(r.courseCode.replace(/\s/g, ""));
      if (hit) {
        match = hit;
        matchKind = "code";
      }
    }
    if (!match) {
      const norm = normalizeName(r.courseName);
      if (norm.length >= 4) {
        const hit = withNorm.find((x) => x.norm === norm) ??
          withNorm.find((x) => x.norm.includes(norm) || norm.includes(x.norm));
        if (hit) {
          match = hit.c;
          matchKind = "name";
        }
      }
    }

    return {
      ...r,
      match,
      matchKind,
      changesGrade: match != null && r.grade != null && match.currentGrade !== r.grade,
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
