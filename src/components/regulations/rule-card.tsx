"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronUp,
  Wrench,
} from "lucide-react";
import { useState } from "react";
import { Link } from "@/i18n/navigation";
import type { RegulationResult } from "@/types/regulation";

interface RuleCardProps {
  rule: RegulationResult;
}

export function RuleCard({ rule }: RuleCardProps) {
  const t = useTranslations("regulations");
  const locale = useLocale();
  const isHe = locale === "he";
  const [expanded, setExpanded] = useState(false);

  const { ruleId, passed, severity } = rule;
  const ruleName = isHe ? rule.ruleNameHe : rule.ruleNameEn;
  const message = isHe ? rule.messageHe : rule.messageEn;

  // Status icon and colors
  let StatusIcon = CheckCircle2;
  let statusColor = "text-emerald-400";
  let borderColor = "border-emerald-400/20";
  let bgColor = "bg-emerald-400/5";
  let statusLabel = t("passed");

  if (!passed) {
    switch (severity) {
      case "ERROR":
        StatusIcon = XCircle;
        statusColor = "text-red-400";
        borderColor = "border-red-400/20";
        bgColor = "bg-red-400/5";
        statusLabel = t("failed");
        break;
      case "WARNING":
        StatusIcon = AlertTriangle;
        statusColor = "text-amber-400";
        borderColor = "border-amber-400/20";
        bgColor = "bg-amber-400/5";
        statusLabel = t("warning");
        break;
      case "INFO":
        StatusIcon = Info;
        statusColor = "text-blue-400";
        borderColor = "border-blue-400/20";
        bgColor = "bg-blue-400/5";
        statusLabel = t("info");
        break;
    }
  }

  // Severity badge
  const severityBadgeColor =
    severity === "ERROR"
      ? "bg-red-400/10 text-red-400 border-red-400/20"
      : severity === "WARNING"
        ? "bg-amber-400/10 text-amber-400 border-amber-400/20"
        : "bg-blue-400/10 text-blue-400 border-blue-400/20";

  return (
    <div
      className={`group rounded-lg border ${borderColor} ${bgColor} transition-all duration-200 hover:shadow-md`}
    >
      {/* Header - always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-3 text-start"
      >
        {/* Status icon */}
        <StatusIcon className={`h-5 w-5 shrink-0 ${statusColor}`} />

        {/* Rule info */}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="font-data text-[11px] font-semibold text-muted-foreground">
              {ruleId}
            </span>
            <span
              className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${severityBadgeColor}`}
            >
              {severity === "ERROR"
                ? t("severityError")
                : severity === "WARNING"
                  ? t("severityWarning")
                  : t("severityInfo")}
            </span>
          </div>
          <span className="truncate font-bold text-sm text-foreground">
            {ruleName}
          </span>
        </div>

        {/* Status label */}
        <div className="flex shrink-0 items-center gap-2">
          <span className={`text-xs font-medium ${statusColor}`}>
            {statusLabel}
          </span>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Expandable details */}
      {expanded && (
        <div className="border-t border-border/10 px-4 py-3">
          <p className="text-sm leading-relaxed text-foreground/70">
            {message}
          </p>

          {/* Details data */}
          {rule.details && Object.keys(rule.details).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(rule.details).map(([key, value]) => {
                // Skip complex nested objects from display
                if (typeof value === "object" && value !== null) return null;
                return (
                  <div
                    key={key}
                    className="flex items-center gap-1 rounded-md border border-border/20 bg-background/50 px-2 py-1 text-xs"
                  >
                    <span className="text-muted-foreground">
                      {t(`detailLabels.${key}` as Parameters<typeof t>[0], { defaultValue: key })}:
                    </span>
                    <span className="font-data font-semibold text-foreground">
                      {String(value)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Affected courses count */}
          {rule.affectedCourseIds && rule.affectedCourseIds.length > 0 && (
            <div className="mt-2 text-xs text-muted-foreground">
              {t("affectedCourses", { count: rule.affectedCourseIds.length })}
            </div>
          )}

          {/* Fix in planner — only for failed rules */}
          {!passed && (
            <Link
              href="/planner"
              className="mt-3 flex w-fit items-center gap-1.5 rounded-md border border-foreground/20 bg-foreground/5 px-3 py-1.5 text-xs font-medium text-foreground/60 transition-colors hover:bg-foreground/10 hover:text-foreground/80"
            >
              <Wrench className="h-3 w-3" />
              {t("fixInPlanner")}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
