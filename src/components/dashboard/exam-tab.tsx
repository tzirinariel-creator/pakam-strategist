"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarClock, Calculator } from "lucide-react";
import { cn } from "@/lib/utils";
import { ExamSchedule } from "@/components/exam/exam-schedule";
import { GradeCalculatorContent } from "@/components/graduation/grade-calculator-content";

type SubTab = "schedule" | "grades";

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
      {subTab === "grades" && <GradeCalculatorContent key="grade-calc" />}
    </div>
  );
}
