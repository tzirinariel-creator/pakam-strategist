"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import {
  ClipboardCheck,
  CalendarDays,
  ListTodo,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ExamTab } from "./exam-tab";
import { CalendarTab } from "./calendar-tab";
import { AssignmentsTab } from "./assignments-tab";

type TabKey = "exams" | "calendar" | "assignments";

const TAB_CONFIG: {
  key: TabKey;
  icon: typeof ClipboardCheck;
  translationKey: string;
}[] = [
  { key: "exams", icon: ClipboardCheck, translationKey: "examsAndGrades" },
  { key: "calendar", icon: CalendarDays, translationKey: "calendar" },
  { key: "assignments", icon: ListTodo, translationKey: "assignments" },
];

export function DashboardTabs({ isHe }: { isHe: boolean }) {
  const t = useTranslations("dashboardTabs");
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as TabKey) || "exams";
  const [activeTab, setActiveTab] = useState<TabKey>(
    TAB_CONFIG.some((c) => c.key === initialTab) ? initialTab : "exams"
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Tab bar */}
      <div role="tablist" className="flex gap-1 rounded-xl border border-border/40 bg-card/40 p-1 overflow-x-auto">
        {TAB_CONFIG.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;

          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              aria-label={t(tab.translationKey)}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-all whitespace-nowrap",
                isActive
                  ? "bg-foreground/10 text-foreground/80 shadow-sm"
                  : "text-muted-foreground hover:text-foreground/60 hover:bg-foreground/5"
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="hidden sm:inline">{t(tab.translationKey)}</span>
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div role="tabpanel" className="min-h-[300px]">
        {activeTab === "exams" && <ExamTab key="tab-exams" isHe={isHe} />}
        {activeTab === "calendar" && <CalendarTab key="tab-calendar" isHe={isHe} />}
        {activeTab === "assignments" && <AssignmentsTab key="tab-assignments" isHe={isHe} />}
      </div>
    </div>
  );
}
