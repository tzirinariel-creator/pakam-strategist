import { describe, it, expect } from "vitest";
import {
  summarizeStanding,
  buildCompletedSeed,
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
  rows: (ExtractedRow & { uncertain?: boolean })[],
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
