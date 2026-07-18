"use client";

import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Calculator } from "lucide-react";
import { CREDIT_REQUIREMENTS } from "@/lib/constants";
import { AskKingButton } from "@/components/ui/ask-king-button";

// -----------------------------------------------------------------------
// Summary card — completed credits, weighted average, focus-area progress.
// -----------------------------------------------------------------------

export function SummaryCard({
  completedCredits,
  weightedAvg,
  focusCredits,
  focusTarget,
  hasFocus,
  t,
}: {
  completedCredits: number;
  weightedAvg: number | null;
  focusCredits: number;
  focusTarget: number;
  hasFocus: boolean;
  t: ReturnType<typeof useTranslations<"record">>;
}) {
  const isHe = useLocale() === "he";
  const totalTarget = CREDIT_REQUIREMENTS.TOTAL;
  const totalPct = Math.min((completedCredits / totalTarget) * 100, 100);
  const focusPct = focusTarget > 0 ? Math.min((focusCredits / focusTarget) * 100, 100) : 0;

  return (
    <div className="data-card grid gap-6 p-6 sm:grid-cols-3">
      {/* Completed credits + progress to 150 */}
      <div className="space-y-2">
        <span className="text-xs text-foreground/50">{t("summaryCompletedCredits")}</span>
        <div dir="ltr" className="flex items-baseline gap-1">
          <span className="font-display tabular text-3xl font-bold text-foreground/85">
            {completedCredits}
          </span>
          <span className="text-sm text-foreground/40">/ {totalTarget}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
          <div
            className="h-full rounded-full bg-emerald-500/70 transition-all duration-500"
            style={{ width: `${totalPct}%` }}
          />
        </div>
        <span className="text-[11px] text-foreground/40">
          {t("summaryTotalProgress", { target: totalTarget })}
        </span>
      </div>

      {/* Weighted average — explicitly NOT the official graduation score, which
          uses 78/18/4 weighting. Labeled + linked so grade-anxious students
          don't mistake this credit-weighted mean for their final score. */}
      <div className="space-y-2 sm:border-s sm:border-border/40 sm:ps-6">
        <span className="block text-xs leading-snug text-foreground/50">
          {t("summaryWeightedAvg")}
        </span>
        <div className="font-display tabular text-3xl font-bold text-foreground/85">
          {weightedAvg !== null ? weightedAvg.toFixed(1) : "--"}
        </div>
        <Link
          href="/graduation"
          className="inline-flex items-center gap-1 text-[11px] leading-snug text-foreground/45 underline-offset-2 transition-colors hover:text-foreground/70 hover:underline"
        >
          <Calculator className="h-3 w-3 shrink-0" />
          {t("summaryWeightedAvgHint")}
        </Link>
        {weightedAvg !== null && (
          <AskKingButton
            promptHe="איך משפרים את הממוצע שלי? תן לי צעדים קונקרטיים לפי הקורסים שנשארו לי."
            promptEn="How can I improve my average? Give me concrete steps based on my remaining courses."
            labelHe="שאל את המלך איך לשפר"
            labelEn="Ask the King how to improve"
            className="mt-1 flex items-center gap-1 text-[11px] font-medium text-accent-brand transition-colors hover:text-accent-brand-hover"
          />
        )}
      </div>

      {/* Focus-area progress */}
      <div className="space-y-2 sm:border-s sm:border-border/40 sm:ps-6">
        <span className="text-xs text-foreground/50">{t("summaryFocusCredits")}</span>
        {hasFocus ? (
          <>
            <div dir="ltr" className="flex items-baseline gap-1">
              <span className="font-display tabular text-3xl font-bold text-foreground/85">
                {focusCredits}
              </span>
              <span className="text-sm text-foreground/40">/ {focusTarget}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
              <div
                className="h-full rounded-full bg-accent-brand transition-all duration-500"
                style={{ width: `${focusPct}%` }}
              />
            </div>
            <span className="text-[11px] text-foreground/40">
              {t("summaryFocusProgress", { target: focusTarget })}
            </span>
          </>
        ) : (
          <p className="pt-1 text-sm text-foreground/40">{t("summaryNoFocus")}</p>
        )}
      </div>
    </div>
  );
}
