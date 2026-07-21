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
