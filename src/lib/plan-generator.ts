// =========================================
// Pakamon — Smart Plan Generator
// =========================================
//
// Generates a single intelligent study plan for PPE students.
// - Places mandatory courses per ידיעון year/semester
// - Validates prerequisites (topological ordering)
// - Detects schedule conflicts
// - Fills electives based on focus area
// - Strictly caps at 150 credits
// - Computes per-semester analytics for the UI

import type { Course } from "@prisma/client";
import type { ProgramDefinition } from "@/lib/programs/types";
import { getActiveProgram } from "@/lib/programs/registry";

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

export interface GeneratedPlanCourse {
  courseId: string;
  plannedYear: number;
  plannedSemester: "FALL" | "SPRING" | "SUMMER";
  locked: boolean; // mandatory courses can't be moved
}

export interface PlanWarning {
  type: "prerequisite" | "conflict" | "overload" | "missing_requirement";
  severity: "error" | "warning" | "info";
  courseId?: string;
  message: string;
  messageHe: string;
}

export interface ScheduleConflict {
  courseA: string; // courseId
  courseB: string;
  day: string;
  time: string;
}

export interface SemesterAnalytics {
  year: number;
  semester: "FALL" | "SPRING";
  credits: number;
  courseCount: number;
  weeklyHours: number;
  examCount: number;
  workloadScore: number; // 0-100, composite metric
  conflicts: ScheduleConflict[];
}

export interface CreditBreakdown {
  mandatory: number;
  elective: number;
  seminar: number;
  law: number;
  byDiscipline: Record<string, number>;
}

export interface InteractivePlan {
  courses: GeneratedPlanCourse[];
  totalCredits: number;
  semesterAnalytics: SemesterAnalytics[];
  creditBreakdown: CreditBreakdown;
  warnings: PlanWarning[];
  funFacts: string[];
  funFactsEn: string[];
}

// Backwards-compatible aliases (used by onboarding-wizard + step-ready)
export type GeneratedPlanWithVariants = InteractivePlan;
export type SemesterBreakdown = SemesterAnalytics;

// Flexible type: accepts both full ScheduleSession and partial (from tRPC select)
export interface ScheduleSessionLike {
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  sessionType: string;
  /** Which semester this session runs in. A course offered in both FALL and
   *  SPRING carries sessions for each; the timetable must filter to the
   *  selected semester or it paints both onto one grid (phantom conflicts). */
  semester?: string | null;
  room?: string | null;
  building?: string | null;
  groupCode?: string | null;
  lecturerName?: string | null;
}

// Course with optional schedule sessions for plan generation.
// discipline is natively String in Prisma after C3 migration.
export type CourseWithSchedule = Course & {
  scheduleSessions?: ScheduleSessionLike[];
};

// -----------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------

const FUN_FACTS_HE = [
  "ידעת ש-78% מהציון הסופי בפכ\"מ מגיע מציוני הקורסים?",
  "ידעת שצריך 4 סמינריונים כדי לסיים את התואר?",
  "ידעת שתואר פכ\"מ כולל 150 ש\"ס?",
  "ידעת שאפשר לבחור תחום מיקוד מתוך 3 דיסציפלינות?",
  "ידעת שהציון המינימלי למעבר שנה הוא 75 כללי ו-80 בפכ\"מ?",
  "ידעת שאפשר לספור קורס מתחום אחד לתחום אחר?",
  "ידעת שיש 10 קורסי יסוד במשפטים לבחור מתוכם?",
  "ידעת שקורס אינטגרטיבי בשנה ב׳ משלב כלכלה ומדע המדינה?",
] as const;

const FUN_FACTS_EN = [
  "Did you know 78% of your final PPE grade comes from course grades?",
  "Did you know you need 4 seminars to graduate?",
  "Did you know the PPE degree totals 150 credit hours?",
  "Did you know you can choose a focus area from 3 disciplines?",
  "Did you know the minimum passing grade is 75 overall and 80 in PPE?",
  "Did you know you can count a course from one discipline toward another?",
  "Did you know there are 10 foundation Law courses to choose from?",
  "Did you know the integrative course in Year B combines Economics and Political Science?",
] as const;

const MAX_CREDITS_PER_SEMESTER = 30;

// -----------------------------------------------------------------------
// Main entry point
// -----------------------------------------------------------------------

