import { passBarFor, type EnglishLevelInfo } from "@/lib/constants";

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
  /** TAU's own code. 2171-xxxx is the English unit — the registrar's answer. */
  code?: string | null;
  courseCode?: string | null;
}): boolean {
  if (course.courseType === "ENGLISH") return true;
  if (looksEnglishByName(`${course.nameHe ?? ""} ${course.nameEn ?? ""}`)) return true;
  // Ariel, 21.8, for the third time: "מתקדמים ב׳ - עדיין לא הצלחת להגדיר את זה
  // בתור אנגלית וזה משפיע לרעה", and "אני מזכיר שאנגלית לא נכנס בממוצע".
  //
  // Those two complaints were the same bug. isEnglishLevelCourseName already
  // recognised his row — "מתקדמים ב' חוצה דיצפלינות בין תחומי", code
  // 2171-9201 — but THIS function is the one the rest of the app asks, and it
  // still demanded the literal word "אנגלית", which TAU does not print. So the
  // pass bar, the credit engine and the average-exclusion all saw an ordinary
  // elective: his English course counted toward his degree average, and
  // nothing could tell he had finished the English track.
  //
  // Delegating to the level-course predicate instead of repeating its rules
  // is the point — two functions answering "is this English?" differently is
  // how this survived being fixed once already.
  return isEnglishLevelCourseName(course.nameHe, course.code ?? course.courseCode ?? null);
}

/** The pass bar for a row with NO courseType, decided by its name. Routes
 *  through the one `passBarFor` so there is still a single bar in the app. */
export function passBarForName(name: string | null | undefined): number {
  return passBarFor(looksEnglishByName(name) ? "ENGLISH" : undefined);
}

/**
 * TAU's course code for the English unit. A row carrying it is an English
 * course no matter what its name says — the registrar's own classification,
 * which beats any heuristic we could write.
 */
const ENGLISH_UNIT_CODE = /^2171-/;

/**
 * Preparatory LEVEL courses.
 *
 * Ariel, 21.8: "למה הוא לא מבין אוטומטית שמתקדמים ב׳ למשל זה אנגלית והוא
 * מבקש ממני הצהרה". Because this used to require the word "אנגלית" to appear
 * in the name — and TAU does not print it. His actual row reads
 * "מתקדמים ב' חוצה דיצפלינות בין תחומי" under course code 2171-9201: an
 * English level course with no "אנגלית" anywhere in it. So the app couldn't
 * see it, kept counting a level course as still owed, and asked him to declare
 * something the sheet had already stated.
 *
 * Recognised three ways now, strongest first:
 *   1. the 2171 course code — the registrar's own answer;
 *   2. an explicit English name plus a level word (the original path);
 *   3. a name that OPENS with a level phrase — "מתקדמים ב׳ …", "טרום בסיסי …" —
 *      which is exactly how TAU titles these and nothing else.
 *
 * Anchoring (3) to the start is what keeps it honest: "נושאים מתקדמים בכלכלה"
 * contains "מתקדמים" but does not begin with it, so it is not swept in. An
 * English CONTENT course ("אנגלית לכלכלנים") names no level and stays excluded —
 * it counts toward PKM-012, a different requirement entirely.
 */
export function isEnglishLevelCourseName(
  name: string | null | undefined,
  courseCode?: string | null,
): boolean {
  if (courseCode && ENGLISH_UNIT_CODE.test(courseCode.trim())) return true;
  if (!name) return false;
  // "טרום בסיסי" contains "בסיסי", so it is matched by the BASIC pattern too —
  // both are level courses, which is all this predicate is asked to decide.
  const namesALevel = /טרום/.test(name) || LEVEL_LADDER.some((l) => l.match.test(name));
  if (looksEnglishByName(name) && namesALevel) return true;
  // A title that OPENS with the level is TAU's own naming for these rows.
  return /^\s*(?:טרום\s*)?(?:בסיסי|מתקדמים\s*[אב])/.test(name);
}

export interface EnglishLevelCourseLike {
  nameHe: string;
  grade: number | null;
  /** Miluim pass/fail conversion — passed, but with no numeric grade. */
  isBinary?: boolean;
  status?: string;
  /** The registrar's own classification — 2171-xxxx is the English unit. */
  courseCode?: string | null;
}

/** A level course counts as done when it was passed. English passes at 70 in the
 *  humanities faculty (ENGLISH_CONFIG.COURSE_PASSING_GRADE), not the usual 60. A
 *  binary/COMPLETED row with no number is a pass by definition. */
function isPassed(c: EnglishLevelCourseLike): boolean {
  if (c.grade != null) return c.grade >= passBarFor("ENGLISH");
  return c.isBinary === true || c.status === "COMPLETED";
}

export function countPassedEnglishLevelCourses(courses: EnglishLevelCourseLike[]): number {
  return courses.filter((c) => isEnglishLevelCourseName(c.nameHe, c.courseCode) && isPassed(c)).length;
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
