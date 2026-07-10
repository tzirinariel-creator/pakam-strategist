// =========================================================================
// Anonymized fixture of a REAL TAU "אישור קורסים וציונים" (received 10.7.2026).
// =========================================================================
// Faithful to the actual sheet: real course codes/names/credits, the real
// column quirks (grades zero-padded to 3 digits: "089"), the real *** rows
// (enrolled, not yet graded), the semester headers (2025/1, 2025/2), the
// "דרישות כלל אוניברסיטאיות … אנגלית: מתקדמים ב'-מיון" line, an English course
// marked "לא לשקלול" with an empty weight column, and the bidi control
// characters + glued teaching-mode tokens that PDF text extraction produces.
//
// PRIVACY (SC-1): the PDF itself never enters the repo, and the GRADE VALUES
// here are synthetic — only the structure is real. No name, no ID.

// Invisible bidi controls exactly as they appear in text extracted from the
// real PDF (RLM + embedding marks) — the parser must strip them.
const RLM = "‏";
const LRE = "‪";
const PDF_ = "‬"; // POP DIRECTIONAL FORMATTING

type FixtureRow = {
  courseCode: string;
  courseName: string;
  grade: number | null;
  credits: number | null;
  semester: string;
  inProgress: boolean;
};

/** The 12 graded rows of semester 2025/1 (grades synthetic, structure real). */
const SEM1: FixtureRow[] = [
  { courseCode: "0618-1012", courseName: "מבוא ללוגיקה", grade: 100, credits: 4, semester: "2025/1", inProgress: false },
  { courseCode: "0618-1018", courseName: "מבוא לפילוסופיה של המוסר", grade: 83, credits: 2, semester: "2025/1", inProgress: false },
  { courseCode: "0618-1019", courseName: "מבוא לפילוסופיה פוליטית", grade: 91, credits: 2, semester: "2025/1", inProgress: false },
  { courseCode: "0618-1037", courseName: "מבוא לתורת ההכרה ומטאפיזיקה", grade: 87, credits: 2, semester: "2025/1", inProgress: false },
  { courseCode: "0651-1001", courseName: "קריאה מודרכת א'", grade: 94, credits: 2, semester: "2025/1", inProgress: false },
  { courseCode: "0651-1007", courseName: 'מתמטיקה לפכ"מ', grade: 100, credits: 5, semester: "2025/1", inProgress: false },
  { courseCode: "0651-1019", courseName: "תרגיל צמוד למבוא לפילוסופיה פוליטית - פכ\"מ", grade: 78, credits: 2, semester: "2025/1", inProgress: false },
  { courseCode: "1031-1002", courseName: "פוליטיקה ומשטר בישראל", grade: 95, credits: 4, semester: "2025/1", inProgress: false },
  { courseCode: "1031-1100", courseName: "כתיבה ומחקר במדע המדינה", grade: 90, credits: 4, semester: "2025/1", inProgress: false },
  { courseCode: "1031-4015", courseName: "דוגרי: אמת, אמון ואמנות בסכסוך הישראלי-פלסטיני", grade: 86, credits: 2, semester: "2025/1", inProgress: false },
  { courseCode: "1880-0901", courseName: "משבר האקלים וקיימות: מבט רב תחומי", grade: 92, credits: 2, semester: "2025/1", inProgress: false },
  { courseCode: "1882-0301", courseName: "צעדים ראשונים במדעי המחשב ותכנות בפייתון", grade: 89, credits: 2, semester: "2025/1", inProgress: false },
];

/** The 8 *** rows of semester 2025/2 — enrolled, no grade printed. */
const SEM2: FixtureRow[] = [
  { courseCode: "0618-1032", courseName: "מבוא לפילוסופיה חדשה", grade: null, credits: 2, semester: "2025/2", inProgress: true },
  { courseCode: "0651-1002", courseName: "קריאה מודרכת ב'", grade: null, credits: 2, semester: "2025/2", inProgress: true },
  { courseCode: "0651-1003", courseName: "פילוסופיה של מדעי החברה", grade: null, credits: 4, semester: "2025/2", inProgress: true },
  { courseCode: "0651-1005", courseName: 'סטטיסטיקה לפכ"מ', grade: null, credits: 5, semester: "2025/2", inProgress: true },
  { courseCode: "1011-2103", courseName: "מיקרו כלכלה א' - קבלת החלטות כלכליות", grade: null, credits: 5, semester: "2025/2", inProgress: true },
  { courseCode: "1011-2500", courseName: "חשבונאות לכלכלנים", grade: null, credits: 2, semester: "2025/2", inProgress: true },
  { courseCode: "1031-2108", courseName: "אסטרטגיה בעידן המודרני", grade: null, credits: 3, semester: "2025/2", inProgress: true },
  { courseCode: "1411-9107", courseName: "חקיקה ורגולציה", grade: null, credits: 4, semester: "2025/2", inProgress: true },
];

/** The English course block: "לא לשקלול", empty weight column, *** grade. */
const ENGLISH_ROW: FixtureRow = {
  courseCode: "2171-9201",
  courseName: "מתקדמים ב' חוצה דיצפלינות בין תחומי",
  grade: null,
  credits: null,
  semester: "2025/2",
  inProgress: true,
};

/** What a CORRECT parse of the sheet must yield — 21 rows, in sheet order. */
export const TAU_SHEET_EXPECTED: FixtureRow[] = [...SEM1, ...SEM2, ENGLISH_ROW];

const pad3 = (g: number) => String(g).padStart(3, "0");

/** One raw-model-output row. `dirty` mimics the worst real-world echo: bidi
 *  controls inside strings, and the teaching-mode column glued onto the name
 *  (both straight "ש'+ת'" and its bidi-mirrored form "ת\"וש"). */
function rawRow(r: FixtureRow, dirty?: { name?: string; code?: string }): string {
  const grade = r.grade == null ? "null" : pad3(r.grade); // 083 — invalid JSON on purpose
  return (
    `{"courseCode":${JSON.stringify(dirty?.code ?? r.courseCode)},` +
    `"courseName":${JSON.stringify(dirty?.name ?? r.courseName)},` +
    `"grade":${grade},"credits":${r.credits ?? "null"},"passText":null,` +
    `"semester":"${r.semester}","inProgress":${r.inProgress}}`
  );
}

/**
 * The raw model echo for the whole sheet: fenced JSON, zero-padded grades,
 * bidi-polluted strings, glued mode tokens — everything the parser must survive.
 */
export const TAU_SHEET_RAW: string =
  "```json\n{\"rows\":[" +
  [
    // Worst-case echoes, exactly like PDF text extraction produces:
    rawRow(SEM1[0]!, { name: `${RLM}מבוא ללוגיקה ש'+ת'` }), // glued mode token + RLM
    rawRow(SEM1[1]!, { code: `${LRE}0618-1018${PDF_}` }), // code wrapped in embedding marks
    ...SEM1.slice(2).map((r) => rawRow(r)),
    ...SEM2.slice(0, 5).map((r) => rawRow(r)),
    rawRow(SEM2[5]!, { name: `ת"וש חשבונאות לכלכלנים` }), // bidi-mirrored שו"ת glued on
    ...SEM2.slice(6).map((r) => rawRow(r)),
    rawRow(ENGLISH_ROW),
  ].join(",") +
  `],"englishLevelLabel":"מתקדמים ב'"}` +
  "\n```";
