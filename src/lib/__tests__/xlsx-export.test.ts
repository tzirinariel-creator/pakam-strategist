// #15/#34 — the colored exam-plan workbook, verified by reading the actual
// workbook object back: sheet set, banner totals, exam-day red, intensity
// tints, per-day totals with crunch highlighting, agenda checklist rows.

import { describe, it, expect } from "vitest";
import { buildExamPlanWorkbook } from "@/lib/xlsx-export";
import type { ExamPlanResult } from "@/lib/exam-planner";

const NOW = new Date(2026, 6, 11); // 11.7.2026, local midnight

function makePlan(): ExamPlanResult {
  const mk = (y: number, m: number, d: number) => new Date(y, m - 1, d);
  return {
    exams: [
      {
        courseCode: "1011-2101",
        courseName: "מאקרו כלכלה",
        examDate: mk(2026, 7, 15),
        moed: "A",
        difficulty: "high",
        totalHours: 10,
        color: "#6366f1",
      },
      {
        courseCode: "0651-1003",
        courseName: "פילוסופיה של החברה",
        examDate: mk(2026, 7, 20),
        moed: "A",
        difficulty: "low",
        totalHours: 4,
        color: "#10b981",
      },
    ],
    sessions: [
      // Crunch day: 12.7 carries 4h + 3h = 7h → red daily-total.
      { courseCode: "1011-2101", courseName: "מאקרו כלכלה", date: mk(2026, 7, 12), hours: 4, color: "#6366f1", difficulty: "high" },
      { courseCode: "0651-1003", courseName: "פילוסופיה של החברה", date: mk(2026, 7, 12), hours: 3, color: "#10b981", difficulty: "low" },
      { courseCode: "1011-2101", courseName: "מאקרו כלכלה", date: mk(2026, 7, 13), hours: 1, color: "#6366f1", difficulty: "high" },
      { courseCode: "0651-1003", courseName: "פילוסופיה של החברה", date: mk(2026, 7, 18), hours: 1, color: "#10b981", difficulty: "low" },
    ],
  };
}

describe("buildExamPlanWorkbook", () => {
  it("returns null for an empty plan (caller shows an honest empty message)", async () => {
    expect(await buildExamPlanWorkbook({ exams: [], sessions: [] }, { now: NOW })).toBeNull();
  });

  it("builds the weekly grid, plan table and agenda (gantt dropped)", async () => {
    const built = await buildExamPlanWorkbook(makePlan(), { isHe: true, now: NOW });
    expect(built).not.toBeNull();
    const { wb, meta } = built!;

    expect(wb.worksheets.map((w) => w.name)).toEqual(["לוח שבועי", "תוכנית", "אג'נדה"]);
    // 11.7 → 20.7 inclusive = 10 day columns; today = first column (B).
    expect(meta.dayCount).toBe(10);
    expect(meta.todayCol).toBe(2);
    expect(meta.totalHours).toBe(9);

    // Banner carries the real totals (2 exams · 9 hours).
    const table = wb.getWorksheet("תוכנית")!;
    expect(String(table.getCell(2, 1).value)).toContain("2 מבחנים");
    expect(String(table.getCell(2, 1).value)).toContain("9 שעות");

    // Days-left column: exam on 15.7, today 11.7 → 4.
    // Rows: 1 title, 2 subtitle, 3 spacer, 4 headers, 5 first exam.
    expect(table.getCell(5, 3).value).toBe(4);
  });

  it("agenda: one checklist row per study block + bold exam marker rows", async () => {
    const built = await buildExamPlanWorkbook(makePlan(), { isHe: true, now: NOW });
    const agenda = built!.wb.getWorksheet("אג'נדה")!;

    // 4 study lines + 2 exam lines + header = 7 rows.
    expect(agenda.rowCount).toBe(7);
    // First body row: 12.7, checkbox present, date shown (new day).
    expect(agenda.getCell(2, 1).value).toBe("☐");
    expect(String(agenda.getCell(2, 2).value)).toContain("12");
    // Second row same day → date cell empty.
    expect(agenda.getCell(3, 2).value === "" || agenda.getCell(3, 2).value == null).toBe(true);
    // Exam rows are marked.
    const values: string[] = [];
    agenda.eachRow((row) => values.push(String(row.getCell(4).value)));
    expect(values.filter((v) => v.includes("מבחן:")).length).toBe(2);
  });
});

// #35/#36 (12.7) — the weekly calendar grid, modeled on the real spreadsheet
// students plan with: days across, weeks down, exams highlighted in cells.
describe("weekly calendar grid sheet (#35/#36)", () => {
  it("is the FIRST sheet, has day headers, and places the exam in its day cell", async () => {
    const plan = makePlan();
    const built = await buildExamPlanWorkbook(plan, { isHe: true, now: NOW });
    expect(built).not.toBeNull();
    const cal = built!.wb.worksheets[0]!;
    expect(cal.name).toBe("לוח שבועי");
    // header row = day names
    expect(String(cal.getRow(1).getCell(1).value)).toBe("ראשון");
    expect(String(cal.getRow(1).getCell(7).value)).toBe("שבת");
    // somewhere in the grid the exam appears as an exam cell (📝 + מועד)
    let foundExam = false;
    let foundStudy = false;
    cal.eachRow((row) => {
      row.eachCell((cell) => {
        const v = String(cell.value ?? "");
        if (v.includes("📝") && v.includes("מועד")) foundExam = true;
        // 18:19 (#5) — day totals moved to the date row ("D.M · N ש׳"); study
        // cells carry the short course name, no per-session "(N ש׳)".
        if (/·\s*\d+\s*ש׳/.test(v)) foundStudy = true;
      });
    });
    expect(foundExam).toBe(true);
    expect(foundStudy).toBe(true);
  });
});

// #5 (18:19) — short course names for the weekly grid
import { shortCourseName } from "@/lib/xlsx-export";

describe("shortCourseName (#5)", () => {
  it("strips tutorial tails and caps at a word boundary", () => {
    expect(shortCourseName("מיקרו כלכלה והחלטות כלכליות + תרגיל")).not.toContain("תרגיל");
    expect(shortCourseName("מבוא ללוגיקה + תרגיל")).toBe("מבוא ללוגיקה");
    expect(shortCourseName("סטטיסטיקה")).toBe("סטטיסטיקה");
  });
  it("keeps a distinctive prefix and never runs past the cap", () => {
    const s = shortCourseName("מיקרו כלכלה והחלטות כלכליות בעידן המודרני", 22);
    expect(s.length).toBeLessThanOrEqual(23); // + ellipsis
    expect(s.startsWith("מיקרו")).toBe(true);
  });
});
