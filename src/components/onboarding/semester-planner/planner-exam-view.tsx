"use client";

import { useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { CalendarClock, AlertTriangle } from "lucide-react";
import { DISCIPLINE_CONFIG } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { CourseWithSchedule } from "@/lib/plan-generator";
import type { Discipline } from "@/types/enums";

// ─── Types ───────────────────────────────────────────────────────────

interface ExamEntry {
  courseId: string;
  courseName: string;
  courseCode: string;
  discipline: Discipline;
  credits: number;
  moedA: Date | null;
  moedB: Date | null;
  gapDays: number | null;
}

interface PlannerExamViewProps {
  courses: CourseWithSchedule[];
}

// ─── Helpers ────────────────────────────────────────────────────────

function daysBetween(a: Date, b: Date): number {
  const dateA = new Date(a);
  const dateB = new Date(b);
  dateA.setHours(0, 0, 0, 0);
  dateB.setHours(0, 0, 0, 0);
  return Math.ceil(
    Math.abs(dateB.getTime() - dateA.getTime()) / (1000 * 60 * 60 * 24)
  );
}

function formatDate(date: Date, locale: string): string {
  return date.toLocaleDateString(locale === "he" ? "he-IL" : "en-US", {
    day: "numeric",
    month: "short",
  });
}

function gapColor(gap: number | null): string {
  if (gap === null) return "text-foreground/30";
  if (gap <= 7) return "text-red-500";
  if (gap <= 14) return "text-amber-500";
  return "text-foreground/40";
}

function gapBg(gap: number | null): string {
  if (gap === null) return "bg-foreground/5";
  if (gap <= 7) return "bg-red-500/5";
  if (gap <= 14) return "bg-amber-500/5";
  return "bg-foreground/[0.03]";
}

// ─── Component ───────────────────────────────────────────────────────

export function PlannerExamView({ courses }: PlannerExamViewProps) {
  const t = useTranslations("onboarding");
  const locale = useLocale();
  const isHe = locale === "he";

  // Build exam entries
  const examEntries = useMemo<ExamEntry[]>(() => {
    const entries: ExamEntry[] = [];

    for (const c of courses) {
      const name = isHe ? c.nameHe : (c.nameEn ?? c.nameHe);
      const disc = c.discipline as Discipline;
      const moedA = c.examDateA ? new Date(c.examDateA) : null;
      const moedB = c.examDateB ? new Date(c.examDateB) : null;

      if (!moedA && !moedB) continue;

      const gap = moedA && moedB ? daysBetween(moedA, moedB) : null;

      entries.push({
        courseId: c.id,
        courseName: name,
        courseCode: c.code,
        discipline: disc,
        credits: c.credits,
        moedA,
        moedB,
        gapDays: gap,
      });
    }

    // Sort by earliest exam date
    entries.sort((a, b) => {
      const dateA = a.moedA ?? a.moedB!;
      const dateB = b.moedA ?? b.moedB!;
      return dateA.getTime() - dateB.getTime();
    });

    return entries;
  }, [courses, isHe]);

  // ─── Empty state ──────────────────────────────────────────────────

  if (examEntries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <CalendarClock className="h-8 w-8 text-foreground/20" />
        <p className="mt-2 text-xs text-foreground/40">
          {t("noExamDates")}
        </p>
      </div>
    );
  }

  // Stats
  const tightGaps = examEntries.filter(
    (e) => e.gapDays !== null && e.gapDays < 14
  ).length;

  // ─── Card-based exam view ─────────────────────────────────────────

  return (
    <div className="space-y-3">
      {/* Exam cards */}
      <div className="space-y-2">
        {examEntries.map((entry) => {
          const config = DISCIPLINE_CONFIG[entry.discipline];
          const color = config?.color ?? "hsl(var(--muted-foreground))";

          return (
            <div
              key={entry.courseId}
              className={cn(
                "rounded-xl border border-border/30 p-3 transition-colors",
                gapBg(entry.gapDays)
              )}
            >
              {/* Course header */}
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="text-sm font-medium text-foreground/80 truncate flex-1">
                  {entry.courseName}
                </span>
                <span className="text-[11px] font-mono text-foreground/30">
                  {entry.credits} {t("credits")}
                </span>
              </div>

              {/* Exam dates row */}
              <div className="flex items-center gap-3">
                {/* Moed A */}
                {entry.moedA && (
                  <div className="flex items-center gap-1.5 rounded-lg bg-card/50 border border-border/20 px-2.5 py-1.5">
                    <div
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <div className="text-[11px]">
                      <span className="text-foreground/40">{t("moedA")}</span>
                      <span className="mx-1 text-foreground/15">·</span>
                      <span className="font-mono font-medium text-foreground/70">
                        {formatDate(entry.moedA, locale)}
                      </span>
                    </div>
                  </div>
                )}

                {/* Gap indicator */}
                {entry.gapDays !== null && (
                  <div className="flex items-center gap-1">
                    <div className="h-px w-3 bg-foreground/10" />
                    <span
                      className={cn(
                        "font-mono text-[10px] font-semibold",
                        gapColor(entry.gapDays)
                      )}
                    >
                      {entry.gapDays}{isHe ? "י" : "d"}
                    </span>
                    <div className="h-px w-3 bg-foreground/10" />
                  </div>
                )}

                {/* Moed B */}
                {entry.moedB && (
                  <div className="flex items-center gap-1.5 rounded-lg bg-card/50 border border-border/20 px-2.5 py-1.5">
                    <div
                      className="h-2 w-2 rounded-full bg-background"
                      style={{ border: `2px solid ${color}` }}
                    />
                    <div className="text-[11px]">
                      <span className="text-foreground/40">{t("moedB")}</span>
                      <span className="mx-1 text-foreground/15">·</span>
                      <span className="font-mono font-medium text-foreground/70">
                        {formatDate(entry.moedB, locale)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 text-[11px] text-foreground/30">
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-foreground/30" />
          <span>{t("moedA")}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full border-2 border-foreground/30 bg-background" />
          <span>{t("moedB")}</span>
        </div>
      </div>

      {/* Warning for tight gaps */}
      {tightGaps > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500/60" />
          <p className="text-xs leading-relaxed text-amber-600/70">
            {isHe
              ? "יש קורסים עם פחות מ-14 יום בין מועד א׳ למועד ב׳"
              : "Some courses have less than 14 days between Moed A and Moed B"}
          </p>
        </div>
      )}
    </div>
  );
}
