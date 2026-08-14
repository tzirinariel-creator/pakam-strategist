// =========================================
// Degree progress delta — narrative "you moved X% → Y%" on save
// =========================================
// Pure functions. Both breakdowns are SERVER-computed getCredits snapshots
// (before = the editor's value at mount, after = the dashboard's value after
// the save invalidates the cache), so the numbers can never disagree with the
// canonical status the way a client-side projection would.

import { CREDIT_REQUIREMENTS } from "@/lib/constants";
import { degreeProgress, type CreditProgressInput } from "@/lib/degree-progress";
import type { CreditBreakdown } from "@/types/degree";

/**
 * The degree-% — the SAME number <DegreeStatus> renders (credits already held:
 * earned + miluim exemption, over the program total).
 *
 * It used to read `effectiveTotal`, which folds in PLANNED courses, while the
 * hero two centimetres above it counted only what the student HAS. Saving a
 * plan therefore announced "עלית מ-52% ל-69% בתואר" next to a hero reading 52%
 * — two definitions of degree progress under one label, on one screen. The
 * projected figure is still available (`plannedPct` below), but it may only be
 * shown with a label that says "including planned" out loud.
 */
export function degreePct(b: CreditProgressInput | null): number {
  return degreeProgress(b, CREDIT_REQUIREMENTS.TOTAL).pct;
}

/** The projection if every PLANNED course is passed (effectiveTotal / total).
 *  Never render this against a bare "% of the degree" label. */
export function plannedPct(b: CreditProgressInput | null): number {
  return degreeProgress(b, CREDIT_REQUIREMENTS.TOTAL).projectedPct;
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
  /** Degree-% BEFORE the save — credits held (matches the dashboard hero). */
  fromPct: number;
  /** Degree-% AFTER the save — credits held (matches the dashboard hero). */
  toPct: number;
  /** Plan COVERAGE before the save (held + planned). Only ever render this with
   *  an explicit "including planned courses" label — never as "% of the degree". */
  fromPlanPct: number;
  /** Plan COVERAGE after the save (held + planned). Same labelling rule. */
  toPlanPct: number;
  /** A requirement bucket that crossed from unmet → met with this save, if any. */
  closedLaneHe: string | null;
  closedLaneEn: string | null;
}

/**
 * Diff two SERVER credit breakdowns into a narrative-ready delta: the degree-%
 * movement, and the first requirement bucket (if any) that this save pushed from
 * unmet to met. focusAreaTarget is read from the `after` snapshot when present.
 *
 * Two percentage pairs come back on purpose. `fromPct`/`toPct` are the credits
 * the student HOLDS — the identical definition the hero renders, so the save
 * banner can never contradict the number right above it. `fromPlanPct`/
 * `toPlanPct` are plan coverage (held + planned); they answer "what did this
 * save add to my plan" and MUST carry a label that says so.
 */
export function diffBreakdown(
  before: CreditBreakdown | null,
  after: CreditBreakdown | null,
): BreakdownDelta {
  const fromPct = degreePct(before);
  const toPct = degreePct(after);
  const fromPlanPct = plannedPct(before);
  const toPlanPct = plannedPct(after);

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

  return { fromPct, toPct, fromPlanPct, toPlanPct, closedLaneHe, closedLaneEn };
}
