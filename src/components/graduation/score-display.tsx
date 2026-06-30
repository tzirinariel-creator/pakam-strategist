"use client";

import { GraduationCap } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { roundScore } from "@/lib/grade-calculator";
import type { GradeBreakdown } from "@/types/degree";

interface ScoreDisplayProps {
  breakdown: GradeBreakdown;
  className?: string;
}

/**
 * Bloomberg-style large monospace graduation score display.
 * Shows the weighted graduation score prominently with a color-coded gauge.
 */
export function ScoreDisplay({ breakdown, className }: ScoreDisplayProps) {
  const t = useTranslations("graduation");
  // The full weighted graduation score needs seminar + referat grades. Until a
  // student has those, fall back to their current course average so someone with
  // real grades sees their number (with a clear "provisional" note) instead of an
  // empty "no grades yet" state.
  const finalScore = roundScore(breakdown.weightedScore);
  const provisionalScore =
    finalScore === null ? roundScore(breakdown.courseAverage) : null;
  const score = finalScore ?? provisionalScore;
  const hasScore = score !== null;
  const isProvisional = finalScore === null && provisionalScore !== null;
  // The plain overall course average ("ממוצע כללי"). When provisional, the hero
  // number already IS this value, so we caption it rather than repeat it; when
  // the weighted graduation score is shown, the general average is a distinct,
  // useful number and gets its own prominent block.
  const generalAverage = roundScore(breakdown.courseAverage);

  // Color coding based on score ranges
  const getScoreColor = (s: number) => {
    if (s >= 90) return "text-emerald-400";
    if (s >= 80) return "text-foreground/80";
    if (s >= 70) return "text-amber-400";
    if (s >= 60) return "text-orange-400";
    return "text-red-400";
  };

  const getScoreLabel = (s: number) => {
    if (s >= 95) return t("scoreSumma");
    if (s >= 90) return t("scoreMagna");
    if (s >= 85) return t("scoreVeryGood");
    if (s >= 75) return t("scoreGood");
    if (s >= 65) return t("scoreAlmostGood");
    return t("scoreSufficient");
  };

  const getGlowColor = (s: number) => {
    if (s >= 90) return "shadow-emerald-400/20";
    if (s >= 80) return "shadow-foreground/15";
    if (s >= 70) return "shadow-amber-400/20";
    return "shadow-red-400/20";
  };

  return (
    <div
      className={cn(
        "data-card flex flex-col items-center gap-4 p-8",
        hasScore && getGlowColor(score),
        hasScore && "shadow-lg",
        className
      )}
    >
      {hasScore ? (
        <>
          {/* Caption — names the big number. In provisional mode the hero IS the
              general average, so say so outright instead of hiding it in fine print. */}
          <span className="text-xs font-semibold uppercase tracking-wide text-foreground/45">
            {isProvisional ? t("generalAverage") : t("graduationScoreLabel")}
          </span>

          {/* Large score number */}
          <div className="flex items-baseline gap-1" dir="ltr">
            <span
              className={cn(
                "font-display tabular text-6xl font-bold tabular-nums tracking-tight",
                getScoreColor(score)
              )}
            >
              {score.toFixed(2)}
            </span>
            <span className="text-lg text-foreground/40">/100</span>
          </div>

          {/* Honest framing — provisional course average until seminars are graded */}
          <p className="-mt-2 text-xs text-foreground/40">
            {isProvisional
              ? t("provisionalBasis")
              : t("forecastBasis", { credits: breakdown.completedCredits })}
          </p>

          {/* Score label */}
          <div
            className={cn(
              "rounded-full border px-4 py-1 font-bold text-sm",
              score >= 90
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-400"
                : score >= 80
                  ? "border-foreground/20 bg-foreground/10 text-foreground/80"
                  : score >= 70
                    ? "border-amber-400/30 bg-amber-400/10 text-amber-400"
                    : "border-red-400/30 bg-red-400/10 text-red-400"
            )}
          >
            {getScoreLabel(score)}
          </div>

          {/* General average — its own prominent block when the hero shows the
              weighted graduation score (so the plain GPA never gets buried). */}
          {!isProvisional && generalAverage !== null && (
            <div className="mt-1 flex w-full flex-col items-center gap-0.5 rounded-xl border border-foreground/10 bg-foreground/[0.03] px-5 py-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground/45">
                {t("generalAverage")}
              </span>
              <span
                className={cn(
                  "font-mono tabular text-2xl font-bold tabular-nums",
                  getScoreColor(generalAverage)
                )}
              >
                {generalAverage.toFixed(2)}
              </span>
            </div>
          )}

          {/* Stats row */}
          <div className="mt-2 flex items-center gap-6 text-sm text-foreground/50">
            <div className="flex flex-col items-center">
              <span className="font-mono tabular text-lg font-semibold text-foreground/70">
                {breakdown.totalGradedCourses}
              </span>
              <span>{t("gradedCourses")}</span>
            </div>
            <div className="h-8 w-px bg-border" />
            <div className="flex flex-col items-center">
              <span className="font-mono tabular text-lg font-semibold text-foreground/70">
                {breakdown.completedCredits}
              </span>
              <span>{t("completedCredits")}</span>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Empty state — friendly, not just --.- */}
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-foreground/5">
            <GraduationCap className="h-8 w-8 text-foreground/25" />
          </div>
          <p className="text-sm font-medium text-foreground/50">
            {t("noDataTitle")}
          </p>
          <p className="max-w-xs text-center text-xs leading-relaxed text-foreground/35">
            {t("noScoreHint")}
          </p>
        </>
      )}
    </div>
  );
}
