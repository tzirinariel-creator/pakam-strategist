"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarClock, Calculator, ArrowLeft, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/trpc/react";
import { ExamSchedule } from "@/components/exam/exam-schedule";
import { ScoreDisplay } from "@/components/graduation/score-display";
import type { GradeBreakdown } from "@/types/degree";

type SubTab = "schedule" | "grades";

// -----------------------------------------------------------------------
// Read-only score preview — grades are edited in ONE place (/graduation).
// This embedded view only previews the current score and links out.
// -----------------------------------------------------------------------

function GradesPreview({ isHe }: { isHe: boolean }) {
  const t = useTranslations("examSchedule");
  const Arrow = isHe ? ArrowLeft : ArrowRight;
  const gradeQuery = api.plan.getGraduationScore.useQuery(undefined, {
    retry: 1,
  });

  const breakdown: GradeBreakdown = gradeQuery.data ?? {
    courseAverage: null,
    seminarPaperAverage: null,
    referatGrade: null,
    weightedScore: null,
    completedCredits: 0,
    totalGradedCourses: 0,
  };

  return (
    <div className="flex flex-col gap-4">
      <ScoreDisplay breakdown={breakdown} />
      <Link
        href="/graduation"
        className="flex items-center justify-center gap-2 rounded-lg border border-border/40 bg-card/40 px-4 py-3 text-sm font-medium text-foreground/70 transition-colors hover:border-foreground/25 hover:text-foreground/90"
      >
        <Calculator className="size-4" />
        {t("openGradeCalculator")}
        <Arrow className="size-3.5" />
      </Link>
    </div>
  );
}

export function ExamTab({ isHe }: { isHe: boolean }) {
  const t = useTranslations("examSchedule");
  const [subTab, setSubTab] = useState<SubTab>("schedule");

  const tabs: { key: SubTab; label: string; icon: typeof CalendarClock }[] = [
    { key: "schedule", label: t("tabSchedule"), icon: CalendarClock },
    { key: "grades", label: t("tabGrades"), icon: Calculator },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Sub-tab toggle */}
      <div className="flex rounded-lg border border-border/40 bg-muted/30 p-0.5 w-fit">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setSubTab(tab.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                subTab === tab.key
                  ? "bg-foreground/15 text-foreground/80 shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="size-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content — use && pattern (not ternary) so React treats them
          as separate tree positions and doesn't try to reconcile hooks
          between the two different components. */}
      {subTab === "schedule" && <ExamSchedule key="exam-schedule" />}
      {subTab === "grades" && <GradesPreview key="grades-preview" isHe={isHe} />}
    </div>
  );
}
