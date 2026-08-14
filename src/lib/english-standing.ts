import { ENGLISH_CONFIG, passBarFor, type EnglishLevelInfo } from "@/lib/constants";

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

/**
 * Does this NAME look like an English course? The one name heuristic, for rows
 * that carry no courseType at all — a scanned transcript line, an off-catalog
 * elective. Four variants of this existed: two checked `courseType === "ENGLISH"`
 * as well and two did not, and the two families used different regexes
 * (`/\benglish\b/` on a lowercased string vs `/english/i` with no word
 * boundary), so "Englishman Studies" was an English course to half the app.
 * The word boundary wins: it is the stricter of the two, and a false POSITIVE
 * here raises a student's pass bar from 60 to 70 — the expensive direction.
 */
export function looksEnglishByName(name: string | null | undefined): boolean {
  if (!name) return false;
  return /אנגלית/.test(name) || /\benglish\b/i.test(name);
}

/**
 * Is this course taught in English? `courseType === "ENGLISH"` is the canonical
 * flag the credit-calculator and the regulation engine use; the name match is
 * the fallback for a catalog row not yet typed ENGLISH.
 *
 * This matters beyond a label: English has a DIFFERENT pass bar in the
 * humanities faculty (70, not 60 — ENGLISH_CONFIG.COURSE_PASSING_GRADE), so a
 * variant that misses an English course records a 65 as a pass the university
 * does not recognise.
 */
export function isEnglishCourse(course: {
  courseType?: string | null;
  nameHe?: string | null;
  nameEn?: string | null;
}): boolean {
  if (course.courseType === "ENGLISH") return true;
  return looksEnglishByName(`${course.nameHe ?? ""} ${course.nameEn ?? ""}`);
}

/** The pass bar for a row with NO courseType, decided by its name. Routes
 *  through the one `passBarFor` so there is still a single bar in the app. */
export function passBarForName(name: string | null | undefined): number {
  return passBarFor(looksEnglishByName(name) ? "ENGLISH" : undefined);
}

/** Preparatory LEVEL courses are English courses whose name also names a level.
 *  An English CONTENT course ("אנגלית לכלכלנים") names no level and is excluded —
 *  it counts toward PKM-012, a different requirement entirely. */
export function isEnglishLevelCourseName(name: string | null | undefined): boolean {
  if (!name) return false;
  if (!looksEnglishByName(name)) return false;
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
  if (c.grade != null) return c.grade >= passBarFor("ENGLISH");
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
