// =========================================
// Colored exam-plan Excel (.xlsx) export — notes #15 / #34
// =========================================
// Real xlsx (not the old faux-CSV) built with exceljs. THREE sheets:
//   (1) "תוכנית" — title + totals banner, then a flat table: exam, date,
//       days-left, moed, difficulty, budgeted hours, prep-block count.
//   (2) "לוח-גאנט" — a day×course grid: rows = exams/courses, columns =
//       calendar days (today → last exam). Study cells are tinted by
//       intensity (more hours = deeper course color), exam day is solid red,
//       weekends are shaded, TODAY's column is marked, and both a per-course
//       total column and a per-day total row (with crunch-day highlighting)
//       close the grid.
//   (3) "אג'נדה" — a printable chronological checklist: one row per study
//       block, day-header rows between dates, a ☐ column to tick off.
//
// HONESTY-FIRST: this exports EXACTLY the plan the UI already shows
// (the persisted tasks / generateExamPlan result). It invents no dates and
// no sessions of its own — it only renders what's in `plan`.
//
// exceljs is heavy; it is imported DYNAMICALLY inside the export function so
// it stays out of the initial bundle.

import type { ExamPlanResult } from "./exam-planner";
import type { Workbook, Worksheet, Cell } from "exceljs";

export interface XlsxExportOptions {
  isHe?: boolean;
  /** Injectable "today" for tests / determinism. Defaults to new Date(). */
  now?: Date;
  filename?: string;
  /** Student's name for a personal banner ("תקופת המבחנים של אריאל צירין"). */
  studentName?: string | null;
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
const HE_WEEKDAYS_FULL = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const EN_WEEKDAYS_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const DIFFICULTY_LABEL: Record<string, { he: string; en: string }> = {
  high: { he: "גבוה", en: "High" },
  medium: { he: "בינוני", en: "Medium" },
  low: { he: "נמוך", en: "Low" },
};

// ─── color helpers ───────────────────────────────────────────────────

/** exceljs wants ARGB hex without the leading "#". Course colors are "#rrggbb". */
function argb(hex: string): string {
  const clean = hex.replace(/^#/, "");
  return clean.length === 6 ? `FF${clean.toUpperCase()}` : "FF6366F1";
}

/** Blend a course color toward white — 0 = untouched, 1 = white. Used to tint
 *  study cells by intensity so a 1h touch-up reads lighter than a 4h grind. */
function tintArgb(hex: string, towardWhite: number): string {
  const clean = hex.replace(/^#/, "");
  if (clean.length !== 6) return "FF6366F1";
  const mix = (c: number) => Math.round(c + (255 - c) * towardWhite);
  const r = mix(parseInt(clean.slice(0, 2), 16));
  const g = mix(parseInt(clean.slice(2, 4), 16));
  const b = mix(parseInt(clean.slice(4, 6), 16));
  const h = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();
  return `FF${h(r)}${h(g)}${h(b)}`;
}

/** White text on the full color, dark text on light tints. */
function tintFont(towardWhite: number): string {
  return towardWhite > 0.45 ? "FF1E1B4B" : "FFFFFFFF";
}

const INK = "FF1E1B4B"; // deep indigo — headers
const HEAD = "FF312E81";
const HEAD_WEEKEND = "FF4C1D95";
const EXAM_RED = "FFEF4444";
const WEEKEND_WASH = "FFF1F0FB";
const TODAY_GOLD = "FFF59E0B";
const CRUNCH_AMBER = "FFFDE68A";
const CRUNCH_RED = "FFFECACA";

/** Intensity → how far toward white the course color is washed. */
function intensityTint(hours: number): number {
  if (hours >= 4) return 0; // full color
  if (hours >= 2.5) return 0.2;
  if (hours >= 1.5) return 0.45;
  return 0.65; // a light touch-up
}

// ─── workbook builder (pure — unit-testable in node) ─────────────────

export interface BuiltPlanWorkbook {
  wb: Workbook;
  /** Grid geometry the tests assert against. */
  meta: {
    dayCount: number;
    todayCol: number | null;
    totalHours: number;
  };
}

export async function buildExamPlanWorkbook(
  plan: ExamPlanResult,
  opts: XlsxExportOptions = {},
): Promise<BuiltPlanWorkbook | null> {
  const isHe = opts.isHe ?? true;
  const now = startOfDay(opts.now ?? new Date());

  if (!plan.exams.length) return null;

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

  // Sort exams by date once — all sheets share this order.
  const exams = plan.exams
    .slice()
    .sort((a, b) => a.examDate.getTime() - b.examDate.getTime());

  // sessions grouped by course → per-day hour totals, for the grid + agenda.
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

  const grandTotalHours = plan.sessions.reduce((sum, s) => sum + s.hours, 0);

  // ─────────────────────────────────────────────────────────────────
  // Sheet 1 — the plan table (with a title/totals banner)
  // ─────────────────────────────────────────────────────────────────
  const table = wb.addWorksheet(isHe ? "תוכנית" : "Plan", {
    views: [{ rightToLeft: isHe }],
  });

  const COLS = 7;

  // Banner rows: title + subtitle. Merged across the table width.
  const studentName = opts.studentName?.trim();
  const title = table.addRow([
    isHe
      ? studentName
        ? `תקופת המבחנים של ${studentName} — פכמון`
        : "תקופת המבחנים שלי — פכמון"
      : studentName
        ? `${studentName}'s exam period — Pakamon`
        : "My exam period — Pakamon",
  ]);
  table.mergeCells(1, 1, 1, COLS);
  title.height = 30;
  const titleCell = title.getCell(1);
  titleCell.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INK } };
  titleCell.alignment = { vertical: "middle", horizontal: isHe ? "right" : "left", indent: 1 };

  const sub = table.addRow([
    isHe
      ? `${exams.length} מבחנים · ${grandTotalHours} שעות לימוד · הופק ${fmtDate(now)} · ${fmtDate(planStart)}–${fmtDate(planEnd)}`
      : `${exams.length} exams · ${grandTotalHours} study hours · generated ${fmtDate(now)} · ${fmtDate(planStart)}–${fmtDate(planEnd)}`,
  ]);
  table.mergeCells(2, 1, 2, COLS);
  sub.height = 18;
  const subCell = sub.getCell(1);
  subCell.font = { size: 11, color: { argb: "FFE0E7FF" } };
  subCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEAD } };
  subCell.alignment = { vertical: "middle", horizontal: isHe ? "right" : "left", indent: 1 };

  table.addRow([]); // breathing room

  const headers = isHe
    ? ["מבחן", "תאריך", "עוד כמה ימים", "מועד", "רמת-קושי", "שעות-לימוד", "מקטעי-הכנה"]
    : ["Exam", "Date", "Days left", "Moed", "Difficulty", "Study hours", "Prep blocks"];

  const headerRow = table.addRow(headers);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEAD } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = { bottom: { style: "thin", color: { argb: INK } } };
  });

  for (const e of exams) {
    const blocks = plan.sessions.filter((s) => s.courseCode === e.courseCode).length;
    const diff = DIFFICULTY_LABEL[e.difficulty] ?? { he: e.difficulty, en: e.difficulty };
    const daysLeft = daysBetween(now, e.examDate);
    const row = table.addRow([
      e.courseName,
      fmtDate(e.examDate),
      daysLeft >= 0 ? daysLeft : (isHe ? "עבר" : "past"),
      isHe ? (e.moed === "A" ? "א׳" : "ב׳") : `Moed ${e.moed}`,
      isHe ? diff.he : diff.en,
      e.totalHours,
      blocks,
    ]);
    // Color-swatch the course name cell so the table's colors match the grid.
    const nameCell = row.getCell(1);
    nameCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(e.color) } };
    nameCell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
    row.eachCell((cell, col) => {
      cell.alignment = {
        vertical: "middle",
        horizontal: col === 1 ? (isHe ? "right" : "left") : "center",
      };
    });
    // An exam in ≤3 days gets a red days-left cell — the eye lands there first.
    if (daysLeft >= 0 && daysLeft <= 3) {
      const urgent = row.getCell(3);
      urgent.font = { bold: true, color: { argb: "FFB91C1C" } };
      urgent.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CRUNCH_RED } };
    }
  }

  table.columns.forEach((col, i) => {
    col.width = i === 0 ? 34 : 14;
  });
  table.getRow(4).height = 22;

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
  const todayIdx = days.findIndex((d) => dayKey(d) === dayKey(now));
  const todayCol = todayIdx >= 0 ? todayIdx + 2 : null;
  const totalColIdx = days.length + 2; // per-course totals, after the last day

  // Header row 1: day-of-month numbers. Header row 2: weekday letters.
  const corner = isHe ? "מבחן \\ יום" : "Exam \\ Day";
  const numRow = grid.addRow([
    corner,
    ...days.map((d) => d.getDate()),
    isHe ? "סה״כ" : "Total",
  ]);
  const dowRow = grid.addRow([
    "",
    ...days.map((d, i) => (i === todayIdx ? (isHe ? "היום" : "now") : weekdays[d.getDay()] ?? "")),
    "",
  ]);

  const styleHeaderCell = (cell: Cell, weekend: boolean, today: boolean) => {
    cell.font = { bold: true, color: { argb: today ? INK : "FFFFFFFF" }, size: 11 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: today ? TODAY_GOLD : weekend ? HEAD_WEEKEND : HEAD },
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  };
  const styleCorner = (cell: Cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INK } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  };
  numRow.eachCell((cell, col) => {
    if (col === 1 || col === totalColIdx) {
      styleCorner(cell);
    } else {
      const d = days[col - 2];
      styleHeaderCell(cell, d ? d.getDay() === 5 || d.getDay() === 6 : false, col === todayCol);
    }
  });
  dowRow.eachCell((cell, col) => {
    if (col === 1 || col === totalColIdx) {
      styleCorner(cell);
    } else {
      const d = days[col - 2];
      styleHeaderCell(cell, d ? d.getDay() === 5 || d.getDay() === 6 : false, col === todayCol);
    }
  });

  const examDayByCourse = new Map<string, string>();
  for (const e of exams) examDayByCourse.set(e.courseCode, dayKey(e.examDate));

  // Per-day totals accumulate while we lay the course rows.
  const dayTotals = new Array<number>(days.length).fill(0);

  for (const e of exams) {
    const perDay = sessionsByCourse.get(e.courseCode);
    const examKey = examDayByCourse.get(e.courseCode);
    let courseTotal = 0;
    const cells: (number | string)[] = [e.courseName];
    days.forEach((d, i) => {
      const k = dayKey(d);
      if (k === examKey) {
        cells.push(isHe ? "מבחן" : "EXAM");
      } else {
        const h = perDay?.get(k);
        if (h) {
          courseTotal += h;
          dayTotals[i] = (dayTotals[i] ?? 0) + h;
        }
        cells.push(h ? h : "");
      }
    });
    cells.push(courseTotal);
    const row = grid.addRow(cells);

    // Row label — course-colored swatch, matching the table sheet.
    const label = row.getCell(1);
    label.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(e.color) } };
    label.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    label.alignment = { vertical: "middle", horizontal: isHe ? "right" : "left" };

    const totalCell = row.getCell(totalColIdx);
    totalCell.font = { bold: true, color: { argb: INK }, size: 10 };
    totalCell.alignment = { vertical: "middle", horizontal: "center" };
    totalCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E7FF" } };

    row.eachCell((cell, col) => {
      if (col === 1 || col === totalColIdx) return;
      const d = days[col - 2];
      if (!d) return;
      const k = dayKey(d);
      const isWeekend = d.getDay() === 5 || d.getDay() === 6;
      if (k === examKey) {
        // Exam day — solid red, unmistakable.
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EXAM_RED } };
        cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
        cell.alignment = { vertical: "middle", horizontal: "center" };
      } else {
        const h = perDay?.get(k);
        if (h) {
          // Study block — course color, tinted by intensity (hours).
          const t = intensityTint(h);
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: tintArgb(e.color, t) } };
          cell.font = { color: { argb: tintFont(t) }, size: 10, bold: h >= 4 };
          cell.alignment = { vertical: "middle", horizontal: "center" };
        } else if (isWeekend) {
          // Weekend wash keeps the rhythm of the calendar readable.
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WEEKEND_WASH } };
        }
        if (col === todayCol) {
          // A golden "you are here" seam on both sides of today's column.
          cell.border = {
            ...cell.border,
            left: { style: "medium", color: { argb: TODAY_GOLD } },
            right: { style: "medium", color: { argb: TODAY_GOLD } },
          };
        }
      }
    });
  }

  // Bottom row — total hours per day, crunch days highlighted so the student
  // SEES the overloaded day before it happens.
  const totalsRow = grid.addRow([
    isHe ? "סה״כ ליום" : "Daily total",
    ...dayTotals.map((h) => (h > 0 ? h : "")),
    grandTotalHours,
  ]);
  totalsRow.eachCell((cell, col) => {
    cell.font = { bold: true, color: { argb: INK }, size: 10 };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    if (col === 1) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E7FF" } };
      cell.alignment = { vertical: "middle", horizontal: isHe ? "right" : "left" };
      return;
    }
    const h = col === totalColIdx ? 0 : dayTotals[col - 2] ?? 0;
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: {
        argb: col === totalColIdx ? "FFE0E7FF" : h >= 7 ? CRUNCH_RED : h >= 5 ? CRUNCH_AMBER : "FFF8FAFC",
      },
    };
  });

  grid.getColumn(1).width = 30;
  for (let c = 2; c <= days.length + 1; c++) grid.getColumn(c).width = 4.5;
  grid.getColumn(totalColIdx).width = 8;
  grid.getRow(1).height = 18;
  grid.getRow(2).height = 16;

  // ─────────────────────────────────────────────────────────────────
  // Sheet 3 — the printable agenda checklist
  // ─────────────────────────────────────────────────────────────────
  const agenda = wb.addWorksheet(isHe ? "אג'נדה" : "Agenda", {
    views: [{ rightToLeft: isHe }],
  });

  const aHeaders = isHe
    ? ["✓", "תאריך", "יום", "קורס", "שעות"]
    : ["✓", "Date", "Day", "Course", "Hours"];
  const aHead = agenda.addRow(aHeaders);
  aHead.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEAD } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });

  const colorByCourse = new Map(exams.map((e) => [e.courseCode, e.color]));
  const nameByCourse = new Map(exams.map((e) => [e.courseCode, e.courseName]));
  const weekdaysFull = isHe ? HE_WEEKDAYS_FULL : EN_WEEKDAYS_FULL;

  // One agenda line per (day, course) with summed hours; exam days become
  // bold red marker rows. Chronological.
  type AgendaLine = { date: Date; courseCode: string; hours: number; exam: boolean };
  const lines: AgendaLine[] = [];
  for (const [code, perDay] of sessionsByCourse) {
    for (const [k, hours] of perDay) {
      const [y, m, d] = k.split("-").map(Number);
      lines.push({ date: new Date(y!, (m ?? 1) - 1, d ?? 1), courseCode: code, hours, exam: false });
    }
  }
  for (const e of exams) {
    lines.push({ date: startOfDay(e.examDate), courseCode: e.courseCode, hours: 0, exam: true });
  }
  lines.sort((a, b) => a.date.getTime() - b.date.getTime() || (a.exam ? 1 : 0) - (b.exam ? 1 : 0));

  let lastKey = "";
  for (const line of lines) {
    const k = dayKey(line.date);
    const isNewDay = k !== lastKey;
    lastKey = k;
    const name = nameByCourse.get(line.courseCode) ?? line.courseCode;
    const row = agenda.addRow([
      line.exam ? "" : "☐",
      isNewDay ? fmtDate(line.date) : "",
      isNewDay ? weekdaysFull[line.date.getDay()] ?? "" : "",
      line.exam ? (isHe ? `🎓 מבחן: ${name}` : `🎓 EXAM: ${name}`) : name,
      line.exam ? "" : line.hours,
    ]);
    const nameCell = row.getCell(4);
    if (line.exam) {
      row.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFB91C1C" }, size: 11 };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CRUNCH_RED } };
      });
    } else {
      // A colored swatch bar on the course cell keeps the palette consistent.
      const color = colorByCourse.get(line.courseCode);
      if (color) {
        nameCell.border = {
          ...(nameCell.border ?? {}),
          [isHe ? "right" : "left"]: { style: "thick", color: { argb: argb(color) } },
        };
      }
    }
    if (isNewDay) {
      row.eachCell((cell) => {
        cell.border = { ...(cell.border ?? {}), top: { style: "thin", color: { argb: "FFC7D2FE" } } };
      });
    }
    row.getCell(1).alignment = { vertical: "middle", horizontal: "center" };
    row.getCell(5).alignment = { vertical: "middle", horizontal: "center" };
  }

  agenda.getColumn(1).width = 5;
  agenda.getColumn(2).width = 12;
  agenda.getColumn(3).width = 10;
  agenda.getColumn(4).width = 38;
  agenda.getColumn(5).width = 8;

  return {
    wb,
    meta: { dayCount, todayCol, totalHours: grandTotalHours },
  };
}

// ─── browser wrapper: build + trigger download ───────────────────────

/**
 * Build the colored three-sheet workbook from a computed exam plan and trigger
 * a browser download. No-ops (returns false) when the plan is empty so callers
 * can surface an honest "nothing to export yet" message.
 */
export async function exportExamPlanXlsx(
  plan: ExamPlanResult,
  opts: XlsxExportOptions = {},
): Promise<boolean> {
  const built = await buildExamPlanWorkbook(plan, opts);
  if (!built) return false;

  const now = startOfDay(opts.now ?? new Date());
  const stamp = dayKey(now);

  const buffer = await built.wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = opts.filename ?? `pakamon-exam-plan-${stamp}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}
