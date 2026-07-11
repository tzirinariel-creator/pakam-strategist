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

export type HonestLoadLabel =
  | "hours" // contact hours dominate
  | "credits" // credit weight dominates
  | "examCrunch" // exams are packed close together
  | "light"; // nothing stands out

export interface HonestLoadSession {
  dayOfWeek: string;
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
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

function sessionHours(s: HonestLoadSession): number {
  const [sh, sm] = s.startTime.split(":");
  const [eh, em] = s.endTime.split(":");
  const start = parseInt(sh ?? "0", 10) + parseInt(sm ?? "0", 10) / 60;
  const end = parseInt(eh ?? "0", 10) + parseInt(em ?? "0", 10) / 60;
  const diff = end - start;
  return Number.isFinite(diff) && diff > 0 ? diff : 0;
}

/**
 * Compute the honest three-number load for a semester's courses.
 * Pure and side-effect free; safe to call in a useMemo.
 */
export function calculateHonestLoad(
  courses: HonestLoadCourse[],
): HonestLoadResult {
  const credits = courses.reduce((sum, c) => sum + (c.credits || 0), 0);

  let weeklyHours = 0;
  for (const c of courses) {
    for (const s of c.sessions ?? []) {
      weeklyHours += sessionHours(s);
    }
  }
  weeklyHours = Math.round(weeklyHours * 2) / 2;

  // Exam density — tightest gap between two KNOWN exam dates.
  const examTimes = courses
    .map((c) => {
      if (!c.examDate) return null;
      const d = c.examDate instanceof Date ? c.examDate : new Date(c.examDate);
      const t = d.getTime();
      return Number.isFinite(t) ? t : null;
    })
    .filter((t): t is number => t != null)
    .sort((a, b) => a - b);

  let tightestExamGapDays: number | null = null;
  if (examTimes.length >= 2) {
    const MS_PER_DAY = 86_400_000;
    let smallest = Infinity;
    for (let i = 1; i < examTimes.length; i++) {
      const gap = (examTimes[i]! - examTimes[i - 1]!) / MS_PER_DAY;
      if (gap < smallest) smallest = gap;
    }
    tightestExamGapDays = Math.round(smallest);
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
