// =========================================
// Colored exam-plan Excel (.xlsx) export — notes #15 / #34
// =========================================
// Real xlsx (not the old faux-CSV) built with exceljs. TWO sheets:
//   (1) "תוכנית" — a flat table: exam, date, moed, difficulty, budgeted hours,
//       prep-block count.
//   (2) "לוח-גאנט" — a day×course grid: rows = exams/courses, columns = calendar
//       days (today → last exam), cells COLORED per the study plan — course-color
//       for study blocks, solid red for the exam day itself.
//
// HONESTY-FIRST: this exports EXACTLY the plan the UI already computed
// (generateExamPlan → ExamPlanResult). It invents no dates and no sessions of
// its own — it only renders what's in `plan`. If a course has no known upcoming
// sitting it never reached the plan, so it never reaches this file.
//
// exceljs is heavy; it is imported DYNAMICALLY inside the export function so it
// stays out of the initial bundle.

import type { ExamPlanResult } from "./exam-planner";
import type { Cell } from "exceljs";

export interface XlsxExportOptions {
  isHe?: boolean;
  /** Injectable "today" for tests / determinism. Defaults to new Date(). */
  now?: Date;
  filename?: string;
}

// ─── date helpers (LOCAL-midnight — must match exam-planner/study-skyline) ───

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** LOCAL day key (NOT toISOString/UTC): Israel is UTC+2/+3, so a local-midnight
 *  Date serialized as UTC rolls back a day and would misalign sessions from
 *  their column. Same convention the engine and the on-screen skyline use. */
function dayKey(d: Date): string {
  const x = startOfDay(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000);
}

const HE_WEEKDAYS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];
const EN_WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const DIFFICULTY_LABEL: Record<string, { he: string; en: string }> = {
  high: { he: "גבוה", en: "High" },
  medium: { he: "בינוני", en: "Medium" },
  low: { he: "נמוך", en: "Low" },
};