export function generateDefaultPlan(
  allCourses: CourseWithSchedule[],
  _year: number,
  focusArea: string | null,
  program?: ProgramDefinition
): InteractivePlan {
  const totalTarget = program?.creditRequirements.total
    ?? getActiveProgram().creditRequirements.total;
  const courseMap = new Map(allCourses.map((c) => [c.id, c]));
  const codeToId = new Map(allCourses.map((c) => [c.code, c.id]));

  // Step 1: Place mandatory courses in their correct year/semester
  const planned: GeneratedPlanCourse[] = [];
  const plannedIds = new Set<string>();

  for (let y = 1; y <= 3; y++) {
    placeMandatoryCourses(allCourses, y, planned, plannedIds);
  }

  // Step 2: Place seminars (2 in year 2, 2 in year 3 = 4 total)
  placeSeminars(allCourses, focusArea, planned, plannedIds);

  // Step 3: Place law foundation courses (3 courses across years 2-3)
  placeLawFoundation(allCourses, planned, plannedIds);

  // Step 4: Fill with electives based on focus area, respecting the credit cap
  fillElectives(allCourses, focusArea, planned, plannedIds, courseMap, totalTarget);

  // Step 5: Compute analytics
  const semesterAnalytics = computeAllSemesterAnalytics(planned, allCourses);
  const creditBreakdown = computeCreditBreakdown(planned, courseMap);
  const warnings = validatePlan(planned, allCourses, codeToId);
  const totalCredits = planned.reduce((sum, pc) => {
    return sum + (courseMap.get(pc.courseId)?.credits ?? 0);
  }, 0);

  // Pick fun facts
  const indices = Array.from({ length: FUN_FACTS_HE.length }, (_, i) => i)
    .sort(() => Math.random() - 0.5);
  const i0 = indices[0] ?? 0;
  const i1 = indices[1] ?? 1;

  return {
    courses: planned,
    totalCredits,
    semesterAnalytics,
    creditBreakdown,
    warnings,
    funFacts: [FUN_FACTS_HE[i0]!, FUN_FACTS_HE[i1]!],
    funFactsEn: [FUN_FACTS_EN[i0]!, FUN_FACTS_EN[i1]!],
  };
}

// -----------------------------------------------------------------------
// Step 1: Place mandatory courses
// -----------------------------------------------------------------------

function placeMandatoryCourses(
  allCourses: CourseWithSchedule[],
  year: number,
  planned: GeneratedPlanCourse[],
  plannedIds: Set<string>
) {
  const mandatory = allCourses.filter(
    (c) =>
      (c.courseType === "MANDATORY" || c.isMandatory) &&
      c.yearOffered.includes(year) &&
      !plannedIds.has(c.id)
  );

  for (const course of mandatory) {
    const semester = pickSemesterForCourse(course, year, planned, allCourses);
    planned.push({
      courseId: course.id,
      plannedYear: year,
      plannedSemester: semester,
      locked: true,
    });
    plannedIds.add(course.id);
  }
}

// -----------------------------------------------------------------------
// Step 2: Place seminars
// -----------------------------------------------------------------------

function placeSeminars(
  allCourses: CourseWithSchedule[],
  focusArea: string | null,
  planned: GeneratedPlanCourse[],
  plannedIds: Set<string>
) {
  const seminars = allCourses.filter(
    (c) => c.courseType === "SEMINAR" && !plannedIds.has(c.id)
  );

  // Sort: focus area first, then alphabetically
  seminars.sort((a, b) => {
    if (focusArea) {
      const af = a.discipline === focusArea ? 0 : 1;
      const bf = b.discipline === focusArea ? 0 : 1;
      if (af !== bf) return af - bf;
    }
    return a.nameHe.localeCompare(b.nameHe, "he");
  });

  // Place 2 in year 2, 2 in year 3 (4 total required)
  let placed = 0;
  for (const sem of seminars) {
    if (placed >= 4) break;
    const year = placed < 2 ? 2 : 3;
    // Check if offered in this year
    if (!sem.yearOffered.includes(year) && sem.yearOffered.length > 0) continue;
    const semester = pickSemesterForCourse(sem, year, planned, allCourses);
    planned.push({
      courseId: sem.id,
      plannedYear: year,
      plannedSemester: semester,
      locked: false,
    });
    plannedIds.add(sem.id);
    placed++;
  }
}

