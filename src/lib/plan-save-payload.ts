// =========================================
// The planner → savePlan payload
// =========================================
// Pure, and deliberately extracted: this is the last gate a course passes
// through before it is saved, and getting the filter wrong here is what made a
// manually added course vanish with a toast (#8). It is filtered ONLY on what
// savePlan actually rejects — a courseId that isn't a real database id —
// never on catalog membership. A course the student just added is real and
// saveable, but by design it is NOT in the catalog, and it is NOT yet in the
// plan query's cached data either (that refetches after the save).

import { isPersistedCourseId } from "@/lib/off-catalog";

export interface PlannedSemesterLike {
  year: number;
  semester: "FALL" | "SPRING";
  courseIds: string[];
}

export interface SavePlanCourse {
  courseId: string;
  plannedYear: number;
  plannedSemester: "FALL" | "SPRING";
  selectedGroups?: Record<string, string>;
  disciplineOverride?: string;
}

export interface BuildPlanPayloadResult {
  courses: SavePlanCourse[];
  /** Ids left out because they were never registered — the caller MUST tell the
   *  student. Silently dropping them is the bug this whole note is about. */
  droppedIds: string[];
}

export function buildSavePlanPayload(
  plannedSemesters: PlannedSemesterLike[],
  /** courseId → course code, for looking up session-group choices. A course
   *  registered moments ago legitimately isn't in here yet. */
  courseCodeById: Map<string, string>,
  sessionGroupSelections: Record<string, Record<string, string>>,
  disciplineOverrides: Record<string, string>,
): BuildPlanPayloadResult {
  const droppedIds: string[] = [];
  const courses = plannedSemesters.flatMap((sem) =>
    sem.courseIds.flatMap((courseId): SavePlanCourse[] => {
      if (!isPersistedCourseId(courseId)) {
        droppedIds.push(courseId);
        return [];
      }
      const code = courseCodeById.get(courseId);
      const groups = code ? sessionGroupSelections[code] : undefined;
      const discipline = disciplineOverrides[courseId];
      return [
        {
          courseId,
          plannedYear: sem.year,
          plannedSemester: sem.semester,
          ...(groups && Object.keys(groups).length > 0 ? { selectedGroups: groups } : {}),
          // The student's own attribution — a re-filed course, or an off-catalog
          // course they declared approved for their degree.
          ...(discipline ? { disciplineOverride: discipline } : {}),
        },
      ];
    }),
  );

  return { courses, droppedIds };
}
