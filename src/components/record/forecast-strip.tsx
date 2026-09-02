"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { GraduationCap, Award } from "lucide-react";
import { roundScore } from "@/lib/grade-calculator";
import { type HonorsDistance } from "@/lib/honors";
import { Bidi } from "@/lib/bidi";

// Compact forecast strip at the top of /record — brings the predicted final
// grade + honors gap onto the record itself so a grade-anxious student sees
// "where this is going" without leaving. Read-only: grades are still entered
// only in the table below. weightedScore comes from getGraduationScore (the
// same source /graduation reads), so the two screens can never disagree.
export function ForecastStrip({
  weightedScore,
  honors,
  t,
}: {
  // Null until year 3 (needs a seminar-paper + referat). The honors gap is
  // computable from day one, so the strip renders for the honors side alone
  // when the final score isn't available yet (launch audit 24.7).
  weightedScore: number | null;
  honors: HonorsDistance;
  t: ReturnType<typeof useTranslations<"record">>;
}) {
  const score = weightedScore != null ? (roundScore(weightedScore) ?? weightedScore) : null;
  return (
    <div className="data-card flex flex-wrap items-center justify-between gap-4 p-5">
      {score != null ? (
        <div className="flex items-center gap-3">
          <GraduationCap className="h-6 w-6 shrink-0 text-accent-brand" />
          <div>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-3xl font-bold text-foreground/85">
                <Bidi text={score.toFixed(1)} />
              </span>
              <span className="text-sm font-medium text-foreground/60">{t("forecastTitle")}</span>
            </div>
            <p className="mt-0.5 text-[11px] text-foreground/60">{t("forecastCaption")}</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <Award className="h-6 w-6 shrink-0 text-status-amber" />
          <div>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-2xl font-bold text-foreground/85">
                <Bidi text={(honors.yearlyAverage ?? 0).toFixed(1)} />
              </span>
              <span className="text-sm font-medium text-foreground/60">
                {t("forecastYearAvg", { year: honors.year })}
              </span>
            </div>
          </div>
        </div>
      )}

      {honors.yearlyAverage !== null && (
        <div className="flex items-center gap-2 text-xs">
          <Award className="h-4 w-4 shrink-0 text-status-amber" />
          <span className="text-foreground/60">
            {honors.gap !== null && honors.gap > 0 ? (
              <Bidi text={t("forecastHonorsGap", { gap: honors.gap.toFixed(1), year: honors.year })} />
            ) : (
              <Bidi text={t("forecastHonorsIn", { year: honors.year })} />
            )}
          </span>
          <Link href="/graduation" className="font-medium text-accent-brand hover:underline">
            {t("forecastFullLink")}
          </Link>
        </div>
      )}
    </div>
  );
}