// -----------------------------------------------------------------------
// Step 3: Place law foundation courses
// -----------------------------------------------------------------------

function placeLawFoundation(
  allCourses: CourseWithSchedule[],
  planned: GeneratedPlanCourse[],
  plannedIds: Set<string>
) {
  const lawCourses = allCourses.filter(
    (c) => c.courseType === "LAW_FOUNDATION" && !plannedIds.has(c.id)
  );

  // Pick 3 law courses: 2 in year 2, 1 in year 3
  const targets = [
    { year: 2, count: 2 },
    { year: 3, count: 1 },
  ];

  for (const { year, count } of targets) {
    let placed = 0;
    for (const course of lawCourses) {
      if (placed >= count) break;
      if (plannedIds.has(course.id)) continue;
      if (!course.yearOffered.includes(year) && course.yearOffered.length > 0) continue;
      const semester = pickSemesterForCourse(course, year, planned, allCourses);
      planned.push({
        courseId: course.id,
        plannedYear: year,
        plannedSemester: semester,
        locked: false,
      });
      plannedIds.add(course.id);
      placed++;
    }
  }
}

// -----------------------------------------------------------------------
// Step 4: Fill electives to reach 150 credits
// -----------------------------------------------------------------------

function fillElectives(
  allCourses: CourseWithSchedule[],
  focusArea: string | null,
  planned: GeneratedPlanCourse[],
  plannedIds: Set<string>,
  courseMap: Map<string, CourseWithSchedule>,
  totalTarget: number
) {
  const currentCredits = () =>
    planned.reduce((sum, pc) => sum + (courseMap.get(pc.courseId)?.credits ?? 0), 0);

  if (currentCredits() >= totalTarget) return;

  // Available electives
  const electives = allCourses.filter(
    (c) =>
      !plannedIds.has(c.id) &&
      (c.courseType === "ELECTIVE" || c.courseType === "PRACTICE" || c.courseType === "ENGLISH")
  );

  // Sort: focus area first, then by difficulty ascending (easier first), then credits descending
  // This makes the planner prefer easier electives, saving capacity for mandatory hard courses
  electives.sort((a, b) => {
    if (focusArea) {
      const af = a.discipline === focusArea ? 0 : 1;
      const bf = b.discipline === focusArea ? 0 : 1;
      if (af !== bf) return af - bf;
    }
    // Prefer easier electives
    const da = difficultyScore(a);
    const db = difficultyScore(b);
    if (da !== db) return da - db;
    return b.credits - a.credits;
  });

  for (const course of electives) {
    if (currentCredits() >= totalTarget) break;
    // Don't exceed the target (with a small +2 tolerance)
    if (currentCredits() + course.credits > totalTarget + 2) continue;

    // Pick earliest valid year
    const years = course.yearOffered.length > 0 ? course.yearOffered : [1, 2, 3];
    const year = years[0]!;

    // Check semester credits don't blow up
    const semester = pickSemesterForCourse(course, year, planned, allCourses);
    const semCredits = planned
      .filter((pc) => pc.plannedYear === year && pc.plannedSemester === semester)
      .reduce((sum, pc) => sum + (courseMap.get(pc.courseId)?.credits ?? 0), 0);

    if (semCredits + course.credits > MAX_CREDITS_PER_SEMESTER) continue;

    // Difficulty guard: avoid placing hard electives in semesters already heavy with hard courses
    const isHard = course.difficultyLevel === "hard" || course.difficultyLevel === "very_hard";
    if (isHard) {
      const hardCount = countHardCourses(year, semester, planned, courseMap);
      if (hardCount >= 2) continue; // skip — this semester already has 2+ hard courses
    }

    planned.push({
      courseId: course.id,
      plannedYear: year,
      plannedSemester: semester,
      locked: false,
    });
    plannedIds.add(course.id);
  }
}

// -----------------------------------------------------------------------
// Semester picker
// -----------------------------------------------------------------------

/** Numeric difficulty for sorting/balancing. Higher = harder. */
function difficultyScore(course: CourseWithSchedule): number {
  const scores: Record<string, number> = { easy: 0, moderate: 1, hard: 2, very_hard: 3 };
  return scores[course.difficultyLevel ?? ""] ?? 1; // default to "moderate" if unknown
}

