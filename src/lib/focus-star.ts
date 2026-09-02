// =========================================================================
// Is this course "mine"? — the focus-area star
// =========================================================================
// Ariel, #13: "אני חושב שבקטלוג הקורסים אין את כל הקורסים של תחום המיקוד
// בסימון כוכב — תעמיק בזה. בכללי על כל האמינות שלנו מול הידיעון. קריטי ממש"
//
// He was right, and the reason is worth writing down because it looks like a
// data bug and is not one.
//
// Measured against the live catalog on 2.9: 123 of the 304 active courses
// carry no discipline, and 61 of the 67 seminars are among them. That is
// FAITHFUL to the ידיעון. The ידיעון lists seminars under headings like
// "סמינר 4 ש״ס" — by credit count, never by field. There is nothing in that
// heading to parse a discipline out of, and inventing one from the course-code
// prefix would be our guess wearing the ידיעון's authority.
//
// The field comes from a different ידיעון line entirely:
//     "סמינר בתחום המיקוד בו תוגש עבודה סמינריונית"
// which makes the discipline a fact about WHERE THE STUDENT SUBMITS THE PAPER,
// not about the course. Two students can take the same seminar and have it
// count in two different fields, and both are correct.
//
// So the app asks (unassigned-discipline-prompt) and stores a per-user
// override. credit-calculator, the planner and the course colours all honour
// it. The catalog table did not — it compared `course.discipline` alone. A
// student who had already told us their seminar is philosophy saw it counted
// toward the focus area on the record screen and sitting unstarred in the
// catalog. One course, two screens, two answers, and no way to tell which one
// is lying to them.

/**
 * The discipline this course counts in FOR THIS STUDENT.
 * Their own assignment wins over the catalog's, because for the courses that
 * matter here the catalog has nothing to say.
 */
export function effectiveDiscipline(
  courseCode: string,
  catalogDiscipline: string | null | undefined,
  overrides?: Record<string, string> | null,
): string | null {
  return overrides?.[courseCode] ?? catalogDiscipline ?? null;
}

/** Whether the catalog should star this row. */
export function isFocusCourse(
  courseCode: string,
  catalogDiscipline: string | null | undefined,
  focusArea: string | null | undefined,
  overrides?: Record<string, string> | null,
): boolean {
  if (!focusArea) return false;
  return effectiveDiscipline(courseCode, catalogDiscipline, overrides) === focusArea;
}
