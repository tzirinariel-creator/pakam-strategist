"use client";

import { useTranslations, useLocale } from "next-intl";
import { Clock, FileText, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SemesterAnalytics } from "@/lib/plan-generator";

interface SemesterAnalyticsBarProps {
  analytics: SemesterAnalytics;
}

export function SemesterAnalyticsBar({ analytics }: SemesterAnalyticsBarProps) {
  const t = useTranslations("onboarding");
  const locale = useLocale();
  const isHe = locale === "he";

  const score = analytics.workloadScore;
  const color =
    score > 75 ? "text-red-400" : score > 50 ? "text-amber-400" : "text-emerald-400";
  const bgColor =
    score > 75 ? "bg-red-400" : score > 50 ? "bg-amber-400" : "bg-emerald-400";

  return (
    <div className="flex items-center gap-3 text-[10px] text-foreground/40">
      <div className="flex items-center gap-1" title={t("weeklyHours")}>
        <Clock className="h-3 w-3" />
        <span>{analytics.weeklyHours}{isHe ? "ש" : "h"}</span>
      </div>
      <div className="flex items-center gap-1" title={t("exams")}>
        <FileText className="h-3 w-3" />
        <span>{analytics.examCount}</span>
      </div>
      {analytics.conflicts.length > 0 && (
        <div className="flex items-center gap-1 text-red-400" title={t("conflicts")}>
          <AlertTriangle className="h-3 w-3" />
          <span>{analytics.conflicts.length}</span>
        </div>
      )}
      {/* Workload gauge */}
      <div className="flex items-center gap-1.5 ms-auto">
        <div className="h-1.5 w-12 rounded-full bg-foreground/10 overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", bgColor)}
            style={{ width: `${score}%` }}
          />
        </div>
        <span className={cn("font-mono", color)}>{score}</span>
      </div>
    </div>
  );
}
