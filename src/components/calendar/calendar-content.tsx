"use client";

import { useState, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  CalendarDays,
  GanttChart,
  Loader2,
  AlertTriangle,
  BookOpen,
  ClipboardCheck,
  Download,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";
import { ThemedLoader } from "@/components/ui/themed-loader";
import { SEMESTER_CONFIG, YEAR_CONFIG } from "@/lib/constants";
import { WeeklyTimetable } from "./weekly-timetable";
import { GanttView } from "./gantt-view";
import { ExamSchedule } from "@/components/exam/exam-schedule";
import { downloadICSFromSessions } from "@/lib/ics-export";
import type { Semester } from "@/types/enums";

// ─── Types ───────────────────────────────────────────────────────────

type ViewMode = "weekly" | "gantt" | "exams";

interface SemesterOption {
  key: string; // e.g. "1-FALL"
  year: number;
  semester: Semester;
  label: string;
}

// ─── Component ───────────────────────────────────────────────────────

export function CalendarContent() {
  const t = useTranslations("calendar");
  const tCommon = useTranslations("common");
  const locale = useLocale();

  const [viewMode, setViewMode] = useState<ViewMode>("weekly");

  const {
    data: planData,
    isLoading: planLoading,
    error: planError,
  } = api.plan.getUserPlan.useQuery();

  // Build semester options from plan data
  const semesterOptions = useMemo<SemesterOption[]>(() => {
    if (!planData?.semesters) return [];

    const options: SemesterOption[] = [];
    const keys = Object.keys(planData.semesters).sort();

    for (const key of keys) {
      const parts = key.split("-");
      const yearStr = parts[0];
      const semStr = parts[1] as Semester | undefined;
      if (!yearStr || !semStr) continue;

      const year = parseInt(yearStr, 10);
      if (isNaN(year)) continue;

      const yearConfig = YEAR_CONFIG[year as keyof typeof YEAR_CONFIG];
      const semConfig = SEMESTER_CONFIG[semStr];

      const yearLabel = locale === "he"
        ? (yearConfig?.nameHe ?? `${year}`)
        : (yearConfig?.nameEn ?? `Year ${year}`);
      const semLabel = locale === "he"
        ? (semConfig?.nameHe ?? semStr)
        : (semConfig?.nameEn ?? semStr);

      options.push({
        key,
        year,
        semester: semStr,
        label: `${yearLabel} — ${semLabel}`,
      });
    }

    return options;
  }, [planData?.semesters, locale]);

  const [selectedSemester, setSelectedSemester] = useState<string>("");

  // Auto-select first semester when data loads
  const activeSemester = selectedSemester || (semesterOptions[0]?.key ?? "");

  // Parse active semester into year + semester
  const parsedSemester = useMemo(() => {
    if (!activeSemester) return null;
    const parts = activeSemester.split("-");
    const yearStr = parts[0];
    const semStr = parts[1] as Semester | undefined;
    if (!yearStr || !semStr) return null;
    const year = parseInt(yearStr, 10);
    if (isNaN(year)) return null;
    return { year, semester: semStr };
  }, [activeSemester]);

  // Fetch real schedule sessions for the selected semester
  const {
    data: scheduleData,
    isLoading: scheduleLoading,
  } = api.schedule.getScheduleForSemester.useQuery(
    { year: parsedSemester?.year ?? 1, semester: parsedSemester?.semester ?? "FALL" },
    { enabled: !!parsedSemester },
  );

  // Courses for the selected semester (for Gantt view + ICS export)
  const semesterCourses = useMemo(() => {
    if (!planData?.semesters || !activeSemester) return [];
    return planData.semesters[activeSemester] ?? [];
  }, [planData?.semesters, activeSemester]);

  // Google Calendar sync
  const googleStatus = api.schedule.getGoogleStatus.useQuery();
  const syncToGoogle = api.schedule.syncToGoogle.useMutation({
    onSuccess: () => toast.success(t("syncToGoogle")),
    onError: () => toast.error(t("syncToGoogle")),
  });

  const isLoading = planLoading;

  // ICS export handler — uses schedule session data directly
  const handleExport = () => {
    const sessions = scheduleData?.sessions;
    // Guard the empty case: warn instead of silently doing nothing.
    if (!sessions || sessions.length === 0 || !parsedSemester) {
      toast.error(t("exportEmpty"));
      return;
    }
    const sem = parsedSemester.semester;
    if (sem === "FALL" || sem === "SPRING") {
      downloadICSFromSessions(sessions, sem);
      toast.success(t("exportSuccess"));
    } else {
      // SUMMER (or unsupported) — no teaching .ics range available.
      toast.error(t("exportEmpty"));
    }
  };

  // ─── Loading state ───────────────────────────────────────────────

  if (isLoading) {
    return <ThemedLoader />;
  }

  // ─── Error state ─────────────────────────────────────────────────

  if (planError) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
        <AlertTriangle className="size-8 text-red-400" />
        <p className="text-sm text-muted-foreground">{tCommon("error")}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="text-sm text-foreground/80 underline underline-offset-4 hover:text-foreground"
        >
          {tCommon("retry")}
        </button>
      </div>
    );
  }

  // ─── Empty state (no plan data at all) ───────────────────────────

  if (semesterOptions.length === 0) {
    return (
      <div className="flex flex-col gap-5 p-4 md:p-6">
        <PageHeader viewMode={viewMode} onViewChange={setViewMode} />

        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4">
          <BookOpen className="size-12 text-muted-foreground/40" />
          <div className="text-center">
            <p className="text-lg font-medium text-foreground/70">
              {t("noSchedule")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("noScheduleDesc")}
            </p>
          </div>
          <a
            href={`/${locale}/planner`}
            className="mt-2 inline-flex items-center gap-2 rounded-lg border border-foreground/20 bg-foreground/10 px-4 py-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-foreground/15"
          >
            {t("goToPlanner")}
          </a>
        </div>
      </div>
    );
  }

  // ─── Main view ───────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      {/* Page header with view toggle */}
      <PageHeader viewMode={viewMode} onViewChange={setViewMode} />

      {/* Controls row: semester selector + export button */}
      <div className="animate-stagger-2 data-card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <CalendarDays className="size-5 text-foreground/80" />
          <span className="text-sm font-medium text-foreground">
            {t("selectSemester")}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={activeSemester}
            onChange={(e) => setSelectedSemester(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground focus:border-foreground/40 focus:outline-none focus:ring-1 focus:ring-foreground/20"
          >
            {semesterOptions.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* ICS Export button — names the artifact (.ics) */}
          {semesterCourses.length > 0 && viewMode !== "exams" && (
            <button
              type="button"
              onClick={handleExport}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground/70 transition-colors hover:bg-foreground/5 hover:text-foreground"
              title={t("exportICSFile")}
            >
              <Download className="size-3.5" />
              <span className="hidden sm:inline">{t("exportICSFile")}</span>
            </button>
          )}

          {/* Google Calendar sync button */}
          {semesterCourses.length > 0 && viewMode !== "exams" && googleStatus.data?.connected && parsedSemester && (
            <button
              type="button"
              onClick={() => {
                if (parsedSemester) {
                  syncToGoogle.mutate({
                    year: parsedSemester.year,
                    semester: parsedSemester.semester,
                  });
                }
              }}
              disabled={syncToGoogle.isPending}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground/70 transition-colors hover:bg-foreground/5 hover:text-foreground disabled:opacity-50"
              title={t("syncToGoogle")}
            >
              <RefreshCw className={cn("size-3.5", syncToGoogle.isPending && "animate-spin")} />
              <span className="hidden sm:inline">{t("syncToGoogle")}</span>
            </button>
          )}
        </div>
      </div>

      {/* .ics import hint — clarifies the downloaded file must be imported */}
      {semesterCourses.length > 0 && viewMode !== "exams" && (
        <p className="-mt-2 text-xs text-muted-foreground/70">
          {t("exportHint")}
        </p>
      )}

      {/* Empty semester state */}
      {semesterCourses.length === 0 && viewMode !== "exams" && (
        <div className="animate-stagger-3 flex min-h-[30vh] flex-col items-center justify-center gap-3">
          <BookOpen className="size-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">{t("noSchedule")}</p>
        </div>
      )}

      {/* View content */}
      {viewMode === "exams" ? (
        <div className="animate-stagger-3">
          <ExamSchedule />
        </div>
      ) : semesterCourses.length > 0 ? (
        <div className="animate-stagger-3">
          {viewMode === "weekly" ? (
            scheduleLoading ? (
              <div className="flex min-h-[30vh] items-center justify-center">
                <Loader2 className="size-5 animate-spin text-foreground/80" />
                <span className="ms-2 text-sm text-muted-foreground">{tCommon("loading")}</span>
              </div>
            ) : (
              <WeeklyTimetable sessions={scheduleData?.sessions ?? []} />
            )
          ) : (
            <GanttView courses={semesterCourses} />
          )}
        </div>
      ) : null}
    </div>
  );
}

// ─── Page Header Sub-component ───────────────────────────────────────

function PageHeader({
  viewMode,
  onViewChange,
}: {
  viewMode: ViewMode;
  onViewChange: (mode: ViewMode) => void;
}) {
  const t = useTranslations("calendar");

  const tabs = [
    { mode: "weekly" as const, icon: CalendarDays, label: t("weekly") },
    { mode: "gantt" as const, icon: GanttChart, label: t("gantt") },
    { mode: "exams" as const, icon: ClipboardCheck, label: t("exams") },
  ];

  return (
    <div className="animate-stagger-1 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {/* Title */}
      <div className="flex items-center gap-3">
        <CalendarDays className="size-7 text-foreground/80" />
        <div>
          <h1 className="font-display font-bold text-2xl text-foreground/80">
            {t("title")}
          </h1>
          <p className="text-xs text-muted-foreground">{t("subtitle")}</p>
        </div>
      </div>

      {/* View toggle tabs — now with 3 options */}
      <div className="flex rounded-lg border border-border bg-muted/30 p-0.5">
        {tabs.map(({ mode, icon: Icon, label }) => (
          <button
            key={mode}
            type="button"
            onClick={() => onViewChange(mode)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all",
              viewMode === mode
                ? "bg-foreground/15 text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
