import { describe, it, expect } from "vitest";
import {
  summarizeStanding,
  buildCompletedSeed,
  groupRowsBySemester,
  nextSemesterOn,
  yearFromCredits,
  type StandingCatalogCourse,
} from "@/lib/onboarding-standing";
import { matchExtractedToCatalog } from "@/lib/grade-sheet";
import type { ExtractedRow } from "@/lib/grade-sheet";

// A miniature PPE catalog. `credits` and mandatory flags are what the summary
// counts, so they carry the whole arithmetic of these tests.
const CATALOG: StandingCatalogCourse[] = [
  { code: "0651-1001", nameHe: "מבוא לפילוסופיה", credits: 4, courseType: "MANDATORY", discipline: "PHILOSOPHY" },
  { code: "1011-1001", nameHe: "מבוא לכלכלה", credits: 5, courseType: "MANDATORY", discipline: "ECONOMICS" },
  { code: "1031-1001", nameHe: "מבוא למדע המדינה", credits: 4, courseType: "MANDATORY", discipline: "POLITICS" },
  { code: "0651-2020", nameHe: "פילוסופיה של המוסר", credits: 2, courseType: "ELECTIVE", discipline: "PHILOSOPHY", canCountAs: ["POLITICS"] },
  { code: "1011-3450", nameHe: "כלכלת פיתוח", credits: 3, courseType: "ELECTIVE", discipline: "ECONOMICS" },
  { code: "ENG-1", nameHe: "אנגלית מתקדמים ב׳", credits: 4, courseType: "ENGLISH", discipline: "GENERAL" },
];

function row(partial: Partial<ExtractedRow> & { courseName: string }): ExtractedRow {
  return {
    courseCode: null,
    grade: null,
    credits: null,
    passText: null,
    semester: null,
    inProgress: false,
    ...partial,
  };
}

function summarize(
  rows: (ExtractedRow & { uncertain?: boolean; otherGrade?: number | null })[],
  upcomingSemester: "FALL" | "SPRING" = "FALL",
) {
  const matched = matchExtractedToCatalog(rows, CATALOG);
  return summarizeStanding({
    rows,
    catalog: CATALOG,
    matches: matched.map((m) => m.course),
    upcomingSemester,
  });
}

describe("nextSemesterOn", () => {
  it("advances FALL → SPRING within the same year", () => {
    expect(nextSemesterOn({ year: 2, semester: "FALL" }, "SPRING")).toEqual({ year: 2, semester: "SPRING" });
  });
  it("advances SPRING → next year's FALL", () => {
    expect(nextSemesterOn({ year: 1, semester: "SPRING" }, "FALL")).toEqual({ year: 2, semester: "FALL" });
  });
  it("skips forward when the target semester already passed this year", () => {
    // Last studied year-2 FALL, and the calendar's next teaching semester is
    // FALL → the next FALL is year 3, not year 2 again.
    expect(nextSemesterOn({ year: 2, semester: "FALL" }, "FALL")).toEqual({ year: 3, semester: "FALL" });
  });
  it("never proposes a year past the degree's last", () => {
    expect(nextSemesterOn({ year: 3, semester: "SPRING" }, "FALL")).toEqual({ year: 3, semester: "FALL" });
  });
});

describe("yearFromCredits", () => {
  it("stays at year 1 below the year-1 load", () => {
    expect(yearFromCredits(0)).toBe(1);
    expect(yearFromCredits(39)).toBe(1);
  });
  it("reads a full year-1 load as year 2", () => {
    expect(yearFromCredits(56)).toBe(2);
  });
  it("reads two years of load as year 3", () => {
    expect(yearFromCredits(96)).toBe(3);
  });
});

