// =========================================
// Session groups — ONE rule, every surface
// =========================================
// A course's session type (הרצאה / תרגול / מעבדה) can offer several groups.
// Which one does the student's week actually contain?
//
// Until this module existed the answer depended on where you looked:
//   • the planner grid kept the first group alphabetically,
//   • the server returned ALL of them when nothing was saved,
//   • /calendar then hid the extras client-side with its own near-copy of the
//     rule (which dropped "ALL" meetings and group-less rows).
// So the week a student approved in the planner was not the week the dashboard
// and the calendar drew afterwards. One rule now lives here, and the planner,
// the server and every client call into it.
//
// The rule, in full:
//   1. A session whose groupCode is "ALL" runs whichever group you pick — it is
//      always part of the week and is never a choice.
//   2. A session type with a single group is not a choice either — it is in.
//   3. A session type with SEVERAL groups keeps the student's saved pick.
//   4. …and when there is no saved pick, it keeps the first group code in plain
//      lexicographic order — and REMEMBERS that this was the app's default, not
//      the student's decision (`defaultedTypes`). Nothing in the product may
//      present a default as a choice; that confusion is the whole reason this
//      module carries the flag.
//
// Session types are matched case-insensitively: the catalog holds both
// "tutorial" and "TUTORIAL" rows, the planner saved its picks under whichever
// spelling the row carried, and the server looked them up lowercased — so a
// pick saved as "TUTORIAL" used to be silently ignored server-side.

/** The minimum a row needs for the rule to apply to it. */
export interface GroupedSessionLike {
  sessionType: string;
  groupCode?: string | null;
}

/** Sessions that run for every group — never a choice, always in the week. */
export const SHARED_GROUP_CODE = "ALL";

/** A row with no group code at all still belongs to some group; "A" is the
 *  historical stand-in and every surface already assumed it. */
const IMPLICIT_GROUP_CODE = "A";

export function normalizeSessionType(sessionType: string | null | undefined): string {
  return (sessionType ?? "").toLowerCase();
}

export function groupCodeOf(session: GroupedSessionLike): string {
  return session.groupCode ?? IMPLICIT_GROUP_CODE;
}

/**
 * normalized sessionType → its group codes, sorted lexicographically.
 * "ALL" rows are excluded (rule 1), so a type that ONLY has shared meetings
 * ends up with an empty list and is never treated as a choice.
 */
export function buildGroupIndex(
  sessions: readonly GroupedSessionLike[],
): Map<string, string[]> {
  const byType = new Map<string, Set<string>>();
  for (const s of sessions) {
    const code = groupCodeOf(s);
    if (code === SHARED_GROUP_CODE) continue;
    const type = normalizeSessionType(s.sessionType);
    const set = byType.get(type);
    if (set) set.add(code);
    else byType.set(type, new Set([code]));
  }
  const out = new Map<string, string[]>();
  for (const [type, codes] of byType) out.set(type, [...codes].sort());
  return out;
}

/**
 * The student's saved pick for a session type, tolerant of the case the pick
 * was written in ("TUTORIAL" vs "tutorial" — see the header note).
 */
export function savedGroupFor(
  selectedGroups: Record<string, string> | null | undefined,
  sessionType: string,
): string | undefined {
  if (!selectedGroups) return undefined;
  const exact = selectedGroups[sessionType];
  if (exact !== undefined) return exact;
  const normalized = normalizeSessionType(sessionType);
  const lower = selectedGroups[normalized];
  if (lower !== undefined) return lower;
  for (const [key, value] of Object.entries(selectedGroups)) {
    if (normalizeSessionType(key) === normalized) return value;
  }
  return undefined;
}

export interface ResolvedGroup {
  /** normalized sessionType. */
  sessionType: string;
  /** The group that is actually on the grid. */
  groupCode: string;
  /** Every group offered for this type, sorted — what a picker must list. */
  options: string[];
  /** FALSE = the app picked it, the student never did. Nothing may render a
   *  defaulted group the same way it renders a chosen one. */
  chosen: boolean;
}

/**
 * The full answer for one course: which group each multi-group session type
 * contributes, and whether that was a decision or a default.
 * Types with a single group are NOT included — there is nothing to choose.
 */
export function resolveGroupSelections(
  sessions: readonly GroupedSessionLike[],
  selectedGroups: Record<string, string> | null | undefined,
): ResolvedGroup[] {
  const index = buildGroupIndex(sessions);
  const out: ResolvedGroup[] = [];
  for (const [sessionType, options] of index) {
    if (options.length <= 1) continue;
    const saved = savedGroupFor(selectedGroups, sessionType);
    const chosen = saved !== undefined && options.includes(saved);
    out.push({
      sessionType,
      groupCode: chosen ? saved! : options[0]!,
      options,
      chosen,
    });
  }
  // Stable order: lecture, tutorial, then the rest alphabetically.
  const rank = (t: string) => (t === "lecture" ? 0 : t === "tutorial" ? 1 : 2);
  out.sort((a, b) => rank(a.sessionType) - rank(b.sessionType) || a.sessionType.localeCompare(b.sessionType));
  return out;
}

/** Session types of this course that are still on the app's default. */
export function defaultedSessionTypes(
  sessions: readonly GroupedSessionLike[],
  selectedGroups: Record<string, string> | null | undefined,
): string[] {
  return resolveGroupSelections(sessions, selectedGroups)
    .filter((r) => !r.chosen)
    .map((r) => r.sessionType);
}

/** True when at least one session type offers a real choice. */
export function hasGroupChoice(sessions: readonly GroupedSessionLike[]): boolean {
  for (const options of buildGroupIndex(sessions).values()) {
    if (options.length > 1) return true;
  }
  return false;
}

/**
 * The week this course actually contributes: shared meetings, single-group
 * meetings, and exactly one group per multi-group type (saved pick, else the
 * default). This is THE filter — planner, server and calendar all run it.
 */
export function filterSessionsByGroups<T extends GroupedSessionLike>(
  sessions: readonly T[],
  selectedGroups: Record<string, string> | null | undefined,
): T[] {
  const index = buildGroupIndex(sessions);
  const keepByType = new Map<string, string>();
  for (const r of resolveGroupSelections(sessions, selectedGroups)) {
    keepByType.set(r.sessionType, r.groupCode);
  }

  return sessions.filter((s) => {
    const code = groupCodeOf(s);
    if (code === SHARED_GROUP_CODE) return true; // rule 1
    const type = normalizeSessionType(s.sessionType);
    const options = index.get(type);
    if (!options || options.length <= 1) return true; // rule 2
    return code === keepByType.get(type); // rules 3 + 4
  });
}
