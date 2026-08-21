// =========================================================================
// The TAU grade sheet has a TEXT LAYER. Stop asking a model to look at it.
// =========================================================================
// Three times, on three different days, the vision scan lost real courses off
// Ariel's own sheet — דוגרי, משבר האקלים, אסטרטגיה, אנגלית. Every fix we
// shipped made the guess better: a second read, a reconciliation rule, a
// code census, a candidate offer. All of them are still guesses, and his
// verdict was the right one: "זה כבר שובר אמון עם המשתמש ברגע שהוא נכנס".
//
// The zoom-out he asked for: the "אישור קורסים וציונים" that TAU issues is a
// DIGITALLY GENERATED PDF, not a photograph. It carries a text layer, and that
// layer is perfectly regular:
//
//   3.0 3.0 ש'+ת' 090 אסטרטגיה בעידן המודרני 1031-2108
//   ^משקל ^שעות ^אופן ^ציון ^שם                ^קוד
//
// So the right answer was never a better prompt. It is: read the text, and use
// the model only when there is no text to read (a photo, a scan). A regex over
// a machine-generated layout cannot "miss a row" — it either matches or it
// doesn't, and it does the same thing every single time.
//
// COLUMN ORDER: the sheet is RTL, so the header reads (right→left)
// מס' קורס · שם הקורס · ציון קובע · אופן הוראה · שעות סמס' · משקל · הערות.
// Extraction walks the visual line left→right, so a row arrives as
// [הערות] משקל [שעות] אופן ציון שם קוד — which is what the grammar below
// encodes, anchored on the course code at the end.

/** A course row exactly as the sheet prints it — nothing inferred. */
export interface SheetTextRow {
  courseCode: string;
  courseName: string;
  /** 0-100, or null for *** / a pass-mark / a non-grade code. */
  grade: number | null;
  /** משקל — the weighted credits. NULL when the column is blank, which is how
   *  the sheet marks a course that does not count toward the average. */
  credits: number | null;
  /** שעות סמס' — always printed, even when משקל is blank. */
  hours: number | null;
  /** "עובר" / "נכשל" / "פטור" when the grade column holds words, else null. */
  passText: string | null;
  /** The sheet prints *** while a course is still running. */
  inProgress: boolean;
  /** "2025/1" — from the שנה"ל header above this row's block. */
  semester: string | null;
  /** The הערות column, e.g. "לא לשקלול". */
  note: string | null;
  /** A grade-column value outside 0-100 (TAU prints such codes; see below). */
  gradeOutOfRange: boolean;
}

export interface SheetTextParse {
  rows: SheetTextRow[];
  /** "ממוצע משוקלל לסמסטר 2025/1 : 96.42" → { "2025/1": 96.42 }. */
  semesterAverages: Record<string, number>;
  /** "ממוצע משוקלל לשנת 2025 : 96.39". */
  yearAverages: Record<string, number>;
  /** "ממוצע בחוג : 96.39" — the one the app compares against. */
  programAverage: number | null;
  /** "אנגלית: פטור ע\"ס קורס" → the words after the colon, verbatim. */
  englishLabel: string | null;
  /** The ID printed on the sheet, so we can tell the student if it isn't theirs. */
  studentId: string | null;
}

