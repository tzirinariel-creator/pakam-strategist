"use client";

import { useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import type { Tip } from "@/lib/tips-engine";

interface TipCardProps {
  tip: Tip;
  className?: string;
}

export function TipCard({ tip, className }: TipCardProps) {
  const locale = useLocale();
  const isHe = locale === "he";
  const text = isHe ? tip.textHe : tip.textEn;

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border border-foreground/10 bg-foreground/[0.02] p-4",
        className
      )}
    >
      <tip.icon className="mt-0.5 h-4 w-4 shrink-0 text-foreground/40" />
      <p className="text-sm leading-relaxed text-foreground/60">{text}</p>
    </div>
  );
}
