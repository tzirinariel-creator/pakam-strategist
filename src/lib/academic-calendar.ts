// =========================================================================
// THE single source of truth for TAU academic-year dates and "where are we
// now" (notes #39/#43 — the app used to ASK the student which semester it is,
// and its hard-coded dates were a month off the official calendar).
// Dates verified against https://www.tau.ac.il/calendar (updated תשפ"ו PDF +
// the תשפ"ז tab) by the deep-research adversarial review, 7.7.2026.
// Pure module: every function takes an injectable `now` for tests.
// =========================================================================

export type TeachingSemester = "FALL" | "SPRING";
export type AcademicPhase = "teaching" | "exams" | "break";

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day); // 1-based month

export interface SemesterDates {
  teachingStart: Date;
  /** Last day of classes (inclusive). */
  teachingEnd: Date;
  examStart: Date;
  /** null = not published yet; we model exams as ~6 weeks from examStart. */
  examEnd: Date | null;
}

export interface AcademicYearCalendar {
  /** 2025 = תשפ"ו. */
  startYear: number;
  labelHe: string;
  FALL: SemesterDates;
  SPRING: SemesterDates;
  summer?: { start: Date; end: Date };
}

export const TAU_CALENDARS: AcademicYearCalendar[] = [
  {
    // תשפ"ד — the Iron-Swords WAR year: teaching started 31.12 (not October!)
    // and ran into August. These irregular dates are exactly why guessing was
    // forbidden — sourced from the official TAU calendar page
    // (tau.ac.il/calendar/2023-2024, fetched 14.7.2026). Enables 3010 service-
    // period mapping for year-3 students who served during תשפ"ד.
    startYear: 2023,
    labelHe: "תשפ״ד",
    FALL: { teachingStart: d(2023, 12, 31), teachingEnd: d(2024, 3, 15), examStart: d(2024, 3, 25), examEnd: d(2024, 5, 24) },
    SPRING: { teachingStart: d(2024, 5, 26), teachingEnd: d(2024, 8, 12), examStart: d(2024, 8, 14), examEnd: null },
  },
  {
    // תשפ"ה — official TAU calendar (tau.ac.il/calendar_2024-2025, fetched
    // 14.7.2026).
    startYear: 2024,
    labelHe: "תשפ״ה",
    FALL: { teachingStart: d(2024, 11, 3), teachingEnd: d(2025, 2, 2), examStart: d(2025, 2, 3), examEnd: d(2025, 3, 16) },
    SPRING: { teachingStart: d(2025, 3, 17), teachingEnd: d(2025, 7, 2), examStart: d(2025, 7, 6), examEnd: null },
  },
  {
    startYear: 2025,
    labelHe: "תשפ״ו",
    FALL: { teachingStart: d(2025, 10, 26), teachingEnd: d(2026, 1, 25), examStart: d(2026, 1, 28), examEnd: d(2026, 3, 13) },
    SPRING: { teachingStart: d(2026, 4, 12), teachingEnd: d(2026, 7, 10), examStart: d(2026, 7, 12), examEnd: null },
    summer: { start: d(2026, 7, 26), end: d(2026, 9, 18) },
  },
  {
    startYear: 2026,
    labelHe: "תשפ״ז",
    FALL: { teachingStart: d(2026, 10, 18), teachingEnd: d(2027, 1, 18), examStart: d(2027, 1, 20), examEnd: d(2027, 3, 8) },
    SPRING: { teachingStart: d(2027, 3, 9), teachingEnd: d(2027, 6, 27), examStart: d(2027, 6, 29), examEnd: null },
    summer: { start: d(2027, 7, 20), end: d(2027, 9, 17) },
  },
];

const DAY_MS = 86_400_000;
/** Unpublished exam-period end: ~6 weeks after examStart (moed A + most of B),
 *  then the phase turns to an honest "break" — no "exam period" in late
 *  September (adversarial-review find). One place to update when TAU publishes. */
const UNPUBLISHED_EXAM_WEEKS = 6;