/** exceljs wants ARGB hex without the leading "#". Course colors are "#rrggbb". */
function argb(hex: string): string {
  const clean = hex.replace(/^#/, "");
  return clean.length === 6 ? `FF${clean.toUpperCase()}` : "FF6366F1";
}

/**
 * Build a colored two-sheet workbook from a computed exam plan and trigger a
 * browser download. No-ops (returns false) when the plan is empty so callers
 * can surface an honest "nothing to export yet" message.
 */
export async function exportExamPlanXlsx(
  plan: ExamPlanResult,
  opts: XlsxExportOptions = {},
): Promise<boolean> {
  const isHe = opts.isHe ?? true;
  const now = startOfDay(opts.now ?? new Date());

  if (!plan.exams.length) return false;

  // Dynamic import — keeps exceljs (~large) out of the initial bundle.
  // exceljs is CJS with named exports; grab .default when the bundler wraps it,
  // else the module namespace itself.
  const mod = await import("exceljs");
  const ExcelJS = (mod as unknown as { default?: typeof mod }).default ?? mod;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Pakamon";
  wb.created = new Date();

  const fmtDate = (d: Date) =>
    new Intl.DateTimeFormat(isHe ? "he-IL" : "en-US", {
      day: "numeric",
      month: "numeric",
      year: "numeric",
    }).format(d);

  // Sort exams by date once — both sheets share this order.
  const exams = plan.exams
    .slice()
    .sort((a, b) => a.examDate.getTime() - b.examDate.getTime());

  // sessions grouped by course → per-day hour totals, for the grid + block count.
  const sessionsByCourse = new Map<string, Map<string, number>>();
  let planStart = now;
  let planEnd = now;
  for (const e of exams) {
    if (e.examDate.getTime() > planEnd.getTime()) planEnd = startOfDay(e.examDate);
  }
  for (const s of plan.sessions) {
    const day = startOfDay(s.date);
    if (day.getTime() < planStart.getTime()) planStart = day;
    if (day.getTime() > planEnd.getTime()) planEnd = day;
    let m = sessionsByCourse.get(s.courseCode);
    if (!m) {
      m = new Map<string, number>();
      sessionsByCourse.set(s.courseCode, m);
    }
    const k = dayKey(day);
    m.set(k, (m.get(k) ?? 0) + s.hours);
  }

  // ─────────────────────────────────────────────────────────────────
  // Sheet 1 — the plan table
  // ─────────────────────────────────────────────────────────────────
  const table = wb.addWorksheet(isHe ? "תוכנית" : "Plan", {
    views: [{ rightToLeft: isHe }],
  });

  const headers = isHe
    ? ["מבחן", "תאריך", "מועד", "רמת-קושי", "שעות-לימוד", "מקטעי-הכנה"]
    : ["Exam", "Date", "Moed", "Difficulty", "Study hours", "Prep blocks"];

  const headerRow = table.addRow(headers);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF312E81" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = { bottom: { style: "thin", color: { argb: "FF1E1B4B" } } };
  });

  for (const e of exams) {
    const blocks = plan.sessions.filter((s) => s.courseCode === e.courseCode).length;
    const diff = DIFFICULTY_LABEL[e.difficulty] ?? { he: e.difficulty, en: e.difficulty };
    const row = table.addRow([
      e.courseName,
      fmtDate(e.examDate),
      isHe ? (e.moed === "A" ? "א׳" : "ב׳") : `Moed ${e.moed}`,
      isHe ? diff.he : diff.en,
      e.totalHours,
      blocks,
    ]);
    // Color-swatch the course name cell so the table's colors match the grid.
    const nameCell = row.getCell(1);
    nameCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(e.color) } };
    nameCell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
    row.eachCell((cell) => {
      cell.alignment = { vertical: "middle", horizontal: isHe ? "right" : "left" };
    });
  }

  table.columns.forEach((col, i) => {
    col.width = i === 0 ? 34 : 14;
  });
  table.getRow(1).height = 22;

  // ─────────────────────────────────────────────────────────────────
  // Sheet 2 — the day×course gantt grid
  // ─────────────────────────────────────────────────────────────────
  const grid = wb.addWorksheet(isHe ? "לוח-גאנט" : "Gantt", {
    views: [{ rightToLeft: isHe, state: "frozen", xSplit: 1, ySplit: 2 }],
  });

  const dayCount = Math.max(0, daysBetween(planStart, planEnd)) + 1;
  const days: Date[] = [];
  for (let i = 0; i < dayCount; i++) days.push(addDays(planStart, i));

  const weekdays = isHe ? HE_WEEKDAYS : EN_WEEKDAYS;

  // Header row 1: day-of-month numbers. Header row 2: weekday letters.
  const corner = isHe ? "מבחן \\ יום" : "Exam \\ Day";
  const numRow = grid.addRow([corner, ...days.map((d) => d.getDate())]);
  const dowRow = grid.addRow(["", ...days.map((d) => weekdays[d.getDay()] ?? "")]);

  const styleHeaderCell = (cell: Cell, weekend: boolean) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: weekend ? "FF4C1D95" : "FF312E81" },
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  };
  numRow.eachCell((cell, col) => {
    if (col === 1) {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E1B4B" } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    } else {
      const d = days[col - 2];
      styleHeaderCell(cell, d ? d.getDay() === 5 || d.getDay() === 6 : false);
    }
  });
  dowRow.eachCell((cell, col) => {
    if (col === 1) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E1B4B" } };
    } else {
      const d = days[col - 2];
      styleHeaderCell(cell, d ? d.getDay() === 5 || d.getDay() === 6 : false);
    }
  });

  const examDayByCourse = new Map<string, string>();
  for (const e of exams) examDayByCourse.set(e.courseCode, dayKey(e.examDate));

  for (const e of exams) {
    const perDay = sessionsByCourse.get(e.courseCode);
    const examKey = examDayByCourse.get(e.courseCode);
    const cells: (number | string)[] = [e.courseName];
    for (const d of days) {
      const k = dayKey(d);
      if (k === examKey) {
        cells.push(isHe ? "מבחן" : "EXAM");
      } else {
        const h = perDay?.get(k);
        cells.push(h ? h : "");
      }
    }
    const row = grid.addRow(cells);

    // Row label — course-colored swatch, matching the table sheet.
    const label = row.getCell(1);
    label.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(e.color) } };
    label.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    label.alignment = { vertical: "middle", horizontal: isHe ? "right" : "left" };

    row.eachCell((cell, col) => {
      if (col === 1) return;
      const d = days[col - 2];
      if (!d) return;
      const k = dayKey(d);
      if (k === examKey) {
        // Exam day — solid red, unmistakable.
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEF4444" } };
        cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
        cell.alignment = { vertical: "middle", horizontal: "center" };
      } else if (perDay?.get(k)) {
        // Study block — course color.
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(e.color) } };
        cell.font = { color: { argb: "FFFFFFFF" }, size: 10 };
        cell.alignment = { vertical: "middle", horizontal: "center" };
      }
    });
  }

  grid.getColumn(1).width = 30;
  for (let c = 2; c <= days.length + 1; c++) grid.getColumn(c).width = 4.5;
  grid.getRow(1).height = 18;
  grid.getRow(2).height = 16;

  // ─── serialize + trigger browser download ───
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = opts.filename ?? "pakamon-exam-plan.xlsx";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}
