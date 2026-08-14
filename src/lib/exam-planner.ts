// =========================================
// Exam-period planner — reverse-planning engine
// =========================================
// Deterministic. Given a set of exams, it works BACKWARDS from each exam date
// to lay spaced study sessions across the available days, budgets hours by
// credits × difficulty, and surfaces conflicts + a Moed-B relief suggestion.
// No LLM. Pure + testable; the UI/server fill ExamInput from real data.

// Import the leaf visibility module directly (not the barrel) so this pure lib
// never pulls in the Arazim network fetcher.
import { ARAZIM_ENABLED } from "./arazim/visibility";

export interface ExamInput {
  courseCode: string;
  courseName: string;
  /** Chosen sitting date (Moed A or B) as ISO/Date. */
  examDate: Date | string;
  credits: number;
  /** 0–100 average grade (lower = harder), if known. */
  averageGrade?: number | null;
  /** Fail-rate PERCENTAGE 0–100 (higher = harder), if known. Matches
   *  Course.failRate (schema.prisma:184) — classifyDifficulty tests `>= 20`. */
  failRate?: number | null;
  /** Self-reported readiness 1 (not ready) … 5 (very ready). The student's OWN
   *  report, NOT our prediction — it scales the hour budget only. */
  confidence?: number | null;
  /** The student's own total-hours choice for this exam (13.7 #25 — "who said
   *  2.5 hours?"). When set (> 0) it REPLACES the credits×difficulty×readiness
   *  estimate entirely: their judgment wins over our formula. */
  hoursOverride?: number | null;
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

// One CALM color per course (#27). Six harmonious hues, not eight neon ones —
// color signals course IDENTITY only. RED and AMBER are deliberately NOT here:
// they're reserved for meaning (red = the exam day / danger, amber = a warning),
// so the same red no longer means three different things at once.
const PALETTE = [
  "#6366f1", // indigo (brand)
  "#2563eb", // blue
  "#0891b2", // cyan
  "#059669", // emerald
  "#7c3aed", // violet
  "#db2777", // pink
];

const HOURS_PER_CREDIT: Record<Difficulty, number> = { low: 1.5, medium: 2.5, high: 4 };
const SESSION_HOURS = 2.5;

/** Self-report readiness → hour multiplier. Low readiness buys MORE hours, high
 *  buys fewer; 3 (or unset) is neutral (1.0×) so a plan without any confidence
 *  input is byte-for-byte the old plan. Input is clamped to 1..5. */
const CONFIDENCE_MULT: Record<number, number> = { 1: 1.4, 2: 1.2, 3: 1.0, 4: 0.85, 5: 0.7 };
export function confidenceMultiplier(c?: number | null): number {
  if (c == null || !Number.isFinite(c)) return 1;
  const k = Math.min(5, Math.max(1, Math.round(c)));
  return CONFIDENCE_MULT[k] ?? 1;
}

/**
 * The in-product answer to "למה 12 שעות למיקרו?" (13.7 #25). Recomputes the
 * budget the engine uses and returns every component, so the UI can show ONE
 * honest line instead of a bare number. `overridden` = the student's own hours
 * replaced the formula entirely.
 */
export interface BudgetExplanation {
  credits: number;
  difficulty: Difficulty;
  /** Hours budgeted per ש״ס at this difficulty (1.5 / 2.5 / 4). */
  perCredit: number;
  /** Readiness multiplier actually applied (1 = neutral/unset). */
  multiplier: number;
  /** The formula's own result (before any override). */
  estimated: number;
  overridden: boolean;
  /** The budget the engine schedules with. */
  total: number;
}

export function explainBudget(
  exam: Pick<ExamInput, "credits" | "averageGrade" | "failRate" | "confidence" | "hoursOverride">,
): BudgetExplanation {
  const difficulty = classifyDifficulty(exam.averageGrade, exam.failRate);
  const perCredit = HOURS_PER_CREDIT[difficulty];
  const multiplier = confidenceMultiplier(exam.confidence);
  const estimated = Math.max(SESSION_HOURS, Math.round(exam.credits * perCredit * multiplier));
  const overridden = exam.hoursOverride != null && exam.hoursOverride > 0;
  return {
    credits: exam.credits,
    difficulty,
    perCredit,
    multiplier,
    estimated,
    overridden,
    total: overridden ? Math.max(1, Math.round(exam.hoursOverride!)) : estimated,
  };
}

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
  // Arazim is the ONLY source of these historical grade/fail signals. With it
  // off ("בלי ארזים כרגע") there is no difficulty signal at all, so every course
  // budgets at the neutral "medium" rate — the exam-planner already surfaces
  // this honestly ("אין נתוני עבר — הנחנו בינוני"). Reversible via ARAZIM_ENABLED.
  if (!ARAZIM_ENABLED) return "medium";
  // failRate is a PERCENTAGE 0-100 (Course.failRate — schema.prisma:184, and the
  // UI passes c.failRate straight in). The bar is 20% fail, NOT 0.2 — the old
  // 0.2 fired at a 0.2% fail rate, tagging almost every course "high" and
  // over-budgeting study hours across the whole plan.
  if ((failRate != null && failRate >= 20) || (averageGrade != null && averageGrade < 70)) return "high";
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
 * How many study hours the student actually has, per day. `weekdayHours` is
 * indexed 0=Sunday … 6=Saturday; `overrides` are per-date (local YYYY-MM-DD →
 * hours) for a specific partial day or a hard zero. The plan NEVER schedules
 * more than a day's capacity across ALL courses — no more piled-up days.
 */
export interface StudyCapacity {
  weekdayHours: number[];
  overrides?: Record<string, number>;
}
/** Sane default — the Israeli study week: Sun–Thu 3h, Fri 2h, Sat 0. */
export const DEFAULT_CAPACITY: StudyCapacity = { weekdayHours: [3, 3, 3, 3, 3, 2, 0] };
/** Most hours of ONE course a student studies in a single day (spread > cram). */
const MAX_COURSE_HOURS_PER_DAY = SESSION_HOURS; // 2.5
const round2 = (n: number) => Math.round(n * 100) / 100;

/** A study block already fixed in place — one the student moved/locked, or a
 *  manual quick-add — that a re-tune must fill AROUND (not wipe): its hours
 *  consume the day's capacity and reduce its course's remaining budget. */
export interface PrePlacedBlock {
  courseCode: string;
  date: Date | string;
  hours: number;
}

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
  style: PrepSpreadStyle = "steady",
  capacity: StudyCapacity = DEFAULT_CAPACITY,
  prePlaced: PrePlacedBlock[] = [],
): ExamPlanResult {
  const today = startOfDay(now);
  const blocked = new Set(unavailable);
  const examSummaries: ExamPlanResult["exams"] = [];

  // A day's study capacity (hours): 0 if blocked, else a per-date override or
  // the weekday default. This is the whole point of the capacity model — the
  // plan NEVER schedules more than this on a day across ALL courses.
  const capOf = (d: Date): number => {
    const k = dayKey(d);
    if (blocked.has(k)) return 0;
    const override = capacity.overrides?.[k];
    if (override != null) return Math.max(0, override);
    return Math.max(0, capacity.weekdayHours[d.getDay()] ?? 0);
  };

  // Shared cross-course ledger + ONE accumulated session per (course, day).
  const usedByDay = new Map<string, number>();
  const alloc = new Map<string, StudySession>();
  const addHours = (
    courseCode: string,
    courseName: string,
    day: Date,
    hours: number,
    color: string,
    difficulty: Difficulty,
  ) => {
    const dk = dayKey(day);
    const key = `${dk}|${courseCode}`;
    const cur = alloc.get(key);
    if (cur) cur.hours = round2(cur.hours + hours);
    else alloc.set(key, { courseCode, courseName, date: day, hours: round2(hours), color, difficulty });
    usedByDay.set(dk, round2((usedByDay.get(dk) ?? 0) + hours));
  };

  // Seed the ledger with pre-placed (locked/manual) blocks so the plan fills
  // AROUND them: their hours consume the day's capacity AND shrink their
  // course's remaining budget. Only FUTURE blocks count — a past locked session
  // must not eat a future day's cap or reduce a budget.
  const preByCourseDay = new Map<string, number>();
  const preHoursByCourse = new Map<string, number>();
  for (const p of prePlaced) {
    const d = startOfDay(new Date(p.date));
    if (isNaN(d.getTime()) || d.getTime() < today.getTime() || !(p.hours > 0)) continue;
    const dk = dayKey(d);
    const key = `${dk}|${p.courseCode}`;
    usedByDay.set(dk, round2((usedByDay.get(dk) ?? 0) + p.hours));
    preByCourseDay.set(key, round2((preByCourseDay.get(key) ?? 0) + p.hours));
    preHoursByCourse.set(p.courseCode, round2((preHoursByCourse.get(p.courseCode) ?? 0) + p.hours));
  }

  // Nearest exam first — the soonest exam claims scarce capacity before later
  // ones. (Also gives stable, date-ordered colors.)
  const ordered = exams
    .map((e) => ({ ...e, _date: startOfDay(new Date(e.examDate)) }))
    // `>=`, NOT `>`: an exam happening TODAY is still upcoming. Every other
    // surface agrees — the picker (exam-planner-content), exam-availability,
    // the countdown list and days-until all use a `>= today` civil-day test and
    // label it "היום". Only this engine used `>`, so on the MORNING OF THE EXAM
    // the row vanished from the skyline / weekly grid / agenda / XLSX while it
    // sat checked in the picker, and analyzeExamPeriod announced the SECOND
    // exam as "המבחן הכי קרוב". (Its own `days === 0 → "היום!"` branch was
    // unreachable, which is the tell.) Today's exam yields an exam summary with
    // no study sessions — the candidate-day loop below starts at exam−1 and
    // naturally finds nothing, which is the honest answer.
    .filter((e) => !isNaN(e._date.getTime()) && e._date.getTime() >= today.getTime())
    .sort((a, b) => a._date.getTime() - b._date.getTime());

  ordered.forEach((exam, idx) => {
    const color = colorFor(idx);
    const difficulty = classifyDifficulty(exam.averageGrade, exam.failRate);
    // The student's own hours (13.7 #25) win over the formula, floor 1h; the
    // estimate keeps the SESSION_HOURS floor so a tiny course still gets one
    // real session.
    const totalHours =
      exam.hoursOverride != null && exam.hoursOverride > 0
        ? Math.max(1, Math.round(exam.hoursOverride))
        : Math.max(
            SESSION_HOURS,
            Math.round(exam.credits * HOURS_PER_CREDIT[difficulty] * confidenceMultiplier(exam.confidence)),
          );

    examSummaries.push({
      courseCode: exam.courseCode,
      courseName: exam.courseName,
      examDate: exam._date,
      moed: exam.moed,
      difficulty,
      totalHours,
      color,
    });

    // Candidate days: from the day BEFORE the exam back to today, within the
    // prep-style window (steady ~3 weeks, crammer ~1 week), that have spare
    // capacity. Reverse-planned nearest-first.
    const windowDays = style === "crammer" ? WINDOW_DAYS_CRAMMER : WINDOW_DAYS_STEADY;
    const candidates: Date[] = [];
    for (let d = addDays(exam._date, -1); d.getTime() >= today.getTime(); d = addDays(d, -1)) {
      if (capOf(d) > 0) candidates.push(d);
      if (candidates.length >= windowDays) break;
    }
    if (candidates.length === 0) return; // no room for this exam (blocked/at capacity)

    const spareOf = (d: Date) => Math.max(0, capOf(d) - (usedByDay.get(dayKey(d)) ?? 0));
    const courseSpareOf = (d: Date) => {
      const k = `${dayKey(d)}|${exam.courseCode}`;
      return MAX_COURSE_HOURS_PER_DAY - (alloc.get(k)?.hours ?? 0) - (preByCourseDay.get(k) ?? 0);
    };

    // Locked/manual hours already count toward this course's budget, so only the
    // shortfall still needs scheduling. examSummaries.totalHours stays the FULL
    // budget (the shortfall rec compares full budget vs everything placed).
    let remaining = Math.max(0, round2(totalHours - (preHoursByCourse.get(exam.courseCode) ?? 0)));
    if (style === "crammer") {
      // Concentrate: fill the nearest days to their spare capacity (up to the
      // per-course daily max) before touching farther ones.
      for (const day of candidates) {
        if (remaining <= 1e-6) break;
        const place = Math.min(remaining, spareOf(day), courseSpareOf(day));
        if (place > 1e-6) {
          addHours(exam.courseCode, exam.courseName, day, place, color, difficulty);
          remaining = round2(remaining - place);
        }
      }
    } else {
      // Spread (steady/light): round-robin half-hour increments across the whole
      // window, so every available day gets a little before any day gets a lot.
      const STEP = 0.5;
      let guard = 0;
      let progress = true;
      while (remaining > 1e-6 && progress && guard++ < 1000) {
        progress = false;
        for (const day of candidates) {
          if (remaining <= 1e-6) break;
          const place = Math.min(STEP, remaining, spareOf(day), courseSpareOf(day));
          if (place > 1e-6) {
            addHours(exam.courseCode, exam.courseName, day, place, color, difficulty);
            remaining = round2(remaining - place);
            progress = true;
          }
        }
      }
    }
    // If capacity ran out before totalHours, we place only what fits — honest:
    // we never overload a day the student said they can't fill.
  });

  const sessions = [...alloc.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
  return { sessions, exams: examSummaries };
}

export interface ExamRecommendation {
  kind: "start" | "clash" | "deferB" | "capacity";
  textHe: string;
  textEn: string;
}

/**
 * Deterministic recommendations over the exam set: what to start, exams too
 * close together, and a Moed-B relief suggestion when the period is overloaded.
 */
export function analyzeExamPeriod(
  plan: ExamPlanResult,
  isHe: boolean,
  now: Date = new Date(),
  // B/C/G reservists keep the HIGHER of two sittings automatically — for them
  // Moed B is a safe upgrade, not a risk, so the "last grade counts" caveat is
  // inverted and must flip (launch audit 24.7).
  preferHigherGrade = false,
): ExamRecommendation[] {
  const recs: ExamRecommendation[] = [];
  const exams = plan.exams.slice().sort((a, b) => a.examDate.getTime() - b.examDate.getTime());
  if (exams.length === 0) return recs;

  // 1. Start with the soonest. Product voice is PLURAL (אתם), and days are
  //    counted like a person would — never "בעוד 1 ימים".
  const first = exams[0]!;
  const days = Math.max(0, Math.round((first.examDate.getTime() - startOfDay(now).getTime()) / 86400000));
  const whenHe = days === 0 ? "היום!" : days === 1 ? "מחר" : days === 2 ? "מחרתיים" : `בעוד ${days} ימים`;
  const whenEn = days === 0 ? "today!" : days === 1 ? "tomorrow" : `in ${days} days`;
  recs.push({
    kind: "start",
    textHe: `התחילו מ${first.courseName} — המבחן הכי קרוב (${whenHe}).`,
    textEn: `Start with ${first.courseName} — your soonest exam (${whenEn}).`,
  });

  // 2. Clashes: exams < 3 days apart.
  for (let i = 1; i < exams.length; i++) {
    const gap = Math.round((exams[i]!.examDate.getTime() - exams[i - 1]!.examDate.getTime()) / 86400000);
    if (gap < 3) {
      recs.push({
        kind: "clash",
        textHe: `${exams[i - 1]!.courseName} ו${exams[i]!.courseName} במרחק ${gap === 1 ? "יום אחד" : `${gap} ימים`} בלבד — צפוף. שקלו לדחות אחד למועד ב׳.`,
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
      textHe: `העומס גבוה (${totalHours} שעות לימוד ב-${span} ימים). אם צריך — ${candidate.courseName} מועמד טוב לדחייה למועד ב׳.${preferHigherGrade ? " ובמילואים שלכם — הציון הגבוה מבין המועדים נשמר, אז מועד ב׳ הוא שדרוג בטוח." : " שימו לב: הציון האחרון קובע, לא הגבוה."}`,
      textEn: `High load (${totalHours} study hours in ${span} days). If needed, ${candidate.courseName} is a good candidate to defer to Moed B.${preferHigherGrade ? " With your miluim benefit the HIGHER of the two sittings is kept, so Moed B is a safe upgrade." : " Note: the last grade counts, not the higher one."}`,
    });
  }

  // 4. Capacity shortfall (precise, capacity-aware): compare the budgeted study
  //    hours to what actually FIT under the per-day caps. If a meaningful chunk
  //    didn't fit, say so honestly — the student's stated hours are too tight —
  //    rather than letting them silently under-study.
  const placedHours = plan.sessions.reduce((s, x) => s + x.hours, 0);
  const shortfall = Math.round(totalHours - placedHours);
  if (totalHours > 0 && placedHours < totalHours * 0.9 && shortfall >= 3) {
    recs.push({
      kind: "capacity",
      textHe: `לפי הזמן שסימנתם, ${shortfall} שעות לימוד לא נכנסו ללוח. שקלו להוסיף שעות ביום, לפנות ימים חסומים, או לדחות מבחן למועד ב׳.`,
      textEn: `Given the hours you set, ${shortfall} study hours didn't fit the board. Consider adding hours per day, freeing blocked days, or deferring an exam to Moed B.`,
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