/** End-boundary dates are INCLUSIVE calendar days — compare against 23:59:59. */
function endOfDay(x: Date): Date {
  return new Date(x.getFullYear(), x.getMonth(), x.getDate(), 23, 59, 59, 999);
}

function examEndOf(s: SemesterDates): Date {
  return endOfDay(s.examEnd ?? new Date(s.examStart.getTime() + UNPUBLISHED_EXAM_WEEKS * 7 * DAY_MS));
}

export interface AcademicNow {
  /** 2025 = תשפ"ו. */
  startYear: number;
  labelHe: string;
  semester: TeachingSemester;
  phase: AcademicPhase;
  dates: SemesterDates;
  /** Start of the NEXT teaching block (this year's SPRING or next year's FALL). */
  nextTeachingStart: Date;
  /** Summer-session window of the current academic year, when defined. */
  summer: { start: Date; end: Date } | null;
  /** True when `now` falls outside every known calendar — labels stay honest. */
  isStale: boolean;
}

export function getAcademicNow(now: Date = new Date()): AcademicNow {
  const first = TAU_CALENDARS[0]!;
  const last = TAU_CALENDARS[TAU_CALENDARS.length - 1]!;

  // Before the first known calendar — pin to it, flagged stale.
  if (now < first.FALL.teachingStart) {
    return {
      startYear: first.startYear,
      labelHe: first.labelHe,
      semester: "FALL",
      phase: "break",
      dates: first.FALL,
      nextTeachingStart: first.FALL.teachingStart,
      summer: first.summer ?? null,
      isStale: true,
    };
  }

  for (let i = 0; i < TAU_CALENDARS.length; i++) {
    const cal = TAU_CALENDARS[i]!;
    const next = TAU_CALENDARS[i + 1] ?? null;
    const fallWindowEnd = cal.SPRING.teachingStart; // exclusive
    const springWindowEnd = next ? next.FALL.teachingStart : null; // exclusive

    // FALL attribution window: [FALL.teachingStart, SPRING.teachingStart)
    if (now >= cal.FALL.teachingStart && now < fallWindowEnd) {
      const phase: AcademicPhase =
        now <= endOfDay(cal.FALL.teachingEnd) ? "teaching" : now <= examEndOf(cal.FALL) ? "exams" : "break";
      return {
        startYear: cal.startYear,
        labelHe: cal.labelHe,
        semester: "FALL",
        phase,
        dates: cal.FALL,
        nextTeachingStart: cal.SPRING.teachingStart,
        summer: cal.summer ?? null,
        isStale: false,
      };
    }

    // SPRING attribution window: [SPRING.teachingStart, nextFall.teachingStart)
    if (now >= cal.SPRING.teachingStart && (springWindowEnd === null || now < springWindowEnd)) {
      const phase: AcademicPhase =
        now <= endOfDay(cal.SPRING.teachingEnd) ? "teaching" : now <= examEndOf(cal.SPRING) ? "exams" : "break";
      return {
        startYear: cal.startYear,
        labelHe: cal.labelHe,
        semester: "SPRING",
        phase,
        dates: cal.SPRING,
        nextTeachingStart: next ? next.FALL.teachingStart : new Date(cal.SPRING.teachingStart.getFullYear() + 1, 9, 15),
        summer: cal.summer ?? null,
        isStale: springWindowEnd === null && now > examEndOf(cal.SPRING) && (!cal.summer || now > cal.summer.end),
      };
    }
  }

  // Past every known calendar — pin to the last SPRING, flagged stale.
  return {
    startYear: last.startYear,
    labelHe: last.labelHe,
    semester: "SPRING",
    phase: "break",
    dates: last.SPRING,
    nextTeachingStart: new Date(last.SPRING.teachingStart.getFullYear() + 1, 9, 15),
    summer: last.summer ?? null,
    isStale: true,
  };
}

