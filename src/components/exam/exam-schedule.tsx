"use client";

import { useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  CalendarClock,
  Clock,
  BookOpen,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  Download,
  List,
  BarChart3,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";
import { downloadExamICS } from "@/lib/ics-export";
import { DISCIPLINE_CONFIG, SEMESTER_CONFIG, YEAR_CONFIG, CREDIT_REQUIREMENTS } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { ExamGantt } from "@/components/onboarding/semester-planner/exam-gantt";
import type { Discipline, Semester } from "@/types/enums";
import type { CourseWithSchedule } from "@/lib/plan-generator";

// ─── Types ───────────────────────────────────────────────────────────

interface ExamEntry {
  userCourseId: string;
  courseCode: string;
  courseName: string;
  discipline: string;
  credits: number;
  status: string;
  grade: number | null;
  plannedYear: number;
  plannedSemester: string;
  examDateA: Date | null; // superjson preserves Date objects
  examDateB: Date | null;
  courseType: string;
  submissionType: string;
}

interface ExamGroup {
  date: Date;
  label: string;
  exams: ExamEntry[];
  isMoedB: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────

function daysUntil(date: Date): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale === "he" ? "he-IL" : "en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}


// ─── Component ───────────────────────────────────────────────────────

export function ExamSchedule() {
  const t = useTranslations("examSchedule");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const isRTL = locale === "he";

  const [activeTab, setActiveTab] = useState<"list" | "gantt">("list");
  const { data, isLoading, error } = api.schedule.getExamSchedule.useQuery();

  // Group exams by date (both Moed A and Moed B)
  const examGroups = useMemo<ExamGroup[]>(() => {
    if (!data?.exams) return [];

    const dateMap = new Map<string, ExamGroup>();

    for (const exam of data.exams) {
      // Add Moed A
      if (exam.examDateA) {
        const dateA = exam.examDateA;
        const key = `A-${dateA.toISOString().split("T")[0] ?? ""}`;
        const existing = dateMap.get(key);
        if (existing) {
          existing.exams.push(exam);
        } else {
          dateMap.set(key, {
            date: dateA,
            label: `${t("moedA")} — ${formatDate(dateA, locale)}`,
            exams: [exam],
            isMoedB: false,
          });
        }
      }

      // Add Moed B
      if (exam.examDateB) {
        const dateB = exam.examDateB;
        const key = `B-${dateB.toISOString().split("T")[0] ?? ""}`;
        const existing = dateMap.get(key);
        if (existing) {
          existing.exams.push(exam);
        } else {
          dateMap.set(key, {
            date: dateB,
            label: `${t("moedB")} — ${formatDate(dateB, locale)}`,
            exams: [exam],
            isMoedB: true,
          });
        }
      }
    }

    // Sort by date
    return Array.from(dateMap.values()).sort(
      (a, b) => a.date.getTime() - b.date.getTime()
    );
  }, [data?.exams, locale, isRTL]);

  // Stats
  const stats = useMemo(() => {
    if (!data?.exams) return { total: 0, upcoming: 0, nextExam: null as Date | null, passed: 0 };

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    let upcoming = 0;
    let passed = 0;
    let nextExam: Date | null = null;

    for (const exam of data.exams) {
      if (exam.status === "COMPLETED" && exam.grade !== null && exam.grade >= CREDIT_REQUIREMENTS.PASSING_GRADE) {
        passed++;
      }

      // Check both Moed A and Moed B for upcoming exams and next exam countdown
      let hasUpcoming = false;
      if (exam.examDateA) {
        const dateA = exam.examDateA;
        if (dateA >= now) {
          hasUpcoming = true;
          if (!nextExam || dateA < nextExam) nextExam = dateA;
        }
      }
      if (exam.examDateB) {
        const dateB = exam.examDateB;
        if (dateB >= now) {
          hasUpcoming = true;
          if (!nextExam || dateB < nextExam) nextExam = dateB;
        }
      }
      if (hasUpcoming) upcoming++;
    }

    return { total: data.exams.length, upcoming, nextExam, passed };
  }, [data?.exams]);

  // Adapt exam data for ExamGantt component
  // NOTE: This useMemo MUST be called before any early returns to respect
  // React's Rules of Hooks (hooks must always be called in the same order).
  const ganttCourses = useMemo(() => {
    if (!data?.exams) return [];
    return data.exams.map((e) => ({
      id: e.userCourseId,
      code: e.courseCode,
      nameHe: e.courseName,
      nameEn: e.courseName,
      discipline: e.discipline as Discipline,
      credits: e.credits,
      examDateA: e.examDateA,
      examDateB: e.examDateB,
      courseType: e.courseType,
      yearOffered: [] as number[],
      semesterOffered: [] as Semester[],
      prerequisites: [] as string[],
      canCountAs: [] as Discipline[],
      description: null,
      isMandatory: e.courseType === "MANDATORY",
      submissionType: e.submissionType,
      weeklyHours: null,
    }));
  }, [data?.exams]);

  // ─── Loading ─────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-5 animate-spin text-foreground/80" />
        <span className="ms-2 text-sm text-muted-foreground">{tCommon("loading")}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3">
        <AlertTriangle className="size-8 text-red-400" />
        <p className="text-sm text-muted-foreground">{tCommon("error")}</p>
      </div>
    );
  }

  // ─── Empty state ────────────────────────────────────────────────

  if (!data?.exams || data.exams.length === 0) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4">
        <CalendarClock className="size-10 text-foreground/20" />
        <div className="text-center">
          <p className="text-base font-medium text-foreground/60">{t("noExams")}</p>
          <p className="mt-1 max-w-xs text-sm text-foreground/40">{t("noExamsDesc")}</p>
        </div>
      </div>
    );
  }

  // ─── Main view ──────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-5">
      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Total exams */}
        <div className="data-card flex flex-col items-center gap-1 py-3">
          <span className="font-data text-2xl font-bold text-foreground/80">{stats.total}</span>
          <span className="text-xs text-muted-foreground">{t("totalExams")}</span>
        </div>
        {/* Upcoming */}
        <div className="data-card flex flex-col items-center gap-1 py-3">
          <span className="font-data text-2xl font-bold text-foreground">{stats.upcoming}</span>
          <span className="text-xs text-muted-foreground">{t("upcoming")}</span>
        </div>
        {/* Passed */}
        <div className="data-card flex flex-col items-center gap-1 py-3">
          <span className="font-data text-2xl font-bold text-emerald-400">{stats.passed}</span>
          <span className="text-xs text-muted-foreground">{t("passed")}</span>
        </div>
        {/* Next exam countdown */}
        <div className="data-card flex flex-col items-center gap-1 py-3">
          {stats.nextExam ? (
            <>
              <span className="font-data text-2xl font-bold text-red-400">
                {daysUntil(stats.nextExam)}
              </span>
              <span className="text-xs text-muted-foreground">{t("daysToNext")}</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="size-6 text-emerald-400" />
              <span className="text-xs text-muted-foreground">{t("allDone")}</span>
            </>
          )}
        </div>
      </div>

      {/* Tab switch + Export button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 rounded-lg border border-border/40 bg-card/40 p-0.5">
          <button
            type="button"
            onClick={() => setActiveTab("list")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              activeTab === "list"
                ? "bg-foreground/10 text-foreground/80"
                : "text-muted-foreground hover:text-foreground/60"
            )}
          >
            <List className="size-3.5" />
            {t("tabSchedule")}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("gantt")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              activeTab === "gantt"
                ? "bg-foreground/10 text-foreground/80"
                : "text-muted-foreground hover:text-foreground/60"
            )}
          >
            <BarChart3 className="size-3.5" />
            {t("tabTimeline")}
          </button>
        </div>
        <button
          type="button"
          disabled={!data?.exams || data.exams.length === 0}
          onClick={() => {
            if (data?.exams) {
              downloadExamICS(
                data.exams.map((e) => ({
                  userCourseId: e.userCourseId,
                  courseCode: e.courseCode,
                  courseName: e.courseName,
                  credits: e.credits,
                  examDateA: e.examDateA,
                  examDateB: e.examDateB,
                }))
              );
              toast.success(t("exportSuccess"));
            }
          }}
          className={cn(
            "flex items-center gap-1.5 rounded-lg border border-border/50 bg-background/80 px-3 py-1.5 text-xs font-medium text-foreground/60 transition-colors",
            data?.exams && data.exams.length > 0
              ? "hover:bg-foreground/5 hover:text-foreground/80"
              : "cursor-not-allowed opacity-50"
          )}
        >
          <Download className="size-3.5" />
          {t("exportICS")}
        </button>
      </div>

      {/* Gantt timeline view */}
      {activeTab === "gantt" && (
        ganttCourses.length > 0 ? (
          <ExamGantt courses={ganttCourses as CourseWithSchedule[]} />
        ) : (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/30 p-6">
            <CalendarClock className="size-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">{t("noExams")}</p>
          </div>
        )
      )}

      {/* Exam groups by date (list view) */}
      {activeTab === "list" && <div className="flex flex-col gap-4">
        {examGroups.map((group) => {
          const days = daysUntil(group.date);
          const isPast = days < 0;
          const isToday = days === 0;
          const isSoon = days > 0 && days <= 7;

          return (
            <div key={group.label} className="data-card overflow-hidden">
              {/* Date header */}
              <div
                className={cn(
                  "flex items-center justify-between border-b border-border px-4 py-2.5",
                  isToday && "bg-red-500/10",
                  isSoon && !isToday && "bg-foreground/5",
                  group.isMoedB && "bg-muted/30",
                )}
              >
                <div className="flex items-center gap-2">
                  <CalendarClock
                    className={cn(
                      "size-4",
                      isToday ? "text-red-400" : isSoon ? "text-foreground/80" : "text-muted-foreground",
                    )}
                  />
                  <span
                    className={cn(
                      "text-sm font-semibold",
                      isToday ? "text-red-400" : "text-foreground",
                    )}
                  >
                    {group.label}
                  </span>
                  {group.isMoedB && (
                    <Badge variant="outline" className="text-[10px]">
                      {t("moedB")}
                    </Badge>
                  )}
                </div>

                {!isPast && (
                  <div className="flex items-center gap-1.5">
                    <Clock className="size-3.5 text-muted-foreground" />
                    <span
                      className={cn(
                        "font-data text-xs font-medium",
                        isToday ? "text-red-400" : isSoon ? "text-foreground/80" : "text-muted-foreground",
                      )}
                    >
                      {isToday
                        ? t("today")
                        : `${days} ${t("days")}`}
                    </span>
                  </div>
                )}
              </div>

              {/* Exam entries */}
              <div className="divide-y divide-border/50">
                {group.exams.map((exam) => {
                  const disc = exam.discipline as Discipline;
                  const discConfig = DISCIPLINE_CONFIG[disc];
                  const color = discConfig?.color ?? "hsl(var(--muted-foreground))";
                  const hasPassed = exam.status === "COMPLETED" && exam.grade !== null && exam.grade >= CREDIT_REQUIREMENTS.PASSING_GRADE;
                  const hasFailed = exam.status === "COMPLETED" && exam.grade !== null && exam.grade < CREDIT_REQUIREMENTS.PASSING_GRADE;

                  return (
                    <div
                      key={`${exam.userCourseId}-${group.isMoedB ? "B" : "A"}`}
                      className={cn(
                        "flex items-center gap-3 px-4 py-2.5",
                        isPast && !hasPassed && "opacity-60",
                      )}
                    >
                      {/* Discipline indicator */}
                      <div
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: color }}
                      />

                      {/* Course info */}
                      <div className="flex min-w-0 flex-[2] flex-col">
                        <span className="text-sm font-medium text-foreground line-clamp-2">
                          {exam.courseName}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {exam.courseCode} · {exam.credits} {t("credits")}
                        </span>
                      </div>

                      {/* Semester badge */}
                      <div className="hidden sm:block">
                        <Badge variant="outline" className="text-[10px]">
                          {locale === "he"
                            ? (YEAR_CONFIG[exam.plannedYear as keyof typeof YEAR_CONFIG]?.nameHe ?? `${exam.plannedYear}`)
                            : (YEAR_CONFIG[exam.plannedYear as keyof typeof YEAR_CONFIG]?.nameEn ?? `Year ${exam.plannedYear}`)}
                          {" · "}
                          {locale === "he"
                            ? (SEMESTER_CONFIG[exam.plannedSemester as Semester]?.short ?? exam.plannedSemester)
                            : (SEMESTER_CONFIG[exam.plannedSemester as Semester]?.nameEn ?? exam.plannedSemester)}
                        </Badge>
                      </div>

                      {/* Grade / status */}
                      <div className="shrink-0">
                        {hasPassed && (
                          <div className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5">
                            <CheckCircle2 className="size-3.5 text-emerald-400" />
                            <span className="font-data text-xs font-bold text-emerald-400">
                              {exam.grade}
                            </span>
                          </div>
                        )}
                        {hasFailed && (
                          <div className="flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5">
                            <XCircle className="size-3.5 text-red-400" />
                            <span className="font-data text-xs font-bold text-red-400">
                              {exam.grade}
                            </span>
                          </div>
                        )}
                        {!hasPassed && !hasFailed && !isPast && (
                          <BookOpen className="size-4 text-muted-foreground/50" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>}
    </div>
  );
}
