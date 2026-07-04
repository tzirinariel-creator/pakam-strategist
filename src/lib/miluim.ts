// =========================================
// Miluim (military reserve) — pure domain logic
// =========================================
// No DB access, no React. All functions are pure and driven by MILUIM_CONFIG
// (src/lib/constants.ts), which mirrors the official מתווה תשפ"ו
// (docs/pakam-domain-rules-2026.md §6 Layer B).
//
// PURELY ADDITIVE: deriveCurrentGroup falls back to the user's single
// `miluimGroup` when there are no per-semester rows, so a user with NO
// MiluimSemester data gets the EXACT same group (and therefore the exact same
// credit/exemption numbers) as before this feature existed.

import { MILUIM_CONFIG } from "@/lib/constants";
import type { MiluimGroup, Semester } from "@/types/enums";

export type MiluimGroupKey = keyof typeof MILUIM_CONFIG.GROUPS;

/**
 * The current Israeli academic year as a single calendar-year key, used as the
 * `MiluimSemester.academicYear` value on BOTH the write path (onboarding +
 * settings) and the read path (plan / regulation resolution). MUST be the one
 * source of this key — a mismatch silently breaks per-semester resolution.
 *
 * The academic year starts in October, so a FALL semester and the SPRING that
 * follows it share ONE academic-year value:
 *   - Oct–Dec  → the current calendar year (the year the academic year started)
 *   - Jan–Sep  → the previous calendar year (still the same academic year)
 *
 * e.g. Nov 2025 and Mar 2026 both map to 2025 (תשפ"ו).
 *
 * @param now  Injectable for tests; defaults to the real current date.
 */
export function getCurrentAcademicYear(now: Date = new Date()): number {
  const month = now.getMonth(); // 0-indexed: 9 = October
  const year = now.getFullYear();
  return month >= 9 ? year : year - 1; // Oct onward → this calendar year
}

/**
 * Map any semester to the FALL/SPRING bucket that the miluim outline actually
 * uses. SUMMER has no distinct miluim group (the schema accepts it but the
 * editor never creates a SUMMER row), so a student currently flagged SUMMER
 * still resolves against the nearest taught semester. We fold SUMMER → SPRING:
 * the summer term sits at the tail of the academic year, so it shares that
 * year's SPRING service window.
 */
function toResolvableSemester(semester: Semester): Semester {
  return semester === "SUMMER" ? "SPRING" : semester;
}

/**
 * Minimal shape of a per-semester miluim record used by the pure helpers.
 * Matches the Prisma `MiluimSemester` model but stays decoupled from it so the
 * helpers can be unit-tested with plain objects.
 */
export interface MiluimSemesterLike {
  academicYear: number;
  semester: Semester;
  daysServed: number;
  isCombat: boolean;
  derivedGroup: MiluimGroup;
}

/**
 * Derive the miluim group from the common-path inputs (days served this
 * semester + combat status). This is the SINGLE source of truth lifted verbatim
 * from the onboarding deriveGroup, driven by the MILUIM_CONFIG thresholds:
 *   - combat (ייעוד קדמי): 21+ → C, 14–20 → B, 1–13 → A
 *   - regular reservist:   35+ → C, 21–34 → B, 1–20 → A
 *   - 0 (or negative) days → NONE
 * Per מתווה תשפ"ו (docs/pakam-domain-rules-2026.md §6).
 */
export function deriveGroupFromDays(days: number, combat: boolean): MiluimGroupKey {
  if (days <= 0) return "NONE";

  if (combat) {
    // Combat (ייעוד קדמי): enhanced mapping — higher group with fewer days.
    const [b, c] = MILUIM_CONFIG.COMBAT_UPGRADE.perSemesterRules;
    if (days >= c.minDays) return "GROUP_C"; // 21+
    if (days >= b.minDays) return "GROUP_B"; // 14–20
    return "GROUP_A"; // a handful of combat days still clears the legal 10-day floor
  }

  // Regular reservists. Thresholds come from MILUIM_CONFIG (single source) —
  // same place combat reads from, so the two never drift apart.
  const [b, c] = MILUIM_CONFIG.REGULAR_RESERVIST.perSemesterRules;
  if (days >= c.minDays) return "GROUP_C"; // 35+
  if (days >= b.minDays) return "GROUP_B"; // 21–34
  return "GROUP_A"; // 1–20 days
}

/**
 * Resolve the CURRENT miluim group for a student.
 *
 * Preferred: the derivedGroup of the per-semester row matching the current
 * academic year + semester (the group is reassigned every semester). If no such
 * row exists we fall back to the user's stored `miluimGroup`. This preserves the
 * exact pre-feature behavior for any user with no MiluimSemester rows.
 *
 * @param semesters      The user's MiluimSemester rows (may be empty).
 * @param fallbackGroup  user.miluimGroup — used when no current-semester row exists.
 * @param current        The student's current { academicYear, semester }. When
 *                       omitted, falls straight back to fallbackGroup.
 */
