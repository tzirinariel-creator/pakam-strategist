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
import { Bidi } from "@/lib/bidi";
import { Badge } from "@/components/ui/badge";
import { StudySkyline } from "@/components/exam-planner/study-skyline";
import { generateExamPlan, analyzeExamPeriod, type ExamInput } from "@/lib/exam-planner";
import type { Discipline, Semester } from "@/types/enums";

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

  // Group UPCOMING exams by date. The board previously listed every sitting and
  // merely dimmed past ones (opacity-60), so it stayed cluttered with exams that
  // already happened and with sittings for courses already passed (#33). We now
  // hide them outright, client-side (server-side date-nulling would corrupt the
  // shared Course.examDate* that the dashboard countdown also reads).
  const examGroups = useMemo<ExamGroup[]>(() => {
    if (!data?.exams) return [];

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const isFuture = (d: Date) => d.getTime() >= todayStart.getTime();

    const dateMap = new Map<string, ExamGroup>();

    for (const exam of data.exams) {
      // Already passed → no upcoming exam to plan for; drop its sittings.
      // (A FAILED course keeps its future Moed B, so retakes still show.)
      const passed =
        exam.status === "COMPLETED" &&
        exam.grade != null &&
        exam.grade >= CREDIT_REQUIREMENTS.PASSING_GRADE;
      if (passed) continue;

      // Add Moed A — only if it hasn't happened yet.
      if (exam.examDateA && isFuture(exam.examDateA)) {
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

      // Add Moed B — only if it hasn't happened yet.
      if (exam.examDateB && isFuture(exam.examDateB)) {
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
  }, [data?.exams, locale, t]);

  // Stats
  const stats = useMemo(() => {
    if (!data?.exams) return { total: 0, upcoming: 0, nextExam: null as Date | null, passed: 0 };

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    let upcoming = 0;
    let passed = 0;
    let nextExam: Date | null = null;

    for (const exam of data.exams) {
      // Already passed → count it as passed and STOP — it must not feed the
      // "upcoming" tally or the next-exam countdown, so the stats agree with the
      // board (examGroups), which hides passed courses.
      if (exam.status === "COMPLETED" && exam.grade !== null && exam.grade >= CREDIT_REQUIREMENTS.PASSING_GRADE) {
        passed++;
        continue;
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

  // Build a StudySkyline plan (the good graph, #38) from the UPCOMING exams,
  // replacing the weak day×course gantt grid on the Timeline tab. Honesty-first:
  // we plan against each course's SOONEST upcoming sitting (Moed A preferred —
  // the last grade counts; B only if A already passed), never inventing dates.
  // MUST run before any early return (Rules of Hooks).
  const timelinePlan = useMemo(() => {
    if (!data?.exams) return { sessions: [], exams: [] };
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const futureOnly = (d: Date | null) =>
      d && d.getTime() >= todayStart.getTime() ? d : null;
    const inputs: ExamInput[] = [];
    for (const e of data.exams) {
      const passed =
        e.status === "COMPLETED" &&
        e.grade != null &&
        e.grade >= CREDIT_REQUIREMENTS.PASSING_GRADE;
      if (passed) continue;
      const a = futureOnly(e.examDateA);
      const b = futureOnly(e.examDateB);
      const moed: "A" | "B" = a ? "A" : "B";
      const date = a ?? b;
      if (!date) continue;
      inputs.push({
        courseCode: e.courseCode,
        courseName: e.courseName,
        examDate: date,
        credits: e.credits,
        moed,
      });
    }
    return generateExamPlan(inputs);
  }, [data?.exams]);

  const timelineRecs = useMemo(
    () => analyzeExamPeriod(timelinePlan, isRTL),
    [timelinePlan, isRTL],
  );

  // Disciplines present among the UPCOMING exams — drives the board legend (#8),
  // so the colored dots actually mean something to the reader.
  const legendDisciplines = useMemo(() => {
    const ids = new Set<string>();
    for (const g of examGroups) for (const e of g.exams) ids.add(e.discipline);
    return Array.from(ids);
  }, [examGroups]);

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

      {/* Timeline view — unified on StudySkyline (the good graph, #38) */}
      {activeTab === "gantt" && (
        timelinePlan.exams.length > 0 ? (
          <StudySkyline plan={timelinePlan} recommendations={timelineRecs} isHe={isRTL} />
        ) : (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/30 p-6">
            <CalendarClock className="size-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">{t("noExams")}</p>
          </div>
        )
      )}

      {/* Exam groups by date (list view) */}
      {activeTab === "list" && (examGroups.length === 0 ? (
        // Everything is in the past or already passed → nothing upcoming (#33).
        <div className="flex min-h-[160px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/40 p-6">
          <CheckCircle2 className="size-8 text-emerald-400/70" />
          <p className="text-sm text-foreground/55">
            {isRTL ? "אין מבחנים קרובים — אתה מעודכן." : "No upcoming exams — you're all caught up."}
          </p>
        </div>
      ) : (
      <div className="flex flex-col gap-4">
        {/* Legend (#8): what the dot color, Moed-B badge and red mean. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-border/40 bg-card/30 px-3 py-2 text-[11px] text-foreground/50">
          {legendDisciplines.map((id) => {
            const cfg = DISCIPLINE_CONFIG[id as Discipline];
            return (
              <span key={id} className="inline-flex items-center gap-1.5">
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: cfg?.color ?? "hsl(var(--muted-foreground))" }}
                />
                {(isRTL ? cfg?.nameHe : cfg?.nameEn) ?? id}
              </span>
            );
          })}
          <span className="inline-flex items-center gap-1.5">
            <Badge variant="outline" className="text-[11px]">{t("moedB")}</Badge>
            {isRTL ? "מועד חוזר" : "retake"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-red-400" />
            {isRTL ? "היום / דחוף" : "today / urgent"}
          </span>
        </div>
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
                    <Badge variant="outline" className="text-[11px]">
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
                          <Bidi text={exam.courseCode} /> · {exam.credits} {t("credits")}
                        </span>
                      </div>

                      {/* Semester badge */}
                      <div className="hidden sm:block">
                        <Badge variant="outline" className="text-[11px]">
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
      </div>
      ))}
    </div>
  );
}
