// =========================================
// Study-plan export → CSV (Excel-friendly), zero-dependency
// =========================================
// The previous version handed Excel an HTML <table> with a `.xls` extension.
// Modern Excel (2016/2019/365) rejects that as "format and extension don't
// match — corrupted or unsafe", or renders the raw markup / garbles Hebrew —
// exactly the "מבולגן ושבור" report. A real CSV with a UTF-8 BOM opens cleanly
// in Excel with correct Hebrew, sorts/filters natively, and needs no library.
// Colors can't ride in a CSV; the colored Gantt still lives in-app.

export interface GanttTask {
  title: string;
  courseCode: string | null;
  courseLabel: string; // display label for the row (course name or "מטלות")
  date: Date; // the day this task sits on
  taskType: string; // study | assignment | exam | custom
  color: string | null;
  hours?: number | null;
}

const TYPE_LABEL_HE: Record<string, string> = {
  study: "לימוד",
  assignment: "מטלה",
  exam: "מבחן",
  custom: "אישי",
};
const TYPE_LABEL_EN: Record<string, string> = {
  study: "Study",
  assignment: "Assignment",
  exam: "Exam",
  custom: "Personal",
};

function weekday(d: Date, isHe: boolean): string {
  return (isHe
    ? ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"]
    : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"])[d.getDay()]!;
}

/** RFC-4180 cell escaping: quote when the value holds a comma/quote/newline. */
function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Build a clean, sortable CSV of the study plan — one row per task, ordered by
 * date. Columns: Date · Day · Course/track · Type · Detail · Hours. This is far
 * more useful in Excel than the old sparse date×course grid (the user can sort,
 * filter, and pivot).
 */
export function buildStudyPlanCsv(tasks: GanttTask[], isHe: boolean): string {
  const header = isHe
    ? ["תאריך", "יום", "קורס / מסלול", "סוג", "פירוט", "שעות"]
    : ["Date", "Day", "Course / track", "Type", "Detail", "Hours"];

  const typeLabel = (t: string) =>
    (isHe ? TYPE_LABEL_HE : TYPE_LABEL_EN)[t] ?? t;

  const sorted = tasks
    .slice()
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const rows: string[][] = [header];
  for (const t of sorted) {
    const d = new Date(t.date);
    rows.push([
      `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`,
      weekday(d, isHe),
      t.courseLabel,
      typeLabel(t.taskType),
      t.title,
      t.hours != null ? String(t.hours) : "",
    ]);
  }

  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}

/** Trigger a browser download of the study plan as a UTF-8 CSV. */
export function downloadGanttCsv(tasks: GanttTask[], isHe: boolean): void {
  const csv = buildStudyPlanCsv(tasks, isHe);
  // Leading BOM (﻿) makes Excel read the file as UTF-8 → correct Hebrew.
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = isHe ? "תוכנית-מבחנים.csv" : "exam-plan.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
