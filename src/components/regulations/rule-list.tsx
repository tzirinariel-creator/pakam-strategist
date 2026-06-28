"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { XCircle, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { RuleCard } from "./rule-card";
import type { RegulationResult } from "@/types/regulation";

interface RuleListProps {
  results: RegulationResult[];
}

export function RuleList({ results }: RuleListProps) {
  const t = useTranslations("regulations");

  // Group rules into four buckets:
  //   - failed   : real violations (ERROR, not passed)            → red, needs a fix
  //   - warning  : WARNING-severity issues (not passed)           → amber
  //   - inProgress: not-yet-earned progress targets (INFO, not passed) → neutral
  //   - passed   : satisfied requirements                          → green
  // INFO progress rules must NEVER land under "Requirements Met" while unmet,
  // nor imply the student must "fix" not-yet-having-150-credits.
  const { failedRules, warningRules, inProgressRules, passedRules } = useMemo(() => {
    const failed: RegulationResult[] = [];
    const warning: RegulationResult[] = [];
    const inProgress: RegulationResult[] = [];
    const passed: RegulationResult[] = [];

    for (const rule of results) {
      if (rule.passed) {
        passed.push(rule);
      } else if (rule.severity === "ERROR") {
        failed.push(rule);
      } else if (rule.severity === "WARNING") {
        warning.push(rule);
      } else {
        // INFO-severity, not yet satisfied → normal in-progress accumulation.
        inProgress.push(rule);
      }
    }

    return {
      failedRules: failed,
      warningRules: warning,
      inProgressRules: inProgress,
      passedRules: passed,
    };
  }, [results]);

  return (
    <div className="flex flex-col gap-6">
      {/* Failed rules */}
      {failedRules.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-400" />
            <h3 className="font-bold text-base text-red-400">
              {t("failedSection")}
            </h3>
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-400/10 px-1.5 font-data text-xs font-bold text-red-400">
              {failedRules.length}
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-1 lg:grid-cols-2">
            {failedRules.map((rule) => (
              <RuleCard key={rule.ruleId} rule={rule} />
            ))}
          </div>
        </section>
      )}

      {/* Warning rules */}
      {warningRules.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
            <h3 className="font-bold text-base text-amber-400">
              {t("warningSection")}
            </h3>
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400/10 px-1.5 font-data text-xs font-bold text-amber-400">
              {warningRules.length}
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-1 lg:grid-cols-2">
            {warningRules.map((rule) => (
              <RuleCard key={rule.ruleId} rule={rule} />
            ))}
          </div>
        </section>
      )}

      {/* In-progress rules — neutral accumulation targets, NOT failures */}
      {inProgressRules.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-foreground/60" />
            <h3 className="font-bold text-base text-foreground/70">
              {t("inProgressSection")}
            </h3>
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground/10 px-1.5 font-data text-xs font-bold text-foreground/70">
              {inProgressRules.length}
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-1 lg:grid-cols-2">
            {inProgressRules.map((rule) => (
              <RuleCard key={rule.ruleId} rule={rule} />
            ))}
          </div>
        </section>
      )}

      {/* Passed rules */}
      {passedRules.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            <h3 className="font-bold text-base text-emerald-400">
              {t("passedSection")}
            </h3>
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-400/10 px-1.5 font-data text-xs font-bold text-emerald-400">
              {passedRules.length}
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-1 lg:grid-cols-2">
            {passedRules.map((rule) => (
              <RuleCard key={rule.ruleId} rule={rule} />
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {results.length === 0 && (
        <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-border/20 bg-muted/5 p-8">
          <p className="text-sm text-muted-foreground">{t("noRules")}</p>
        </div>
      )}
    </div>
  );
}