describe("summarizeStanding — a third-year sheet (#11 core case)", () => {
  const rows = [
    row({ courseCode: "0651-1001", courseName: "מבוא לפילוסופיה", grade: 88, semester: "2024/1" }),
    row({ courseCode: "1011-1001", courseName: "מבוא לכלכלה", grade: 91, semester: "2024/1" }),
    row({ courseCode: "1031-1001", courseName: "מבוא למדע המדינה", grade: 76, semester: "2024/2" }),
    row({ courseCode: "0651-2020", courseName: "פילוסופיה של המוסר", grade: 89, semester: "2025/1" }),
    row({ courseCode: "1011-3450", courseName: "כלכלת פיתוח", grade: 82, semester: "2025/2" }),
  ];

  it("counts only what the sheet actually shows as passed", () => {
    const s = summarize(rows);
    expect(s.completed).toHaveLength(5);
    expect(s.creditsEarned).toBe(4 + 5 + 4 + 2 + 3);
    expect(s.mandatoryDone).toBe(3);
    expect(s.mandatoryTotal).toBe(3);
  });

  it("places the student in year 3 FALL — not year 1", () => {
    const s = summarize(rows, "FALL");
    // Sheet blocks: 2024/1, 2024/2, 2025/1, 2025/2 → four semesters done, the
    // last being a SPRING → the next FALL is year 3.
    expect(s.semestersOnSheet).toBe(4);
    expect(s.placement).toEqual({
      year: 3,
      semester: "FALL",
      basis: "sheet",
      lastSheetSemester: "2025/2",
    });
  });

  it("credits a dual-discipline elective to both disciplines", () => {
    const s = summarize(rows);
    // פילוסופיה של המוסר is PHILOSOPHY and canCountAs POLITICS.
    expect(s.creditsByDiscipline.PHILOSOPHY).toBe(4 + 2);
    expect(s.creditsByDiscipline.POLITICS).toBe(4 + 2);
    expect(s.creditsByDiscipline.ECONOMICS).toBe(5 + 3);
  });

  it("separates electives from mandatory credits", () => {
    const s = summarize(rows);
    expect(s.electiveCredits).toBe(2 + 3);
  });
});

describe("summarizeStanding — never over-claims", () => {
  it("does not count a failed grade as completed", () => {
    const s = summarize([
      row({ courseCode: "1011-1001", courseName: "מבוא לכלכלה", grade: 45, semester: "2024/1" }),
    ]);
    expect(s.completed).toHaveLength(0);
    expect(s.failed).toHaveLength(1);
    expect(s.creditsEarned).toBe(0);
  });

  it("uses the English pass bar (70), so a 65 in English is FAILED", () => {
    const s = summarize([
      row({ courseCode: "ENG-1", courseName: "אנגלית מתקדמים ב׳", grade: 65, semester: "2024/1" }),
    ]);
    expect(s.failed).toHaveLength(1);
    expect(s.completed).toHaveLength(0);
  });

  it("does not count a still-in-progress (***) row", () => {
    const s = summarize([
      row({ courseCode: "1011-1001", courseName: "מבוא לכלכלה", grade: null, inProgress: true, semester: "2025/1" }),
    ]);
    expect(s.inProgress).toHaveLength(1);
    expect(s.completed).toHaveLength(0);
    expect(s.creditsEarned).toBe(0);
  });

  it("keeps a פטור row as EXEMPT, out of the earned credits", () => {
    const s = summarize([
      row({ courseCode: "ENG-1", courseName: "אנגלית מתקדמים ב׳", passText: "פטור", semester: "2024/1" }),
    ]);
    expect(s.exempt).toHaveLength(1);
    expect(s.creditsEarned).toBe(0);
  });

  it("marks a row with neither grade nor pass mark as UNREADABLE, not passed", () => {
    const s = summarize([row({ courseCode: "1011-1001", courseName: "מבוא לכלכלה", semester: "2024/1" })]);
    expect(s.rows[0]!.status).toBe("UNREADABLE");
    expect(s.completed).toHaveLength(0);
  });

  it("counts a binary 'עובר' row as a completion, with its catalog ש״ס", () => {
    // A pass/fail course prints a word, not a number. It is a real completion —
    // conflating it with a still-in-progress row is exactly how a passed course
    // ends up reported as "בלימוד".
    const s = summarize([
      row({ courseCode: "0651-1001", courseName: "מבוא לפילוסופיה", passText: "עובר", semester: "2024/1" }),
    ]);
    expect(s.rows[0]!.status).toBe("COMPLETED");
    expect(s.inProgress).toHaveLength(0);
    expect(s.creditsEarned).toBe(4); // from the catalog, not from the sheet
  });

  it("counts a נכשל mark as failed, never as in-progress", () => {
    const s = summarize([
      row({ courseCode: "1011-1001", courseName: "מבוא לכלכלה", passText: "נכשל", semester: "2024/1" }),
    ]);
    expect(s.failed).toHaveLength(1);
    expect(s.creditsEarned).toBe(0);
  });

  it("carries the scanner's uncertainty flag through untouched", () => {
    const s = summarize([
      { ...row({ courseCode: "1011-1001", courseName: "מבוא לכלכלה", grade: 91, semester: "2024/1" }), uncertain: true },
    ]);
    expect(s.uncertain).toHaveLength(1);
    expect(s.completed).toHaveLength(1); // still counted, but flagged for review
  });

  it("returns no placement at all for an empty / unreadable scan", () => {
    const s = summarize([]);
    expect(s.placement).toBeNull();
    expect(s.creditsEarned).toBe(0);
    expect(s.semestersOnSheet).toBe(0);
  });
});

