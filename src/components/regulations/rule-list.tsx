"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { XCircle, AlertTriangle, CheckCircle2, Clock, ChevronDown } from "lucide-react";
import { RuleCard } from "./rule-card";
import { cn } from "@/lib/utils";
import type { RegulationResult } from "@/types/regulation";

interface RuleListProps {
  results: RegulationResult[];
}

/**
 * One severity section. Failures/warnings always show open (they need action).
 * The "passed" and "in-progress" buckets are collapsible and start collapsed so
 * a student with 25+ rules sees the few that matter first, not a wall of cards.
 */
function RuleSection({
  icon: Icon,
  title,
  rules,
  tone,
  collapsible,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  rules: RegulationResult[];
  tone: { text: string; badge: string };
  collapsible?: boolean;
}) {
  const [open, setOpen] = useState(!collapsible);
  if (rules.length === 0) return null;

  const header = (
    <div className="flex items-center gap-2">
      <Icon className={cn("h-5 w-5", tone.text)} />
      <h3 className={cn("font-bold text-base", tone.text)}>{title}</h3>
      <span
        className={cn(
          "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 font-data text-xs font-bold",
          tone.badge
        )}
      >
        {rules.length}
      </span>
      {collapsible && (
        <ChevronDown
          className={cn(
            "ms-auto h-4 w-4 text-foreground/40 transition-transform",
            open && "rotate-180"
          )}
        />
      )}
    </div>
  );

  return (
    <section className="flex flex-col gap-3">
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="rounded-lg text-start transition-colors hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-foreground/20"
        >
          {header}
        </button>
      ) : (
        header
      )}

      {open && (
        <div className="grid gap-2 sm:grid-cols-1 lg:grid-cols-2">
          {rules.map((rule) => (
            <RuleCard key={rule.ruleId} rule={rule} />
          ))}
        </div>
      )}
    </section>
  );
}

export function RuleList({ results }: RuleListProps) {
  const t = useTranslations("regulations");

  // Four buckets by severity/status. INFO progress rules must NEVER land under
  // "Requirements Met" while unmet, nor imply the student must "fix" not-yet-
  // having-150-credits.
  const { failedRules, warningRules, inProgressRules, passedRules } = useMemo(() => {
    const failed: RegulationResult[] = [];
    const warning: RegulationResult[] = [];
    const inProgress: RegulationResult[] = [];
    const passed: RegulationResult[] = [];

    for (const rule of results) {
      if (rule.passed) passed.push(rule);
      else if (rule.severity === "ERROR") failed.push(rule);
      else if (rule.severity === "WARNING") warning.push(rule);
      else inProgress.push(rule);
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
      {/* Failures + warnings — always open, they need action */}
      <RuleSection
        icon={XCircle}
        title={t("failedSection")}
        rules={failedRules}
        tone={{ text: "text-red-400", badge: "bg-red-400/10 text-red-400" }}
      />
      <RuleSection
        icon={AlertTriangle}
        title={t("warningSection")}
        rules={warningRules}
        tone={{ text: "text-amber-400", badge: "bg-amber-400/10 text-amber-400" }}
      />

      {/* In-progress + passed — collapsed by default to cut the wall of cards */}
      <RuleSection
        icon={Clock}
        title={t("inProgressSection")}
        rules={inProgressRules}
        tone={{ text: "text-foreground/70", badge: "bg-foreground/10 text-foreground/70" }}
        collapsible
      />
      <RuleSection
        icon={CheckCircle2}
        title={t("passedSection")}
        rules={passedRules}
        tone={{ text: "text-emerald-400", badge: "bg-emerald-400/10 text-emerald-400" }}
        collapsible
      />

      {/* Empty state */}
      {results.length === 0 && (
        <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-border/20 bg-muted/5 p-8">
          <p className="text-sm text-muted-foreground">{t("noRules")}</p>
        </div>
      )}
    </div>
  );
}
