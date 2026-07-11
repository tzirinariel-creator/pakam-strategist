// =========================================
// Exam-period planner — reverse-planning engine
// =========================================
// Deterministic. Given a set of exams, it works BACKWARDS from each exam date
// to lay spaced study sessions across the available days, budgets hours by
// credits × difficulty, and surfaces conflicts + a Moed-B relief suggestion.
// No LLM. Pure + testable; the UI/server fill ExamInput from real data.

export interface ExamInput {
  courseCode: string;
  courseName: string;
  /** Chosen sitting date (Moed A or B) as ISO/Date. */
  examDate: Date | string;
  credits: number;
  /** 0–100 average grade (lower = harder), if known. */
  averageGrade?: number | null;
  /** 0–1 fail rate (higher = harder), if known. */
  failRate?: number | null;
  /** Which sitting this date is. */
  moed: "A" | "B";
}

export interface StudySession {
  courseCode: string;
  courseName: string;
  /** Calendar day (local midnight) for the session. */
  date: Date;
  hours: number;
  color: string;
  difficulty: Difficulty;
}

export type Difficulty = "low" | "medium" | "high";

export interface ExamPlanResult {
  sessions: StudySession[];
  /** Per-exam summary for the UI. */
  exams: {
    courseCode: string;
    courseName: string;
    examDate: Date;
    moed: "A" | "B";
    difficulty: Difficulty;
    totalHours: number;
    color: string;
  }[];
}

// A stable, accessible-ish palette — one color per course (cap ~8).
const PALETTE = [
  "#6366f1", "#10b981", "#f59e0b", "#ef4444",
  "#3b82f6", "#a855f7", "#14b8a6", "#ec4899",
];

const HOURS_PER_CREDIT: Record<Difficulty, number> = { low: 1.5, medium: 2.5, high: 4 };
const SESSION_HOURS = 2.5;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** LOCAL day key — NOT toISOString(): for Israel (UTC+2/+3) a local-midnight
 *  date serialized as UTC rolls to the previous day, so blocked-day matching
 *  would silently miss by one. Must stay consistent with the UI's day keys. */
