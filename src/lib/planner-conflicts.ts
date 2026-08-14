// =========================================
// Planner conflicts — ONE count, one red
// =========================================
// The planner used to run THREE conflict engines over the same screen:
//   • `plan-generator.detectConflicts` fed the insights bar — it skipped pairs
//     that belong to the same course and never deduped the catalog's duplicate
//     rows. (Deleted 14.8 once nothing called it; this module replaced it.)
//   • `timetable-conflicts.findConflictPairs` drew the red on the grid — it
//     dedupes, and counts a lecture clashing with its own tutorial,
//   • `conflict-detector.detectTimeConflicts` pre-flagged the picker's options.
// The visible result was the grid naming a clash in red while the card above it
// said "0 התנגשויות" in green — and because the "מצאו לי שילוב" button was gated
// on that zero, it never appeared for the one clash a group swap could fix.
//
// This module is the grid's engine, in the shape the insights bar needs. Both
// now count exactly the same thing over exactly the same deduped meetings.
//
// The dedupe is not cosmetic: 140 distinct meetings in the תשפ״ז catalog are
// stored more than once (98 twice, 35 three times, up to six). Two clashing
// courses with duplicated rows produce k×m identical pairs, so an undeduped
// count inflated the same single clash up to six-fold.

import {
  dedupeMeetings,
  findConflictPairs,
  formatHourRange,
  type ConflictCandidate,
  type ConflictPair,
} from "@/lib/timetable-conflicts";
import type { CourseWithSchedule } from "@/lib/plan-generator";
import { hhmmToHours } from "@/lib/time-of-day";

/** Sun–Fri, exactly the columns the grid draws. Saturday never appears. */
const DAY_INDEX: Record<string, number> = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
};

const DAY_NAME_HE: Record<number, string> = {
  0: "ראשון",
  1: "שני",
  2: "שלישי",
  3: "רביעי",
  4: "חמישי",
  5: "שישי",
};

const DAY_NAME_EN: Record<number, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
};



/** A clash in the words the insights bar prints. Names, not ids: the pair may
 *  be two meetings of the SAME course (a tutorial over its own lecture), which
 *  an id-keyed lookup could never name. */
export interface PlannerConflict {
  aName: string;
  bName: string;
  /** DayOfWeek enum value, e.g. "TUESDAY". */
  day: string;
  /** "12:00–13:00" — the overlap only. Render inside <bdi dir="ltr">. */
  time: string;
}

/**
 * Conflicts over the courses AS DRAWN (already semester- and group-filtered by
 * the caller), using the grid's own pipeline: dedupe the duplicate catalog rows,
 * then pair up everything that overlaps.
 */
export function detectPlannerConflicts(
  courses: CourseWithSchedule[],
  isHe: boolean,
): PlannerConflict[] {
  const rows = courses.flatMap((course) =>
    (course.scheduleSessions ?? []).map((s) => ({
      courseCode: course.code,
      courseName: isHe ? course.nameHe : (course.nameEn ?? course.nameHe),
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      sessionType: s.sessionType,
      groupCode: s.groupCode ?? null,
      room: s.room ?? null,
      building: s.building ?? null,
      lecturerName: s.lecturerName ?? null,
    })),
  );

  const slots: ConflictCandidate[] = [];
  for (const [i, row] of dedupeMeetings(rows).entries()) {
    const day = DAY_INDEX[row.dayOfWeek];
    if (day === undefined) continue; // Saturday / unknown — off the grid
    const startHour = hhmmToHours(row.startTime);
    const endHour = hhmmToHours(row.endTime);
    if (!Number.isFinite(startHour) || !Number.isFinite(endHour)) continue;
    slots.push({
      id: `${row.courseCode}-${row.sessionType}-${row.groupCode ?? ""}-${i}`,
      day,
      startHour,
      endHour,
      courseCode: row.courseCode,
      courseName: row.courseName,
    });
  }

  return findConflictPairs(slots).map((pair: ConflictPair) => ({
    aName: pair.aName,
    bName: pair.bName,
    day:
      Object.keys(DAY_INDEX).find((k) => DAY_INDEX[k] === pair.day) ?? "SUNDAY",
    time: formatHourRange(pair.overlapStart, pair.overlapEnd),
  }));
}

/** "שלישי" / "Tuesday" for a DayOfWeek value the conflict carries. */
export function conflictDayLabel(day: string, isHe: boolean): string {
  const idx = DAY_INDEX[day];
  if (idx === undefined) return day;
  return (isHe ? DAY_NAME_HE[idx] : DAY_NAME_EN[idx]) ?? day;
}

/**
 * Courses selected for the semester that carry NO meeting times at all.
 * 75 of the 302 תשפ״ז courses (including 35 of 68 seminars) have no schedule
 * rows, so any statement about the week — "0 conflicts", "Thursday is free",
 * "18 hours" — is a statement about the courses we HAVE times for. Callers
 * quote this count instead of implying the silence is data.
 */
export function coursesWithoutTimes(courses: CourseWithSchedule[]): number {
  return courses.filter((c) => !hasUsableMeeting(c)).length;
}

/**
 * A course contributes to the week only if at least one of its meetings has a
 * start AND an end we can actually read.
 *
 * This used to be "has any session row at all", and the gap between the two was
 * a silent lie. `detectPlannerConflicts` drops a meeting whose "HH:MM" is
 * unreadable — it must, because the alternative is inventing an end time and
 * reporting a clash we made up. But a course with one unreadable session row
 * counted as "we have times for this one", so the student read
 * "נבדק רק מול הקורסים שיש להם שעות (3 בלי שעות ידועות)" while a fourth course
 * had quietly contributed nothing.
 *
 * The times come off the ידיעון as raw strings and are never validated on the
 * way in, and 75 of ~302 catalog courses already have no hours at all — so this
 * is not a theoretical input. Either the number the student is shown covers
 * every course we couldn't check, or the sentence around it isn't true.
 */
function hasUsableMeeting(course: CourseWithSchedule): boolean {
  return (course.scheduleSessions ?? []).some(
    (s) =>
      Number.isFinite(hhmmToHours(s.startTime)) &&
      Number.isFinite(hhmmToHours(s.endTime)),
  );
}
