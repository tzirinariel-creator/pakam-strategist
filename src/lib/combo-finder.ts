// =========================================
// P2 — "מצאו לי שילוב בלי התנגשויות"
// =========================================
// Pure search over the semester's group choices. For every course whose
// session-type offers more than one group, try the alternatives and rank each
// full combination by REAL, verifiable facts (the honesty principle):
//   score = conflicts·1000 + daysOnCampus·10 + maxDailySpanHours
// Early pruning on partial conflicts + a hard cap on explored combinations
// keep it well under a second on real catalogs. Never invents anything: if a
// zero-conflict combination doesn't exist, it returns the least-bad one and
// says so (`conflicts > 0`).

import { hhmmToMinutes } from "@/lib/time-of-day";

export interface ComboSession {
  sessionType: string;
  groupCode: string;
  dayOfWeek: string;
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
}

export interface ComboCourse {
  code: string;
  sessions: ComboSession[];
}

/**
 * #8 — "שאלון → מערכת". Ariel's own condition on this was "ללכת על זה רק אם
 * יעבוד ממש טוב", so it is NOT an AI that composes a timetable and hopes. It is
 * the same exhaustive search, told what the student actually cares about.
 *
 * Everything here is a real constraint the student states about their own week,
 * and every answer is checkable against the grid in front of them. Empty
 * preferences reproduce the previous behaviour exactly.
 */
export interface ComboPreferences {
  /** Days to keep clear, as dayOfWeek values ("SUNDAY", …). */
  freeDays?: string[];
  /** No class before this hour (0–23). Mornings at work. */
  earliestHour?: number | null;
  /** No class after this hour (0–23). A shift, a commute, kids. */
  latestHour?: number | null;
}

export interface ComboResult {
  /** courseCode → sessionType → chosen groupCode (only MULTI-group types). */
  selections: Record<string, Record<string, string>>;
  conflicts: number;
  daysOnCampus: number;
  maxDailySpanHours: number;
  /**
   * #8 — which of the student's stated wishes this combination actually keeps.
   * The UI must never say "כיבדנו את יום שלישי" unless this says so: a wish is
   * a soft cost, and a week with a real clash in it can legitimately outrank it.
   * `null` when no preferences were given.
   */
  honored: {
    /** Requested free days that ended up genuinely empty. */
    freeDaysKept: string[];
    /** Requested free days that still carry a session. */
    freeDaysBroken: string[];
    /** Sessions falling outside the requested hours. 0 = every hour honoured. */
    outOfHoursSessions: number;
  } | null;
  /** True when the cap stopped the search before covering every combination. */
  capped: boolean;
  explored: number;
}

const DEFAULT_CAP = 10_000;

// One HH:MM parser for the whole app (lib/time-of-day). The local copy answered
// 0 — i.e. MIDNIGHT — for an unreadable time, which quietly parked a broken row
// at the top of every candidate week instead of admitting we couldn't read it.

interface FlatSession {
  day: string;
  start: number;
  end: number;
}

function overlaps(a: FlatSession, b: FlatSession): boolean {
  return a.day === b.day && a.start < b.end && b.start < a.end;
}

function conflictsWith(existing: FlatSession[], added: FlatSession[]): number {
  let n = 0;
  for (const e of existing) for (const a of added) if (overlaps(e, a)) n++;
  return n;
}

// A preference is a WISH, a clash is a FACT. The weights below are chosen so
// that no number of wishes can ever outrank a single real overlap (×1000):
// a violating session costs 100, an out-of-hours one 20, so even five sessions
// on a "free" day (500) lose to one clash. The search will never hand a student
// a broken week to keep their Tuesday.
const FREE_DAY_PENALTY = 100;
const OUT_OF_HOURS_PENALTY = 20;

function preferenceCost(sessions: FlatSession[], prefs: ComboPreferences | undefined): number {
  if (!prefs) return 0;
  const free = new Set(prefs.freeDays ?? []);
  const earliest = prefs.earliestHour != null ? prefs.earliestHour * 60 : null;
  const latest = prefs.latestHour != null ? prefs.latestHour * 60 : null;
  let cost = 0;
  for (const s of sessions) {
    if (free.has(s.day)) cost += FREE_DAY_PENALTY;
    if (earliest != null && s.start < earliest) cost += OUT_OF_HOURS_PENALTY;
    if (latest != null && s.end > latest) cost += OUT_OF_HOURS_PENALTY;
  }
  return cost;
}

function scoreOf(sessions: FlatSession[], conflicts: number, prefs?: ComboPreferences) {
  const byDay = new Map<string, { min: number; max: number }>();
  for (const s of sessions) {
    const d = byDay.get(s.day);
    if (!d) byDay.set(s.day, { min: s.start, max: s.end });
    else {
      d.min = Math.min(d.min, s.start);
      d.max = Math.max(d.max, s.end);
    }
  }
  const daysOnCampus = byDay.size;
  let maxSpan = 0;
  for (const d of byDay.values()) maxSpan = Math.max(maxSpan, (d.max - d.min) / 60);
  const maxDailySpanHours = Math.round(maxSpan * 10) / 10;
  return {
    daysOnCampus,
    maxDailySpanHours,
    score:
      conflicts * 1000 +
      preferenceCost(sessions, prefs) +
      daysOnCampus * 10 +
      maxDailySpanHours,
  };
}

/**
 * Find the best group combination for a semester's courses. `courses` must
 * carry the semester's sessions only (the caller filters, exactly like the
 * grid). Returns null when there is nothing to search (no course offers a
 * choice) — the UI should say so instead of pretending to optimize.
 */