// =========================================================================
// #2a (13.8) — "משום מה הוא לא הצליח לקלוט שעשיתי לוגיקה". A course Ariel
// PASSED was reported "בלימוד", with no grade and its ש״ס dropped.
//
// The two ways a passed course could reach this screen without its grade:
//   1. the row arrived carrying BOTH a number and the *** flag, and the flag
//      was checked first — so the printed grade was thrown away;
//   2. the two vision reads disagreed about whether the row has a grade at
//      all, and the empty read silently won (see mergeDoubleRead).
// Both are settled here: a printed number always beats the flag, and a
// disputed row is reported as unclear — never as a fact about the document.
// =========================================================================
describe("status derivation — every mark the TAU sheet can print (#2a)", () => {
  const statusOf = (over: Partial<ExtractedRow>) =>
    summarize([row({ courseCode: "0651-1001", courseName: "מבוא לפילוסופיה", semester: "2024/1", ...over })])
      .rows[0]!.status;

  it("reads each mark exactly as the sheet prints it", () => {
    expect(statusOf({ grade: 88 })).toBe("COMPLETED"); // a number
    expect(statusOf({ grade: 45 })).toBe("FAILED");
    expect(statusOf({ passText: "עובר" })).toBe("COMPLETED"); // binary pass
    expect(statusOf({ passText: "פטור" })).toBe("EXEMPT");
    expect(statusOf({ passText: "נכשל" })).toBe("FAILED");
    expect(statusOf({ inProgress: true })).toBe("IN_PROGRESS"); // ***
    expect(statusOf({})).toBe("UNREADABLE"); // nothing to go on — say so
  });

  it("a printed grade outranks the *** flag — the row is COMPLETED, not בלימוד", () => {
    // The sheet prints *** INSTEAD of a grade, so a row carrying both is a read
    // artefact. The number is the only positive evidence in it.
    const s = summarize([
      row({ courseCode: "0651-1001", courseName: "מבוא לפילוסופיה", grade: 88, inProgress: true, semester: "2024/1" }),
    ]);
    expect(s.rows[0]!.status).toBe("COMPLETED");
    expect(s.inProgress).toHaveLength(0);
    expect(s.creditsEarned).toBe(4); // the ש״ס are no longer dropped
    expect(buildCompletedSeed(s, s.placement!)["0651-1001"]?.grade).toBe(88);
  });

  it("a binary pass mark still wins over a stray *** flag", () => {
    expect(statusOf({ passText: "עובר", inProgress: true })).toBe("COMPLETED");
    expect(statusOf({ passText: "פטור", inProgress: true })).toBe("EXEMPT");
  });

  it("a row the two reads disagreed about is 'unclear', never asserted as בלימוד", () => {
    // What mergeDoubleRead now hands over when one read saw 89 and the other
    // saw an empty grade cell: no grade, no *** — and the number carried along.
    const s = summarize([
      {
        ...row({ courseCode: "0651-1001", courseName: "מבוא לפילוסופיה", grade: null, semester: "2024/1" }),
        uncertain: true,
        otherGrade: 89,
      },
    ]);
    expect(s.rows[0]!.status).toBe("UNREADABLE");
    expect(s.inProgress).toHaveLength(0); // never counted as "still studying"
    expect(s.unclear).toHaveLength(1);
    expect(s.rows[0]!.otherGrade).toBe(89); // the review screen can offer it
    // And one tap on that number turns it into an honest completion.
    const fixed = reviseStandingRow(s.rows[0]!, { grade: 89 });
    expect(fixed.status).toBe("COMPLETED");
  });

  it("counts the same course sat twice only from the sitting that has a grade", () => {
    // The retake shape: a first sitting with no grade, a later one graded.
    const s = summarize([
      row({ courseCode: "1011-1001", courseName: "מבוא לכלכלה", grade: null, inProgress: true, semester: "2024/2" }),
      row({ courseCode: "1011-1001", courseName: "מבוא לכלכלה", grade: 78, semester: "2025/2" }),
    ]);
    expect(s.rows.map((r) => r.status)).toEqual(["IN_PROGRESS", "COMPLETED"]);
    expect(s.creditsEarned).toBe(5); // counted ONCE, from the graded sitting
    const seed = buildCompletedSeed(s, s.placement!);
    expect(Object.keys(seed)).toEqual(["1011-1001"]);
    expect(seed["1011-1001"]?.grade).toBe(78);
  });
});

