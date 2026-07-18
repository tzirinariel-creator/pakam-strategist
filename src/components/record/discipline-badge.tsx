"use client";

import { DISCIPLINE_CONFIG } from "@/lib/constants";
import { cn } from "@/lib/utils";

// -----------------------------------------------------------------------
// Discipline badge (matches the grade-calculator screen)
// -----------------------------------------------------------------------

export function DisciplineBadge({ discipline, locale }: { discipline: string; locale: string }) {
  const cfg = DISCIPLINE_CONFIG[discipline] ?? DISCIPLINE_CONFIG["GENERAL"];
  if (!cfg) return <span className="text-xs">{discipline}</span>;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        cfg.badgeClass
      )}
    >
      {locale === "he" ? cfg.nameHe : cfg.nameEn}
    </span>
  );
}