export function findBestCombination(
  courses: ComboCourse[],
  cap: number = DEFAULT_CAP,
  preferences?: ComboPreferences,
): ComboResult | null {
  // Fixed sessions (single-group session types) + decision variables.
  const fixed: FlatSession[] = [];
  const variables: {
    courseCode: string;
    sessionType: string;
    options: { groupCode: string; sessions: FlatSession[] }[];
  }[] = [];

  for (const course of courses) {
    // sessionType → groupCode → sessions. "ALL" sessions run for every group
    // (same convention as the grid filter) — they are FIXED, never a choice.
    const byType = new Map<string, Map<string, FlatSession[]>>();
    for (const s of course.sessions) {
      const start = hhmmToMinutes(s.startTime);
      const end = hhmmToMinutes(s.endTime);
      // A meeting whose time we cannot read is DROPPED from the search rather
      // than placed at midnight (what the old local parser's `|| 0` did) or fed
      // in as NaN (which would poison the day-span score for the whole week).
      // We don't know when it is, so we don't pretend to schedule around it.
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      const flat = { day: s.dayOfWeek, start, end };
      const gc = s.groupCode || "A";
      if (gc === "ALL") {
        fixed.push(flat);
        continue;
      }
      const groups = byType.get(s.sessionType) ?? new Map<string, FlatSession[]>();
      const list = groups.get(gc) ?? [];
      list.push(flat);
      groups.set(gc, list);
      byType.set(s.sessionType, groups);
    }
    for (const [sessionType, groups] of byType) {
      if (groups.size <= 1) {
        for (const list of groups.values()) fixed.push(...list);
      } else {
        variables.push({
          courseCode: course.code,
          sessionType,
          options: [...groups.entries()].map(([groupCode, sessions]) => ({ groupCode, sessions })),
        });
      }
    }
  }

  if (variables.length === 0) return null; // nothing to optimize

  // Fewest options first — cheaper pruning near the root.
  variables.sort((a, b) => a.options.length - b.options.length);

  const baseConflicts = conflictsWith(fixed, []) /* 0 */ + countInternal(fixed);

  let best: { assignment: string[]; conflicts: number; score: number } | null = null;
  let explored = 0;
  let capped = false;

  const chosen: FlatSession[][] = [];
  const assignment: string[] = [];

  const dfs = (i: number, partialConflicts: number) => {
    if (capped) return;
    // Prune: a partial already worse (by conflicts alone) than the best full
    // score can never win — conflicts dominate the score at ×1000.
    if (best && partialConflicts * 1000 >= best.score) return;
    if (i === variables.length) {
      explored++;
      if (explored >= cap) capped = true;
      const all = [...fixed, ...chosen.flat()];
      const { score } = scoreOf(all, partialConflicts, preferences);
      if (!best || score < best.score) {
        best = { assignment: [...assignment], conflicts: partialConflicts, score };
      }
      return;
    }
    for (const opt of variables[i]!.options) {
      const already = [...fixed, ...chosen.flat()];
      const added = conflictsWith(already, opt.sessions) + countInternal(opt.sessions);
      chosen.push(opt.sessions);
      assignment.push(opt.groupCode);
      dfs(i + 1, partialConflicts + added);
      chosen.pop();
      assignment.pop();
      if (capped) return;
    }
  };
  dfs(0, baseConflicts);

  if (!best) return null;
  // TS can't see `best` is assigned inside the closure — narrow it once.
  const found = best as { assignment: string[]; conflicts: number; score: number };

  const selections: Record<string, Record<string, string>> = {};
  variables.forEach((v, i) => {
    selections[v.courseCode] = selections[v.courseCode] ?? {};
    selections[v.courseCode]![v.sessionType] = found.assignment[i]!;
  });
  // Recompute the descriptive facts for the winning combination.
  const winningSessions = [
    ...fixed,
    ...variables.flatMap((v, i) =>
      v.options.find((o) => o.groupCode === found.assignment[i])!.sessions,
    ),
  ];
  const { daysOnCampus, maxDailySpanHours } = scoreOf(winningSessions, found.conflicts);

  // Report the wishes against the winner, measured — never assumed from the
  // fact that they were requested.
  let honored: ComboResult["honored"] = null;
  if (preferences) {
    const requested = preferences.freeDays ?? [];
    const busyDays = new Set(winningSessions.map((s) => s.day));
    const earliest = preferences.earliestHour != null ? preferences.earliestHour * 60 : null;
    const latest = preferences.latestHour != null ? preferences.latestHour * 60 : null;
    honored = {
      freeDaysKept: requested.filter((d) => !busyDays.has(d)),
      freeDaysBroken: requested.filter((d) => busyDays.has(d)),
      outOfHoursSessions: winningSessions.filter(
        (s) => (earliest != null && s.start < earliest) || (latest != null && s.end > latest),
      ).length,
    };
  }

  return {
    selections,
    conflicts: found.conflicts,
    daysOnCampus,
    maxDailySpanHours,
    honored,
    capped,
    explored,
  };
}

/** Pairwise conflicts WITHIN one list (fixed sessions can clash too). */
function countInternal(sessions: FlatSession[]): number {
  let n = 0;
  for (let i = 0; i < sessions.length; i++)
    for (let j = i + 1; j < sessions.length; j++)
      if (overlaps(sessions[i]!, sessions[j]!)) n++;
  return n;
}
