"use client";

import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import { ALL_TIPS, type Tip } from "@/lib/tips-engine";

interface TipCardProps {
  tip: Tip;
  className?: string;
}

export function TipCard({ tip, className }: TipCardProps) {
  const locale = useLocale();
  const isHe = locale === "he";

  // Rotation pool: all tips sharing the initial tip's category, so the
  // "next tip" affordance stays contextually relevant. Falls back to the
  // single tip if its category somehow has no siblings.
  const pool = useMemo(() => {
    const sameCategory = ALL_TIPS.filter((t) => t.category === tip.category);
    return sameCategory.length > 0 ? sameCategory : [tip];
  }, [tip]);

  // Start at the index of the initial tip within the pool (or 0).
  const [index, setIndex] = useState(() => {
    const i = pool.findIndex((t) => t.id === tip.id);
    return i >= 0 ? i : 0;
  });

  const current = pool[index] ?? tip;
  const text = isHe ? current.textHe : current.textEn;
  const Icon = current.icon;
  const canCycle = pool.length > 1;

  const nextTip = () => setIndex((i) => (i + 1) % pool.length);

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border border-foreground/10 bg-foreground/[0.02] p-4",
        className
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-foreground/40" />
      <p className="flex-1 text-sm leading-relaxed text-foreground/60">{text}</p>
      {canCycle && (
        <button
          type="button"
          onClick={nextTip}
          title={isHe ? "טיפ הבא" : "Next tip"}
          aria-label={isHe ? "טיפ הבא" : "Next tip"}
          className="-me-1 -mt-1 shrink-0 rounded-md p-1.5 text-foreground/30 transition-colors hover:bg-foreground/5 hover:text-foreground/60"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
