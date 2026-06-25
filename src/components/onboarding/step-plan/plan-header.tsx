"use client";

import { useTranslations } from "next-intl";
import { Progress } from "@/components/ui/progress";
import { CREDIT_REQUIREMENTS, DISCIPLINE_CONFIG } from "@/lib/constants";
import type { CreditBreakdown } from "@/lib/plan-generator";

interface PlanHeaderProps {
  totalCredits: number;
  creditBreakdown: CreditBreakdown;
  warningCount: number;
}

export function PlanHeader({ totalCredits, creditBreakdown, warningCount }: PlanHeaderProps) {
  const t = useTranslations("onboarding");
  const pct = Math.min((totalCredits / CREDIT_REQUIREMENTS.TOTAL) * 100, 100);

  return (
    <div className="w-full max-w-3xl space-y-3">
      {/* Credits total */}
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-foreground/50">{t("totalCreditsLabel")}</span>
        <div className="flex items-baseline gap-1">
          <span className="font-mono text-xl font-bold text-foreground/80">{totalCredits}</span>
          <span className="font-mono text-sm text-foreground/30">/ {CREDIT_REQUIREMENTS.TOTAL}</span>
        </div>
      </div>
      <Progress value={pct} className="h-2" />

      {/* Discipline breakdown chips */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(creditBreakdown.byDiscipline).map(([disc, cr]) => {
          const cfg = DISCIPLINE_CONFIG[disc as keyof typeof DISCIPLINE_CONFIG];
          if (!cfg || cr === 0) return null;
          return (
            <div
              key={disc}
              className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px]"
              style={{
                borderColor: `${cfg.color}40`,
                backgroundColor: `${cfg.color}10`,
              }}
            >
              <div
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: cfg.color }}
              />
              <span style={{ color: cfg.color }}>{cr}</span>
            </div>
          );
        })}
        {/* Breakdown summary */}
        <div className="flex items-center gap-3 text-[10px] text-foreground/30 ms-auto">
          <span>{t("mandatory")}: {creditBreakdown.mandatory}</span>
          <span>{t("elective")}: {creditBreakdown.elective}</span>
          <span>{t("seminar")}: {creditBreakdown.seminar}</span>
          {creditBreakdown.law > 0 && <span>{t("law")}: {creditBreakdown.law}</span>}
        </div>
      </div>

      {/* Warning count */}
      {warningCount > 0 && (
        <div className="text-[10px] text-red-400">
          {warningCount} {warningCount === 1 ? t("warning") : t("warnings")}
        </div>
      )}
    </div>
  );
}