function dayKey(d: Date): string {
  const x = startOfDay(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

/** Classify difficulty from the course's historical grade signal. */
export function classifyDifficulty(averageGrade?: number | null, failRate?: number | null): Difficulty {
  if ((failRate != null && failRate >= 0.2) || (averageGrade != null && averageGrade < 70)) return "high";
  // A known-easy course (avg ≥ 80, no fail-rate red flag) budgets fewer hours.
  // Without this branch "low" was unreachable and easy courses were over-
  // budgeted at the medium rate, inflating the whole study plan.
  if (averageGrade != null && averageGrade >= 80) return "low";
  return "medium"; // <80 or unknown — safer than under-budgeting
}

function colorFor(index: number): string {
  return PALETTE[index % PALETTE.length]!;
}

/** E1′ — how the wizard's prep-style shapes the plan:
 *  steady (default) spreads over the full ~21-day window; crammer concentrates
 *  the same sessions into the last days before each exam; light's reduction
 *  happens at the credits level (×0.75) by the callers. */
export type PrepSpreadStyle = "steady" | "crammer" | "light";
const WINDOW_DAYS_STEADY = 21;
const WINDOW_DAYS_CRAMMER = 7;

/**
 * Build a reverse-planned study schedule for a set of exams.
 *
 * @param exams           The exams to study for.
 * @param now             "Today" (injectable for tests).
 * @param unavailable     ISO day strings the student can't study (work/blocked).
 * @param style           Wizard prep-style — shapes the spread window (E1′).
 */
export function generateExamPlan(
  exams: ExamInput[],
  now: Date = new Date(),
  unavailable: string[] = [],
  style: PrepSpreadStyle = "steady"
): ExamPlanResult {
  const today = startOfDay(now);
  const blocked = new Set(unavailable);
  const sessions: StudySession[] = [];
  const examSummaries: ExamPlanResult["exams"] = [];

  // Sort by date so colors are assigned by exam order (stable + readable).
  const ordered = exams
    .map((e) => ({ ...e, _date: startOfDay(new Date(e.examDate)) }))
    .filter((e) => !isNaN(e._date.getTime()) && e._date.getTime() > today.getTime())
    .sort((a, b) => a._date.getTime() - b._date.getTime());

  ordered.forEach((exam, idx) => {
    const color = colorFor(idx);
    const difficulty = classifyDifficulty(exam.averageGrade, exam.failRate);
    const totalHours = Math.max(SESSION_HOURS, Math.round(exam.credits * HOURS_PER_CREDIT[difficulty]));
    const sessionCount = Math.max(2, Math.round(totalHours / SESSION_HOURS));

    examSummaries.push({
      courseCode: exam.courseCode,
      courseName: exam.courseName,
      examDate: exam._date,
      moed: exam.moed,
      difficulty,
      totalHours,
      color,
    });

    // Available study days = from today up to the day BEFORE the exam, minus
    // blocked days. Reverse-planning: prefer days closer to the exam, so we walk
    // backwards from exam-1. The window is the wizard's prep-style (E1′):
    // steady looks ~3 weeks back; crammer concentrates into the last week.
    const windowDays = style === "crammer" ? WINDOW_DAYS_CRAMMER : WINDOW_DAYS_STEADY;
    const available: Date[] = [];
    for (let d = addDays(exam._date, -1); d.getTime() >= today.getTime(); d = addDays(d, -1)) {
      if (!blocked.has(dayKey(d))) available.push(d);
      if (available.length >= windowDays) break;
    }
    if (available.length === 0) return; // skip this exam (forEach callback)

    // Place `sessionCount` sessions on `available` days (nearest-first order).
    // steady/light honor the wizard's promise ("פיזור מלא על כל החלון") by
    // distributing EVENLY across the whole window; crammer stacks nearest-first
    // (E1′ — the engine used to stack nearest-first for everyone, so "steady"
    // never actually spread). More sessions than days wraps around.
    for (let i = 0; i < sessionCount; i++) {
      const idx =
        style === "crammer"
          ? i % available.length
          : Math.floor((i * available.length) / sessionCount) % available.length;
      const day = available[idx]!;
      sessions.push({
        courseCode: exam.courseCode,
        courseName: exam.courseName,
        date: day,
        hours: SESSION_HOURS,
        color,
        difficulty,
      });
    }
  });

  // Stable order for display.
  sessions.sort((a, b) => a.date.getTime() - b.date.getTime());
  return { sessions, exams: examSummaries };
}

export interface ExamRecommendation {
  kind: "start" | "clash" | "deferB";
  textHe: string;
  textEn: string;
}

/**
 * Deterministic recommendations over the exam set: what to start, exams too
 * close together, and a Moed-B relief suggestion when the period is overloaded.
 */
export function analyzeExamPeriod(plan: ExamPlanResult, isHe: boolean, now: Date = new Date()): ExamRecommendation[] {
  const recs: ExamRecommendation[] = [];
  const exams = plan.exams.slice().sort((a, b) => a.examDate.getTime() - b.examDate.getTime());
  if (exams.length === 0) return recs;

  // 1. Start with the soonest.
  const first = exams[0]!;
  const days = Math.max(0, Math.round((first.examDate.getTime() - startOfDay(now).getTime()) / 86400000));
  recs.push({
    kind: "start",
    textHe: `התחל מ${first.courseName} — המבחן הכי קרוב (בעוד ${days} ימים).`,
    textEn: `Start with ${first.courseName} — your soonest exam (in ${days} days).`,
  });

  // 2. Clashes: exams < 3 days apart.
  for (let i = 1; i < exams.length; i++) {
    const gap = Math.round((exams[i]!.examDate.getTime() - exams[i - 1]!.examDate.getTime()) / 86400000);
    if (gap < 3) {
      recs.push({
        kind: "clash",
        textHe: `${exams[i - 1]!.courseName} ו${exams[i]!.courseName} במרחק ${gap} ימים בלבד — צפוף. שקול לדחות אחד למועד ב׳.`,
        textEn: `${exams[i - 1]!.courseName} and ${exams[i]!.courseName} are only ${gap} days apart — tight. Consider deferring one to Moed B.`,
      });
    }
  }

  // 3. Overload relief: if total budgeted hours exceed the available study days
  //    (×~4h/day), suggest deferring the least-pressing exam to Moed B.
  const totalHours = exams.reduce((s, e) => s + e.totalHours, 0);
  const lastDate = exams[exams.length - 1]!.examDate;
  const span = Math.max(1, Math.round((lastDate.getTime() - startOfDay(now).getTime()) / 86400000));
  if (totalHours > span * 4 && exams.length > 1) {
    // Defer the one that's easiest/latest (lowest stakes to push).
    const candidate = exams.slice().sort((a, b) => b.examDate.getTime() - a.examDate.getTime())[0]!;
    recs.push({
      kind: "deferB",
      textHe: `העומס גבוה (${totalHours} שעות לימוד ב-${span} ימים). אם צריך — ${candidate.courseName} מועמד טוב לדחייה למועד ב׳. שים לב: הציון האחרון קובע, לא הגבוה.`,
      textEn: `High load (${totalHours} study hours in ${span} days). If needed, ${candidate.courseName} is a good candidate to defer to Moed B. Note: the last grade counts, not the higher one.`,
    });
  }

  return recs;
}

/**
 * Which sitting to recommend (#32). Default is ALWAYS Moed A — the last grade
 * counts, so B is the safety net and sitting A keeps it in reserve. Recommend
 * B only when A is tight (<3 days from another chosen exam) and B is not.
 * Null = the course has no scheduled sittings at all.
 */
export function recommendMoed(
  course: { examDateA: Date | null; examDateB: Date | null },
  otherChosenDates: Date[],
): "A" | "B" | null {
  if (!course.examDateA && !course.examDateB) return null;
  if (!course.examDateA) return "B";
  if (!course.examDateB) return "A";
  const tight = (d: Date) =>
    otherChosenDates.some(
      (o) => Math.abs(startOfDay(o).getTime() - startOfDay(d).getTime()) < 3 * 86400000,
    );
  return tight(course.examDateA) && !tight(course.examDateB) ? "B" : "A";
}