/** Count hard/very_hard courses in a specific semester slot. */
function countHardCourses(
  year: number,
  semester: string,
  planned: GeneratedPlanCourse[],
  courseMap: Map<string, CourseWithSchedule>
): number {
  return planned
    .filter((pc) => pc.plannedYear === year && pc.plannedSemester === semester)
    .reduce((count, pc) => {
      const c = courseMap.get(pc.courseId);
      if (!c) return count;
      const dl = c.difficultyLevel;
      return count + (dl === "hard" || dl === "very_hard" ? 1 : 0);
    }, 0);
}

function pickSemesterForCourse(
  course: CourseWithSchedule,
  year: number,
  planned: GeneratedPlanCourse[],
  allCourses: CourseWithSchedule[]
): "FALL" | "SPRING" {
  const offered = course.semesterOffered.map(String);
  const canFall = offered.includes("FALL");
  const canSpring = offered.includes("SPRING");

  // If only one option
  if (canFall && !canSpring) return "FALL";
  if (canSpring && !canFall) return "SPRING";

  // Both available — balance using credits + difficulty
  const courseMap = new Map(allCourses.map((c) => [c.id, c]));

  const fallCredits = planned
    .filter((pc) => pc.plannedYear === year && pc.plannedSemester === "FALL")
    .reduce((sum, pc) => sum + (courseMap.get(pc.courseId)?.credits ?? 0), 0);
  const springCredits = planned
    .filter((pc) => pc.plannedYear === year && pc.plannedSemester === "SPRING")
    .reduce((sum, pc) => sum + (courseMap.get(pc.courseId)?.credits ?? 0), 0);

  const isHardCourse = course.difficultyLevel === "hard" || course.difficultyLevel === "very_hard";

  if (isHardCourse) {
    // For hard courses: prefer the semester with fewer hard courses
    const fallHard = countHardCourses(year, "FALL", planned, courseMap);
    const springHard = countHardCourses(year, "SPRING", planned, courseMap);
    if (fallHard !== springHard) {
      return fallHard <= springHard ? "FALL" : "SPRING";
    }
    // Tie-break on credits
  }

  return fallCredits <= springCredits ? "FALL" : "SPRING";
}

// -----------------------------------------------------------------------
// Analytics
// -----------------------------------------------------------------------

export function computeAllSemesterAnalytics(
  planned: GeneratedPlanCourse[],
  allCourses: CourseWithSchedule[]
): SemesterAnalytics[] {
  const courseMap = new Map(allCourses.map((c) => [c.id, c]));
  const analytics: SemesterAnalytics[] = [];

  for (let y = 1; y <= 3; y++) {
    for (const sem of ["FALL", "SPRING"] as const) {
      const semCourses = planned.filter(
        (pc) => pc.plannedYear === y && pc.plannedSemester === sem
      );
      const courses = semCourses
        .map((pc) => courseMap.get(pc.courseId))
        .filter((c): c is CourseWithSchedule => c != null);

      const credits = courses.reduce((s, c) => s + c.credits, 0);
      const weeklyHours = courses.reduce((s, c) => s + (c.weeklyHours ?? 0), 0);
      const examCount = courses.filter((c) => c.submissionType === "EXAM").length;
      const conflicts = detectConflicts(courses);

      // Workload score: 0-100 composite
      // credits weight: 30%, hours weight: 20%, exams weight: 15%, conflicts weight: 5%, difficulty weight: 30%
      const creditScore = Math.min((credits / MAX_CREDITS_PER_SEMESTER) * 100, 100);
      const hourScore = Math.min((weeklyHours / 24) * 100, 100);
      const examScore = Math.min((examCount / 6) * 100, 100);
      const conflictScore = Math.min(conflicts.length * 25, 100);

      // Difficulty score: based on avg difficulty of courses in this semester
      const semDiffScores = courses.map((c) => difficultyScore(c));
      const avgDiff = semDiffScores.length > 0
        ? semDiffScores.reduce((a, b) => a + b, 0) / semDiffScores.length
        : 0;
      const diffScore = Math.min((avgDiff / 3) * 100, 100); // 0=easy, 3=very_hard → 0-100

      const workloadScore = Math.round(
        creditScore * 0.3 + hourScore * 0.2 + examScore * 0.15 + conflictScore * 0.05 + diffScore * 0.3
      );

      analytics.push({
        year: y,
        semester: sem,
        credits,
        courseCount: semCourses.length,
        weeklyHours,
        examCount,
        workloadScore,
        conflicts,
      });
    }
  }

  return analytics;
}

