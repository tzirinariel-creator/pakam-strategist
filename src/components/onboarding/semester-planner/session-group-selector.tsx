// The two group helpers the rest of the app imports. The component that used to
// live here — a row of group CHIPS inside "הסמסטר שלי" — is gone (13.8):
//   • it sat ~1350px below the top of the planner, under a ~700px grid, inside
//     a 380px scroll box, so on a 1280×800 laptop you could not see the week
//     change when you picked;
//   • it described a group by ONE meeting when half the תשפ״ז groups meet more
//     than once, and it never said whether a group would clash;
//   • it previewed on mouseenter/focus, and on a trackpad tap focus and click
//     fire together — so it previewed and committed in the same instant.
// Choosing now happens in the rail beside the grid (`group-rail.tsx`) or on the
// block itself (`group-picker-popover.tsx`), both rendering the same GroupRow.

import { filterSessionsByGroups, hasGroupChoice } from "@/lib/session-groups";
import type { ScheduleSessionLike } from "@/lib/plan-generator";

/**
 * For a course, returns the filtered sessions based on selected groups.
 * - "ALL" sessions are always included
 * - For session types with multiple groups, only the selected group is included
 * - For session types with a single group, that group is included
 *
 * The rule itself now lives in `@/lib/session-groups` — the ONE copy the
 * server, the calendar and this planner all run, so the week a student approves
 * here is the week every other screen draws (it used to differ: the server
 * returned all six tutorial groups when nothing was saved).
 */
export function filterSessionsBySelectedGroups(
  sessions: ScheduleSessionLike[],
  selectedGroups: Record<string, string> // sessionType → groupCode
): ScheduleSessionLike[] {
  return filterSessionsByGroups(sessions, selectedGroups);
}

/**
 * Checks if a course has any session types with multiple groups.
 * Used to decide whether to show the group selector.
 */
export function courseHasMultipleGroups(sessions: ScheduleSessionLike[]): boolean {
  return hasGroupChoice(sessions);
}
