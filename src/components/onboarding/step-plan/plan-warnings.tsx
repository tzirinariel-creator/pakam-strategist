"use client";

import { useLocale } from "next-intl";
import { AlertTriangle, AlertCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlanWarning } from "@/lib/plan-generator";

interface PlanWarningsProps {
  warnings: PlanWarning[];
}

const SEVERITY_CONFIG = {
  error: { icon: AlertCircle, color: "text-red-400", bg: "bg-red-400/10 border-red-400/20" },
  warning: { icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-400/10 border-amber-400/20" },
  info: { icon: Info, color: "text-blue-400", bg: "bg-blue-400/10 border-blue-400/20" },
} as const;

export function PlanWarnings({ warnings }: PlanWarningsProps) {
  const locale = useLocale();
  const isHe = locale === "he";

  if (warnings.length === 0) return null;

  // Show max 5 warnings, group errors first
  const sorted = [...warnings].sort((a, b) => {
    const order = { error: 0, warning: 1, info: 2 };
    return order[a.severity] - order[b.severity];
  });
  const shown = sorted.slice(0, 5);

  return (
    <div className="w-full max-w-3xl space-y-1.5">
      {shown.map((w, i) => {
        const cfg = SEVERITY_CONFIG[w.severity];
        const Icon = cfg.icon;
        return (
          <div
            key={i}
            className={cn("flex items-start gap-2 rounded-lg border px-3 py-2", cfg.bg)}
          >
            <Icon className={cn("mt-0.5 h-3 w-3 shrink-0", cfg.color)} />
            <span className="text-[11px] text-foreground/60">
              {isHe ? w.messageHe : w.message}
            </span>
          </div>
        );
      })}
      {warnings.length > 5 && (
        <div className="text-center text-[10px] text-foreground/30">
          +{warnings.length - 5} {isHe ? "אזהרות נוספות" : "more warnings"}
        </div>
      )}
    </div>
  );
}
