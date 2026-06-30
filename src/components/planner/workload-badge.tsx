"use client";

import { cn } from "@/lib/utils";
import { useTranslations, useLocale } from "next-intl";
import {
  Feather,
  Gauge,
  Weight,
  Flame,
} from "lucide-react";
import {
  calculateWorkload,
  getWorkloadColor,
  getWorkloadBgColor,
  type WorkloadResult,
  type WorkloadLevel,
} from "@/lib/workload-calculator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Bidi } from "@/lib/bidi";

// -----------------------------------------------------------------------
// Workload level labels (keyed by level → i18n is handled at usage)
// -----------------------------------------------------------------------

const LEVEL_LABELS_HE: Record<WorkloadLevel, string> = {
  light: "קל",
  moderate: "בינוני",
  heavy: "כבד",
  intense: "מאתגר מאוד",
};

const LEVEL_LABELS_EN: Record<WorkloadLevel, string> = {
  light: "Light",
  moderate: "Moderate",
  heavy: "Heavy",
  intense: "Intense",
};

const LEVEL_ICONS: Record<WorkloadLevel, React.ComponentType<{ className?: string }>> = {
  light: Feather,
  moderate: Gauge,
  heavy: Weight,
  intense: Flame,
};

// -----------------------------------------------------------------------
// WorkloadBadge — compact badge for semester columns
// -----------------------------------------------------------------------

interface WorkloadBadgeProps {
  courses: {
    credits: number;
    courseType: string;
    discipline: string;
  }[];
  className?: string;
  showTooltip?: boolean;
}

export function WorkloadBadge({
  courses,
  className,
  showTooltip = true,
}: WorkloadBadgeProps) {
  const t = useTranslations("workload");
  const locale = useLocale();
  const isHe = locale === "he";
  const result = calculateWorkload(courses);

  if (courses.length === 0) return null;

  const levelLabel = isHe ? LEVEL_LABELS_HE[result.level] : LEVEL_LABELS_EN[result.level];

  const IconComponent = LEVEL_ICONS[result.level];

  const badge = (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all",
        getWorkloadBgColor(result.level),
        getWorkloadColor(result.level),
        className
      )}
    >
      <IconComponent className="size-3.5" />
      <span className="font-data">{levelLabel}</span>
    </div>
  );

  if (!showTooltip) return badge;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-[200px] bg-background border border-border p-3"
        >
          <WorkloadTooltipContent result={result} t={t} />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// -----------------------------------------------------------------------
// Tooltip content helper
// -----------------------------------------------------------------------

function WorkloadTooltipContent({
  result,
  t,
}: {
  result: WorkloadResult;
  t: (key: string) => string;
}) {
  return (
    <div className="space-y-2 text-xs">
      <div className="font-medium text-foreground">
        {t("details")}
      </div>
      <div className="space-y-1 text-foreground/70">
        <div className="flex justify-between gap-3">
          <span>{t("credits")}</span>
          <span className="font-mono">{result.credits}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span>{t("courses")}</span>
          <span className="font-mono">{result.courseCount}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span>{t("disciplines")}</span>
          <span className="font-mono">{result.disciplineSpread}</span>
        </div>
        {result.hasSeminar && (
          <div className="text-foreground/80">
            {t("includesSeminar")}
          </div>
        )}
      </div>
      <div className="border-t border-border pt-1.5">
        <div className="flex justify-between gap-3">
          <span className="font-medium">
            {t("score")}
          </span>
          <span
            className={cn("font-mono font-bold", getWorkloadColor(result.level))}
          >
            <Bidi text={`${result.score}/100`} />
          </span>
        </div>
      </div>
    </div>
  );
}
