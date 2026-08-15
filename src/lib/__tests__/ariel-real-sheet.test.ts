// =========================================================================
// Ariel's own grade sheet, transcribed by hand from the PDF — 14.8
// =========================================================================
// He scanned this sheet, and his account came out with 11 completed courses
// and an average of 97.3. The sheet itself PRINTS 96.39, and it lists 15
// graded rows. Four graded courses never arrived: דוגרי (93), משבר האקלים
// (94), אסטרטגיה בעידן המודרני (90), and the English course (90). His words:
// "איך הוא עדיין טועה בחישוב כמות ש״ס שלי … אתה קולט איזה פאדיחה זאת?"
//
// The rows below are the SHEET, typed from the PDF by eye — not the model's
// output. That is the whole point: it separates "our pipeline drops rows" from
// "the vision read missed them". If every graded row survives this file, the
// pipeline is sound and the loss is in the read (which is now diagnosable —
// see scan-diagnostics.tsx). If a row dies here, the bug is ours.
//
// Verified arithmetic that anchors the whole test: the sheet's own printed
// 96.39 is reproduced EXACTLY by the 15 graded rows minus the English one
// ("לא לשקלול") — 3952/41. That is how we know this transcription is right.
import { describe, it, expect } from "vitest";
import { summarizeStanding, buildCompletedSeed } from "@/lib/onboarding-standing";
import { matchExtractedToCatalog } from "@/lib/grade-sheet";
import type { ExtractedRow } from "@/lib/grade-sheet";

const r = (
  courseCode: string,
  courseName: string,
  grade: number | null,
  credits: number,
  semester: string,
  inProgress = false,
): ExtractedRow => ({
  courseCode, courseName, grade, credits, semester, inProgress, passText: null,
}) as ExtractedRow;

// ── The sheet, page 1: שנה"ל תשפ"ו סמסטר 2025/1 — twelve rows, all graded ──
const SEM_1: ExtractedRow[] = [
  r("0618-1012", "מבוא ללוגיקה", 100, 4, "2025/1"),
  r("0618-1018", "מבוא לפילוסופיה של המוסר", 89, 2, "2025/1"),
  r("0618-1019", "מבוא לפילוסופיה פוליטית", 96, 2, "2025/1"),
  r("0618-1037", "מבוא לתורת ההכרה ומטאפיזיקה", 95, 2, "2025/1"),
  r("0651-1001", "קריאה מודרכת א'", 95, 2, "2025/1"),
  r("0651-1007", "מתמטיקה לפכ\"מ", 100, 5, "2025/1"),
  r("0651-1019", "תרגיל צמוד למבוא לפילוסופיה פוליטית - פכ\"מ", 92, 2, "2025/1"),
  r("1031-1002", "פוליטיקה ומשטר בישראל", 100, 4, "2025/1"),
  r("1031-1100", "כתיבה ומחקר במדע המדינה", 97, 4, "2025/1"),
  r("1031-4015", "דוגרי: אמת, אמון ואמנות בסכסוך הישראלי-פלסטיני", 93, 2, "2025/1"),
  r("1880-0901", "משבר האקלים וקיימות: מבט רב תחומי", 94, 2, "2025/1"),
  r("1882-0301", "צעדים ראשונים במדעי המחשב ותכנות בפייתון", 93, 2, "2025/1"),
];

// ── The sheet, page 2: סמסטר 2025/2 — two graded, five still ***  ──────────
const SEM_2: ExtractedRow[] = [
  r("0618-1032", "מבוא לפילוסופיה חדשה", null, 2, "2025/2", true),
  r("0651-1002", "קריאה מודרכת ב'", null, 2, "2025/2", true),
  r("0651-1003", "פילוסופיה של מדעי החברה", null, 4, "2025/2", true),
  r("0651-1005", "סטטיסטיקה לפכ\"מ", null, 5, "2025/2", true),
  r("1011-2103", "מיקרו כלכלה א' - קבלת החלטות כלכליות", 100, 5, "2025/2"),
  r("1031-2108", "אסטרטגיה בעידן המודרני", 90, 3, "2025/2"),
  r("1411-9107", "חקיקה ורגולציה", null, 4, "2025/2", true),
];

// The English course sits under דרישות כלל אוניברסיטאיות, marked "לא לשקלול".
const ENGLISH = r("2171-9201", "מתקדמים ב' חוצה דיציפלינות בין תחומי", 90, 4, "2025/2");

const SHEET = [...SEM_1, ...SEM_2, ENGLISH];

/** The catalog entries these rows must bind to (codes/credits verified against
 *  the production catalog on 14.8 — all present except the English one). */
