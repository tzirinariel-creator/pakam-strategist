"use client";

import { useTranslations } from "next-intl";
import { Shield, CheckCircle2, XCircle, AlertTriangle, Info } from "lucide-react";
import type { RegulationSummary } from "@/types/regulation";

interface ComplianceOverviewProps {
  summary: RegulationSummary;
}

export function ComplianceOverview({ summary }: ComplianceOverviewProps) {
  const t = useTranslations("regulations");

  const { complianceScore, passed, failed, warnings, totalRules } = summary;

  // Determine color based on score
  const scoreColor =
    complianceScore >= 80
      ? "text-emerald-400"
      : complianceScore >= 50
        ? "text-foreground/80"
        : "text-red-400";

  const scoreBorderColor =
    complianceScore >= 80
      ? "border-emerald-400/30"
      : complianceScore >= 50
        ? "border-foreground/30"
        : "border-red-400/30";

  const scoreBgColor =
    complianceScore >= 80
      ? "bg-emerald-400"
      : complianceScore >= 50
        ? "bg-foreground"
        : "bg-red-400";

  // SVG circular progress
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (complianceScore / 100) * circumference;

  return (
    <div className="data-card flex flex-col items-center gap-6 p-6 md:flex-row md:items-start md:gap-10">
      {/* Circular Progress */}
      <div className="relative flex shrink-0 items-center justify-center">
        <svg width="140" height="140" viewBox="0 0 140 140" className="-rotate-90">
          {/* Background circle */}
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            className="text-muted/30"
          />
          {/* Progress circle */}
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            strokeLinecap="round"
            className={scoreColor}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            style={{ transition: "stroke-dashoffset 1s ease-in-out" }}
          />
        </svg>
        {/* Score text in center */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`font-display tabular text-3xl font-bold ${scoreColor}`}>
            {complianceScore}%
          </span>
          <span className="text-xs text-muted-foreground">
            {t("compliance")}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="flex flex-1 flex-col gap-4">
        <div className="flex items-center gap-3">
          <Shield className={`h-6 w-6 ${scoreColor}`} />
          <h2 className="font-display font-bold text-xl text-foreground">
            {t("complianceTitle")}
          </h2>
        </div>

        <p className="text-sm text-foreground/60">
          {t("complianceDescription", { passed, total: totalRules })}
        </p>

        {/* Status counters */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {/* Passed */}
          <div className={`flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/5 px-3 py-2`}>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <div className="flex flex-col">
              <span className="font-data text-lg font-bold text-emerald-400">{passed}</span>
              <span className="text-xs text-muted-foreground">{t("passed")}</span>
            </div>
          </div>

          {/* Failed */}
          <div className={`flex items-center gap-2 rounded-lg border border-red-400/20 bg-red-400/5 px-3 py-2`}>
            <XCircle className="h-4 w-4 text-red-400" />
            <div className="flex flex-col">
              <span className="font-data text-lg font-bold text-red-400">{failed}</span>
              <span className="text-xs text-muted-foreground">{t("failed")}</span>
            </div>
          </div>

          {/* Warnings */}
          <div className={`flex items-center gap-2 rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2`}>
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <div className="flex flex-col">
              <span className="font-data text-lg font-bold text-amber-400">{warnings}</span>
              <span className="text-xs text-muted-foreground">{t("warning")}</span>
            </div>
          </div>

          {/* Total */}
          <div className={`flex items-center gap-2 rounded-lg border ${scoreBorderColor} ${scoreBgColor}/5 px-3 py-2`}>
            <Info className={`h-4 w-4 ${scoreColor}`} />
            <div className="flex flex-col">
              <span className={`font-data text-lg font-bold ${scoreColor}`}>{totalRules}</span>
              <span className="text-xs text-muted-foreground">{t("totalRules")}</span>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{t("progressLabel")}</span>
            <span className="tabular">{passed}/{totalRules}</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted/30">
            <div
              className={`h-full rounded-full ${scoreBgColor} transition-all duration-1000 ease-in-out`}
              style={{ width: `${complianceScore}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