describe("summarizeStanding — off-catalog and headerless sheets", () => {
  it("keeps a real elective that isn't in the PPE catalog", () => {
    const s = summarize([
      row({ courseCode: "9999-1234", courseName: "קורס חיצוני כלשהו", grade: 90, credits: 4, semester: "2024/1" }),
    ]);
    expect(s.offCatalogCompleted).toBe(1);
    expect(s.creditsEarned).toBe(4);
    expect(s.rows[0]!.inCatalog).toBe(false);
  });

  it("falls back to a credits-based placement when the sheet prints no semester headers", () => {
    const rows = [
      row({ courseCode: "0651-1001", courseName: "מבוא לפילוסופיה", grade: 88 }),
      row({ courseCode: "1011-1001", courseName: "מבוא לכלכלה", grade: 91 }),
    ];
    const s = summarize(rows, "SPRING");
    expect(s.semestersOnSheet).toBe(0);
    expect(s.placement).toEqual({
      year: 1, // 9 credits — honestly still year 1
      semester: "SPRING",
      basis: "credits",
      lastSheetSemester: null,
    });
  });

  it("flags a gap when the next teaching semester doesn't follow the sheet", () => {
    // Sheet ends on a FALL block, but the calendar's next teaching semester is
    // also FALL → a semester is missing. Same suggestion, honest basis.
    const s = summarize(
      [row({ courseCode: "0651-1001", courseName: "מבוא לפילוסופיה", grade: 88, semester: "2024/1" })],
      "FALL",
    );
    expect(s.placement?.basis).toBe("gap");
    expect(s.placement).toMatchObject({ year: 2, semester: "FALL" });
  });

  it("does not let a SUMMER sitting advance the degree clock", () => {
    const s = summarize(
      [
        row({ courseCode: "0651-1001", courseName: "מבוא לפילוסופיה", grade: 88, semester: "2024/1" }),
        row({ courseCode: "1011-3450", courseName: "כלכלת פיתוח", grade: 80, semester: "2024/3" }),
      ],
      "SPRING",
    );
    expect(s.semestersOnSheet).toBe(1); // only the FALL block counts as a step
    expect(s.placement).toMatchObject({ year: 1, semester: "SPRING", basis: "sheet" });
  });
});

