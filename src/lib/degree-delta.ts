// =========================================
// Degree progress delta — narrative "you moved X% → Y%" on save
// =========================================
// Pure functions. Both breakdowns are SERVER-computed getCredits snapshots
// (before = the editor's value at mount, after = the dashboard's value after
// the save invalidates the cache), so the numbers can never disagree with the
// canonical status the way a client-side projection would.

import { CREDIT_REQUIREMENTS } from "@/lib/constants";
import type { CreditBreakdown } from "@/types/degree";

/** The degree-% formula — identical to <DegreeStatus> (effectiveTotal / total). */
export function degreePct(b: Pick<CreditBreakdown, "effectiveTotal"> | null): number {
  const target = CREDIT_REQUIREMENTS.TOTAL;
  const effective = b?.effectiveTotal ?? 0;
  return target > 0 ? Math.min(100, Math.round((effective / target) * 100)) : 0;
}

export type Lane = "mandatory" | "elective" | "seminar" | "focusArea" | "english";

const LANE_META: { lane: Lane; field: keyof CreditBreakdown; target: number; he: string; en: string }[] = [
  { lane: "mandatory", field: "mandatory", target: CREDIT_REQUIREMENTS.MANDATORY_TOTAL, he: "חובה", en: "mandatory" },
  { lane: "elective", field: "elective", target: CREDIT_REQUIREMENTS.ELECTIVE_TOTAL, he: "בחירה", en: "electives" },
  { lane: "seminar", field: "seminar", target: CREDIT_REQUIREMENTS.SEMINAR_TOTAL, he: "סמינרים", en: "seminars" },
  { lane: "focusArea", field: "focusArea", target: CREDIT_REQUIREMENTS.FOCUS_AREA_MIN, he: "תחום מיקוד", en: "focus area" },
  { lane: "english", field: "englishCourseCount", target: CREDIT_REQUIREMENTS.ENGLISH_MIN_COURSES, he: "אנגלית", en: "English" },
];

export interface BreakdownDelta {
  fromPct: number;
  toPct: number;
  /** A requirement bucket that crossed from unmet → met with this save, if any. */
  closedLaneHe: string | null;
  closedLaneEn: string | null;
}

/**
 * Diff two SERVER credit breakdowns into a narrative-ready delta: the degree-%
 * movement, and the first requirement bucket (if any) that this save pushed from
 * unmet to met. focusAreaTarget is read from the `after` snapshot when present.
 */
export function diffBreakdown(
  before: CreditBreakdown | null,
  after: CreditBreakdown | null,
): BreakdownDelta {
  const fromPct = degreePct(before);
  const toPct = degreePct(after);

  let closedLaneHe: string | null = null;
  let closedLaneEn: string | null = null;
  if (before && after) {
    for (const m of LANE_META) {
      // ?? (not ||): an EXPLICIT focusAreaTarget of 0 (a program with no focus
      // requirement, e.g. Law) must stay 0 — falling back to 60 would fabricate
      // a "closed lane" banner. Zero/negative targets can never "close".
      const target = m.lane === "focusArea" ? (after.focusAreaTarget ?? m.target) : m.target;
      if (target <= 0) continue;
      const b = Number(before[m.field] ?? 0);
      const a = Number(after[m.field] ?? 0);
      if (b < target && a >= target) {
        closedLaneHe = m.he;
        closedLaneEn = m.en;
        break;
      }
    }
  }

  return { fromPct, toPct, closedLaneHe, closedLaneEn };
}
