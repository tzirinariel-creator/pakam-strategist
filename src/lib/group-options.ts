// =========================================
// Group options — the bidding-week decision unit
// =========================================
// A course's "group" (קבוצה) is what a student actually requests in TAU's
// bidding round. Until now both group surfaces described a group by its FIRST
// meeting only. In the real תשפ״ז catalog 159 of 318 (course, semester, type,
// group) tuples carry MORE THAN ONE meeting — so half the time we showed one
// time and put two or three on the grid. This module builds the whole truth
// once, and both surfaces render it.
//
// Everything here is a verifiable fact derived from the ידיעון rows plus the
// student's own week. Nothing is predicted. In particular this module says
// NOTHING about bidding points — TAU's quota is unpublished and the official
// guidelines forbid extrapolating from prior years.

import { detectTimeConflicts, type SessionInfo } from "@/lib/conflict-detector";
import { savedGroupFor } from "@/lib/session-groups";
import { DAY_OF_WEEK_INDEX } from "@/lib/day-of-week";
import type { ScheduleSessionLike } from "@/lib/plan-generator";
import type { DayOfWeek } from "@/types/enums";
import { hhmmToMinutes } from "@/lib/time-of-day";
import { heNoun } from "@/lib/he-count";

// ─── Types ───────────────────────────────────────────────────────────

export interface GroupMeeting {
  dayOfWeek: string;
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  room: string | null;
  building: string | null;
  lecturerName: string | null;
}

export interface GroupClash {
  /** Name of the course this group collides with. */
  courseName: string;
  /** True when the collision is with THIS course's own other session type
   *  (e.g. a tutorial group that runs over its own lecture) — worth wording
   *  differently, because no swap of the other course can fix it. */
  sameCourse: boolean;
  dayOfWeek: string;
  overlapStart: string;
  overlapEnd: string;
}

export interface GroupOption {
  sessionType: string;
  groupCode: string;
  /** EVERY meeting of the group, sorted by day then start time. */
  meetings: GroupMeeting[];
  /** Distinct lecturer names across the group's meetings, in first-seen order. */
  lecturers: string[];
  /** Weekly hours this group adds, one decimal. */
  weeklyHours: number;
  /** Deduped to one entry per (course, day). Empty = the group is free. */
  clashes: GroupClash[];
  /** Days this group puts the student on campus that nothing else in the week
   *  already does. 0 = it costs no extra trip. */
  addsCampusDays: number;
}

export interface GroupChoice {
  sessionType: string;
  /** Free options first, then fewest added campus days, then group code. */
  options: GroupOption[];
  /**
   * The group the grid falls back to when nothing is chosen yet. MUST mirror
   * `filterSessionsBySelectedGroups` (plain lexicographic sort, first element)
   * or the picker would tick a group the grid isn't actually drawing.
   */
  defaultGroupCode: string;
  /** How many of `options` carry no clash at all. */
  freeCount: number;
}

export interface BuildGroupChoicesParams {
  /** This course's schedule sessions (any semester — filtered here). */
  sessions: ScheduleSessionLike[];
  /** The course's own display name, used to word a self-clash. */
  courseName: string;
  /** Every session already fixed on the grid for OTHER courses. */
  otherSessions: SessionInfo[];
  /** Keep only sessions of this semester. Undefined keeps everything. */
  semester?: "FALL" | "SPRING";
  /** Current picks for THIS course: sessionType → groupCode. */
  selectedGroups?: Record<string, string>;
}

// ─── Labels ──────────────────────────────────────────────────────────

const DAY_NAMES_HE: Record<string, string> = {
  SUNDAY: "ראשון",
  MONDAY: "שני",
  TUESDAY: "שלישי",
  WEDNESDAY: "רביעי",
  THURSDAY: "חמישי",
  FRIDAY: "שישי",
};

const DAY_NAMES_EN: Record<string, string> = {
  SUNDAY: "Sun",
  MONDAY: "Mon",
  TUESDAY: "Tue",
  WEDNESDAY: "Wed",
  THURSDAY: "Thu",
  FRIDAY: "Fri",
};

/**
 * Every sessionType that appears in the real catalog. `project` used to leak
 * through untranslated into the Hebrew screens (it exists in the תשפ״ז rows but
 * was missing from every label map).
 */
