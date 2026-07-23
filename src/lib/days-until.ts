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

/** A course row carrying the two possible exam sittings + its status. */
interface ExamCourseLike {
  status: string;
  course: {
    nameHe: string;
    nameEn?: string | null;
    examDateA: Date | string | null;
    examDateB: Date | string | null;
  };
}

/**
 * The nearest FUTURE exam across a plan, in CIVIL days — the single source the
 * dashboard time-focus, the exam-countdown list, AND the King's greeting all use
 * so they can never show two different countdowns for the same exam (audit 22.7).
 * Both "today" and the exam are normalized to UTC-midnight before the diff
 * (exam dates are stored at UTC-midnight; a raw ms-ceil inflated the count by a
 * day near the time-of-day boundary). COMPLETED/FAILED courses are skipped.
 */
export function nearestUpcomingExam(
  courses: ExamCourseLike[],
  now: Date = new Date(),
): { nameHe: string; nameEn: string | null; days: number } | null {
  const nowMs = now.getTime();
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let best: { nameHe: string; nameEn: string | null; ms: number } | null = null;
  for (const uc of courses) {
    if (uc.status === "COMPLETED" || uc.status === "FAILED") continue;
    for (const d of [uc.course.examDateA, uc.course.examDateB]) {
      if (!d) continue;
      const t = new Date(d).getTime();
      if (t >= nowMs && (best == null || t < best.ms)) {
        best = { nameHe: uc.course.nameHe, nameEn: uc.course.nameEn ?? null, ms: t };
      }
    }
  }
  if (!best) return null;
  const e = new Date(best.ms);
  const examUTC = Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate());
  return { nameHe: best.nameHe, nameEn: best.nameEn, days: Math.round((examUTC - todayUTC) / 86_400_000) };
}
