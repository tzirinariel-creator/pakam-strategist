"use client";

import { useMemo } from "react";
import { CalendarClock, ArrowLeft, ArrowRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";

export function ExamCountdown() {
  const locale = useLocale();
  const isHe = locale === "he";
  const t = useTranslations("dashboard");

  const { data, isLoading } = api.schedule.getExamSchedule.useQuery(undefined, {
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });

  const upcomingExams = useMemo(() => {
    if (!data?.exams) return [];

    // Use UTC day comparison to avoid timezone shift (±1 day) issues.
    const n = new Date();
    const todayUTC = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
    const MS_PER_DAY = 1000 * 60 * 60 * 24;

    const upcoming: {
      courseCode: string;
      courseName: string;
      date: Date;
      moed: "A" | "B";
      daysLeft: number;
    }[] = [];

    const pushIfFuture = (
      raw: string | Date | null | undefined,
      exam: (typeof data.exams)[number],
      moed: "A" | "B"
    ) => {
      if (!raw) return;
      const d = new Date(raw);
      if (isNaN(d.getTime())) return;
      const examUTC = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      const daysLeft = Math.round((examUTC - todayUTC) / MS_PER_DAY);
      if (daysLeft >= 0) {
        upcoming.push({
          courseCode: exam.courseCode,
          courseName: exam.courseName,
          date: d,
          moed,
          daysLeft,
        });
      }
    };

    for (const exam of data.exams) {
      pushIfFuture(exam.examDateA, exam, "A");
      pushIfFuture(exam.examDateB, exam, "B");
    }

    // Sort by date, take 3 nearest
    upcoming.sort((a, b) => a.daysLeft - b.daysLeft);
    return upcoming.slice(0, 3);
  }, [data?.exams]);

  if (isLoading) return null;
  if (upcomingExams.length === 0) return null;

  const formatDate = (d: Date) => {
    return d.toLocaleDateString(isHe ? "he-IL" : "en-US", {
      day: "numeric",
      month: "short",
    });
  };

  return (
    <div className="data-card p-5">
      <div className="flex items-center gap-2 mb-3">
        <CalendarClock className="h-5 w-5 text-foreground/60" />
        <h3 className="font-display text-base font-bold text-foreground/90">
          {t("examCountdown")}
        </h3>
      </div>

      <div className="space-y-2">
        {upcomingExams.map((exam, i) => {
          const urgencyColor =
            exam.daysLeft <= 3
              ? "text-red-400 bg-red-400/10 border-red-400/20"
              : exam.daysLeft <= 7
                ? "text-amber-400 bg-amber-400/10 border-amber-400/20"
                : "text-foreground/60 bg-foreground/5 border-foreground/10";

          const daysBgColor =
            exam.daysLeft <= 3
              ? "bg-red-400/20 text-red-400"
              : exam.daysLeft <= 7
                ? "bg-amber-400/20 text-amber-400"
                : "bg-foreground/10 text-foreground/60";

          return (
            <div
              key={`${exam.courseCode}-${exam.moed}-${i}`}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm",
                urgencyColor
              )}
            >
              {/* Days counter */}
              <div className={cn(
                "flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg font-mono",
                daysBgColor
              )}>
                <span className="text-lg font-bold leading-none tabular">
                  {exam.daysLeft}
                </span>
                <span className="text-[9px] leading-none mt-0.5">
                  {t("daysShort")}
                </span>
              </div>

              {/* Exam info */}
              <div className="flex-1 min-w-0">
                <div className="truncate font-medium text-foreground/80">
                  {exam.courseName}
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-foreground/40">
                  <span>
                    {exam.moed === "A" ? t("moedA") : (isHe ? "מועד ב׳" : "Moed B")}
                  </span>
                  <span>·</span>
                  <span>{formatDate(exam.date)}</span>
                </div>
              </div>

              {/* Today badge */}
              {exam.daysLeft === 0 && (
                <span className="shrink-0 rounded-full bg-red-400/20 px-2 py-0.5 text-[10px] font-bold text-red-400 animate-pulse">
                  {isHe ? "היום" : "Today"}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend — what the colors and A/B labels mean (#8). */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/40 pt-2 text-[10px] text-foreground/45">
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-full bg-red-400/70" />
          {isHe ? "עד 3 ימים" : "≤3 days"}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-full bg-amber-400/70" />
          {isHe ? "עד 7 ימים" : "≤7 days"}
        </span>
        <span className="text-foreground/35">
          {isHe ? "מועד א׳ = ראשון · מועד ב׳ = חוזר" : "A = first sitting · B = retake"}
        </span>
      </div>

      {/* Jump to the full exam-period planner */}
      <Link
        href="/exam-planner"
        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent-brand transition-opacity hover:opacity-80"
      >
        {isHe ? "תכנן את תקופת המבחנים" : "Plan your exam period"}
        {isHe ? <ArrowLeft className="size-3" /> : <ArrowRight className="size-3" />}
      </Link>
    </div>
  );
}
