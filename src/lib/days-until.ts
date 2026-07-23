/**
 * Grammatical "in N days" countdown for both languages — never the ungrammatical
 * "בעוד 1 ימים" / "in 1 days" near a boundary (audit 22.7).
 *   0 → today · 1 → in a day · 2 → in two days (Hebrew nicety) · else → in N days
 * The honest number is preserved; only the grammar around it changes.
 */
export function daysUntilLabel(days: number, isHe: boolean): string {
  if (isHe) {
    if (days <= 0) return "היום";
    if (days === 1) return "בעוד יום";
    if (days === 2) return "בעוד יומיים";
    return `בעוד ${days} ימים`;
  }
  if (days <= 0) return "today";
  if (days === 1) return "in 1 day";
  return `in ${days} days`;
}

/** A course row carrying the two possible exam sittings + its status/grade. */
interface ExamCourseLike {
  status: string;
  grade?: number | null;
  course: {
    nameHe: string;
    nameEn?: string | null;
    examDateA: Date | string | null;
    examDateB: Date | string | null;
  };
}

/**
 * The nearest upcoming exam across a plan, in CIVIL days — the single source the
 * dashboard time-focus, the exam-countdown list, AND the King's greeting all use
 * so they can never show two different countdowns for the same exam (audit 22.7).
 *
 * Two things MUST match the exam-countdown list (schedule.getExamSchedule /
 * exam-countdown.tsx) or the greeting silently disagrees with it:
 *   1. Exclusion — only a COMPLETED course WITH a grade is done. A FAILED course
 *      still has its Moed-B retake ahead (dropping it hid the countdown exactly
 *      when it's most urgent); a completed-without-grade is still pending.
 *   2. "Upcoming" is a CIVIL-day test (examUTC >= todayUTC), not a raw-ms one —
 *      exam dates are stored at UTC-midnight, so on the exam morning a raw
 *      `t >= nowMs` treated it as PAST while the list showed "היום/Today".
 */
export function nearestUpcomingExam(
  courses: ExamCourseLike[],
  now: Date = new Date(),
): { nameHe: string; nameEn: string | null; days: number } | null {
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let best: { nameHe: string; nameEn: string | null; examUTC: number } | null = null;
  for (const uc of courses) {
    // Done = completed WITH a grade (mirrors schedule.ts's NOT filter).
    if (uc.status === "COMPLETED" && uc.grade != null) continue;
    for (const d of [uc.course.examDateA, uc.course.examDateB]) {
      if (!d) continue;
      const e = new Date(d);
      const examUTC = Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate());
      if (examUTC >= todayUTC && (best == null || examUTC < best.examUTC)) {
        best = { nameHe: uc.course.nameHe, nameEn: uc.course.nameEn ?? null, examUTC };
      }
    }
  }
  if (!best) return null;
  return { nameHe: best.nameHe, nameEn: best.nameEn, days: Math.round((best.examUTC - todayUTC) / 86_400_000) };
}
