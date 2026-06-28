"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  ChevronDown,
  ChevronUp,
  Wrench,
} from "lucide-react";
import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { DISCIPLINE_CONFIG, ENGLISH_CONFIG } from "@/lib/constants";
import type { RegulationResult } from "@/types/regulation";

// Detail keys whose values are discipline enum IDs (e.g. "ECONOMICS").
// These must be rendered through DISCIPLINE_CONFIG, never as the raw enum.
const DISCIPLINE_DETAIL_KEYS = new Set(["discipline", "focusArea"]);

// Internal sort/rank keys the rules emit purely to compute ordering
// (e.g. deadlineRank, currentRank). They are NOT user-facing information, so
// they are dropped from the details UI entirely.
const HIDDEN_DETAIL_KEYS = new Set(["deadlineRank", "currentRank"]);

// Detail keys whose values are English-level enum IDs (e.g. "ADVANCED_B").
// Rendered through ENGLISH_CONFIG.LEVELS, never as the raw enum.
const ENGLISH_LEVEL_DETAIL_KEYS = new Set(["level"]);

// Keys whose value is a genuine number (a score/count) and should stay LTR.
// Hebrew labels and localized text values inherit the page's RTL direction.
const NUMERIC_DETAIL_KEYS = new Set([
  "amirantScore",
  "score",
  "current",
  "required",
  "deficit",
  "total",
  "completed",
  "incomplete",
  "currentCourses",
  "minCourses",
  "currentCredits",
  "minCredits",
  "levelCourses",
  "mandatoryCreditsCurrent",
  "mandatoryCreditsRequired",
  "courseAverage",
  "majorAverage",
  "used",
  "cap",
  "remaining",
  "percent",
  "totalHours",
  "binaryHours",
  "binaryUsed",
  "failedCount",
  "totalAttempted",
  "failureRate",
  "maxFailureRate",
  "maxAttempts",
]);

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
        // Unmet INFO = a normal in-progress accumulation target, not a failure.
        StatusIcon = Clock;
        statusColor = "text-foreground/60";
        borderColor = "border-foreground/15";
        bgColor = "bg-foreground/5";
        statusLabel = t("inProgressStatus");
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
      className={`group hover-lift shadow-card rounded-lg border ${borderColor} ${bgColor} transition-all duration-200 hover:shadow-md`}
    >
      {/* Header - always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-controls={`rule-${ruleId}-details`}
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
          <span className="font-display truncate font-bold text-sm text-foreground">
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
        <div
          id={`rule-${ruleId}-details`}
          className="border-t border-border/10 px-4 py-3"
        >
          <p className="text-sm leading-relaxed text-foreground/70">
            {message}
          </p>

          {/* Details data */}
          {rule.details && Object.keys(rule.details).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(rule.details).map(([key, value]) => {
                // Skip complex nested objects from display
                if (typeof value === "object" && value !== null) return null;
                // Drop internal sort/rank keys entirely — they're ordering
                // helpers, never user-facing information.
                if (HIDDEN_DETAIL_KEYS.has(key) || key.endsWith("Rank")) return null;

                // ── Localize the value (no English gibberish) ──────────────
                let displayValue = String(value);
                let isNumeric = NUMERIC_DETAIL_KEYS.has(key) && typeof value === "number";

                if (typeof value === "boolean") {
                  // Booleans → כן/לא (or Yes/No), never true/false.
                  displayValue = value ? (isHe ? "כן" : "Yes") : (isHe ? "לא" : "No");
                  isNumeric = false;
                } else if (DISCIPLINE_DETAIL_KEYS.has(key) && value != null) {
                  // Discipline/focus-area values are enum IDs (e.g. "ECONOMICS").
                  const cfg = DISCIPLINE_CONFIG[String(value)];
                  if (cfg) displayValue = isHe ? cfg.nameHe : cfg.nameEn;
                  isNumeric = false;
                } else if (ENGLISH_LEVEL_DETAIL_KEYS.has(key) && value != null) {
                  // English-level enum (e.g. "ADVANCED_B") → the localized level name.
                  const row = ENGLISH_CONFIG.LEVELS.find((l) => l.level === value);
                  if (row) displayValue = isHe ? row.nameHe : row.nameEn;
                  isNumeric = false;
                }

                // ── Localize the LABEL via next-intl v4's t.has() guard ────
                // (No unsupported `defaultValue` option — a missing key would
                // otherwise print the raw "detailLabels.foo" path.)
                const labelKey = `detailLabels.${key}` as Parameters<typeof t>[0];
                // Unknown key with no human label → omit the chip rather than
                // surface an internal field name.
                if (!t.has(labelKey)) return null;
                const label = t(labelKey);

                return (
                  <div
                    key={key}
                    className="flex items-center gap-1 rounded-md border border-border/20 bg-background/50 px-2 py-1 text-xs"
                  >
                    <span className="text-muted-foreground">{label}:</span>
                    <span
                      className="font-data font-semibold text-foreground"
                      {...(isNumeric ? { dir: "ltr" as const } : {})}
                    >
                      {displayValue}
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

          {/* Fix in planner — only for real issues (ERROR violations or
              WARNINGs). Unmet INFO targets are normal progress, not something
              the student must "fix", so they get no wrench CTA. */}
          {!passed && severity !== "INFO" && (
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