const CATALOG = [
  ...SEM_1.map((x) => ({ code: x.courseCode!, nameHe: x.courseName, credits: x.credits!, courseType: "ELECTIVE" })),
  ...SEM_2.map((x) => ({ code: x.courseCode!, nameHe: x.courseName, credits: x.credits!, courseType: "MANDATORY" })),
].map((c) =>
  // The three that are MANDATORY in the real catalog, so pass bars match.
  ["0618-1012", "0618-1018", "0618-1019", "0618-1037", "0651-1001", "0651-1007",
   "0651-1019", "1031-1002", "1031-1100"].includes(c.code)
    ? { ...c, courseType: "MANDATORY" }
    : c,
);

function run() {
  const matched = matchExtractedToCatalog(SHEET, CATALOG);
  return summarizeStanding({
    rows: SHEET,
    catalog: CATALOG as never,
    matches: matched.map((m) => m.course) as never,
    upcomingSemester: "FALL" as const,
  });
}

describe("Ariel's real sheet — the transcription is right", () => {
  it("reproduces the sheet's own printed average of 96.39 exactly", () => {
    // 15 graded rows; English excluded because the sheet marks it "לא לשקלול".
    const graded = SHEET.filter((x) => x.grade != null && x.courseCode !== "2171-9201");
    const pts = graded.reduce((a, x) => a + x.grade! * x.credits!, 0);
    const cr = graded.reduce((a, x) => a + x.credits!, 0);
    expect(cr).toBe(41);
    expect(Math.round((pts / cr) * 100) / 100).toBe(96.39);
  });

  it("reproduces the app's WRONG 97.3 from exactly the 11 rows it kept", () => {
    // Proof that the four missing rows are the entire difference — nothing else
    // in the calculation is off.
    const kept = new Set([
      "0618-1012", "0618-1018", "0618-1019", "0618-1037", "0651-1001", "0651-1007",
      "0651-1019", "1031-1002", "1031-1100", "1882-0301", "1011-2103",
    ]);
    const rows = SHEET.filter((x) => kept.has(x.courseCode!));
    const pts = rows.reduce((a, x) => a + x.grade! * x.credits!, 0);
    const cr = rows.reduce((a, x) => a + x.credits!, 0);
    expect(cr).toBe(34);
    expect(Math.round((pts / cr) * 10) / 10).toBe(97.3);
  });
});

describe("the pipeline does NOT drop the four missing courses", () => {
  it("keeps every graded row as COMPLETED — including the three that vanished", () => {
    const s = run();
    const completed = new Set(s.completed.map((x) => x.key));
    for (const code of ["1031-4015", "1880-0901", "1031-2108"]) {
      expect(completed.has(code)).toBe(true);
    }
  });

  it("counts 45 earned credits, not 34", () => {
    // 41 academic + the 4-credit English course, which the pipeline has no
    // "לא לשקלול" signal for. See the separate test below — that is its own bug.
    const s = run();
    expect(s.creditsEarned).toBe(45);
  });

  it("carries every graded row into the seed that is actually saved", () => {
    const seed = buildCompletedSeed(run(), { year: 2, semester: "FALL" });
    for (const code of ["1031-4015", "1880-0901", "1031-2108"]) {
      expect(seed[code]).toBeDefined();
      expect(seed[code]!.grade).toBe(SHEET.find((x) => x.courseCode === code)!.grade);
    }
  });
});

describe("what the pipeline genuinely gets wrong", () => {
  it("REGRESSION: the five in-progress courses are saved nowhere", () => {
    // Ariel: "הוא יזכיר לי בהמשך להוסיף ציונים שעוד לא הוספתי?" — today, no.
    // buildCompletedSeed walks summary.completed only, so a course he is
    // actively taking is read off the sheet, shown on the review screen, and
    // then dropped on confirm. There is nothing left to remind him about.
    const s = run();
    const seed = buildCompletedSeed(s, { year: 2, semester: "FALL" });
    expect(s.inProgress.map((x) => x.key).sort()).toEqual(
      ["0618-1032", "0651-1002", "0651-1003", "0651-1005", "1411-9107"].sort(),
    );
    for (const code of ["0618-1032", "0651-1002", "0651-1003", "0651-1005", "1411-9107"]) {
      expect(seed[code]).toBeUndefined();
    }
  });

  it("REGRESSION: a 'לא לשקלול' row is counted as earned credit", () => {
    // The sheet prints "לא לשקלול" in the הערות column for the English course,
    // and the extraction schema has no field for it — so 4 credits that the
    // university excludes are added to the degree total.
    const s = run();
    expect(s.completed.some((x) => x.key === "2171-9201")).toBe(true);
  });
});
