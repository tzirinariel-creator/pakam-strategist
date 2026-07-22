// =========================================================================
// Honest milestones (Wave-4 delegated build, direction chosen 13.7):
// King-voiced MOMENTS at real, derivable thresholds — no points, no badges,
// no leaderboards, no streaks. A milestone is something that objectively
// happened in the student's own data; the King marks it once and moves on.
// Pure module: the dashboard passes numbers in, one card renders at most.
// =========================================================================

import type { Gender } from "@/lib/personal-address";

export interface MilestoneInput {
  /** Credits actually EARNED (completed, after exemptions math) — the hero's number. */
  earnedCredits: number;
  /** Degree total (150 for PPE). */
  totalCredits: number;
  /** Courses with a recorded grade. */
  gradedCount: number;
  /** Resolved English exemption (declared level or score — resolveEnglishLevel). */
  englishExempt: boolean;
  gender: Gender;
}

export interface Milestone {
  id: string;
  /** The King's line — grounded in the number, never invented. */
  textHe: string;
  textEn: string;
}

/**
 * Every milestone whose condition is TRUE, in priority order (largest first —
 * a returning student who crossed two thresholds while away sees the bigger
 * one; the card marks all reached ids as seen so there's no backlog nagging).
 */
export function reachedMilestones(input: MilestoneInput): Milestone[] {
  // Milestones are PRODUCT cards on the dashboard → plural voice, no gendered
  // verbs (the 50%-card mixed 'טיפסתם' plural with a gendered 'המשך' — research
  // 14.7). `gender` stays on the input for forward-compat but isn't used here.
  const { earnedCredits, totalCredits, gradedCount, englishExempt } = input;
  const out: Milestone[] = [];
  if (totalCredits <= 0) return out;

  const share = earnedCredits / totalCredits;

  if (share >= 0.75) {
    out.push({
      id: "credits-75",
      textHe: `${earnedCredits} מתוך ${totalCredits} ש״ס — שלושה רבעים מהדרך. אפלטון דיבר על היציאה מהמערה; אצלכם כבר רואים את האור. עוד מאמץ אחד טוב.`,
      textEn: `${earnedCredits} of ${totalCredits} credits — three quarters of the way. One good push left.`,
    });
  } else if (share >= 0.5) {
    out.push({
      id: "credits-50",
      textHe: `חצי התואר מאחוריכם — ${earnedCredits} מתוך ${totalCredits} ש״ס. מנקודת האמצע רואים גם כמה טיפסתם וגם את ההמשך. המשיכו באותו קצב.`,
      textEn: `Half the degree behind you — ${earnedCredits} of ${totalCredits} credits. Keep the pace.`,
    });
  } else if (share >= 0.25) {
    out.push({
      id: "credits-25",
      textHe: `רבע מהתואר כבר מאחוריכם — ${earnedCredits} מתוך ${totalCredits} ש״ס. אבן על אבן, בדיוק כך נבנה תואר.`,
      textEn: `A quarter of the degree behind you — ${earnedCredits} of ${totalCredits} credits. Stone by stone.`,
    });
  }

  if (englishExempt) {
    out.push({
      id: "english-exempt",
      textHe: "פטור מאנגלית — שער אחד נסגר מאחוריכם. נשארו רק קורסי-התוכן באנגלית (2 לכולם), והם כבר בתוכנית.",
      textEn: "English exemption reached — one gate closed behind you. Only the 2 content courses remain.",
    });
  }

  if (gradedCount === 1) {
    out.push({
      id: "first-grade",
      textHe: "הציון הראשון שלכם נכנס לתיק — מעכשיו הממוצע והתחזיות מבוססים על נתון אמיתי, לא על הערכה. מכאן זה רק ימשיך להתמלא.",
      textEn: "Your first grade is in — from now your average and forecasts are built on a real number, not an estimate. It only fills up from here.",
    });
  }

  return out;
}
