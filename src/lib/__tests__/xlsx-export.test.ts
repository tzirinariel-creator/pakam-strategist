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

  it("builds three sheets with the banner, grid and agenda", async () => {
    const built = await buildExamPlanWorkbook(makePlan(), { isHe: true, now: NOW });
    expect(built).not.toBeNull();
    const { wb, meta } = built!;

    expect(wb.worksheets.map((w) => w.name)).toEqual(["לוח שבועי", "תוכנית", "לוח-גאנט", "אג'נדה"]);
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

  it("colors the grid honestly: red exam day, tinted study cells, crunch totals", async () => {
    const built = await buildExamPlanWorkbook(makePlan(), { isHe: true, now: NOW });
    const grid = built!.wb.getWorksheet("לוח-גאנט")!;

    // Row 3 = first exam (מאקרו). Day columns start at col 2 for 11.7.
    // 15.7 → col 6: the exam cell, solid red.
    const examCell = grid.getCell(3, 6);
    expect(examCell.value).toBe("מבחן");
    expect((examCell.fill as { fgColor?: { argb?: string } }).fgColor?.argb).toBe("FFEF4444");

    // 12.7 → col 3: a 4h block = FULL course color (no tint).
    const heavy = grid.getCell(3, 3);
    expect(heavy.value).toBe(4);
    expect((heavy.fill as { fgColor?: { argb?: string } }).fgColor?.argb).toBe("FF6366F1");

    // 13.7 → col 4: a 1h block = light tint (NOT the full color).
    const light = grid.getCell(3, 4);
    expect(light.value).toBe(1);
    expect((light.fill as { fgColor?: { argb?: string } }).fgColor?.argb).not.toBe("FF6366F1");

    // Per-course total column (after 10 day columns → col 12).
    expect(grid.getCell(3, 12).value).toBe(5);

    // Daily-totals row (2 header rows + 2 course rows → row 5):
    // 12.7 carries 7h → crunch red.
    const totals = grid.getCell(5, 3);
    expect(totals.value).toBe(7);
    expect((totals.fill as { fgColor?: { argb?: string } }).fgColor?.argb).toBe("FFFECACA");
    // Grand total lands in the corner.
    expect(grid.getCell(5, 12).value).toBe(9);
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
        if (v.includes("ש׳)")) foundStudy = true;
      });
    });
    expect(foundExam).toBe(true);
    expect(foundStudy).toBe(true);
  });
});
