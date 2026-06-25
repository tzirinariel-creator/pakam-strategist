"use client";

import { useTranslations, useLocale } from "next-intl";
import { CheckCircle, Calendar, Feather, Gauge, Weight, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { calculateWorkload, getWorkloadColor } from "@/lib/workload-calculator";
import { SEMESTER_CONFIG, YEAR_CONFIG } from "@/lib/constants";
import type { CourseWithSchedule } from "@/lib/plan-generator";

const LEVEL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  light: Feather,
  moderate: Gauge,
  heavy: Weight,
  intense: Flame,
};

const LEVEL_LABELS_HE: Record<string, string> = {
  light: "קל",
  moderate: "בינוני",
  heavy: "כבד",
  intense: "מאתגר מאוד",
};

const LEVEL_LABELS_EN: Record<string, string> = {
  light: "Light",
  moderate: "Moderate",
  heavy: "Heavy",
  intense: "Intense",
};

interface SemesterSummaryProps {
  year: number;
  semester: "FALL" | "SPRING";
  courses: CourseWithSchedule[];
  totalCredits: number;
  hasMoreSemesters: boolean;
  onPlanNext: () => void;
  onFinish: () => void;
}

export function SemesterSummary({
  year,
  semester,
  courses,
  totalCredits,
  hasMoreSemesters,
  onPlanNext,
  onFinish,
}: SemesterSummaryProps) {
  const t = useTranslations("onboarding");
  const locale = useLocale();
  const isHe = locale === "he";

  const workload = calculateWorkload(
    courses.map((c) => ({
      credits: c.credits,
      courseType: c.courseType,
      discipline: c.discipline,
    }))
  );

  const semesterCredits = courses.reduce((s, c) => s + c.credits, 0);
  const yearLabel = isHe
    ? YEAR_CONFIG[year as 1 | 2 | 3]?.nameHe
    : YEAR_CONFIG[year as 1 | 2 | 3]?.nameEn;
  const semLabel = isHe
    ? SEMESTER_CONFIG[semester]?.nameHe
    : SEMESTER_CONFIG[semester]?.nameEn;
  const levelLabel = isHe ? LEVEL_LABELS_HE[workload.level] : LEVEL_LABELS_EN[workload.level];
  const IconComponent = LEVEL_ICONS[workload.level] ?? Feather;

  return (
    <div className="animate-fade-in w-full max-w-md mx-auto">
      <div className="data-card space-y-5 p-6 text-center">
        {/* Success icon */}
        <div className="flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-400/10">
            <CheckCircle className="h-7 w-7 text-emerald-400" />
          </div>
        </div>

        <div>
          <h3 className="text-lg font-bold text-foreground/90">
            {t("semesterDone")}
          </h3>
          <p className="mt-1 text-sm text-foreground/50">
            {yearLabel} · {semLabel}
          </p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-foreground/5 p-3">
            <div className="font-mono text-xl font-bold text-foreground/80">{courses.length}</div>
            <div className="text-[10px] text-foreground/40">{t("courses")}</div>
          </div>
          <div className="rounded-lg bg-foreground/5 p-3">
            <div className="font-mono text-xl font-bold text-foreground/80">{semesterCredits}</div>
            <div className="text-[10px] text-foreground/40">{t("nz")}</div>
          </div>
          <div className="rounded-lg bg-foreground/5 p-3">
            <div className={cn("flex items-center justify-center", getWorkloadColor(workload.level))}>
              <IconComponent className="size-6" />
            </div>
            <div className="text-[10px] text-foreground/40">{levelLabel}</div>
          </div>
        </div>

        {/* Total progress */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-foreground/50">{t("creditsPlannedSoFar")}</span>
            <span className="font-mono font-medium text-foreground/70">
              {totalCredits}/150
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-foreground/10">
            <div
              className="progress-gradient h-full rounded-full transition-all duration-700"
              style={{ width: `${Math.min((totalCredits / 150) * 100, 100)}%` }}
            />
          </div>
        </div>

        {/* CTAs */}
        <div className="flex flex-col gap-2.5 pt-2">
          {hasMoreSemesters && (
            <button
              onClick={onPlanNext}
              className="bg-foreground flex items-center justify-center gap-2 rounded-xl px-6 py-3 font-bold text-background shadow-sm transition-all hover:scale-[1.02] press-scale"
            >
              <Calendar className="h-4 w-4" />
              {t("planNextSemester")}
            </button>
          )}
          <button
            onClick={onFinish}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-medium transition-all",
              hasMoreSemesters
                ? "border-2 border-border text-foreground/60 hover:border-foreground/30 hover:text-foreground/80"
                : "bg-foreground font-bold text-background shadow-sm hover:scale-[1.02] press-scale"
            )}
          >
            {t("finishPlanning")}
          </button>
        </div>
      </div>
    </div>
  );
}
