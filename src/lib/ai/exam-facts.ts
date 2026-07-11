// =========================================================================
// Exam-period facts for the advisor's system prompt (#15). Builds the
// "## תקופת המבחנים" block from the student's saved StudyTask rows so the
// King/Referent can plan WITH the student instead of answering generically
// (which also used to run long and get cut — #36; the two bugs fed each
// other). Pure + unit-tested; returns null when there is no upcoming plan,
// keeping the prompt byte-identical to today for everyone else.
// =========================================================================

import { planFromStudyTasks, type StudyTaskLike } from "@/lib/plan-from-tasks";

export function buildExamPeriodBlock(
  tasks: StudyTaskLike[],
  now: Date = new Date(),
): string | null {
  // planFromStudyTasks already filters to FUTURE exams, decodes "[auto] Xh"
  // hours and Moed B from notes, and recovers course names — zero re-logic.
  const plan = planFromStudyTasks(tasks, new Map(), now);
  if (plan.exams.length === 0) return null;

  const fmt = (d: Date) => `${d.getDate()}.${d.getMonth() + 1}`;
  // Days-until anchors ("בעוד X ימים") — without them the LLM framed exams
  // 10-25 days out as "השבוע". Local-midnight diff, same as the skyline.
  const midnight = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  };
  const daysUntil = (d: Date) => Math.round((midnight(d) - midnight(now)) / 86400000);
  const untilLabel = (n: number) => (n === 0 ? "היום!" : n === 1 ? "מחר" : `בעוד ${n} ימים`);
  const exams = plan.exams
    .slice()
    .sort((a, b) => a.examDate.getTime() - b.examDate.getTime())
    .slice(0, 10)
    .map(
      (e) =>
        `  • ${e.courseName} — ${fmt(e.examDate)} (מועד ${e.moed === "B" ? "ב׳" : "א׳"}, ${untilLabel(daysUntil(e.examDate))}), ${e.totalHours} שעות לימוד מתוכננות`,
    )
    .join("\n");

  // Heaviest planned day (sum of session hours per local day).
  const byDay = new Map<string, number>();
  for (const s of plan.sessions) {
    const k = fmt(s.date);
    byDay.set(k, (byDay.get(k) ?? 0) + s.hours);
  }
  const peak = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0];

  return `

## תקופת המבחנים של הסטודנט (מתוך תוכנית-הלימוד השמורה באפליקציה — מקור-אמת, אל תמציא תאריכים):
${exams}
  סה"כ מפגשי-לימוד מתוכננים: ${plan.sessions.length}${peak ? ` · היום העמוס ביותר: ${peak[0]} (${peak[1]} שעות)` : ""}

כלל לשאלות תכנון-מבחנים (גובר על "אל תשאל הבהרות" לנושא הזה בלבד): פתח במשפט אחד שמשקף את המצב מהנתונים שלמעלה, שאל שאלה ממוקדת אחת (יום חסום? עבודה? קורס שמדאיג?) — ורק אחרי התשובה תן המלצה קונקרטית אחת. אם אין כאן תוכנית — הפנה למסך "מבחנים" לבנות אחת.`;
}