// =========================================================================
// #2b (13.8) — the review is read semester by semester, like the sheet itself.
// =========================================================================
describe("groupRowsBySemester (#2b)", () => {
  const scanned = () =>
    summarize([
      row({ courseCode: "1011-3450", courseName: "כלכלת פיתוח", grade: 82, semester: "2025/2" }),
      row({ courseCode: "0651-1001", courseName: "מבוא לפילוסופיה", grade: 88, semester: "2024/1" }),
      row({ courseCode: "1031-1001", courseName: "מבוא למדע המדינה", grade: 76, semester: "2024/1" }),
      row({ courseCode: "1011-1001", courseName: "מבוא לכלכלה", grade: 91 }), // no header on the sheet
    ]);

  it("splits the rows into the sheet's own blocks, earliest first", () => {
    const groups = groupRowsBySemester(scanned().rows);
    expect(groups.map((g) => g.sheetSemester)).toEqual(["2024/1", "2025/2", null]);
    expect(groups.map((g) => g.rows.length)).toEqual([2, 1, 1]);
  });

  it("decodes the sitting digit off the header and never invents one", () => {
    const groups = groupRowsBySemester(scanned().rows);
    expect(groups[0]).toMatchObject({ semester: "FALL", year: 1 });
    expect(groups[1]).toMatchObject({ semester: "SPRING", year: 2 });
    // A row with no header stays honestly unknown — not filed under a neighbour.
    expect(groups[2]).toMatchObject({ sheetSemester: null, semester: null, year: null });
  });

  it("keeps each row's index in the original list, so every edit still lands", () => {
    const s = scanned();
    const groups = groupRowsBySemester(s.rows);
    for (const g of groups) {
      for (const { row: r, index } of g.rows) expect(s.rows[index]).toBe(r);
    }
    // The flat list is fully covered — grouping shows every row, exactly once.
    const seen = groups.flatMap((g) => g.rows.map((r) => r.index)).sort((a, b) => a - b);
    expect(seen).toEqual([0, 1, 2, 3]);
  });

  it("puts a course the student added by hand in the unknown-semester block", () => {
    const rows = [...scanned().rows, manualStandingRow(CATALOG[3]!, "פילוסופיה של המוסר")];
    const groups = groupRowsBySemester(rows);
    expect(groups[groups.length - 1]!.sheetSemester).toBeNull();
    expect(groups[groups.length - 1]!.rows.map(({ row: r }) => r.manual)).toEqual([undefined, true]);
  });

  it("returns nothing at all for an empty scan", () => {
    expect(groupRowsBySemester([])).toEqual([]);
  });
});

describe("buildCompletedSeed", () => {
  const rows = [
    row({ courseCode: "0651-1001", courseName: "מבוא לפילוסופיה", grade: 88, semester: "2024/1" }),
    row({ courseCode: "1011-1001", courseName: "מבוא לכלכלה", grade: 45, semester: "2024/1" }), // failed
    row({ courseCode: "1031-1001", courseName: "מבוא למדע המדינה", grade: null, inProgress: true, semester: "2025/2" }),
    row({ courseCode: "9999-1234", courseName: "קורס חיצוני", grade: 90, credits: 4, semester: "2024/2" }),
  ];

  it("seeds only completed rows — never a failed or in-progress one", () => {
    const s = summarize(rows, "FALL");
    const seed = buildCompletedSeed(s, { year: 2, semester: "FALL" });
    expect(Object.keys(seed).sort()).toEqual(["0651-1001", "9999-1234"]);
  });

  it("carries the sheet's own semester placement and grade", () => {
    const s = summarize(rows, "FALL");
    const seed = buildCompletedSeed(s, { year: 2, semester: "FALL" });
    expect(seed["0651-1001"]).toMatchObject({
      courseCode: "0651-1001",
      plannedYear: 1,
      plannedSemester: "FALL",
      grade: 88,
    });
  });

  it("marks an off-catalog course as custom, with its own credits", () => {
    const s = summarize(rows, "FALL");
    const seed = buildCompletedSeed(s, { year: 2, semester: "FALL" });
    expect(seed["9999-1234"]).toMatchObject({ customName: "קורס חיצוני", credits: 4 });
  });

  it("clamps a course placed at-or-after the current semester into the past", () => {
    // A completed course whose sheet block ranks at year 2 while the student is
    // planning year 2 FALL would be invisible on the review screen — clamp it
    // back one semester so it can always be checked and corrected.
    const s = summarize(
      [row({ courseCode: "0651-1001", courseName: "מבוא לפילוסופיה", grade: 88, semester: "2024/1" })],
      "FALL",
    );
    const seed = buildCompletedSeed(s, { year: 1, semester: "FALL" });
    expect(seed["0651-1001"]).toMatchObject({ plannedYear: 1, plannedSemester: "FALL" });
  });
});

