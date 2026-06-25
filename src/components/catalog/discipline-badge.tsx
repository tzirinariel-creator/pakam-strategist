"use client";

import { Badge } from "@/components/ui/badge";
import { useLocale } from "next-intl";
import { DISCIPLINE_CONFIG } from "@/lib/constants";
import type { Discipline } from "@/types/enums";
import { cn } from "@/lib/utils";

interface DisciplineBadgeProps {
  discipline: Discipline;
  className?: string;
}

/**
 * A badge that displays a discipline name with its configured color.
 * Uses the DISCIPLINE_CONFIG from constants for consistent color theming.
 */
export function DisciplineBadge({ discipline, className }: DisciplineBadgeProps) {
  const locale = useLocale();
  const isHe = locale === "he";
  const config = DISCIPLINE_CONFIG[discipline];

  if (!config) {
    return (
      <Badge variant="outline" className={className}>
        {discipline}
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className={cn(config.badgeClass, "font-medium", className)}
    >
      {isHe ? config.nameHe : config.nameEn}
    </Badge>
  );
}
