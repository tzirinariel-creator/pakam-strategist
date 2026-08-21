// =========================================================================
// Which exam date to believe
// =========================================================================
// Ariel, 21.8: "לדעתי לא כל המבחנים שובצו.. אני רואה שאין מבחנים בסמסטר א׳
// שנה ב׳". He was right, and the cause was a precedence I had gotten exactly
// backwards.
//
// We hold two sources for a course's exam sittings:
//
//   · the SCRAPED CATALOG (Course.examDateA/B) — captured from תשפ״ו. Every
//     one of those dates is now in the past.
//   · the ידיעון BOARD (yedion-assessments.json) — תשפ״ז, the year actually
//     being planned.
//
// I had wired the ידיעון as a fallback "used only where our catalog has
// nothing". Since the planner drops any sitting already behind us, preferring
// the stale catalog meant the date was nulled and the course disappeared from
// the planner entirely — no message, no empty state, just a missing row. On a
// real 32-course plan, 22 of the 23 exam courses had a catalog date, all stale,
// so only ONE course survived. Whole semesters looked exam-free.
//
// A source covering the year being planned outranks a source covering the year
// before it. The student's own typed date still beats both, because they can
// see a notice board we cannot.

export interface ExamDateInputs {
  /** Our scraped catalog — currently תשפ״ו, i.e. last year. */
  catalogA: Date | null;
  catalogB: Date | null;
  /** The ידיעון's published board for תשפ״ז. */
  yedionA: Date | null;
  yedionB: Date | null;
  /** A date the student typed for this course, if any. */
  manual: Date | null;
}

export interface ResolvedExamDates {
  examDateA: Date | null;
  examDateB: Date | null;
  /** Where מועד א׳ came from — for telling the student what they're looking at. */
  sourceA: "yedion" | "catalog" | "manual" | null;
}

/** Keep a sitting only if it has not already happened. */
export function futureOnly(d: Date | null | undefined, now: Date): Date | null {
  if (!d) return null;
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  return d.getTime() >= midnight.getTime() ? d : null;
}

/**
 * Resolve a course's two sittings from every source we hold.
 *
 * Each candidate is filtered for being in the future FIRST, so a stale entry in
 * a higher-priority source can never mask a usable one below it — that masking
 * is the whole bug this function exists to prevent.
 */
export function resolveExamDates(inputs: ExamDateInputs, now: Date = new Date()): ResolvedExamDates {
  const f = (d: Date | null) => futureOnly(d, now);
  const yA = f(inputs.yedionA);
  const yB = f(inputs.yedionB);
  const cA = f(inputs.catalogA);
  const cB = f(inputs.catalogB);
  // A typed date is only consulted when nothing published applies — otherwise
  // an old manual entry would override a freshly published sitting.
  const manual = !yA && !yB && !cA && !cB ? f(inputs.manual) : null;

  const examDateA = yA ?? cA ?? manual;
  return {
    examDateA,
    examDateB: yB ?? cB,
    sourceA: examDateA == null ? null : yA ? "yedion" : cA ? "catalog" : "manual",
  };
}