const SESSION_TYPE_LABELS: Record<string, { he: string; en: string }> = {
  lecture: { he: "הרצאה", en: "Lecture" },
  tutorial: { he: "תרגול", en: "Tutorial" },
  lab: { he: "מעבדה", en: "Lab" },
  seminar: { he: "סמינר", en: "Seminar" },
  workshop: { he: "סדנה", en: "Workshop" },
  project: { he: "פרויקט", en: "Project" },
};

export function dayNameFor(day: string, isHe: boolean): string {
  return (isHe ? DAY_NAMES_HE[day] : DAY_NAMES_EN[day]) ?? day;
}

/**
 * THE name of a session type, in one place. Every surface that prints a session
 * type — the grid, the group pickers, today's classes, the calendar page, the
 * course popovers, the WhatsApp week share, the .ics download, the Google
 * Calendar push and the bidding worksheet — must come through here.
 *
 * It is one function because it was several: `tutorial` rendered as "תרגול" on
 * every screen but as "תרגיל" in the .ics file and on the bidding worksheet, so
 * the calendar the student downloaded disagreed with the calendar they were
 * looking at, for the same meeting (audit deferred-3). תרגול is the ידיעון's own
 * word for the session type and was already the overwhelming majority.
 *
 * Case-insensitive on purpose: catalog rows are lowercase but a student-created
 * course is stored "LECTURE" (custom-course-modal), and only some of the old
 * copies handled that — the rest printed the raw enum inside a Hebrew screen.
 *
 * NOTE: "תרגיל" is still correct in two places and must NOT be swept up here —
 * scraper/parser.ts, which READS both spellings out of the ידיעון, and the
 * `PRACTICE` courseType (he.json), which is a degree-requirement bucket
 * ("קורס תרגיל", capped at 8 ש״ס), not a weekly session.
 */
export function sessionTypeNameFor(sessionType: string, isHe: boolean): string {
  const label = SESSION_TYPE_LABELS[(sessionType ?? "").toLowerCase()];
  if (!label) return sessionType;
  return isHe ? label.he : label.en;
}

/**
 * Normalize a group's raw sessions into sorted meetings. Exported so the
 * sidebar chip row describes a group exactly like the grid picker does.
 */
export function toGroupMeetings(sessions: readonly ScheduleSessionLike[]): GroupMeeting[] {
  return sessions.map(toMeeting).sort(meetingSort);
}

/** "ראשון 10:00–12:00 · רביעי 14:00–15:00" — every meeting, never just the first. */
export function formatMeetings(meetings: readonly GroupMeeting[], isHe: boolean): string {
  return meetings
    .map((m) => `${dayNameFor(m.dayOfWeek, isHe)} ${m.startTime}–${m.endTime}`)
    .join(" · ");
}

/** "גילמן 144" / "144" / "" — building and room, whichever exist. */
export function formatLocation(meeting: GroupMeeting): string {
  return [meeting.building, meeting.room].filter(Boolean).join(" ");
}

// ─── Helpers ─────────────────────────────────────────────────────────



function meetingSort(a: GroupMeeting, b: GroupMeeting): number {
  const byDay = (DAY_OF_WEEK_INDEX[a.dayOfWeek] ?? 9) - (DAY_OF_WEEK_INDEX[b.dayOfWeek] ?? 9);
  if (byDay !== 0) return byDay;
  return a.startTime.localeCompare(b.startTime);
}

function toMeeting(s: ScheduleSessionLike): GroupMeeting {
  return {
    dayOfWeek: s.dayOfWeek,
    startTime: s.startTime,
    endTime: s.endTime,
    room: s.room ?? null,
    building: s.building ?? null,
    lecturerName: s.lecturerName ?? null,
  };
}

function toSessionInfo(
  courseCode: string,
  courseName: string,
  sessions: readonly ScheduleSessionLike[],
  keyPrefix: string,
): SessionInfo[] {
  return sessions.map((s, i) => ({
    id: `${keyPrefix}-${i}`,
    courseCode,
    courseName,
    dayOfWeek: s.dayOfWeek as DayOfWeek,
    startTime: s.startTime,
    endTime: s.endTime,
    sessionType: s.sessionType,
  }));
}

/**
 * sessionType → groupCode → sessions, for the groups a student can actually
 * choose between. "ALL" sessions run whichever group you pick, so they are
 * never a choice. Same convention as `filterSessionsBySelectedGroups` and
 * `combo-finder`, so all three agree on what a "choice" is.
 */
