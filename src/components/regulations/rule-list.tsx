"use client";

import { useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { XCircle, AlertTriangle, CheckCircle2, ChevronDown, ShieldAlert, ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { RuleCard } from "./rule-card";
import { AskAdvisorButton } from "@/components/ui/ask-advisor-button";
import { cn } from "@/lib/utils";
import { ruleGroup, RULE_GROUP_ORDER, RULE_GROUP_META, type RuleGroup } from "@/lib/regulations/rule-categories";
import type { RegulationResult } from "@/types/regulation";
import { usePersonalAddress } from "@/components/personal/use-personal-address";

/**
 * The regulations detail, reframed from "a database of 25 rule cards bucketed by
 * severity" into "my situation":
 *  1) a RED-FLAGS band that surfaces the few things needing ACTION (failed
 *     blocking gates that can end a degree + unmet warnings/deadlines), each with
 *     an inline "ask the King" — so the scary stuff never looks like a routine
 *     40/150 progress card.
 *  2) the rest, grouped by THEME (composition / grades / seminars / English /
 *     miluim), each a collapsible accordion with a met/total progress bar.
 * The rule ENGINE is untouched — this is pure presentation.
 */
export function RuleList({ results }: { results: RegulationResult[] }) {
  const t = useTranslations("regulations");
  const isHe = useLocale() === "he";

  // Split failing rules into TWO tiers so this band matches the overview card
  // above (audit 22.7 — they used to disagree: a green "you meet every rule"
  // headline over a single RED "needs action" band that also held WARNINGs).
  //   • blockers  = failing ERROR  → red "דורש טיפול"
  //   • attention = failing WARNING → amber "כדאי לשים לב" (not a blocker)
  const { blockers, attention, byGroup } = useMemo(() => {
    const blk: RegulationResult[] = [];
    const att: RegulationResult[] = [];
    const groups = new Map<RuleGroup, RegulationResult[]>();
    for (const r of results) {
      if (!r.passed && r.severity === "ERROR") blk.push(r);
      else if (!r.passed && r.severity === "WARNING") att.push(r);
      else {
        const g = ruleGroup(r.ruleId);
        (groups.get(g) ?? groups.set(g, []).get(g)!).push(r);
      }
    }
    return { blockers: blk, attention: att, byGroup: groups };
  }, [results]);

  if (results.length === 0) {
    return (
      <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-border/20 bg-muted/5 p-8">
        <p className="text-sm text-muted-foreground">{t("noRules")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Blockers — degree-ending, RED. */}
      {blockers.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <ShieldAlert className="size-5 text-red-400" />
            <h3 className="text-base font-bold text-red-400">{isHe ? "דורש טיפול" : "Needs action"}</h3>
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-400/10 px-1.5 font-data text-xs font-bold text-red-400">
              {blockers.length}
            </span>
          </div>
          {blockers.map((r) => (
            <RedFlagCard key={r.ruleId} rule={r} isHe={isHe} />
          ))}
          {/* Close the VERIFY→PLAN loop: most gaps are fixed by placing courses. */}
          <Link
            href="/planner"
            className="inline-flex w-fit items-center gap-1.5 self-start rounded-lg bg-accent-brand/10 px-3 py-1.5 text-xs font-semibold text-accent-brand transition-colors hover:bg-accent-brand/20"
          >
            {isHe ? "תקנו את זה במתכנן התואר" : "Fix these in the degree planner"}
            <ArrowLeft className="size-3.5 ltr:rotate-180" />
          </Link>
        </section>
      )}

      {/* Attention — worth handling but NOT a blocker, AMBER. */}
      {attention.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-amber-500" />
            <h3 className="text-base font-bold text-amber-500">{isHe ? "כדאי לשים לב" : "Worth attention"}</h3>
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400/10 px-1.5 font-data text-xs font-bold text-amber-500">
              {attention.length}
            </span>
          </div>
          {attention.map((r) => (
            <RedFlagCard key={r.ruleId} rule={r} isHe={isHe} />
          ))}
        </section>
      )}

      {/* All clear — only when there are neither blockers nor attention items. */}
      {blockers.length === 0 && attention.length === 0 && (
        <div className="flex items-center gap-2.5 rounded-xl border border-emerald-400/30 bg-emerald-400/[0.06] px-4 py-3">
          <CheckCircle2 className="size-5 shrink-0 text-emerald-500" />
          <p className="text-sm text-foreground/75">
            {isHe ? "אין חסימות ואין דרישות דחופות כרגע." : "No blockers and nothing urgent right now."}
          </p>
        </div>
      )}

      {/* Thematic groups — routine progress, by area. */}
      <div className="flex flex-col gap-3">
        {RULE_GROUP_ORDER.map((g) => {
          const rules = byGroup.get(g);
          if (!rules || rules.length === 0) return null;
          return <RuleGroupAccordion key={g} group={g} rules={rules} isHe={isHe} />;
        })}
      </div>
    </div>
  );
}

// ── A single red flag — always open, with inline "ask the King" ──
function RedFlagCard({ rule, isHe }: { rule: RegulationResult; isHe: boolean }) {
  const { g: pg } = usePersonalAddress();
  const name = isHe ? rule.ruleNameHe : rule.ruleNameEn;
  const msg = isHe ? rule.messageHe : rule.messageEn;
  const isError = rule.severity === "ERROR";
  return (
    <div className={cn("rounded-xl border p-3.5", isError ? "border-red-400/40 bg-red-400/[0.06]" : "border-amber-400/40 bg-amber-400/[0.06]")}>
      <div className="flex items-start gap-2.5">
        {isError ? (
          <XCircle className="mt-0.5 size-4 shrink-0 text-red-400" />
        ) : (
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-foreground/85">{name}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-foreground/65">{msg}</p>
          <AskAdvisorButton
            promptHe={`הסבר לי את הדרישה "${name}" — למה אני עדיין לא ${pg("עומד", "עומדת", "עומדים")} בה, ומה בדיוק לעשות כדי לסגור אותה?`}
            promptEn={`Explain the requirement "${name}" — why am I not meeting it, and what exactly should I do to close it?`}
            labelHe="שאל את {advisor} איך לסגור את זה"
            labelEn="Ask {advisor} how to close this"
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-accent-brand/10 px-2.5 py-1.5 text-xs font-medium text-accent-brand transition-colors hover:bg-accent-brand/20"
            iconClassName="size-3.5"
          />
        </div>
      </div>
    </div>
  );
}

// ── A thematic group — met/total header + progress, collapsible ──
function RuleGroupAccordion({ group, rules, isHe }: { group: RuleGroup; rules: RegulationResult[]; isHe: boolean }) {
  const met = rules.filter((r) => r.passed).length;
  const total = rules.length;
  const allMet = met === total;
  // Open by default when something in the group is still in progress.
  const [open, setOpen] = useState(!allMet);
  const meta = RULE_GROUP_META[group];
  const pct = total > 0 ? (met / total) * 100 : 0;

  return (
    <section className="data-card overflow-hidden p-0">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 p-3.5 text-start transition-colors hover:bg-foreground/[0.02]">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-foreground/80">{isHe ? meta.he : meta.en}</span>
            <span className="font-mono text-xs text-foreground/60" dir="ltr">{met}/{total}</span>
            {allMet && <CheckCircle2 className="size-3.5 text-emerald-400" />}
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-foreground/8">
            <div className={cn("h-full rounded-full transition-all", allMet ? "bg-emerald-400" : "bg-foreground/45")} style={{ width: `${pct}%` }} />
          </div>
        </div>
        <ChevronDown className={cn("size-4 shrink-0 text-foreground/60 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="grid gap-2 border-t border-border/40 p-3 lg:grid-cols-2">
          {rules.map((rule) => (
            <RuleCard key={rule.ruleId} rule={rule} />
          ))}
        </div>
      )}
    </section>
  );
}
