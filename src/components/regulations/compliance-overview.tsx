"use client";

import { useTranslations, useLocale } from "next-intl";
import { ShieldCheck, ShieldAlert, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import type { RegulationSummary } from "@/types/regulation";
import { Bidi } from "@/lib/bidi";
import { usePersonalAddress } from "@/components/personal/use-personal-address";

interface ComplianceOverviewProps {
  summary: RegulationSummary;
}

export function ComplianceOverview({ summary }: ComplianceOverviewProps) {
  const t = useTranslations("regulations");
  const isHe = useLocale() === "he";
  const { g: pg } = usePersonalAddress();

  const {
    violations,
    warnings,
    progressMet,
    progressTotal,
  } = summary;

  // THREE-TIER status so the headline, the ring, and the RuleList band below all
  // agree on ONE definition of "needs attention" (audit 22.7 — the old
  // "compliant = 0 ERRORs → GREEN" headline sat directly above a RED "needs
  // action" band that ALSO counted WARNINGs, so a student saw green + red at
  // once with mismatched counts):
  //   • blocker   (≥1 ERROR)              → RED
  //   • attention (0 ERROR, ≥1 WARNING)   → AMBER ("no blockers, things to note")
  //   • clear     (0 ERROR, 0 WARNING)    → GREEN
  // A fresh/mid-degree student with only routine progress is never painted red.
  const level: "blocker" | "attention" | "clear" =
    violations > 0 ? "blocker" : warnings > 0 ? "attention" : "clear";
  const statusColor =
    level === "blocker" ? "text-red-400" : level === "attention" ? "text-amber-400" : "text-emerald-400";
  const StatusIcon = level === "clear" ? ShieldCheck : ShieldAlert;

  // Neutral degree-progress figure (non-ERROR requirements satisfied).
  const progressPct =
    progressTotal > 0 ? Math.round((progressMet / progressTotal) * 100) : 0;

  // Ring reflects the status tier; its fill = share of rules NOT in that tier.
  const offCount = level === "blocker" ? violations : level === "attention" ? warnings : 0;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const ringFraction =
    level === "clear" ? 1 : summary.totalRules > 0 ? (summary.totalRules - offCount) / summary.totalRules : 0;
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
          {level === "clear" ? (
            <>
              <StatusIcon className="h-9 w-9 text-emerald-400" />
              <span className="text-xs font-medium text-emerald-400">
                {t("compliantShort")}
              </span>
            </>
          ) : (
            <>
              <span className={`font-display tabular text-3xl font-bold ${statusColor}`}>
                {offCount}
              </span>
              <span className="text-xs text-muted-foreground">
                {level === "blocker" ? t("violationsShort") : isHe ? "לתשומת לב" : "to note"}
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
            {level === "blocker"
              ? t("nonCompliantTitle")
              : level === "attention"
                ? isHe
                  ? "אין חסימות — יש דברים לשים לב אליהם"
                  : "No blockers — a few things to handle"
                : isHe
                  ? "עומדים בכל הכללים"
                  : t("compliantTitle")}
          </h2>
        </div>

        <p className="text-sm text-foreground/60">
          {level === "blocker"
            ? t("nonCompliantDescription", { count: violations })
            : level === "attention"
              ? isHe
                ? `יש ${warnings} ${warnings === 1 ? "דבר" : "דברים"} שכדאי לשים לב אליהם — לא חוסמים את התואר, אבל שווה לטפל בהם.`
                : `${warnings} thing${warnings === 1 ? "" : "s"} worth your attention — they don't block the degree, but worth handling.`
              : t("compliantDescription")}
        </p>

        {/* "Compliant" must never read as "finished". When all-clear but
            requirements are still unmet, say so explicitly so a mid-degree
            student doesn't mistake a green badge for graduation. */}
        {level === "clear" && progressMet < progressTotal && (
          <p className="rounded-lg border border-foreground/10 bg-foreground/[0.03] px-3 py-2 text-xs leading-relaxed text-foreground/55">
            {isHe
              ? `“תקין” אומר ${pg("שאתה עומד", "שאת עומדת", "שאת/ה עומד/ת")} בכל הכללים — לא שסיימת את התואר. עדיין נשארו דרישות להשלים (מסומנות “בתהליך” למטה).`
              : '“Compliant” means you meet every rule — not that you’ve finished the degree. You still have requirements left (marked “in progress” below).'}
          </p>
        )}

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
                <Bidi text={`${progressMet}/${progressTotal}`} />
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
