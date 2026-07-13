// =========================================
// Colored exam-plan Excel (.xlsx) export — notes #15 / #34
// =========================================
// Real xlsx (not the old faux-CSV) built with exceljs. THREE sheets:
//   (1) "תוכנית" — title + totals banner, then a flat table: exam, date,
//       days-left, moed, difficulty, budgeted hours, prep-block count.
//   (2) [dropped 18:19 — was a messy duplicate of the weekly grid]
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

import type { ExamPlanResult, StudySession } from "./exam-planner";
import type { Workbook } from "exceljs";

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

const INK = "FF1E1B4B"; // deep indigo — headers

/**
 * 18:19 (#5) — a SHORT course name for the weekly grid. The full nameHe
 * ("מיקרו כלכלה והחלטות כלכליות + תרגיל") blew up the column. Strip trailing
 * noise (tutorial/lecture tails, parentheticals, "שיעור יסוד:" prefixes),
 * then cap at a word boundary while KEEPING a distinctive prefix.
 */
export function shortCourseName(name: string, max = 22): string {
  let s = name
    .replace(/\s*[+＋]\s*(תרגיל|תרגול|מעבדה|סמינר).*$/u, "")
    .replace(/\s*[-–—]\s*(שיעור המשך|תרגיל|תרגול|מעבדה).*$/u, "")
    .replace(/\s*\([^)]*\)\s*/gu, " ")
    .replace(/^(שיעור יסוד|קורס יסוד|מבוא כללי)\s*[:־-]\s*/u, "")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  s = (lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut).trim();
  return s + "…";
}

