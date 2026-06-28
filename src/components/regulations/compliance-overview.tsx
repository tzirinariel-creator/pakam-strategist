"use client";

import { useTranslations } from "next-intl";
import { ShieldCheck, ShieldAlert, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import type { RegulationSummary } from "@/types/regulation";

interface ComplianceOverviewProps {
  summary: RegulationSummary;
}

export function ComplianceOverview({ summary }: ComplianceOverviewProps) {
  const t = useTranslations("regulations");

  const {
    compliant,
    violations,
    warnings,
    progressMet,
    progressTotal,
  } = summary;

  // The headline is COMPLIANCE, not progress.
  //   - Zero violations  → fully compliant → GREEN. (A fresh or mid-degree
  //     student with no rule breaches is NEVER painted red.)
  //   - One+ violations  → RED, showing the violation count.
  const statusColor = compliant ? "text-emerald-400" : "text-red-400";
  const StatusIcon = compliant ? ShieldCheck : ShieldAlert;

  // Neutral degree-progress figure (non-ERROR requirements satisfied). Painted
  // in a calm, foreground tint — never as a pass/fail red.
  const progressPct =
    progressTotal > 0 ? Math.round((progressMet / progressTotal) * 100) : 0;

  // SVG ring shows COMPLIANCE: a full green ring when compliant, otherwise a
  // red ring whose fill reflects the share of rules NOT violated.
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const ringFraction = compliant
    ? 1
    : summary.totalRules > 0
      ? (summary.totalRules - violations) / summary.totalRules
      : 0;
  const strokeDashoffset = circumference - ringFraction * circumference;

  return (
    <div className="data-card flex flex-col items-center gap-6 p-6 md:flex-row md:items-start md:gap-10">
      {/* Compliance ring */}
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
          {/* Compliance circle */}
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            strokeLinecap="round"
            className={statusColor}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            style={{ transition: "stroke-dashoffset 1s ease-in-out" }}
          />
        </svg>
        {/* Status mark in center */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
          {compliant ? (
            <>
              <StatusIcon className="h-9 w-9 text-emerald-400" />
              <span className="text-xs font-medium text-emerald-400">
                {t("compliantShort")}
              </span>
            </>
          ) : (
            <>
              <span className="font-display tabular text-3xl font-bold text-red-400">
                {violations}
              </span>
              <span className="text-xs text-muted-foreground">
                {t("violationsShort")}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Status + progress */}
      <div className="flex flex-1 flex-col gap-4">
        <div className="flex items-center gap-3">
          <StatusIcon className={`h-6 w-6 ${statusColor}`} />
          <h2 className="font-display font-bold text-xl text-foreground">
            {compliant ? t("compliantTitle") : t("nonCompliantTitle")}
          </h2>
        </div>

        <p className="text-sm text-foreground/60">
          {compliant
            ? t("compliantDescription")
            : t("nonCompliantDescription", { count: violations })}
        </p>

        {/* Status counters — compliance-first */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {/* Violations */}
          <div className="flex items-center gap-2 rounded-lg border border-red-400/20 bg-red-400/5 px-3 py-2">
            <XCircle className="h-4 w-4 text-red-400" />
            <div className="flex flex-col">
              <span className="font-data text-lg font-bold text-red-400">{violations}</span>
              <span className="text-xs text-muted-foreground">{t("violations")}</span>
            </div>
          </div>

          {/* Warnings */}
          <div className="flex items-center gap-2 rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <div className="flex flex-col">
              <span className="font-data text-lg font-bold text-amber-400">{warnings}</span>
              <span className="text-xs text-muted-foreground">{t("warning")}</span>
            </div>
          </div>

          {/* Requirements met (neutral progress) */}
          <div className="flex items-center gap-2 rounded-lg border border-foreground/15 bg-foreground/5 px-3 py-2">
            <CheckCircle2 className="h-4 w-4 text-foreground/60" />
            <div className="flex flex-col">
              <span className="font-data text-lg font-bold text-foreground/80">
                {progressMet}/{progressTotal}
              </span>
              <span className="text-xs text-muted-foreground">{t("requirementsMet")}</span>
            </div>
          </div>
        </div>

        {/* Degree progress — explicitly neutral, never pass/fail */}
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{t("degreeProgressLabel")}</span>
            <span className="tabular">
              {t("requirementsProgress", { met: progressMet, total: progressTotal })}
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted/30">
            <div
              className="h-full rounded-full bg-foreground/70 transition-all duration-1000 ease-in-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