// =========================================================================
// describeAcademicNow (#5/#39) — ONE precise sentence about where the calendar
// actually is right now, built only from published dates. The onboarding used
// to render a rough phase guess ("אנחנו עכשיו בסמסטר ב׳ — באמצע תקופת
// הלימודים"), and the exam planner said nothing at all, so the app read as if
// it had no idea what day it is. Every branch below names a REAL date from the
// table above; nothing is estimated, and an unpublished exam-period end says so
// instead of implying one.
// =========================================================================

export interface AcademicStatus {
  phase: AcademicPhase;
  /** "סמסטר א׳" / "סמסטר ב׳" of the semester `now` belongs to. */
  semesterHe: string;
  semesterEn: string;
  /** "תשפ״ו" / "2025/26". */
  yearLabelHe: string;
  yearLabelEn: string;
  /** Remaining teaching days incl. today (teaching phase only), else null. */
  teachingDaysLeft: number | null;
  /** False when the semester's exam-period END is not published by TAU. */
  examEndPublished: boolean;
  /** True when `now` sits outside every verified calendar — say nothing else. */
  isStale: boolean;
  he: string;
  en: string;
}

const semesterHeLabel = (s: TeachingSemester) => (s === "FALL" ? "סמסטר א׳" : "סמסטר ב׳");
const semesterEnLabel = (s: TeachingSemester) => (s === "FALL" ? "Fall" : "Spring");
const enYearLabel = (startYear: number) => `${startYear}/${String((startYear + 1) % 100).padStart(2, "0")}`;

/** dd.M.yy — the app's date shorthand. Render inside Hebrew via <Bidi>. */
function shortDate(x: Date): string {
  return `${x.getDate()}.${x.getMonth() + 1}.${String(x.getFullYear()).slice(-2)}`;
}

export function describeAcademicNow(now: Date = new Date()): AcademicStatus {
  const a = getAcademicNow(now);
  const semesterHe = semesterHeLabel(a.semester);
  const semesterEn = semesterEnLabel(a.semester);
  const yearLabelHe = hebrewYearLabel(a.startYear);
  const yearLabelEn = enYearLabel(a.startYear);
  const examEndPublished = a.dates.examEnd !== null;

  const base = {
    phase: a.phase,
    semesterHe,
    semesterEn,
    yearLabelHe,
    yearLabelEn,
    examEndPublished,
    isStale: a.isStale,
  };

  // Outside every verified calendar — the one case where we say nothing.
  if (a.isStale) {
    return {
      ...base,
      teachingDaysLeft: null,
      he: "אין לנו לוח שנה אקדמי מאומת לתאריך הזה, ולכן לא נציג ניחוש של המצב בשנה.",
      en: "We have no verified academic calendar for this date, so we won't guess where the year stands.",
    };
  }

  if (a.phase === "teaching") {
    const daysLeft = Math.max(
      1,
      Math.ceil((endOfDay(a.dates.teachingEnd).getTime() - now.getTime()) / DAY_MS),
    );
    return {
      ...base,
      teachingDaysLeft: daysLeft,
      he:
        daysLeft === 1
          ? `אנחנו ביום הלימודים האחרון של ${semesterHe} ${yearLabelHe} (${shortDate(a.dates.teachingEnd)}).`
          : `אנחנו בתוך ${semesterHe} של ${yearLabelHe} — נשארו ${daysLeft} ימים עד סוף הלימודים (${shortDate(a.dates.teachingEnd)}).`,
      en:
        daysLeft === 1
          ? `Today is the last teaching day of ${semesterEn} ${yearLabelEn} (${shortDate(a.dates.teachingEnd)}).`
          : `We're inside ${semesterEn} ${yearLabelEn} — ${daysLeft} days left of teaching (ends ${shortDate(a.dates.teachingEnd)}).`,
    };
  }

  if (a.phase === "exams") {
    const tail = examEndPublished
      ? ` תקופת הבחינות מסתיימת ב-${shortDate(a.dates.examEnd!)}.`
      : " תאריך הסיום של תקופת הבחינות טרם פורסם.";
    const tailEn = examEndPublished
      ? ` The exam period ends ${shortDate(a.dates.examEnd!)}.`
      : " The end of the exam period hasn't been published.";
    return {
      ...base,
      teachingDaysLeft: null,
      he:
        `אנחנו בתוך תקופת המבחנים של ${semesterHe} ${yearLabelHe} — הלימודים הסתיימו ב-${shortDate(a.dates.teachingEnd)}` +
        `, והמבחנים החלו ב-${shortDate(a.dates.examStart)}.${tail}`,
      en:
        `We're inside the exam period of ${semesterEn} ${yearLabelEn} — teaching ended ${shortDate(a.dates.teachingEnd)}` +
        ` and exams began ${shortDate(a.dates.examStart)}.${tailEn}`,
    };
  }

  // break — name the NEXT teaching semester, which is a published date.
  const nextSemester: TeachingSemester = a.semester === "FALL" ? "SPRING" : "FALL";
  const nextStartYear = a.semester === "FALL" ? a.startYear : a.startYear + 1;
  const nextHe = `${semesterHeLabel(nextSemester)} של ${hebrewYearLabel(nextStartYear)}`;
  const nextEn = `${semesterEnLabel(nextSemester)} ${enYearLabel(nextStartYear)}`;
  const gapHe = a.semester === "SPRING" ? "אנחנו בחופשת הקיץ" : "אנחנו בחופשה שבין הסמסטרים";
  const gapEn = a.semester === "SPRING" ? "We're in the summer break" : "We're in the between-semesters break";
  return {
    ...base,
    teachingDaysLeft: null,
    he: `${gapHe} — ${nextHe} מתחיל ב-${shortDate(a.nextTeachingStart)}.`,
    en: `${gapEn} — ${nextEn} starts ${shortDate(a.nextTeachingStart)}.`,
  };
}