export function deriveCurrentGroup(
  semesters: MiluimSemesterLike[],
  fallbackGroup: MiluimGroup,
  current?: { academicYear?: number | null; semester?: Semester | null }
): MiluimGroupKey {
  if (
    current &&
    current.academicYear != null &&
    current.semester != null &&
    semesters.length > 0
  ) {
    // SUMMER never has its own miluim row, so fold it onto the nearest
    // FALL/SPRING bucket before matching (see toResolvableSemester / fix E).
    const wantSemester = toResolvableSemester(current.semester);
    const row = semesters.find(
      (s) =>
        s.academicYear === current.academicYear &&
        s.semester === wantSemester
    );
    if (row) return row.derivedGroup as MiluimGroupKey;
  }
  return fallbackGroup as MiluimGroupKey;
}

/**
 * The credit exemption (ש"ס פטור) granted RIGHT NOW for a group, accounting for
 * how much has already been used across the degree.
 *
 *   computeCreditExemption(group, alreadyUsed)
 *     = clamp( min(group.creditExemptionPerYear,
 *                  MAX_CREDIT_EXEMPTIONS_DEGREE - alreadyUsed),
 *              >= 0 )
 *
 * Mirrors the existing inline math in plan.getCredits / regulation.checkCompliance:
 * with alreadyUsed = 0 this is exactly `min(group rate, 10)` — i.e. identical to
 * today. The degree cap (10 ש"ס for a BA) is per MILUIM_CONFIG. Never multiply by
 * year (that over-grants — see domain §6 "BUG to fix").
 *
 * @param group        A MiluimGroupKey, or null/NONE for no exemption.
 * @param alreadyUsed  Credits already exempted across the degree (default 0).
 */
export function computeCreditExemption(
  group: MiluimGroupKey | null | undefined,
  alreadyUsed: number = 0
): number {
  if (!group || group === "NONE") return 0;
  const cfg = MILUIM_CONFIG.GROUPS[group];
  if (!cfg || cfg.creditExemptionPerYear <= 0) return 0;

  const remainingDegreeCap = Math.max(
    0,
    MILUIM_CONFIG.MAX_CREDIT_EXEMPTIONS_DEGREE - Math.max(0, alreadyUsed)
  );
  return Math.max(0, Math.min(cfg.creditExemptionPerYear, remainingDegreeCap));
}

/**
 * Remaining binary (pass/fail) conversions before hitting the degree cap.
 *
 * The BA cap is the larger of the group's own degree cap and the program-wide
 * BA cap (5), so a student is never blocked below the universal 5-course BA
 * allowance. Returns a non-negative integer.
 *
 * @param alreadyUsed  Binary conversions already used across the degree.
 * @param group        Optional group — used to read its own degree cap.
 */
export function binaryCapRemaining(
  alreadyUsed: number,
  group?: MiluimGroupKey | null
): number {
  const cap = binaryDegreeCap(group);
  return Math.max(0, cap - Math.max(0, alreadyUsed));
}

/**
 * The binary (pass/fail) degree cap that applies to a student. Defaults to the
 * program-wide BA cap (5); if a group specifies its own higher cap, that wins.
 */
export function binaryDegreeCap(group?: MiluimGroupKey | null): number {
  const baCap = MILUIM_CONFIG.BINARY_GRADE.BA_DEGREE_CAP; // 5
  if (group && group !== "NONE") {
    const groupCap = MILUIM_CONFIG.GROUPS[group]?.binaryGradeDegreeCap ?? 0;
    return Math.max(baCap, groupCap);
  }
  return baCap;
}

/**
 * Whether a group actually GRANTS the miluim binary-conversion benefit
 * (retroactively removing a graded course from the average). This is the ONE
 * gate every surface must use so they never disagree: the "My benefits" window,
 * the dashboard recommendations, the record advisor and the King all agree.
 * Per MILUIM_CONFIG only groups B and C set binaryGradeDegreeCap > 0; A, G and
 * NONE do not get this benefit (their config cap is 0). If the מתווה says
 * otherwise for a group, change its config cap — not this gate.
 */
export function hasMiluimBinaryBenefit(group?: MiluimGroupKey | null): boolean {
  if (!group || group === "NONE") return false;
  return (MILUIM_CONFIG.GROUPS[group]?.binaryGradeDegreeCap ?? 0) > 0;
}

/**
 * The honors (rector/dean) binary ceiling as a PERCENT of the year's course
 * hours: binary-converted course hours must be ≤ this percent to stay an
 * excellence candidate (domain §6). Reads MILUIM_CONFIG.BINARY_GRADE.
 * EXCELLENCE_MAX_PERCENT (25).
 */
export function honorsBinaryPercent(): number {
  return MILUIM_CONFIG.BINARY_GRADE.EXCELLENCE_MAX_PERCENT;
}

/**
 * Convenience: given total course hours in a year and the hours that are
 * binary-converted, returns whether the honors 25% cap is exceeded plus the
 * computed percentage. A zero-hour year is never "over" (nothing to exceed).
 */
export function honorsBinaryStatus(
  binaryHours: number,
  totalHours: number
): { percent: number; cap: number; over: boolean } {
  const cap = honorsBinaryPercent();
  if (totalHours <= 0) return { percent: 0, cap, over: false };
  const percent = (binaryHours / totalHours) * 100;
  return { percent, cap, over: percent > cap };
}
