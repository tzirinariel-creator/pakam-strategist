import type { ComponentType } from "react";
import { GraduationCap, BookOpen, Briefcase } from "lucide-react";

export type Moed = "A" | "B";
export type StudyTask = { id: string; title: string; startDate: string | Date; endDate: string | Date; taskType: string; courseCode: string | null; color: string | null; notes: string | null; completed: boolean };

export const TYPE_META: Record<string, { he: string; en: string; icon: ComponentType<{ className?: string }> }> = {
  exam: { he: "מבחן", en: "Exam", icon: GraduationCap },
  study: { he: "לימוד", en: "Study", icon: BookOpen },
  assignment: { he: "מטלה", en: "Assignment", icon: BookOpen },
  custom: { he: "אישי", en: "Personal", icon: Briefcase },
};

/** Hours a study session is worth — stored in `notes` as "2.5h" by the planner. */
export function taskHours(t: StudyTask): number | null {
  if (!t.notes) return null;
  const m = t.notes.match(/([\d.]+)h/);
  return m ? Number(m[1]) || null : null;
}

/** Local YYYY-MM-DD key (never UTC) so an all-day exam at local midnight doesn't
 *  roll to the previous day for an Israel (UTC+2/+3) user. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** מקטע בלוח השבועי: שבוע שמצוייר, או רצף שבועות ריקים שמתקפל לשורה אחת. */
export type WeekSegment =
  | { kind: "week"; w: number }
  | { kind: "gap"; from: number; to: number };

/**
 * M44 — מקפל רצפים של שבועות ריקים לגמרי.
 *
 * אריאל, שלוש פעמים: *"ושוב לוח מבחנים בלתי נגמר"*. הצילום שלו הראה
 * שבועות מ-30.8 ועד 24.10 שכולם תאי "+ לימוד" ותו לא. הצמדת ההתחלה
 * לתוכנית טיפלה בקצה; זה מטפל באמצע.
 *
 * `minRun` = 2 בכוונה: שורת-קיפול לשבוע ריק **בודד** אינה קצרה מהשורה
 * שהיא מחליפה, והיא מוסיפה קליק. הקיפול קיים בשביל הפער האמיתי.
 */
export function planWeekSegments(weeks: number, weekHasContent: (w: number) => boolean, minRun = 2): WeekSegment[] {
  const out: WeekSegment[] = [];
  for (let w = 0; w < weeks; ) {
    if (weekHasContent(w)) { out.push({ kind: "week", w }); w += 1; continue; }
    let end = w;
    while (end + 1 < weeks && !weekHasContent(end + 1)) end += 1;
    if (end - w + 1 >= minRun) { out.push({ kind: "gap", from: w, to: end }); w = end + 1; }
    else { out.push({ kind: "week", w }); w += 1; }
  }
  return out;
}
