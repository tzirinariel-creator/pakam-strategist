// =========================================
// Client id → persistent id, for manually added courses (#8)
// =========================================
// A course the student types into the planner lives under a client-only id
// (`custom-<uuid>`) until the server registers a real Course row for it. Every
// consumer downstream (savePlan's `z.string().uuid()`, the discipline
// attribution map) must see the PERSISTENT id — a leftover client id is the
// exact reason a manually added course used to be dropped with a toast.
//
// Pure on purpose: this is the one step where a saved course can silently turn
// into a discarded one, so it's unit-tested rather than trusted.

import type { PlannedSemester } from "./index";

export interface ResolvedCustomCourse {
  clientId: string;
  courseId: string;
}

/**
 * Rewrite every client-side custom id to the persistent course id it resolved
 * to — in the planned semesters AND in the discipline-attribution map, so the
 * student's declaration lands on the row that actually gets saved.
 *
 * Ids with no resolution are left untouched (the caller reports them; they are
 * dropped by the save, never silently).
 */
export function applyResolvedCustomIds(
  semesters: PlannedSemester[],
  disciplineOverrides: Record<string, string>,
  resolved: ResolvedCustomCourse[],
): { semesters: PlannedSemester[]; disciplineOverrides: Record<string, string> } {
  if (resolved.length === 0) return { semesters, disciplineOverrides };

  const realId = new Map(resolved.map((r) => [r.clientId, r.courseId]));

  return {
    semesters: semesters.map((s) => ({
      ...s,
      courseIds: s.courseIds.map((id) => realId.get(id) ?? id),
    })),
    disciplineOverrides: Object.fromEntries(
      Object.entries(disciplineOverrides).map(([id, discipline]) => [
        realId.get(id) ?? id,
        discipline,
      ]),
    ),
  };
}
