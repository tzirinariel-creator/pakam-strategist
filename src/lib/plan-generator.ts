// =========================================
// Pakamon — Plan course types + prerequisite advisory
// =========================================
//
// Historical note: this file used to hold an automatic plan generator
// (`generateDefaultPlan`) that placed mandatory courses, seminars, law
// foundations and electives on its own, plus its analytics/validation
// helpers. Nothing called it — the product builds plans from the user's own
// choices in the semester planner, and conflict detection moved to
// `@/lib/planner-conflicts`. The dead engine was removed; what remains is
// the shared course/session shapes every planner surface imports, and the
// advisory prerequisite check used by the course pool.

import type { Course } from "@prisma/client";

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

export interface GeneratedPlanCourse {
  courseId: string;
  plannedYear: number;
  plannedSemester: "FALL" | "SPRING" | "SUMMER";
  locked: boolean; // mandatory courses can't be moved
}

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
// Prerequisite advisory
// -----------------------------------------------------------------------

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