// =========================================================================
// #5 + #7 (13.8) — the standing review is EDITABLE, and it is the only pass.
//
// The screen printed "זה מה שקראנו מהגיליון" with no control at all, and the
// real review lived two steps later ("למה יש עוד שלב של מעבר על הגיליון - זאת
// קצת כפילות"). Now the correction happens here, so the thing that has to be
// true is: the corrected value is the value that reaches the seed the whole
// degree is built from. A correction that only changes what is on screen is
// the bug, not the fix.
// =========================================================================
import {
  aggregateStanding,
  reviseStandingRow,
  manualStandingRow,
} from "@/lib/onboarding-standing";

const revise = (
  s: ReturnType<typeof summarize>,
  index: number,
  edit: Parameters<typeof reviseStandingRow>[1],
  upcoming: "FALL" | "SPRING" = "FALL",
) => {
  const rows = [...s.rows];
  rows[index] = reviseStandingRow(rows[index]!, edit);
  return aggregateStanding(rows, CATALOG, upcoming);
};

describe("reviseStandingRow (#5) — the corrected grade is the saved grade", () => {
  const scanned = () =>
    summarize([
      // The scan misread 86 as 68.
      row({ courseCode: "0651-1001", courseName: "מבוא לפילוסופיה", grade: 68, semester: "2024/1" }),
      row({ courseCode: "1011-1001", courseName: "מבוא לכלכלה", grade: 90, semester: "2024/1" }),
    ]);

  it("carries a corrected grade all the way into the completed seed", () => {
    const fixed = revise(scanned(), 0, { grade: 86 });
    const seed = buildCompletedSeed(fixed, fixed.placement!);
    // THE assertion this whole feature exists for: what the student typed is
    // what step-ready hands to saveCompletedCourses.
    expect(seed["0651-1001"]?.grade).toBe(86);
    expect(fixed.rows[0]!.grade).toBe(86);
  });

  it("re-derives status, credits and the average-bearing counts after an edit", () => {
    const before = scanned();
    expect(before.completed.map((r) => r.key)).toEqual(["0651-1001", "1011-1001"]);
    // Correct the same row DOWN below the pass bar: it stops being a
    // completion, and its ש״ס stop counting.
    const failed = revise(before, 0, { grade: 45 });
    expect(failed.rows[0]!.status).toBe("FAILED");
    expect(failed.completed.map((r) => r.key)).toEqual(["1011-1001"]);
    expect(failed.creditsEarned).toBe(5); // only מבוא לכלכלה
    expect(Object.keys(buildCompletedSeed(failed, failed.placement!))).toEqual(["1011-1001"]);
  });

  it("keeps the English bar at 70 after an edit, not 60", () => {
    const s = summarize([
      row({ courseCode: "ENG-1", courseName: "אנגלית מתקדמים ב׳", grade: 90, semester: "2024/1" }),
    ]);
    expect(revise(s, 0, { grade: 65 }).rows[0]!.status).toBe("FAILED");
    expect(revise(s, 0, { grade: 70 }).rows[0]!.status).toBe("COMPLETED");
  });

  it("rejects an out-of-range grade or ש״ס and changes nothing", () => {
    const r = scanned().rows[0]!;
    expect(reviseStandingRow(r, { grade: 101 })).toBe(r);
    expect(reviseStandingRow(r, { grade: -5 })).toBe(r);
    expect(reviseStandingRow(r, { credits: 25 })).toBe(r);
  });

  it("a typed grade answers a *** row, and clearing it restores what the sheet said", () => {
    const s = summarize([
      row({ courseCode: "1031-1001", courseName: "מבוא למדע המדינה", grade: null, inProgress: true, semester: "2024/1" }),
    ]);
    expect(s.rows[0]!.status).toBe("IN_PROGRESS");
    const graded = reviseStandingRow(s.rows[0]!, { grade: 88 });
    expect(graded.status).toBe("COMPLETED");
    // Round-trip: we never destroy what the document actually printed.
    expect(reviseStandingRow(graded, { grade: null }).status).toBe("IN_PROGRESS");
  });

  it("re-matching a row to the right course moves its credits and its seed key", () => {
    const s = summarize([
      row({ courseName: "קורס שלא זוהה", grade: 88, credits: 2, semester: "2024/1" }),
    ]);
    expect(s.rows[0]!.inCatalog).toBe(false);
    const fixed = revise(s, 0, { course: CATALOG[1]! }); // מבוא לכלכלה, 5 ש״ס
    expect(fixed.rows[0]!.inCatalog).toBe(true);
    expect(fixed.creditsEarned).toBe(5);
    const seed = buildCompletedSeed(fixed, fixed.placement!);
    expect(Object.keys(seed)).toEqual(["1011-1001"]);
    expect(seed["1011-1001"]?.customName).toBeUndefined();
    expect(seed["1011-1001"]?.grade).toBe(88);
  });

  it("an edited ש״ס on an off-catalog row is the value that gets saved", () => {
    const s = summarize([
      row({ courseCode: "9999-1234", courseName: "דוגרי", grade: 92, credits: 2, semester: "2024/1" }),
    ]);
    const fixed = revise(s, 0, { credits: 4 });
    const seed = buildCompletedSeed(fixed, fixed.placement!);
    expect(seed["9999-1234"]).toMatchObject({ customName: "דוגרי", credits: 4, grade: 92 });
  });
});

