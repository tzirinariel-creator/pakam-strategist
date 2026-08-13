// =========================================================================
// Honest milestones (Wave-4 delegated build, direction chosen 13.7):
// ADVISOR-voiced MOMENTS at real, derivable thresholds — no points, no badges,
// no leaderboards, no streaks. A milestone is something that objectively
// happened in the student's own data; the advisor marks it once and moves on.
// Pure module: the dashboard passes numbers in, one card renders at most.
//
// Every line exists TWICE, once per persona — same fact, genuinely different
// voice. The King reaches for the canon (the cave, the polis); the Referent is
// the third-year who already walked it and tells you what it means for the rest
// of the way. A Referent user used to get the King's Plato line under a header
// that named the King (13.8).
// =========================================================================

import type { Gender } from "@/lib/personal-address";
import type { Persona } from "@/lib/persona";

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
  /** Whose voice speaks the line. Defaults to the King (the app's default). */
  persona?: Persona;
}

export interface Milestone {
  id: string;
  /** The advisor's line — grounded in the number, never invented. */
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
  const referent = input.persona === "referent";
  const out: Milestone[] = [];
  if (totalCredits <= 0) return out;

  const share = earnedCredits / totalCredits;

  if (share >= 0.75) {
    out.push({
      id: "credits-75",
      textHe: referent
        ? `${earnedCredits} מתוך ${totalCredits} ש״ס — שלושה רבעים מהדרך. מכאן זה כבר עניין של לא להתפזר: מה שנשאר הוא בעיקר סדר, לא כמות.`
        : `${earnedCredits} מתוך ${totalCredits} ש״ס — שלושה רבעים מהדרך. אפלטון דיבר על היציאה מהמערה; אצלכם כבר רואים את האור. עוד מאמץ אחד טוב.`,
      textEn: referent
        ? `${earnedCredits} of ${totalCredits} credits — three quarters of the way. From here it's about order, not volume.`
        : `${earnedCredits} of ${totalCredits} credits — three quarters of the way. One good push left.`,
    });
  } else if (share >= 0.5) {
    out.push({
      id: "credits-50",
      textHe: referent
        ? `חצי התואר מאחוריכם — ${earnedCredits} מתוך ${totalCredits} ש״ס. מהנקודה הזאת כדאי לתכנן אחורה מהסוף, לא רק סמסטר קדימה.`
        : `חצי התואר מאחוריכם — ${earnedCredits} מתוך ${totalCredits} ש״ס. מנקודת האמצע רואים גם כמה טיפסתם וגם את ההמשך. המשיכו באותו קצב.`,
      textEn: referent
        ? `Half the degree behind you — ${earnedCredits} of ${totalCredits} credits. From here, plan backwards from the finish, not one semester ahead.`
        : `Half the degree behind you — ${earnedCredits} of ${totalCredits} credits. Keep the pace.`,
    });
  } else if (share >= 0.25) {
    out.push({
      id: "credits-25",
      textHe: referent
        ? `רבע מהתואר סגור — ${earnedCredits} מתוך ${totalCredits} ש״ס. הקצב שנקבע עכשיו הוא זה שנשאר, אז שווה להסתכל עליו כבר עכשיו.`
        : `רבע מהתואר כבר מאחוריכם — ${earnedCredits} מתוך ${totalCredits} ש״ס. אבן על אבן, בדיוק כך נבנה תואר.`,
      textEn: referent
        ? `A quarter of the degree done — ${earnedCredits} of ${totalCredits} credits. The pace you set now is the one that sticks.`
        : `A quarter of the degree behind you — ${earnedCredits} of ${totalCredits} credits. Stone by stone.`,
    });
  }

  if (englishExempt) {
    out.push({
      id: "english-exempt",
      textHe: referent
        ? "פטור מאנגלית — סעיף אחד פחות לדאוג לו. נשארו רק שני קורסי-התוכן באנגלית, והם כבר בתוכנית."
        : "פטור מאנגלית — שער אחד נסגר מאחוריכם. נשארו רק קורסי-התוכן באנגלית (2 לכולם), והם כבר בתוכנית.",
      textEn: referent
        ? "English exemption done — one less thing to track. Only the 2 content courses remain, and they're already in your plan."
        : "English exemption reached — one gate closed behind you. Only the 2 content courses remain.",
    });
  }

  if (gradedCount === 1) {
    out.push({
      id: "first-grade",
      // "זה" in the old copy dangled between "הממוצע והתחזיות" (plural) and
      // "התיק" (singular) with no clear referent — reworded so "התיק" is the
      // explicit subject of the closing clause (24.7 audit: "מה זה אומר בכלל?").
      textHe: referent
        ? "הציון הראשון נכנס לתיק — מעכשיו הממוצע והתחזיות רצים על נתון אמיתי ולא על הערכה. משם זה רק מתמלא."
        : "הציון הראשון שלכם נכנס לתיק — מעכשיו הממוצע והתחזיות מבוססים על נתון אמיתי, לא על הערכה. התיק רק ימשיך להתמלא מכאן.",
      textEn: referent
        ? "First grade is in — your average and forecasts now run on a real number instead of an estimate."
        : "Your first grade is in — from now your average and forecasts are built on a real number, not an estimate. Your record will only keep filling in from here.",
    });
  }

  return out;
}
