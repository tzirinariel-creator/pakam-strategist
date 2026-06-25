"use client";

import { useState, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import { GRADE_WEIGHTS } from "@/lib/constants";
import { roundScore } from "@/lib/grade-calculator";
import type { GradeBreakdown } from "@/types/degree";

interface WhatIfScoreProps {
  currentBreakdown: GradeBreakdown;
  className?: string;
}

/**
 * "What If" score simulator.
 * Lets students input hypothetical grades and see
 * how their graduation score would change.
 */
export function WhatIfScore({ currentBreakdown, className }: WhatIfScoreProps) {
  const t = useTranslations("graduation");

  const [courseAvg, setCourseAvg] = useState<string>(
    currentBreakdown.courseAverage?.toFixed(1) ?? ""
  );
  const [seminarAvg, setSeminarAvg] = useState<string>(
    currentBreakdown.seminarPaperAverage?.toFixed(1) ?? ""
  );
  const [referatGrade, setReferatGrade] = useState<string>(
    currentBreakdown.referatGrade?.toFixed(1) ?? ""
  );

  const locale = useLocale();
  const isHe = locale === "he";

  // Compute simulated score — supports partial input:
  // Missing components are estimated from the average of the provided ones.
  const { simulated, isPartial } = useMemo(() => {
    const c = parseFloat(courseAvg);
    const s = parseFloat(seminarAvg);
    const r = parseFloat(referatGrade);

    const cValid = !isNaN(c) && c >= 0 && c <= 100;
    const sValid = !isNaN(s) && s >= 0 && s <= 100;
    const rValid = !isNaN(r) && r >= 0 && r <= 100;

    const validCount = [cValid, sValid, rValid].filter(Boolean).length;
    if (validCount === 0) return { simulated: null, isPartial: false };

    // Full calculation — all 3 present
    if (cValid && sValid && rValid) {
      return {
        simulated: c * GRADE_WEIGHTS.COURSES + s * GRADE_WEIGHTS.SEMINAR_PAPERS + r * GRADE_WEIGHTS.REFERAT,
        isPartial: false,
      };
    }

    // Partial: fill missing components with the average of the ones provided
    const provided = [cValid ? c : null, sValid ? s : null, rValid ? r : null].filter(
      (v): v is number => v !== null
    );
    const avg = provided.reduce((a, b) => a + b, 0) / provided.length;
    const cFinal = cValid ? c : avg;
    const sFinal = sValid ? s : avg;
    const rFinal = rValid ? r : avg;

    return {
      simulated: cFinal * GRADE_WEIGHTS.COURSES + sFinal * GRADE_WEIGHTS.SEMINAR_PAPERS + rFinal * GRADE_WEIGHTS.REFERAT,
      isPartial: true,
    };
  }, [courseAvg, seminarAvg, referatGrade]);

  const currentScore = roundScore(currentBreakdown.weightedScore);
  const simulatedScore = roundScore(simulated);
  const diff =
    simulatedScore !== null && currentScore !== null
      ? roundScore(simulatedScore - currentScore)
      : null;

  return (
    <div className={cn("data-card space-y-5 p-6", className)}>
      <h3 className="font-bold text-lg text-foreground/90">
        {t("whatIfTitle")}
      </h3>
      <p className="text-sm text-foreground/50">
        {t("whatIfDesc")}
      </p>

      {/* Input fields */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground/60">
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
            className="w-full rounded-md border border-border/50 bg-background/50 px-3 py-2 font-mono text-sm text-foreground placeholder:text-foreground/20 focus:border-foreground/35 focus:outline-none focus:ring-1 focus:ring-foreground/20"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground/60">
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
            className="w-full rounded-md border border-border/50 bg-background/50 px-3 py-2 font-mono text-sm text-foreground placeholder:text-foreground/20 focus:border-foreground/35 focus:outline-none focus:ring-1 focus:ring-foreground/20"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground/60">
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
            className="w-full rounded-md border border-border/50 bg-background/50 px-3 py-2 font-mono text-sm text-foreground placeholder:text-foreground/20 focus:border-foreground/35 focus:outline-none focus:ring-1 focus:ring-foreground/20"
          />
        </div>
      </div>

      {/* Results */}
      {simulatedScore !== null && (
        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-lg border border-foreground/15 bg-foreground/5 px-5 py-4">
            <div className="space-y-0.5">
              <span className="text-xs text-foreground/50">{t("simulatedScore")}</span>
              <div className="font-mono text-2xl font-bold text-foreground/80">
                {simulatedScore.toFixed(2)}
              </div>
            </div>

            {diff !== null && (
              <div className="text-end space-y-0.5">
                <span className="text-xs text-foreground/50">{t("change")}</span>
                <div
                  className={cn(
                    "font-mono text-lg font-semibold",
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

          {isPartial && (
            <p className="text-xs text-amber-400/80">
              {isHe
                ? "* הערכה בלבד — מניחה שציוני סמינר ורפרט שווים לממוצע הקורסים"
                : "* Estimate only — assumes seminar & referat grades equal course average"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
