// =========================================
// Workload Calculator
// =========================================
// Calculates workload intensity per semester based on
// credit count, course type mix, difficulty data, and exam density.

export type WorkloadLevel = "light" | "moderate" | "heavy" | "intense";

export interface WorkloadResult {
  level: WorkloadLevel;
  score: number; // 0-100
  credits: number;
  courseCount: number;
  hasSeminar: boolean;
  disciplineSpread: number; // how many different disciplines
  hardCourseCount: number;  // courses with difficulty "hard" or "very_hard"
  avgDifficulty: number | null; // average difficulty score (0-3 scale), null if no data
}

interface CourseInfo {
  credits: number;
  courseType: string;
  discipline: string;
  difficultyLevel?: string | null;
  averageGrade?: number | null;
}

/** Map difficulty labels to numeric scores for averaging. */
const DIFFICULTY_SCORES: Record<string, number> = {
  easy: 0,
  moderate: 1,
  hard: 2,
  very_hard: 3,
};

/**
 * Calculate the workload intensity for a set of courses in a semester.
 * Score: 0 = empty, 1-30 = light, 31-60 = moderate, 61-80 = heavy, 81-100 = intense
 *
 * Scoring factors:
 *   - Credits (main):       15-85 points
 *   - Course count:         0-10 points
 *   - Seminar:              0-10 points
 *   - Discipline spread:    0-5 points
 *   - Difficulty factor:    0-15 points (NEW — based on hard/very_hard course count)
 *   - Low avg grade factor: 0-5 points (NEW — many courses with avg < 70)
 */
export function calculateWorkload(courses: CourseInfo[]): WorkloadResult {
  if (courses.length === 0) {
    return {
      level: "light",
      score: 0,
      credits: 0,
      courseCount: 0,
      hasSeminar: false,
      disciplineSpread: 0,
      hardCourseCount: 0,
      avgDifficulty: null,
    };
  }

  const credits = courses.reduce((sum, c) => sum + c.credits, 0);
  const courseCount = courses.length;
  const hasSeminar = courses.some((c) => c.courseType === "SEMINAR");
  const disciplines = new Set(courses.map((c) => c.discipline));
  const disciplineSpread = disciplines.size;

  // Difficulty stats
  const hardCourseCount = courses.filter(
    (c) => c.difficultyLevel === "hard" || c.difficultyLevel === "very_hard"
  ).length;

  const difficultyScores = courses
    .map((c) => (c.difficultyLevel ? DIFFICULTY_SCORES[c.difficultyLevel] : null))
    .filter((s): s is number => s != null);
  const avgDifficulty =
    difficultyScores.length > 0
      ? Math.round((difficultyScores.reduce((a, b) => a + b, 0) / difficultyScores.length) * 100) / 100
      : null;

  const lowGradeCourses = courses.filter(
    (c) => c.averageGrade != null && c.averageGrade > 0 && c.averageGrade < 70
  ).length;

  // Base score from credits (typical semester is 12-18 credits)
  let score = 0;

  // Credit-based scoring (main factor)
  if (credits <= 10) score += 15;
  else if (credits <= 14) score += 30;
  else if (credits <= 17) score += 50;
  else if (credits <= 20) score += 70;
  else score += 85;

  // Course count factor (more courses = more admin overhead)
  if (courseCount >= 7) score += 10;
  else if (courseCount >= 5) score += 5;

  // Seminar factor (adds significant workload)
  if (hasSeminar) score += 10;

  // Discipline spread factor (more diverse = harder context switching)
  if (disciplineSpread >= 4) score += 5;
  else if (disciplineSpread >= 3) score += 3;

  // Difficulty factor (NEW) — hard/very_hard courses significantly increase workload
  if (hardCourseCount >= 3) score += 15;
  else if (hardCourseCount >= 2) score += 10;
  else if (hardCourseCount >= 1) score += 5;

  // Low average grade factor (NEW) — courses with avg < 70 indicate challenging exams
  if (lowGradeCourses >= 3) score += 5;
  else if (lowGradeCourses >= 2) score += 3;

  // Clamp to 0-100
  score = Math.min(100, Math.max(0, score));

  const level: WorkloadLevel =
    score <= 30
      ? "light"
      : score <= 60
        ? "moderate"
        : score <= 80
          ? "heavy"
          : "intense";

  return {
    level,
    score,
    credits,
    courseCount,
    hasSeminar,
    disciplineSpread,
    hardCourseCount,
    avgDifficulty,
  };
}

/**
 * Get the color class for a workload level
 */
export function getWorkloadColor(level: WorkloadLevel): string {
  switch (level) {
    case "light":
      return "text-emerald-400";
    case "moderate":
      return "text-foreground/70";
    case "heavy":
      return "text-amber-500";
    case "intense":
      return "text-red-400";
  }
}

/**
 * Get the background class for a workload level
 */
export function getWorkloadBgColor(level: WorkloadLevel): string {
  switch (level) {
    case "light":
      return "bg-emerald-400/10";
    case "moderate":
      return "bg-foreground/10";
    case "heavy":
      return "bg-amber-500/10";
    case "intense":
      return "bg-red-400/10";
  }
}

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
