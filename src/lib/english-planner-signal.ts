// =========================================================================
// Telling the student, while they plan, that English is already handled
// =========================================================================
// Ariel, 21.8, having raised English for the fourth time: "אני רואה שעדיין לא
// מובן במסך התכנון שעשיתי אנגלית".
//
// The previous three rounds each fixed a real bug one layer down — the name
// predicate, then the function the app actually calls, then the average filter.
// All three now work, and a test runs his exact row through the whole chain.
// This one is different: nothing was computing the wrong answer, because the
// planning screen never asked the question at all. Its insights bar reports
// credits, contact hours, campus days and exam gaps, and has never had a word
// to say about English.
//
// So a student who has finished the English track sits in the planner with no
// acknowledgement of it, which reads exactly like the app not knowing.
//
// THE LINE THIS DOES NOT CROSS, and it is the reason the wording is careful:
// passing מתקדמים ב׳ is not the same as being granted פטור. Only the מזכירות
// grants that, the regulation is not written down anywhere we can cite, and
// this project's rule is that we never state a rule we cannot source. So the
// completed state says the LEVEL COURSES are done and that confirming the
// exemption is the remaining step. That is arithmetic plus an instruction,
// not a claim about a regulation.

// resolveEnglishLevel is the single entry point: a DECLARED level beats an
// amiram score, which is the rule the rest of the app already obeys.
import { resolveEnglishLevel } from "@/lib/constants";
import {
  resolveEnglishStanding,
  isEnglishLevelCourseName,
  type EnglishLevelCourseLike,
} from "@/lib/english-standing";

export type EnglishSignalKind =
  /** Nothing known — no declared level, no score. Say nothing rather than guess. */
  | "unknown"
  /** Already exempt on the profile. */
  | "exempt"
  /** Level courses all passed — exemption still needs confirming. */
  | "level-track-done"
  /** Level courses still outstanding. */
  | "level-courses-left";

export interface EnglishSignal {
  kind: EnglishSignalKind;
  /** Level courses still owed. 0 when done or exempt. */
  remaining: number;
  /** How many the student has already passed — the evidence for the claim. */
  passed: number;
}

/**
 * What the planner should say about English, from what the app already knows.
 *
 * Returns `unknown` whenever the placement is unknown, so the caller renders
 * nothing at all. A confident-looking "0 courses left" for a student we know
 * nothing about would be worse than silence.
 */
export function englishPlannerSignal(
  englishLevel: string | null | undefined,
  amirantScore: number | null | undefined,
  completed: EnglishLevelCourseLike[],
): EnglishSignal {
  const info = resolveEnglishLevel(englishLevel ?? null, amirantScore ?? null);
  if (!info) return { kind: "unknown", remaining: 0, passed: 0 };

  const passed = completed.filter(
    (c) => isEnglishLevelCourseName(c.nameHe, c.courseCode) && isPassing(c),
  ).length;

  if (info.isExempt) return { kind: "exempt", remaining: 0, passed };

  const standing = resolveEnglishStanding(info, completed);
  const remaining = standing?.levelCoursesRemaining ?? info.levelCourses;

  if (remaining === 0 && passed > 0) {
    return { kind: "level-track-done", remaining: 0, passed };
  }
  return { kind: "level-courses-left", remaining, passed };
}

/** English passes at 70 in the humanities faculty, not the usual 60. */
function isPassing(c: EnglishLevelCourseLike): boolean {
  if (c.grade != null) return c.grade >= 70;
  return c.isBinary === true || c.status === "COMPLETED";
}