const CODE = /(\d{4}-\d{4})\s*$/;
const SEMESTER_HEADER = /שנה"ל\s+\S+\s+סמסטר\s+(\d{4}\/\d)/;
const MODE = /(?:ש'\+ת'|שו"ת|ש'|ת'|שו״ת|ש׳\+ת׳|ש׳|ת׳)/;
const NOTE = /^(לא\s+לשקלול)\s+/;

/** "090" → 90 · "***" → null · "עובר" → null (kept as passText). */
function readGradeToken(tok: string): { grade: number | null; passText: string | null; inProgress: boolean; outOfRange: boolean } {
  if (/^\*+$/.test(tok)) return { grade: null, passText: null, inProgress: true, outOfRange: false };
  if (/^(עובר|נכשל|פטור)/.test(tok)) return { grade: null, passText: tok, inProgress: false, outOfRange: false };
  if (/^\d{1,3}$/.test(tok)) {
    const n = Number(tok); // leading zeros are TAU's padding: 089 → 89
    // TAU prints non-grade codes in this column too — Ariel's sheet carries a
    // literal "260" on חקיקה ורגולציה, and the sheet's OWN semester average
    // proves it is excluded (96.25 is exactly the other two rows). Anything
    // outside 0-100 is therefore not a grade: keep the COURSE, drop the number.
    if (n > 100) return { grade: null, passText: null, inProgress: false, outOfRange: true };
    return { grade: n, passText: null, inProgress: false, outOfRange: false };
  }
  return { grade: null, passText: null, inProgress: false, outOfRange: false };
}

/**
 * Parse the extracted text of a TAU "אישור קורסים וציונים".
 *
 * Returns null when the text does not look like one of these sheets at all —
 * the caller then falls back to the vision path (a photo, a foreign document).
 */
export function parseSheetText(text: string): SheetTextParse | null {
  if (!text || !/אישור\s+קורסים\s+וציונים/.test(text)) return null;

  const rows: SheetTextRow[] = [];
  const semesterAverages: Record<string, number> = {};
  const yearAverages: Record<string, number> = {};
  let programAverage: number | null = null;
  let englishLabel: string | null = null;
  let studentId: string | null = null;
  let currentSemester: string | null = null;

  for (const raw of text.split("\n")) {
    const line = raw.replace(/ /g, " ").trim();
    if (!line) continue;

    const sem = SEMESTER_HEADER.exec(line);
    if (sem) { currentSemester = sem[1]!; continue; }

    const semAvg = /ממוצע\s+משוקלל\s+לסמסטר\s+(\d{4}\/\d)\s*:\s*([\d.]+)/.exec(line);
    if (semAvg) { semesterAverages[semAvg[1]!] = Number(semAvg[2]); continue; }

    const yearAvg = /ממוצע\s+משוקלל\s+לשנת\s+(\d{4})\s*:\s*([\d.]+)/.exec(line);
    if (yearAvg) { yearAverages[yearAvg[1]!] = Number(yearAvg[2]); continue; }

    const prog = /ממוצע\s+בחוג\s*:\s*([\d.]+)/.exec(line);
    if (prog) { programAverage = Number(prog[1]); continue; }

    if (/דרישות\s+כלל\s+אוניברסיטאיות/.test(line) || /אנגלית\s*:/.test(line)) {
      const eng = /אנגלית\s*:\s*(.+?)\s*$/.exec(line);
      if (eng) englishLabel = eng[1]!.trim();
      // This line is never a course row.
      continue;
    }

    if (!studentId) {
      const id = /(\d{9})\s+מס'\s+זיהוי/.exec(line);
      if (id) studentId = id[1]!;
    }

    // ── A course row: anchored on the code at the end ────────────────────
    const codeM = CODE.exec(line);
    if (!codeM) continue;
    const courseCode = codeM[1]!;
    let rest = line.slice(0, codeM.index).trim();
    if (!rest) continue;
    // The header row also ends in "מס' קורס" — it has no code, so it never
    // reaches here. Guard anyway against a name that is only column labels.
    if (/ש\s?ם\s+ה\s?ק\s?ו\s?ר\s?ס/.test(rest)) continue;

    let note: string | null = null;
    const noteM = NOTE.exec(rest);
    if (noteM) { note = noteM[1]!.replace(/\s+/g, " "); rest = rest.slice(noteM[0].length); }

    // Leading numbers: [משקל] [שעות]. Two → credits + hours. One → the sheet
    // left משקל blank, which is itself the "doesn't count" signal.
    const nums: number[] = [];
    let cursor = rest;
    for (let i = 0; i < 2; i++) {
      const m = /^(\d+(?:\.\d+)?)\s+/.exec(cursor);
      if (!m) break;
      nums.push(Number(m[1]));
      cursor = cursor.slice(m[0].length);
    }
    if (nums.length === 0) continue; // not a course row

    const modeM = new RegExp(`^(${MODE.source})\\s+`).exec(cursor);
    if (!modeM) continue; // every real row prints an אופן הוראה
    cursor = cursor.slice(modeM[0].length);

    const gradeM = /^(\*+|\d{1,3}|עובר|נכשל|פטור\S*)\s+/.exec(cursor);
    if (!gradeM) continue;
    const g = readGradeToken(gradeM[1]!);
    const courseName = cursor.slice(gradeM[0].length).trim();
    if (!courseName) continue;

    rows.push({
      courseCode,
      courseName,
      grade: g.grade,
      credits: nums.length >= 2 ? nums[0]! : null,
      hours: nums.length >= 2 ? nums[1]! : nums[0]!,
      passText: g.passText,
      inProgress: g.inProgress,
      semester: currentSemester,
      note,
      gradeOutOfRange: g.outOfRange,
    });
  }

  if (rows.length === 0) return null;
  return { rows, semesterAverages, yearAverages, programAverage, englishLabel, studentId };
}

/**
 * The sheet's own arithmetic, recomputed from the rows we parsed — the check
 * that proves a parse is complete rather than merely plausible.
 *
 * A course counts toward the average when it has a numeric grade AND a משקל.
 * That is exactly the rule the printed averages follow: on Ariel's sheet it
 * reproduces 96.42, 96.25 and 96.39 to the cent, and it is what shows that
 * "260" and the "לא לשקלול" English row are correctly excluded.
 */
export function weightedAverageOf(rows: SheetTextRow[]): number | null {
  const counted = rows.filter((r) => r.grade != null && r.credits != null && r.credits > 0);
  if (counted.length === 0) return null;
  const pts = counted.reduce((a, r) => a + r.grade! * r.credits!, 0);
  const cr = counted.reduce((a, r) => a + r.credits!, 0);
  return cr > 0 ? Math.round((pts / cr) * 100) / 100 : null;
}

/** Per-semester recomputation, for the same self-check against the printout. */
export function semesterAverageOf(rows: SheetTextRow[], semester: string): number | null {
  return weightedAverageOf(rows.filter((r) => r.semester === semester));
}