function indexByTypeAndGroup(
  sessions: readonly ScheduleSessionLike[],
): Map<string, Map<string, ScheduleSessionLike[]>> {
  const byType = new Map<string, Map<string, ScheduleSessionLike[]>>();
  for (const s of sessions) {
    const gc = s.groupCode ?? "A";
    if (gc === "ALL") continue;
    let groups = byType.get(s.sessionType);
    if (!groups) {
      groups = new Map();
      byType.set(s.sessionType, groups);
    }
    const list = groups.get(gc);
    if (list) list.push(s);
    else groups.set(gc, [s]);
  }
  return byType;
}

/** One clash entry per (course, day) — six overlapping meetings read as one problem. */
function dedupeClashes(
  raw: readonly { courseName: string; sameCourse: boolean; dayOfWeek: string; overlapStart: string; overlapEnd: string }[],
): GroupClash[] {
  const seen = new Set<string>();
  const out: GroupClash[] = [];
  for (const c of raw) {
    const key = `${c.courseName}|${c.dayOfWeek}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

// ─── Main builder ────────────────────────────────────────────────────

/**
 * Build the full picture for every session type of a course that offers a real
 * choice. Types with a single group are omitted — there is nothing to pick.
 */
export function buildGroupChoices({
  sessions,
  courseName,
  otherSessions,
  semester,
  selectedGroups = {},
}: BuildGroupChoicesParams): GroupChoice[] {
  const semesterSessions = sessions.filter(
    (s) => !semester || !s.semester || s.semester === semester,
  );

  const byType = indexByTypeAndGroup(semesterSessions);

  // "ALL" sessions always run — they are part of the week no matter what.
  const sharedSessions = semesterSessions.filter((s) => (s.groupCode ?? "A") === "ALL");

  // Days the student is already on campus, from everything OUTSIDE the type
  // being chosen. Recomputed per session type below (the course's own other
  // types count toward it too).
  const otherDays = new Set(otherSessions.map((s) => s.dayOfWeek as string));

  const choices: GroupChoice[] = [];

  for (const [sessionType, groups] of byType) {
    if (groups.size <= 1) continue; // nothing to pick

    // This course's OWN sessions that stay fixed while we swap `sessionType`:
    // the shared "ALL" meetings plus the currently-picked group of every other
    // type. A tutorial that runs over its own lecture is a real, unpickable
    // clash — the previous picker never checked for it.
    const selfFixed: ScheduleSessionLike[] = [...sharedSessions];
    for (const [otherType, otherGroups] of byType) {
      if (otherType === sessionType) continue;
      const codes = [...otherGroups.keys()];
      const picked =
        (selectedGroups[otherType] && otherGroups.has(selectedGroups[otherType]!)
          ? selectedGroups[otherType]
          : undefined) ?? [...codes].sort()[0];
      if (picked) selfFixed.push(...(otherGroups.get(picked) ?? []));
    }
    const selfFixedInfo = toSessionInfo("__self__", courseName, selfFixed, "self");

    const busyDays = new Set(otherDays);
    for (const s of selfFixed) busyDays.add(s.dayOfWeek);

    const options: GroupOption[] = [];
    for (const [groupCode, groupSessions] of groups) {
      const meetings = groupSessions.map(toMeeting).sort(meetingSort);

      const lecturers: string[] = [];
      for (const m of meetings) {
        if (m.lecturerName && !lecturers.includes(m.lecturerName)) {
          lecturers.push(m.lecturerName);
        }
      }

      let minutes = 0;
      for (const m of meetings) {
        const span = hhmmToMinutes(m.endTime) - hhmmToMinutes(m.startTime);
        if (Number.isFinite(span) && span > 0) minutes += span;
      }

      const candidate = toSessionInfo("__candidate__", courseName, groupSessions, groupCode);
      const raw = [
        ...detectTimeConflicts(otherSessions, candidate).map((c) => ({
          courseName: c.existingSession.courseName,
          sameCourse: false,
          dayOfWeek: c.day as string,
          overlapStart: c.overlapStart,
          overlapEnd: c.overlapEnd,
        })),
        ...detectTimeConflicts(selfFixedInfo, candidate).map((c) => ({
          courseName,
          sameCourse: true,
          dayOfWeek: c.day as string,
          overlapStart: c.overlapStart,
          overlapEnd: c.overlapEnd,
        })),
      ];

      const newDays = new Set<string>();
      for (const m of meetings) if (!busyDays.has(m.dayOfWeek)) newDays.add(m.dayOfWeek);

      options.push({
        sessionType,
        groupCode,
        meetings,
        lecturers,
        weeklyHours: Math.round((minutes / 60) * 10) / 10,
        clashes: dedupeClashes(raw),
        addsCampusDays: newDays.size,
      });
    }

    options.sort((a, b) => {
      const free = Number(a.clashes.length > 0) - Number(b.clashes.length > 0);
      if (free !== 0) return free;
      if (a.addsCampusDays !== b.addsCampusDays) return a.addsCampusDays - b.addsCampusDays;
      return a.groupCode.localeCompare(b.groupCode, "en", { numeric: true });
    });

    choices.push({
      sessionType,
      options,
      // Plain lexicographic sort — byte-for-byte the fallback that
      // filterSessionsBySelectedGroups applies when nothing is picked yet.
      defaultGroupCode: [...groups.keys()].sort()[0]!,
      freeCount: options.filter((o) => o.clashes.length === 0).length,
    });
  }

  // Stable across renders: lecture before tutorial before the rest.
  const typeRank = (t: string) =>
    t === "lecture" ? 0 : t === "tutorial" ? 1 : 2;
  choices.sort((a, b) => {
    const rank = typeRank(a.sessionType) - typeRank(b.sessionType);
    return rank !== 0 ? rank : a.sessionType.localeCompare(b.sessionType);
  });

  return choices;
}

/**
 * The one-line verdict under a group option. The wording lives here, next to
 * the numbers it quotes, so it is unit-tested rather than restated in JSX.
 * `tone` drives the styling; the caller never composes its own sentence.
 */
export function describeGroupImpact(
  option: GroupOption,
  isHe: boolean,
): { tone: "clash" | "newDay" | "neutral"; text: string } {
  const clash = option.clashes[0];
  if (clash) {
    const day = dayNameFor(clash.dayOfWeek, isHe);
    const range = `${clash.overlapStart}–${clash.overlapEnd}`;
    const extra = option.clashes.length - 1;
    const head = isHe
      ? clash.sameCourse
        ? `חופפת למפגש אחר של הקורס ביום ${day} ${range}`
        : `חופפת ל${clash.courseName} ביום ${day} ${range}`
      : clash.sameCourse
        ? `Overlaps another meeting of this course on ${day} ${range}`
        : `Overlaps ${clash.courseName} on ${day} ${range}`;
    const tail = extra > 0 ? (isHe ? ` (ועוד ${extra})` : ` (+${extra} more)`) : "";
    return { tone: "clash", text: head + tail };
  }

  if (option.addsCampusDays > 0) {
    return {
      tone: "newDay",
      text: isHe
        ? option.addsCampusDays === 1
          ? "מוסיפה יום נוסף בקמפוס"
          : `מוסיפה ${heNoun(option.addsCampusDays, "יום", "ימים")} בקמפוס`
        : option.addsCampusDays === 1
          ? "Adds another day on campus"
          : `Adds ${option.addsCampusDays} days on campus`,
    };
  }

  return {
    tone: "neutral",
    text: isHe ? "בימים שכבר יש לכם בקמפוס" : "On days you're already on campus",
  };
}

/** The group the UI should show as current: the saved pick, else the grid's fallback. */
export function resolveSelectedGroup(
  choice: GroupChoice,
  selectedGroups: Record<string, string> | undefined,
): string {
  const picked = savedGroupFor(selectedGroups, choice.sessionType);
  if (picked && choice.options.some((o) => o.groupCode === picked)) return picked;
  return choice.defaultGroupCode;
}

/**
 * TRUE only when the STUDENT picked this type's group; FALSE when what's on the
 * grid is the app's alphabetical fallback. The picker and the grid both need to
 * tell the two apart — rendering a default with the same ✓ as a decision is the
 * confusion this whole surface was reported for ("לא היה לי אינטואיטיבי להבין
 * איך אני בדיוק בוחר").
 */
export function isGroupChosen(
  choice: GroupChoice,
  selectedGroups: Record<string, string> | undefined,
): boolean {
  const picked = savedGroupFor(selectedGroups, choice.sessionType);
  return picked !== undefined && choice.options.some((o) => o.groupCode === picked);
}
