// =========================================================================
// "2025/1" is not a thing a student says
// =========================================================================
// Ariel, 21.8: "מה זה ה-1/2025 הזה?"
//
// It is TAU's own semester stamp from the grade sheet: the academic year that
// begins in autumn 2025, semester 1 (autumn). We were printing it verbatim as
// a chip next to every scanned row, in a monospace font, LTR — which makes it
// look like a system identifier the reader is supposed to already understand.
// The owner of the app did not, which is a fair verdict on the label.
//
// It is worth KEEPING rather than dropping: it is the only thing that ties our
// row back to the line on the student's actual sheet, and that traceability is
// how someone checks us. So it stays — as words, with the raw stamp kept as a
// tooltip for anyone comparing against the printed sheet.

/** Semester digit → what TAU calls it. 3 is the summer term. */
const SEMESTER_NAMES: Record<string, { he: string; en: string }> = {
  "1": { he: "סמסטר א׳", en: "Semester A" },
  "2": { he: "סמסטר ב׳", en: "Semester B" },
  "3": { he: "סמסטר קיץ", en: "Summer" },
};

export interface SheetSemesterLabel {
  /** Human text: "סמסטר א׳ · תשפ״ו". */
  text: string;
  /** The raw stamp, for a title attribute so the sheet stays checkable. */
  raw: string;
}

/**
 * Hebrew year letters for an academic year key. 2025 → תשפ"ו.
 *
 * Derived, not tabled: the Hebrew year is the Gregorian year of the autumn
 * start plus 3760, and PPE students only ever see years in a narrow window, so
 * a formula with a guarded range beats a table that silently runs out.
 */
function hebrewYear(academicYear: number): string | null {
  const h = academicYear + 3761; // autumn 2025 falls in Hebrew year 5786
  if (h < 5780 || h > 5799) return null; // outside what we can spell safely
  const tens = h - 5780; // 0..19
  const LETTERS = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];
  if (tens < 10) return `תש״${LETTERS[tens] ?? ""}` .replace("תש״", tens === 0 ? "תש״פ" : "תשפ״");
  return `תשפ״${LETTERS[tens - 10] ?? ""}`;
}

/**
 * Turn a sheet stamp into something a person can read.
 *
 * Returns null for anything that is not a stamp, so a caller can fall back to
 * showing nothing rather than inventing a label for a value it did not parse.
 */
export function sheetSemesterLabel(
  stamp: string | null | undefined,
  locale: "he" | "en" = "he",
): SheetSemesterLabel | null {
  if (!stamp) return null;
  const raw = stamp.trim();
  const m = raw.match(/^(\d{4})\s*\/\s*([123])$/);
  if (!m) return null;

  const year = Number(m[1]);
  const sem = SEMESTER_NAMES[m[2]!];
  if (!sem) return null;

  if (locale === "en") {
    // English has no ambiguity to resolve, so the span is the clearest form.
    return { text: `${sem.en} ${year}/${String((year + 1) % 100).padStart(2, "0")}`, raw };
  }

  const heb = hebrewYear(year);
  // Without a Hebrew year we still say the semester rather than nothing — the
  // useful half of the label does not depend on the half we could not derive.
  return { text: heb ? `${sem.he} · ${heb}` : sem.he, raw };
}
