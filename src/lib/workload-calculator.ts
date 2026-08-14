// =========================================
// Workload — the honest three-number metric ONLY (P3′)
// =========================================
// The old 0-100 "magic score" engine (calculateWorkload + level colors) was
// deleted 11.7 after its last consumers migrated to calculateHonestLoad —
// the product principle: numbers the student can verify, never a prediction.

// =========================================
// Honest load metric (#2)
// =========================================
// Three FACTS the student can verify, not a black-box "level":
//   1. weeklyHours          — real contact hours summed from the timetable
//   2. credits              — ש״ס this semester
//   3. tightestExamGapDays  — smallest gap between two exam dates (exam density)
// `label` names the WORST of the three so the UI can lead with the real pain,
// never a prediction. No exam dates are invented — only dates we actually hold
// count; if fewer than two exams have a date, the gap is null (unknown, honest).

import { israelDayKeyMs, storedDateKeyMs } from "@/lib/civil-day";
import { durationHours } from "@/lib/time-of-day";

export type HonestLoadLabel =
  | "hours" // contact hours dominate
  | "credits" // credit weight dominates
  | "examCrunch" // exams are packed close together
  | "light"; // nothing stands out

export interface HonestLoadSession {
  dayOfWeek: string;
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  /** Both optional, and both only used to tell two meetings apart when
   *  de-duplicating. A lecture and a tutorial that genuinely sit at the same
   *  hour are a real clash and must BOTH be counted; two catalog rows for the
   *  one meeting must not. Omitting them is safe — it just makes the key
   *  coarser for callers that have no such collisions. */
  sessionType?: string;
  groupCode?: string | null;
}

export interface HonestLoadCourse {
  credits: number;
  /** Sessions actually on the grid this semester (already group-filtered). */
  sessions?: HonestLoadSession[];
  /** מועד א' date, if known. Null/undefined = unknown, excluded from density. */
  examDate?: Date | string | null;
}

export interface HonestLoadResult {
  weeklyHours: number; // rounded to 0.5
  credits: number;
  tightestExamGapDays: number | null; // null = fewer than 2 known exam dates
  label: HonestLoadLabel;
}



/**
 * Compute the honest three-number load for a semester's courses.
 * Pure and side-effect free; safe to call in a useMemo.
 */
export function calculateHonestLoad(
  courses: HonestLoadCourse[],
  now: number = Date.now(),
): HonestLoadResult {
  const credits = courses.reduce((sum, c) => sum + (c.credits || 0), 0);

  // De-duplicate before summing. The catalog holds true duplicate rows for a
  // handful of meetings (same course, day, hour, type and group under two row
  // ids), and the weekly grid already collapses them via dedupeMeetings — but
  // this function summed them raw. The result was the onboarding summary
  // announcing "8 שעות שבועיות" directly above a timetable showing 6, for the
  // same week (Ariel, 13.8). A student can only be in one place once, so one
  // meeting counts once, and the two surfaces now agree by construction.
  //
  // Keyed per COURSE, so two different courses meeting at the same hour still
  // both count — that is a clash, not a duplicate.
  let weeklyHours = 0;
  for (const c of courses) {
    const seen = new Set<string>();
    for (const s of c.sessions ?? []) {
      const key = [s.dayOfWeek, s.startTime, s.endTime, s.sessionType ?? "", s.groupCode ?? ""].join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      weeklyHours += durationHours(s.startTime, s.endTime);
    }
  }
  weeklyHours = Math.round(weeklyHours * 2) / 2;

  // Exam density — tightest gap between two KNOWN, FUTURE exam dates. Only future
  // dates count: Course.examDate is a single global field the sync overwrites with
  // the LAST-scraped period, so in July a FALL plan carries stale (now-past) SPRING
  // dates. Without this filter, two stale dates on the same day rounded to a false
  // "0-day exam crunch" for a plan whose real exams are months away / unpublished
  // (QA 13.7). Fewer than 2 future dates → gap is unknown (null), never 0.
  //
  // Counted in CIVIL days (lib/civil-day), not raw milliseconds. Exam dates are
  // date-only values stored at UTC midnight, so a raw `t >= nowMs` filter dropped
  // an exam the moment its own day began — on the morning of an exam the density
  // metric silently lost it, and with only one date left the gap fell back to
  // "unknown" (audit deferred-2, same class as the exam-countdown off-by-one).
  // Day keys also make the gap a whole number by construction instead of by
  // rounding a fraction.
  const todayKey = israelDayKeyMs(new Date(now));
  const examDayKeys = courses
    .map((c) => {
      if (!c.examDate) return null;
      const d = c.examDate instanceof Date ? c.examDate : new Date(c.examDate);
      return Number.isFinite(d.getTime()) ? storedDateKeyMs(d) : null;
    })
    .filter((k): k is number => k != null && k >= todayKey)
    .sort((a, b) => a - b);

  let tightestExamGapDays: number | null = null;
  if (examDayKeys.length >= 2) {
    const MS_PER_DAY = 86_400_000;
    let smallest = Infinity;
    for (let i = 1; i < examDayKeys.length; i++) {
      const gap = (examDayKeys[i]! - examDayKeys[i - 1]!) / MS_PER_DAY;
      if (gap < smallest) smallest = gap;
    }
    tightestExamGapDays = smallest;
  }

  // Label = the worst of the three. Thresholds are deliberately conservative:
  // an exam crunch (two exams ≤ 3 days apart) is the sharpest real pain, then
  // a heavy contact week (≥ 22h), then a heavy credit load (≥ 20 ש״ס).
  let label: HonestLoadLabel = "light";
  if (tightestExamGapDays != null && tightestExamGapDays <= 3) {
    label = "examCrunch";
  } else if (weeklyHours >= 22) {
    label = "hours";
  } else if (credits >= 20) {
    label = "credits";
  }

  return { weeklyHours, credits, tightestExamGapDays, label };
}