/** Where PLANNING should open (#39): the current semester while it still
 *  teaches, otherwise the next teaching semester. Never SUMMER. */
export function getPlanningAnchor(now: Date = new Date()): { startYear: number; semester: TeachingSemester } {
  const a = getAcademicNow(now);
  if (a.phase === "teaching") return { startYear: a.startYear, semester: a.semester };
  if (a.semester === "FALL") return { startYear: a.startYear, semester: "SPRING" };
  return { startYear: a.startYear + 1, semester: "FALL" };
}

/**
 * The student's year-of-study, derived from the startYear anchor. PPE is a
 * 3-year degree → clamp to 1..3 (YEAR_CONFIG has exactly 1-3; the settings
 * start-year select is the correction lever for edge cases — critique find).
 * Null anchor → the stored profile year (legacy fallback).
 */
export function deriveYearOfStudy(
  startYear: number | null | undefined,
  storedYear: number,
  atStartYear?: number,
  now: Date = new Date(),
): number {
  if (startYear == null) return storedYear;
  const nowYear = atStartYear ?? getAcademicNow(now).startYear;
  return Math.min(3, Math.max(1, nowYear - startYear + 1));
}

const HEBREW_YEAR_LABELS: Record<number, string> = {
  2022: "תשפ״ג",
  2023: "תשפ״ד",
  2024: "תשפ״ה",
  2025: "תשפ״ו",
  2026: "תשפ״ז",
  2027: "תשפ״ח",
};

export function hebrewYearLabel(startYear: number): string {
  return HEBREW_YEAR_LABELS[startYear] ?? `${startYear}/${(startYear + 1) % 100}`;
}

/** Teaching range for exports (ICS / Google sync): the requested semester's
 *  CURRENT run while it still teaches, otherwise its next occurrence. */
export function getTeachingRange(
  semester: TeachingSemester,
  now: Date = new Date(),
): { start: Date; end: Date } {
  for (const cal of TAU_CALENDARS) {
    const s = cal[semester];
    if (now <= endOfDay(s.teachingEnd)) return { start: s.teachingStart, end: s.teachingEnd };
  }
  const last = TAU_CALENDARS[TAU_CALENDARS.length - 1]![semester];
  return { start: last.teachingStart, end: last.teachingEnd };
}
