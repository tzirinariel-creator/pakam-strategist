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

export interface ComboResult {
  /** courseCode → sessionType → chosen groupCode (only MULTI-group types). */
  selections: Record<string, Record<string, string>>;
  conflicts: number;
  daysOnCampus: number;
  maxDailySpanHours: number;
  /** True when the cap stopped the search before covering every combination. */
  capped: boolean;
  explored: number;
}

const DEFAULT_CAP = 10_000;

function toMinutes(t: string): number {
  const [h, m] = t.split(":");
  return (parseInt(h ?? "0", 10) || 0) * 60 + (parseInt(m ?? "0", 10) || 0);
}

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

function scoreOf(sessions: FlatSession[], conflicts: number) {
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
    score: conflicts * 1000 + daysOnCampus * 10 + maxDailySpanHours,
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
      const flat = { day: s.dayOfWeek, start: toMinutes(s.startTime), end: toMinutes(s.endTime) };
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
      const { score } = scoreOf(all, partialConflicts);
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

  return {
    selections,
    conflicts: found.conflicts,
    daysOnCampus,
    maxDailySpanHours,
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
