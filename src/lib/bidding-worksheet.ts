// =========================================
// Bidding worksheet — pure validation logic
// =========================================
// The student enters THEIR OWN point pool and per-course allocations; we only
// do arithmetic and flag rule violations. We never suggest a number: TAU's
// quota is unpublished and varies each semester — a fabricated recommendation
// would cost students seats. (Patterns validated against real bidding systems:
// Wharton/Kellogg/Ross worksheets all work exactly this way.)

/** TAU rule: a bid below 5 points cannot enter the auction. */
export const MIN_BID = 5;

export type BidPriority = "must" | "important" | "fallback";

export interface AllocationIssue {
  courseCode: string;
  kind: "below-min" | "not-integer" | "negative";
}

export interface WorksheetCheck {
  /** Sum of all entered points (empty inputs count as 0). */
  total: number;
  /** pool − total; null when the student hasn't entered a pool. */
  remaining: number | null;
  /** True when the allocations exceed the entered pool. */
  overPool: boolean;
  /** Per-course rule violations (min-5, integers, negatives). */
  issues: AllocationIssue[];
  /** 5 × (number of bid courses) — the hard floor the pool must cover. */
  minFloor: number;
}

export function checkAllocations(
  pool: number | null,
  allocations: { courseCode: string; points: number | null }[],
): WorksheetCheck {
  const issues: AllocationIssue[] = [];
  let total = 0;
  let bidCount = 0;

  for (const a of allocations) {
    if (a.points == null) continue;
    bidCount++;
    total += a.points;
    if (a.points < 0) issues.push({ courseCode: a.courseCode, kind: "negative" });
    else if (!Number.isInteger(a.points)) issues.push({ courseCode: a.courseCode, kind: "not-integer" });
    else if (a.points < MIN_BID) issues.push({ courseCode: a.courseCode, kind: "below-min" });
  }

  const remaining = pool != null ? pool - total : null;
  return {
    total,
    remaining,
    overPool: pool != null && total > pool,
    issues,
    minFloor: MIN_BID * bidCount,
  };
}

/** Stable ordering: the student's own priority first, then name. */
export const PRIORITY_ORDER: Record<BidPriority, number> = {
  must: 0,
  important: 1,
  fallback: 2,
};

// ── localStorage persistence (client-side only — per the domain guardrail,
//    bid points never get a DB column; its mere presence would invite
//    fabricated recommendations) ──────────────────────────────────────────

export interface WorksheetState {
  pool: number | null;
  /** Per round (1/2 — TAU's two מקצים, full pool reset between them). */
  rounds: Record<"1" | "2", Record<string, number | null>>;
  priorities: Record<string, BidPriority>;
}

export const EMPTY_WORKSHEET: WorksheetState = {
  pool: null,
  rounds: { "1": {}, "2": {} },
  priorities: {},
};

export function worksheetStorageKey(year: number, semester: string): string {
  return `pakam-bidding-worksheet-v1:${year}:${semester}`;
}

export function parseWorksheet(raw: string | null): WorksheetState {
  if (!raw) return EMPTY_WORKSHEET;
  try {
    const p = JSON.parse(raw) as Partial<WorksheetState>;
    return {
      pool: typeof p.pool === "number" ? p.pool : null,
      rounds: {
        "1": { ...(p.rounds?.["1"] ?? {}) },
        "2": { ...(p.rounds?.["2"] ?? {}) },
      },
      priorities: { ...(p.priorities ?? {}) },
    };
  } catch {
    return EMPTY_WORKSHEET;
  }
}

/** The copy-paste cheat sheet the student takes to Yedion (real course codes,
 *  chosen groups, their own points). */
export function buildCheatSheet(
  isHe: boolean,
  round: "1" | "2",
  rows: { courseCode: string; courseName: string; groupLabel: string | null; points: number | null }[],
): string {
  const bid = rows.filter((r) => r.points != null && r.points > 0);
  const head = isHe ? `בידינג — מקצה ${round}` : `Bidding — round ${round}`;
  const lines = bid.map((r) =>
    `${r.courseCode} · ${r.courseName}${r.groupLabel ? ` · ${r.groupLabel}` : ""} — ${r.points}`,
  );
  const total = bid.reduce((s, r) => s + (r.points ?? 0), 0);
  return [head, ...lines, isHe ? `סה״כ: ${total}` : `Total: ${total}`].join("\n");
}