/** Mix a 6-hex color with white (t=0 → color, t=1 → white) for soft tints. */
function mixWithWhite(hex6: string, t: number): string {
  const n = parseInt(hex6, 16);
  const r = Math.round(((n >> 16) & 255) * (1 - t) + 255 * t);
  const g = Math.round(((n >> 8) & 255) * (1 - t) + 255 * t);
  const b = Math.round((n & 255) * (1 - t) + 255 * t);
  return [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();
}
const HEAD = "FF312E81";
const CRUNCH_RED = "FFFECACA";

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
  // Sheet 1 (#35/#36, 12.7) — the weekly CALENDAR grid. Modeled on how
  // students actually plan on paper: days as columns, a block per week,
  // each cell names what you study that day, exam days highlighted.
  // ─────────────────────────────────────────────────────────────────
  {
    const cal = wb.addWorksheet(isHe ? "לוח שבועי" : "Weekly grid", {
      views: [{ rightToLeft: isHe }],
    });
    const DAY_NAMES = isHe
      ? ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"]
      : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    cal.columns = DAY_NAMES.map(() => ({ width: 22 }));

    // Range: from the week containing today (or the first session) to the
    // week of the last exam.
    const sessByDay = new Map<string, StudySession[]>();
    for (const sess of plan.sessions) {
      const k = dayKey(startOfDay(sess.date));
      const list = sessByDay.get(k);
      if (list) list.push(sess);
      else sessByDay.set(k, [sess]);
    }
    const examByDay = new Map<string, { name: string; moed: "A" | "B"; color: string }[]>();
    for (const ex of plan.exams) {
      const k = dayKey(startOfDay(ex.examDate));
      const list = examByDay.get(k);
      const item = { name: ex.courseName, moed: ex.moed, color: ex.color };
      if (list) list.push(item);
      else examByDay.set(k, [item]);
    }
    const firstSession = plan.sessions.length
      ? plan.sessions.reduce((min, sess) => (sess.date < min ? sess.date : min), plan.sessions[0]!.date)
      : now;
    const rangeStart = startOfDay(new Date(Math.min(now.getTime(), startOfDay(firstSession).getTime())));
    const lastExam = plan.exams.reduce(
      (max, ex) => (ex.examDate > max ? ex.examDate : max),
      plan.exams[0]!.examDate,
    );
    // Snap to the containing week (Sunday) and cap at ~10 weeks for sanity.
    const weekStart = addDays(rangeStart, -rangeStart.getDay());
    const totalDays = Math.min(
      70,
      Math.ceil((startOfDay(lastExam).getTime() - weekStart.getTime()) / 86_400_000) + 1,
    );
    const weeks = Math.ceil(totalDays / 7);

    // Header: day names.
    const head = cal.addRow(DAY_NAMES);
    head.height = 22;
    head.eachCell((c) => {
      c.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INK } };
      c.alignment = { horizontal: "center", vertical: "middle" };
    });

    for (let w = 0; w < weeks; w++) {
      // Date row (small, gray) + content row (what you study).
      const dates: string[] = [];
      const contents: string[] = [];
      const cellMeta: { exam: boolean; color?: string; today: boolean }[] = [];
      for (let d = 0; d < 7; d++) {
        const day = addDays(weekStart, w * 7 + d);
        const k = dayKey(day);
        const exams = examByDay.get(k) ?? [];
        const sessions = sessByDay.get(k) ?? [];
        const parts: string[] = [];
        for (const ex of exams) {
          parts.push(isHe ? `📝 ${shortCourseName(ex.name)} — מועד ${ex.moed === "A" ? "א׳" : "ב׳"}` : `📝 ${shortCourseName(ex.name)} — Moed ${ex.moed}`);
        }
        // 18:19 (#5) — SHORT names (the full nameHe blew up the column) and NO
        // per-session "(2.5 ש׳)" clutter; the day's total hours go on the date
        // row instead, which is the real load signal.
        for (const sess of sessions) {
          parts.push(shortCourseName(sess.courseName));
        }
        const dayHours = sessions.reduce((s, x) => s + x.hours, 0);
        dates.push(dayHours > 0 ? `${fmtDate(day)} · ${dayHours} ${isHe ? "ש׳" : "h"}` : fmtDate(day));
        contents.push(parts.join("\n"));
        cellMeta.push({
          exam: exams.length > 0,
          color: exams[0]?.color ?? sessions[0]?.color,
          today: k === dayKey(now),
        });
      }
      const dateRow = cal.addRow(dates);
      dateRow.height = 14;
      dateRow.eachCell((c, col) => {
        c.font = { size: 9, color: { argb: cellMeta[col - 1]?.today ? "FF92400E" : "FF9CA3AF" }, bold: !!cellMeta[col - 1]?.today };
        c.alignment = { horizontal: isHe ? "right" : "left" };
        if (cellMeta[col - 1]?.today) {
          c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
        }
      });
      const contentRow = cal.addRow(contents);
      contentRow.height = 44;
      contentRow.eachCell((c, col) => {
        const meta = cellMeta[col - 1];
        c.alignment = { wrapText: true, vertical: "top", horizontal: isHe ? "right" : "left" };
        c.font = { size: 10, bold: !!meta?.exam };
        c.border = { bottom: { style: "thin", color: { argb: "FFE5E7EB" } } };
        if (meta?.exam && meta.color) {
          c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + meta.color.slice(1).toUpperCase() + "" } };
          c.font = { size: 10, bold: true, color: { argb: "FFFFFFFF" } };
        } else if (meta?.color && c.value) {
          const hex = meta.color.slice(1).toUpperCase();
          c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + mixWithWhite(hex, 0.85) } };
        }
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Sheet 2 — the plan table (with a title/totals banner)
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

  // 18:19 (#5) — the separate gantt sheet was dropped (a messy duplicate of
  // the weekly grid). dayCount/todayCol are still computed for the meta.
  const dayCount = Math.max(0, daysBetween(planStart, planEnd)) + 1;
  const days: Date[] = [];
  for (let i = 0; i < dayCount; i++) days.push(addDays(planStart, i));
  const todayIdx = days.findIndex((d) => dayKey(d) === dayKey(now));
  const todayCol = todayIdx >= 0 ? todayIdx + 2 : null;

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
