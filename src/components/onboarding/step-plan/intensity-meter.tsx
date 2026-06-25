"use client";

import { useTranslations, useLocale } from "next-intl";
import { Flame, Clock, FileText, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SemesterAnalytics } from "@/lib/plan-generator";

interface IntensityMeterProps {
  analytics: SemesterAnalytics[];
}

export function IntensityMeter({ analytics }: IntensityMeterProps) {
  const locale = useLocale();
  const isHe = locale === "he";

  // Compute aggregate metrics
  const totalSemesters = analytics.filter((a) => a.courseCount > 0).length;
  const avgCredits = totalSemesters > 0
    ? Math.round(analytics.reduce((s, a) => s + a.credits, 0) / totalSemesters)
    : 0;
  const avgHours = totalSemesters > 0
    ? Math.round(analytics.reduce((s, a) => s + a.weeklyHours, 0) / totalSemesters)
    : 0;
  const totalExams = analytics.reduce((s, a) => s + a.examCount, 0);
  const totalConflicts = analytics.reduce((s, a) => s + a.conflicts.length, 0);
  const heaviestSem = analytics.length > 0
    ? analytics.reduce(
        (max, a) => (a.workloadScore > max.workloadScore ? a : max),
        analytics[0]!
      )
    : null;
  const avgWorkload = totalSemesters > 0
    ? Math.round(analytics.reduce((s, a) => s + a.workloadScore, 0) / totalSemesters)
    : 0;

  const meters = [
    {
      icon: Clock,
      label: isHe ? "שעות/שבוע ממוצע" : "Avg hours/week",
      value: avgHours,
      max: 24,
      unit: isHe ? "ש" : "h",
      color: avgHours > 20 ? "text-red-400" : avgHours > 14 ? "text-amber-400" : "text-emerald-400",
      barColor: avgHours > 20 ? "bg-red-400" : avgHours > 14 ? "bg-amber-400" : "bg-emerald-400",
    },
    {
      icon: Flame,
      label: isHe ? "עומס ממוצע" : "Avg workload",
      value: avgWorkload,
      max: 100,
      unit: "",
      color: avgWorkload > 75 ? "text-red-400" : avgWorkload > 50 ? "text-amber-400" : "text-emerald-400",
      barColor: avgWorkload > 75 ? "bg-red-400" : avgWorkload > 50 ? "bg-amber-400" : "bg-emerald-400",
    },
    {
      icon: FileText,
      label: isHe ? "סה״כ בחינות" : "Total exams",
      value: totalExams,
      max: 20,
      unit: "",
      color: totalExams > 15 ? "text-red-400" : totalExams > 10 ? "text-amber-400" : "text-emerald-400",
      barColor: totalExams > 15 ? "bg-red-400" : totalExams > 10 ? "bg-amber-400" : "bg-emerald-400",
    },
    {
      icon: AlertTriangle,
      label: isHe ? "התנגשויות" : "Conflicts",
      value: totalConflicts,
      max: 5,
      unit: "",
      color: totalConflicts > 0 ? "text-red-400" : "text-emerald-400",
      barColor: totalConflicts > 0 ? "bg-red-400" : "bg-emerald-400",
    },
  ];

  return (
    <div className="w-full max-w-3xl">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {meters.map((m) => {
          const pct = Math.min((m.value / m.max) * 100, 100);
          const Icon = m.icon;
          return (
            <div
              key={m.label}
              className="rounded-xl border border-border/40 bg-card/30 p-3 space-y-2"
            >
              <div className="flex items-center gap-1.5">
                <Icon className={cn("h-3.5 w-3.5", m.color)} />
                <span className="text-[10px] text-foreground/40 truncate">{m.label}</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className={cn("font-mono text-lg font-bold", m.color)}>{m.value}</span>
                {m.unit && <span className="text-[10px] text-foreground/30">{m.unit}</span>}
              </div>
              <div className="h-1 w-full rounded-full bg-foreground/10 overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all", m.barColor)}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Heaviest semester note */}
      {heaviestSem && heaviestSem.courseCount > 0 && (
        <div className="mt-2 text-center text-[10px] text-foreground/30">
          {isHe ? "הסמסטר הכבד ביותר:" : "Heaviest semester:"}{" "}
          {isHe ? (heaviestSem.year === 1 ? "א׳" : heaviestSem.year === 2 ? "ב׳" : "ג׳") : `Year ${heaviestSem.year}`}{" "}
          {heaviestSem.semester === "FALL" ? (isHe ? "סמסטר א׳" : "Fall") : (isHe ? "סמסטר ב׳" : "Spring")}{" "}
          ({heaviestSem.workloadScore})
        </div>
      )}
    </div>
  );
}