export function detectConflicts(
  courses: CourseWithSchedule[]
): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  const sessions: { courseId: string; day: string; start: number; end: number }[] = [];

  for (const course of courses) {
    for (const session of course.scheduleSessions ?? []) {
      sessions.push({
        courseId: course.id,
        day: session.dayOfWeek,
        start: timeToMinutes(session.startTime),
        end: timeToMinutes(session.endTime),
      });
    }
  }

  // Pairwise check within same day
  for (let i = 0; i < sessions.length; i++) {
    for (let j = i + 1; j < sessions.length; j++) {
      const a = sessions[i]!;
      const b = sessions[j]!;
      if (a.courseId === b.courseId) continue;
      if (a.day !== b.day) continue;
      if (a.start < b.end && b.start < a.end) {
        conflicts.push({
          courseA: a.courseId,
          courseB: b.courseId,
          day: a.day,
          time: `${minutesToTime(Math.max(a.start, b.start))}-${minutesToTime(Math.min(a.end, b.end))}`,
        });
      }
    }
  }

  return conflicts;
}

function timeToMinutes(time: string): number {
  const parts = time.split(":").map(Number);
  const h = Number.isFinite(parts[0]) ? parts[0]! : 0;
  const m = Number.isFinite(parts[1]) ? parts[1]! : 0;
  return h * 60 + m;
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// -----------------------------------------------------------------------
// Credit breakdown
// -----------------------------------------------------------------------

function computeCreditBreakdown(
  planned: GeneratedPlanCourse[],
  courseMap: Map<string, CourseWithSchedule>
): CreditBreakdown {
  let mandatory = 0;
  let elective = 0;
  let seminar = 0;
  let law = 0;
  const byDiscipline: Record<string, number> = {};

  for (const pc of planned) {
    const c = courseMap.get(pc.courseId);
    if (!c) continue;
    const cr = c.credits;

    if (c.courseType === "MANDATORY" || c.isMandatory) mandatory += cr;
    else if (c.courseType === "SEMINAR") seminar += cr;
    else if (c.courseType === "LAW_FOUNDATION") law += cr;
    else elective += cr;

    byDiscipline[c.discipline] = (byDiscipline[c.discipline] ?? 0) + cr;
  }

  return { mandatory, elective, seminar, law, byDiscipline };
}

// -----------------------------------------------------------------------
// Validation
// -----------------------------------------------------------------------

function validatePlan(
  planned: GeneratedPlanCourse[],
  allCourses: CourseWithSchedule[],
  codeToId: Map<string, string>
): PlanWarning[] {
  const warnings: PlanWarning[] = [];
  const courseMap = new Map(allCourses.map((c) => [c.id, c]));

  // Build a map of courseId → (year, semester) for ordering
  const placementOf = new Map<string, { year: number; sem: string }>();
  for (const pc of planned) {
    placementOf.set(pc.courseId, { year: pc.plannedYear, sem: pc.plannedSemester });
  }

  const semIdx = (sem: string) => (sem === "FALL" ? 0 : 1);
  const placement = (y: number, s: string) => y * 10 + semIdx(s);

  for (const pc of planned) {
    const course = courseMap.get(pc.courseId);
    if (!course) continue;

    // Check prerequisites — ADVISORY ONLY for PPE.
    // TAU PPE students are formally exempt from course prerequisites
    // (Yedion note 19), so unmet/out-of-order prereqs are surfaced as soft
    // ordering hints (severity "info"), NEVER as blocking errors. The econ
    // chain (math/stats → micro → macro → econometrics) is a sensible default
    // ordering, not a binding gate.
    for (const prereqCode of course.prerequisites) {
      const prereqId = codeToId.get(prereqCode);
      if (!prereqId) continue;
      const prereqPlacement = placementOf.get(prereqId);
      if (!prereqPlacement) {
        warnings.push({
          type: "prerequisite",
          severity: "info",
          courseId: pc.courseId,
          message: `Prerequisite "${prereqCode}" for "${course.nameEn ?? course.nameHe}" is not in the plan`,
          messageHe: `קדם "${prereqCode}" של "${course.nameHe}" לא בתוכנית`,
        });
      } else {
        const pPlacement = placement(prereqPlacement.year, prereqPlacement.sem);
        const cPlacement = placement(pc.plannedYear, pc.plannedSemester);
        if (pPlacement >= cPlacement) {
          warnings.push({
            type: "prerequisite",
            severity: "info",
            courseId: pc.courseId,
            message: `"${course.nameEn ?? course.nameHe}" requires "${prereqCode}" to be completed first`,
            messageHe: `"${course.nameHe}" דורש את "${prereqCode}" לפני`,
          });
        }
      }
    }

    // Check semester offering
    const offered = course.semesterOffered.map(String);
    if (offered.length > 0 && !offered.includes(pc.plannedSemester)) {
      warnings.push({
        type: "missing_requirement",
        severity: "error",
        courseId: pc.courseId,
        message: `"${course.nameEn ?? course.nameHe}" is not offered in ${pc.plannedSemester}`,
        messageHe: `"${course.nameHe}" לא מוצע ב${pc.plannedSemester === "FALL" ? "סמסטר א׳" : "סמסטר ב׳"}`,
      });
    }
  }

  // Check semester credit overload
  for (let y = 1; y <= 3; y++) {
    for (const sem of ["FALL", "SPRING"] as const) {
      const credits = planned
        .filter((pc) => pc.plannedYear === y && pc.plannedSemester === sem)
        .reduce((sum, pc) => sum + (courseMap.get(pc.courseId)?.credits ?? 0), 0);
      if (credits > MAX_CREDITS_PER_SEMESTER) {
        warnings.push({
          type: "overload",
          severity: "warning",
          message: `Year ${y} ${sem} has ${credits} credits (max ${MAX_CREDITS_PER_SEMESTER})`,
          messageHe: `שנה ${y === 1 ? "א׳" : y === 2 ? "ב׳" : "ג׳"} ${sem === "FALL" ? "סמסטר א׳" : "סמסטר ב׳"}: ${credits} ש״ס (מקסימום ${MAX_CREDITS_PER_SEMESTER})`,
        });
      }
    }
  }

  return warnings;
}

export function canTakeCourse(
  courseId: string,
  year: number,
  semester: "FALL" | "SPRING",
  planned: GeneratedPlanCourse[],
  allCourses: CourseWithSchedule[]
): { ok: boolean; reason?: string; reasonHe?: string; prereqAdvisory?: boolean } {
  const courseMap = new Map(allCourses.map((c) => [c.id, c]));
  const codeToId = new Map(allCourses.map((c) => [c.code, c.id]));
  const course = courseMap.get(courseId);
  if (!course) return { ok: false, reason: "Course not found" };

  // Check semester offering — this remains a HARD gate (the course genuinely
  // isn't taught this semester).
  const offered = course.semesterOffered.map(String);
  if (offered.length > 0 && !offered.includes(semester)) {
    return {
      ok: false,
      reason: `Not offered in ${semester}`,
      reasonHe: `לא מוצע ב${semester === "FALL" ? "סמסטר א׳" : "סמסטר ב׳"}`,
    };
  }

  // Per-course prerequisites are ADVISORY for PPE, NEVER a hard gate:
  // TAU PPE students are formally exempt from course prerequisites (Yedion note 19).
  // We still surface the first unmet prereq as a soft ordering hint (ok stays true),
  // so callers can show an advisory cue without blocking the course.
  const semIdx = (s: string) => (s === "FALL" ? 0 : 1);
  const targetOrder = year * 10 + semIdx(semester);

  for (const prereqCode of course.prerequisites) {
    const prereqId = codeToId.get(prereqCode);
    if (!prereqId) continue;
    const prereqEntry = planned.find((pc) => pc.courseId === prereqId);
    if (!prereqEntry) {
      return {
        ok: true,
        prereqAdvisory: true,
        reason: `Prerequisite ${prereqCode} not in plan`,
        reasonHe: `קדם ${prereqCode} חסר מהתוכנית`,
      };
    }
    const prereqOrder = prereqEntry.plannedYear * 10 + semIdx(prereqEntry.plannedSemester);
    if (prereqOrder >= targetOrder) {
      return {
        ok: true,
        prereqAdvisory: true,
        reason: `Prerequisite ${prereqCode} must come first`,
        reasonHe: `קדם ${prereqCode} צריך להיות לפני`,
      };
    }
  }

  return { ok: true };
}