describe("excluding a row (#5) — visible, reversible, counted nowhere", () => {
  const scanned = () =>
    summarize([
      row({ courseCode: "0651-1001", courseName: "מבוא לפילוסופיה", grade: 88, semester: "2024/1" }),
      row({ courseCode: "1011-1001", courseName: "מבוא לכלכלה", grade: 90, semester: "2024/1" }),
    ]);

  it("drops the row from every count and from the seed, but keeps it on screen", () => {
    const s = revise(scanned(), 1, { excluded: true });
    // Still rendered — the student must be able to see (and undo) the choice.
    expect(s.rows).toHaveLength(2);
    expect(s.rows[1]!.excluded).toBe(true);
    expect(s.completed.map((r) => r.key)).toEqual(["0651-1001"]);
    expect(s.creditsEarned).toBe(4);
    expect(Object.keys(buildCompletedSeed(s, s.placement!))).toEqual(["0651-1001"]);
  });

  it("is reversible — re-including restores the row everywhere", () => {
    const off = revise(scanned(), 1, { excluded: true });
    const back = aggregateStanding(
      off.rows.map((r, i) => (i === 1 ? reviseStandingRow(r, { excluded: false }) : r)),
      CATALOG,
      "FALL",
    );
    expect(back.completed).toHaveLength(2);
    expect(back.creditsEarned).toBe(9);
  });
});

describe("manualStandingRow (#7) — a course the scan missed", () => {
  it("adds a catalog course as a completion the student is asserting", () => {
    const s = summarize([
      row({ courseCode: "0651-1001", courseName: "מבוא לפילוסופיה", grade: 88, semester: "2024/1" }),
    ]);
    const added = aggregateStanding(
      [...s.rows, manualStandingRow(CATALOG[2]!, "מבוא למדע המדינה")],
      CATALOG,
      "FALL",
    );
    const manual = added.rows[1]!;
    expect(manual.manual).toBe(true);
    // No grade yet, but a completion all the same — exactly what the history
    // step allowed before this screen absorbed it.
    expect(manual.status).toBe("COMPLETED");
    expect(added.creditsEarned).toBe(8); // 4 + 4
    const seed = buildCompletedSeed(added, added.placement!);
    expect(seed["1031-1001"]).toMatchObject({ courseCode: "1031-1001", grade: null });
  });

  it("adds an off-catalog course under the student's own name, with editable ש״ס", () => {
    const s = summarize([
      row({ courseCode: "0651-1001", courseName: "מבוא לפילוסופיה", grade: 88, semester: "2024/1" }),
    ]);
    const rows = [...s.rows, manualStandingRow(null, "דוגרי")];
    rows[1] = reviseStandingRow(rows[1]!, { credits: 4 });
    rows[1] = reviseStandingRow(rows[1]!, { grade: 92 });
    const added = aggregateStanding(rows, CATALOG, "FALL");
    const seed = buildCompletedSeed(added, added.placement!);
    expect(seed["CUSTOM-דוגרי"]).toMatchObject({ customName: "דוגרי", credits: 4, grade: 92 });
  });

  it("keeps a manual row COMPLETED when its grade is cleared again", () => {
    const manual = manualStandingRow(null, "דוגרי");
    const graded = reviseStandingRow(manual, { grade: 92 });
    expect(reviseStandingRow(graded, { grade: null }).status).toBe("COMPLETED");
  });
});
