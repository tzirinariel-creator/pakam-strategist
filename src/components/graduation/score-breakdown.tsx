"use client";

import { useState, useMemo, useEffect } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { GRADE_WEIGHTS } from "@/lib/constants";
import { roundScore } from "@/lib/grade-calculator";
import type { GradeBreakdown } from "@/types/degree";

interface ScoreBreakdownProps {
  breakdown: GradeBreakdown;
  enableWhatIf?: boolean;
  className?: string;
}

interface ComponentRowProps {
  label: string;
  weight: number;
  grade: number | null;
  weightedContribution: number | null;
  accentColor: string;
  barColor: string;
  missingLabel: string;
}

function ComponentRow({
  label,
  weight,
  grade,
  weightedContribution,
  accentColor,
  barColor,
  missingLabel,
}: ComponentRowProps) {
  const rounded = roundScore(grade);
  const percentage = weight * 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <div className={cn("h-3 w-3 rounded-sm", barColor)} />
          <span className="font-medium text-foreground/80">{label}</span>
          <span className="font-mono text-xs text-foreground/40">
            ({percentage}%)
          </span>
        </div>
        <div className="flex items-center gap-3">
          {rounded !== null ? (
            <>
              <span className={cn("font-mono tabular text-base font-semibold", accentColor)}>
                {rounded.toFixed(1)}
              </span>
              <span dir="ltr" className="font-mono text-xs text-foreground/40">
                × {weight} ={" "}
                <span className="font-semibold text-foreground/60">
                  {roundScore(weightedContribution)?.toFixed(2) ?? "—"}
                </span>
              </span>
            </>
          ) : (
            <span className="font-mono text-sm text-foreground/25">
              {missingLabel}
            </span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-foreground/5">
        <div
          className={cn("h-full rounded-full transition-all duration-700", barColor)}
          style={{ width: rounded !== null ? `${Math.min(rounded, 100)}%` : "0%" }}
        />
      </div>
    </div>
  );
}

/**
 * Unified score breakdown + what-if simulator.
 * Shows each component (courses 78%, seminar 18%, referat 4%) with
 * its current grade, weight, and contribution to the final score.
 * When enableWhatIf is true, adds a collapsible simulation section.
 */
export function ScoreBreakdown({ breakdown, enableWhatIf, className }: ScoreBreakdownProps) {
  const t = useTranslations("graduation");

  // What-if state
  const [whatIfOpen, setWhatIfOpen] = useState(false);
  const [courseAvg, setCourseAvg] = useState<string>(
    breakdown.courseAverage?.toFixed(1) ?? ""
  );
  const [seminarAvg, setSeminarAvg] = useState<string>(
    breakdown.seminarPaperAverage?.toFixed(1) ?? ""
  );
  const [referatGrade, setReferatGrade] = useState<string>(
    breakdown.referatGrade?.toFixed(1) ?? ""
  );

  // Re-seed the inputs from real data when it loads (the breakdown is the all-null
  // fallback until grade data arrives) — but only while the panel is closed, so we
  // never clobber values the user is actively simulating.
  useEffect(() => {
    if (!whatIfOpen) {
      setCourseAvg(breakdown.courseAverage?.toFixed(1) ?? "");
      setSeminarAvg(breakdown.seminarPaperAverage?.toFixed(1) ?? "");
      setReferatGrade(breakdown.referatGrade?.toFixed(1) ?? "");
    }
  }, [
    breakdown.courseAverage,
    breakdown.seminarPaperAverage,
    breakdown.referatGrade,
    whatIfOpen,
  ]);

  const courseContribution =
    breakdown.courseAverage !== null
      ? breakdown.courseAverage * GRADE_WEIGHTS.COURSES
      : null;
  const seminarContribution =
    breakdown.seminarPaperAverage !== null
      ? breakdown.seminarPaperAverage * GRADE_WEIGHTS.SEMINAR_PAPERS
      : null;
  const referatContribution =
    breakdown.referatGrade !== null
      ? breakdown.referatGrade * GRADE_WEIGHTS.REFERAT
      : null;

  // What-if simulation
  const simulated = useMemo(() => {
    const c = parseFloat(courseAvg);
    const s = parseFloat(seminarAvg);
    const r = parseFloat(referatGrade);

    if (isNaN(c) || isNaN(s) || isNaN(r)) return null;
    if (c < 0 || c > 100 || s < 0 || s > 100 || r < 0 || r > 100) return null;

    return c * GRADE_WEIGHTS.COURSES + s * GRADE_WEIGHTS.SEMINAR_PAPERS + r * GRADE_WEIGHTS.REFERAT;
  }, [courseAvg, seminarAvg, referatGrade]);

  const currentScore = roundScore(breakdown.weightedScore);
  const simulatedScore = roundScore(simulated);
  const diff =
    simulatedScore !== null && currentScore !== null
      ? roundScore(simulatedScore - currentScore)
      : null;

  return (
    <div className={cn("data-card space-y-6 p-6", className)}>
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold text-foreground/90">
          {t("formulaTitle")}
        </h3>
      </div>

      {/* Formula display — translated */}
      <div className="rounded-lg border border-border/50 bg-background/50 px-4 py-3">
        <p className="font-mono text-xs leading-relaxed text-foreground/50" dir="auto">
          {t("formulaExplainer")}
        </p>
      </div>

      {/* Component rows */}
      <div className="space-y-5">
        <ComponentRow
          label={t("courseAvg")}
          weight={GRADE_WEIGHTS.COURSES}
          grade={breakdown.courseAverage}
          weightedContribution={courseContribution}
          accentColor="text-blue-400"
          barColor="bg-blue-500"
          missingLabel={t("missing")}
        />

        <ComponentRow
          label={t("seminarAvg")}
          weight={GRADE_WEIGHTS.SEMINAR_PAPERS}
          grade={breakdown.seminarPaperAverage}
          weightedContribution={seminarContribution}
          accentColor="text-purple-400"
          barColor="bg-purple-500"
          missingLabel={t("missing")}
        />

        <ComponentRow
          label={t("referatGrade")}
          weight={GRADE_WEIGHTS.REFERAT}
          grade={breakdown.referatGrade}
          weightedContribution={referatContribution}
          accentColor="text-teal-400"
          barColor="bg-teal-500"
          missingLabel={t("missing")}
        />
      </div>

      {/* Divider + total */}
      <div className="border-t border-border/50 pt-4">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-foreground/70">{t("totalWeighted")}</span>
          <span className="font-display tabular text-xl font-bold text-foreground/80">
            {roundScore(breakdown.weightedScore)?.toFixed(2) ?? "—"}
          </span>
        </div>
      </div>

      {/* What-If Simulation — collapsible */}
      {enableWhatIf && (
        <div className="border-t border-border/50 pt-4">
          <button
            type="button"
            onClick={() => setWhatIfOpen(!whatIfOpen)}
            className="flex w-full items-center justify-between rounded-lg px-1 py-1 text-sm font-medium text-foreground/70 transition-colors hover:text-foreground/90"
          >
            <span>{t("whatIfTitle")}</span>
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform duration-200",
                whatIfOpen && "rotate-180"
              )}
            />
          </button>

          {whatIfOpen && (
            <div className="mt-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
              <p className="text-xs text-foreground/45">
                {t("whatIfDesc")}
              </p>

              {/* Input fields */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-foreground/55">
                    {t("courseAvgLabel")}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={courseAvg}
                    onChange={(e) => setCourseAvg(e.target.value)}
                    placeholder="85.0"
                    className="w-full rounded-md border border-border/50 bg-background/50 px-3 py-1.5 font-mono text-sm text-foreground placeholder:text-foreground/20 focus:border-foreground/35 focus:outline-none focus:ring-1 focus:ring-foreground/20"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-foreground/55">
                    {t("seminarAvgLabel")}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={seminarAvg}
                    onChange={(e) => setSeminarAvg(e.target.value)}
                    placeholder="88.0"
                    className="w-full rounded-md border border-border/50 bg-background/50 px-3 py-1.5 font-mono text-sm text-foreground placeholder:text-foreground/20 focus:border-foreground/35 focus:outline-none focus:ring-1 focus:ring-foreground/20"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-foreground/55">
                    {t("referatLabel")}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={referatGrade}
                    onChange={(e) => setReferatGrade(e.target.value)}
                    placeholder="90.0"
                    className="w-full rounded-md border border-border/50 bg-background/50 px-3 py-1.5 font-mono text-sm text-foreground placeholder:text-foreground/20 focus:border-foreground/35 focus:outline-none focus:ring-1 focus:ring-foreground/20"
                  />
                </div>
              </div>

              {/* Simulation results */}
              {simulatedScore !== null && (
                <div className="flex items-center justify-between rounded-lg border border-foreground/15 bg-foreground/5 px-4 py-3">
                  <div className="space-y-0.5">
                    <span className="text-[11px] text-foreground/50">{t("simulatedScore")}</span>
                    <div className="font-display tabular text-xl font-bold text-foreground/80">
                      {simulatedScore.toFixed(2)}
                    </div>
                  </div>

                  {diff !== null && (
                    <div className="text-end space-y-0.5">
                      <span className="text-[11px] text-foreground/50">{t("change")}</span>
                      <div
                        className={cn(
                          "font-mono text-base font-semibold",
                          diff > 0
                            ? "text-emerald-400"
                            : diff < 0
                              ? "text-red-400"
                              : "text-foreground/40"
                        )}
                      >
                        {diff > 0 ? "+" : ""}
                        {diff.toFixed(2)}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
