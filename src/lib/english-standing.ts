import { ENGLISH_CONFIG, type EnglishLevelInfo } from "@/lib/constants";

/**
 * English LEVEL-course progress (Ariel's notes #6 + #18, 13.8).
 *
 * The bug: the app modelled English purely as a PLACEMENT. `resolveEnglishLevel`
 * turns a sheet label ("מתקדמים ב׳") or an Amiram score into a level, and every
 * level below פטור carries a fixed `levelCourses` count of preparatory courses
 * "still needed". Nothing anywhere reduced that count when the student actually
 * PASSED one. So a student holding a passing grade in אנגלית מתקדמים ב׳ was told,
 * on the dashboard, to "take a level course or retake Amiram" — advice to do the
 * thing he had already done — and was asked for an Amiram score the sheet had
 * already answered.
 *
 * What this module does NOT do: claim that passing a level course grants פטור.
 * That is a regulation, it is not written down anywhere in this repo, and the
 * iron rule is that we never state a rule we cannot source. What it does is
 * arithmetic that needs no regulation: `levelCourses` counts courses REMAINING,
 * so a level course already passed is one fewer remaining. When the remainder
 * reaches zero we say "you have completed the level courses" — never "you are
 * exempt". Confirming exemption stays with the מזכירות, and the copy says so.
 */

/** The level ladder, lowest → highest, with the name TAU prints for each. */
const LEVEL_LADDER = [
  { level: "BASIC", match: /בסיסי/ },
  { level: "ADVANCED_A", match: /מתקדמים\s*א/ },
  { level: "ADVANCED_B", match: /מתקדמים\s*ב/ },
] as const;

/** Preparatory LEVEL courses are English courses whose name also names a level.
 *  An English CONTENT course ("אנגלית לכלכלנים") names no level and is excluded —
 *  it counts toward PKM-012, a different requirement entirely. */
export function isEnglishLevelCourseName(name: string | null | undefined): boolean {
  if (!name) return false;
  if (!/אנגלית|english/i.test(name)) return false;
  // "טרום בסיסי" contains "בסיסי", so it is matched by the BASIC pattern too —
  // both are level courses, which is all this predicate is asked to decide.
  return /טרום/.test(name) || LEVEL_LADDER.some((l) => l.match.test(name));
}

export interface EnglishLevelCourseLike {
  nameHe: string;
  grade: number | null;
  /** Miluim pass/fail conversion — passed, but with no numeric grade. */
  isBinary?: boolean;
  status?: string;
}

/** A level course counts as done when it was passed. English passes at 70 in the
 *  humanities faculty (ENGLISH_CONFIG.COURSE_PASSING_GRADE), not the usual 60. A
 *  binary/COMPLETED row with no number is a pass by definition. */
function isPassed(c: EnglishLevelCourseLike): boolean {
  if (c.grade != null) return c.grade >= ENGLISH_CONFIG.COURSE_PASSING_GRADE;
  return c.isBinary === true || c.status === "COMPLETED";
}

export function countPassedEnglishLevelCourses(courses: EnglishLevelCourseLike[]): number {
  return courses.filter((c) => isEnglishLevelCourseName(c.nameHe) && isPassed(c)).length;
}

export interface EnglishStanding {
  /** Level courses still outstanding, after crediting the ones already passed. */
  levelCoursesRemaining: number;
  /** How many passed level courses were found (0 ⇒ nothing changed). */
  passedLevelCourses: number;
  /** True once the level track is complete. NOT the same as פטור — see above. */
  completedLevelTrack: boolean;
}

/**
 * Fold passed level courses into a resolved placement.
 *
 * `info` is whatever `resolveEnglishLevel` returned (may be null when neither a
 * level nor a score is known). Returns null in that case so callers stay neutral
 * exactly as they do today — an unknown placement plus a passed level course is
 * still not enough to state a position.
 */
export function resolveEnglishStanding(
  info: EnglishLevelInfo | null,
  courses: EnglishLevelCourseLike[],
): EnglishStanding | null {
  if (!info) return null;
  const passed = countPassedEnglishLevelCourses(courses);
  const remaining = Math.max(0, info.levelCourses - passed);
  return {
    levelCoursesRemaining: remaining,
    passedLevelCourses: passed,
    completedLevelTrack: remaining === 0,
  };
}
