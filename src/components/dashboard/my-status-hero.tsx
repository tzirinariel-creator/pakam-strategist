"use client";

import { GraduationCap, ArrowLeft, ArrowRight, BookOpen } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { GRADE_REQUIREMENTS } from "@/lib/constants";
import { roundScore } from "@/lib/grade-calculator";
import { cn } from "@/lib/utils";
import type { CreditBreakdown, GradeBreakdown } from "@/types/degree";
import { DegreeStatus, type DisciplineProgress } from "./degree-status";

// Re-export so the ~existing import sites (dashboard-content) keep resolving here.
export type { DisciplineProgress };

/**
 * "המצב שלי" — the unified status hero (HOME read-lens). A thin frame around the
 * shared <DegreeStatus> render (the same component the planner board uses, so the
 * two never show two disagreeing credit bars) plus the header GPA badge and the
 * single bridge from "where am I" to "where I plan".
 */
export function MyStatusHero({
  credits,
  grade,
  isHe,
  topGap,
  hasFocusArea,
  amiramScore,
  declaredEnglishLevel,
  currentYear,
  disciplines,
  inProgressCount,
}: {
  credits: CreditBreakdown | null;
  grade: GradeBreakdown;
  isHe: boolean;
  /** The single most pressing unmet requirement, if any. */
  topGap?: { nameHe: string; nameEn: string } | null;
  /** Whether the student has chosen a focus-area discipline. */
  hasFocusArea: boolean;
  /** Amiram/Amirnet English placement score (50–150), or null. */
  amiramScore: number | null;
  /** #23 — English level declared directly (grade sheet / settings); wins over the score. */
  declaredEnglishLevel?: string | null;
  /** Per-discipline progress — the three PPE legs. Empty/undefined hides it. */
  disciplines?: DisciplineProgress[];
  /** Academic year (1–3) — English LEVEL guidance is year-1 only (#11). */
  currentYear: number;
  /** How many planned courses are being studied right now (derived, #4/#22). */
  inProgressCount?: number;
}) {
  const Arrow = isHe ? ArrowLeft : ArrowRight;
  const gpa = roundScore(grade.courseAverage);
  const gpaBar = GRADE_REQUIREMENTS.YEAR_TRANSITION_OVERALL_GPA;

  return (
    <div className="data-card p-5 md:p-6">
      <div className="mb-4 flex items-center gap-2">
        <GraduationCap className="h-5 w-5 text-accent-brand" />
        <h2 className="font-display text-lg font-bold text-foreground/90">
          {isHe ? "המצב שלי" : "My status"}
        </h2>
        {gpa !== null && (
          <span
            dir="ltr"
            className={cn(
              "ms-auto inline-flex items-baseline gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
              gpa >= gpaBar
                ? "bg-emerald-400/10 text-emerald-500"
                : "bg-amber-400/10 text-amber-500",
            )}
          >
            <span className="font-mono font-bold tabular-nums">{gpa.toFixed(1)}</span>
            <span className="opacity-60">{isHe ? "ממוצע" : "GPA"}</span>
          </span>
        )}
      </div>

      {/* The "present": courses being studied right now (derived, #4/#22). Links
          to the Record, where they get marked done once grades are out. */}
      {inProgressCount != null && inProgressCount > 0 && (
        <Link
          href="/record"
          className="mb-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-400/10 px-2.5 py-1 text-xs font-medium text-blue-500 transition-colors hover:bg-blue-400/15"
        >
          <BookOpen className="size-3.5" />
          {isHe
            ? inProgressCount === 1
              ? "קורס אחד בלימוד עכשיו"
              : `${inProgressCount} קורסים בלימוד עכשיו`
            : `${inProgressCount} ${inProgressCount === 1 ? "course" : "courses"} in progress now`}
        </Link>
      )}

      {/* The one canonical status render, shared with the planner board. */}
      <DegreeStatus
        variant="hero"
        credits={credits}
        isHe={isHe}
        gpa={gpa}
        disciplines={disciplines}
        hasFocusArea={hasFocusArea}
        amiramScore={amiramScore}
        declaredEnglishLevel={declaredEnglishLevel}
        currentYear={currentYear}
      />

      {/* The single most pressing thing left + the bridge to where you plan. */}
      <div className="mt-4 border-t border-border/40 pt-3">
        {topGap ? (
          <p className="text-xs text-foreground/60">
            {isHe ? "הכי חשוב עכשיו: " : "Most pressing: "}
            <span className="font-medium text-foreground/80">
              {isHe ? topGap.nameHe : topGap.nameEn}
            </span>
          </p>
        ) : (
          <p className="text-xs text-foreground/45">
            {isHe
              ? "אין כרגע דרישה שחסרה — ממשיכים לצבור ש״ס לפי התוכנית."
              : "No missing requirement right now — keep accumulating credits per your plan."}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link
            href={
              topGap
                ? `/planner/semester?goal=${encodeURIComponent(isHe ? topGap.nameHe : topGap.nameEn)}`
                : "/planner/semester"
            }
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent-brand px-3.5 py-2 text-sm font-semibold text-accent-brand-fg shadow-sm transition-colors hover:bg-accent-brand-hover"
          >
            {topGap
              ? isHe
                ? "תכננו — נסגור את זה"
                : "Plan — close this gap"
              : isHe
                ? "תכננו את הסמסטר הקרוב"
                : "Plan the upcoming semester"}
            <Arrow className="size-3.5" />
          </Link>
          <Link
            href="/regulations"
            className="inline-flex items-center gap-1 text-xs font-medium text-foreground/60 transition-colors hover:text-foreground/85"
          >
            {isHe ? "פירוט מלא של הדרישות" : "Full requirement breakdown"}
            <Arrow className="size-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
