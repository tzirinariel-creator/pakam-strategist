"use client";

import { useState, useMemo } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations, useLocale } from "next-intl";
import {
  CalendarDays,
  Loader2,
  AlertTriangle,
  BookOpen,
  ClipboardCheck,
  Download,
  RefreshCw,
  Share2,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";
import { ThemedLoader } from "@/components/ui/themed-loader";
import { SEMESTER_CONFIG, YEAR_CONFIG } from "@/lib/constants";
import { WeeklyTimetable } from "./weekly-timetable";
import { ExamSchedule } from "@/components/exam/exam-schedule";
import { downloadICSFromSessions } from "@/lib/ics-export";
import { buildWeekShareText } from "@/lib/week-share";
import { getAcademicNow, deriveYearOfStudy, getPlanningAnchor , hebrewYearLabel } from "@/lib/academic-calendar";
import type { Semester } from "@/types/enums";

// ─── Types ───────────────────────────────────────────────────────────

type ViewMode = "weekly" | "exams";

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
  const isHe = locale === "he";

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

  // The student's CURRENT semester — DERIVED from the academic calendar
  // (single source of truth, #39), not the fossilized profile pair.
  const { data: calendarProfile } = api.user.getProfile.useQuery();
  const currentSemesterKey = useMemo(() => {
    if (!calendarProfile) return "";
    const acadNow = getAcademicNow();
    // Open on the semester the student is actually working on: the PLANNING ANCHOR
    // (→ FALL in July, the upcoming teaching semester) when the plan has it, else
    // the live calendar semester — so a fresh year-1 opens on their FALL plan and
    // not on a ב׳ bucket (QA 13.7). The anchor's year must be derived AT THE
    // ANCHOR: in July the anchor is NEXT academic year's fall, so pairing it with
    // today's study-year opened a continuing student on the fall that already
    // ENDED (spirit-audit 14.7).
    const anchor = getPlanningAnchor();
    const anchorYear = deriveYearOfStudy(calendarProfile.startYear, calendarProfile.currentYear ?? 1, anchor.startYear);
    const anchorKey = `${anchorYear}-${anchor.semester}`;
    if (semesterOptions.some((o) => o.key === anchorKey)) return anchorKey;
    const year = deriveYearOfStudy(calendarProfile.startYear, calendarProfile.currentYear ?? 1);
    const calKey = `${year}-${acadNow.semester}`;
    return semesterOptions.some((o) => o.key === calKey) ? calKey : "";
  }, [calendarProfile, semesterOptions]);

  // Default: explicit selection → current semester → first available.
  const activeSemester =
    selectedSemester || currentSemesterKey || (semesterOptions[0]?.key ?? "");

  // Honest "not published yet" note (verify 14.7): when the SELECTED semester
  // belongs to the NEXT academic year (the July case — planning FALL תשפ"ז),
  // its hours/rooms come from the CURRENT ידיעון and may shift when the new
  // one is published. Only fires when the anchor's ידיעון year is actually
  // newer than the published (current) one — mid-year SPRING planning is
  // already covered by the current ידיעון and gets no false warning.
  const yedionCaveat = (() => {
    if (!calendarProfile) return null;
    const acadNow = getAcademicNow();
    const anchor = getPlanningAnchor();
    if (anchor.startYear <= acadNow.startYear) return null;
    const anchorYear = deriveYearOfStudy(calendarProfile.startYear, calendarProfile.currentYear ?? 1, anchor.startYear);
    if (activeSemester !== `${anchorYear}-${anchor.semester}`) return null;
    return { published: acadNow.startYear, upcoming: anchor.startYear };
  })();

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

  // #41 (12.7) — a course whose sessionType still has SEVERAL groups (no
  // choice saved) used to paint ALL of them on the grid ("נראה זוועה").
  // Now: detect them, show only the first group, and ask for the choice.
  const utils41 = api.useUtils();
  const updateGroups = api.plan.updateCourse.useMutation({
    onSuccess: () => {
      void utils41.schedule.getScheduleForSemester.invalidate();
      void utils41.plan.getUserPlan.invalidate();
      toast.success(isHe ? "הקבוצה נשמרה" : "Group saved");
    },
    onError: (e) => toast.error(e.message || (isHe ? "השמירה נכשלה" : "Save failed")),
  });
  const { unchosen, displaySessions } = useMemo(() => {
    interface SessLite {
      courseCode: string;
      sessionType: string | null;
      groupCode?: string | null;
      dayOfWeek: number | string;
      startTime: string;
      endTime: string;
      course: { nameHe: string };
    }
    const raw = (scheduleData?.sessions ?? []) as unknown as SessLite[];
    const sessions = raw;
    const byKey = new Map<string, Set<string>>();
    for (const sIt of sessions) {
      const type = (sIt.sessionType ?? "").toLowerCase();
      const key = `${sIt.courseCode}|${type}`;
      if (!byKey.has(key)) byKey.set(key, new Set());
      if (sIt.groupCode) byKey.get(key)!.add(sIt.groupCode);
    }
    const multi = new Map<string, string>(); // key → first (kept) group
    for (const [key, groups] of byKey) {
      if (groups.size > 1) multi.set(key, [...groups].sort()[0]!);
    }
    const display = sessions.filter((sIt) => {
      const key = `${sIt.courseCode}|${(sIt.sessionType ?? "").toLowerCase()}`;
      const kept = multi.get(key);
      return kept === undefined || sIt.groupCode === kept;
    });
    // dayOfWeek arrives either as a 1-indexed number OR the string enum
    // ("SUNDAY"…). Number("SUNDAY") is NaN, so the old code fell through to the
    // raw uppercase string and the group-picker banner showed "SUNDAY" inside a
    // Hebrew calendar (live-verify 13.7). Normalize both forms to the 1-indexed
    // day arrays below (1 = Sunday = א׳).
    const DOW_TO_IDX: Record<string, number> = {
      SUNDAY: 1, MONDAY: 2, TUESDAY: 3, WEDNESDAY: 4, THURSDAY: 5, FRIDAY: 6, SATURDAY: 7,
    };
    const dayIdx = (d: number | string): number => {
      if (typeof d === "number") return d;
      const n = Number(d);
      return Number.isNaN(n) ? (DOW_TO_IDX[d.toUpperCase()] ?? 0) : n;
    };
    // one banner entry per course, with its per-type options
    const perCourse = new Map<string, { nameHe: string; types: Map<string, { code: string; label: string }[]> }>();
    for (const [key] of multi) {
      const [courseCode, type] = key.split("|") as [string, string];
      const opts = new Map<string, { code: string; label: string }>();
      for (const sIt of sessions) {
        if (sIt.courseCode !== courseCode || (sIt.sessionType ?? "").toLowerCase() !== type || !sIt.groupCode) continue;
        const dIdx = dayIdx(sIt.dayOfWeek);
        const dayHe = ["", "א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"][dIdx] ?? String(sIt.dayOfWeek);
        const dayEn = ["", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dIdx] ?? String(sIt.dayOfWeek);
        const label = `${sIt.groupCode} · ${isHe ? dayHe : dayEn} ${sIt.startTime}-${sIt.endTime}`;
        if (!opts.has(sIt.groupCode)) opts.set(sIt.groupCode, { code: sIt.groupCode, label });
      }
      if (!perCourse.has(courseCode)) {
        const nameHe = sessions.find((x) => x.courseCode === courseCode)?.course.nameHe ?? courseCode;
        perCourse.set(courseCode, { nameHe, types: new Map() });
      }
      perCourse.get(courseCode)!.types.set(type, [...opts.values()]);
    }
    return {
      unchosen: perCourse,
      displaySessions: display as unknown as NonNullable<typeof scheduleData>["sessions"],
    };
  }, [scheduleData]);

  const chooseGroup = (courseCode: string, type: string, groupCode: string) => {
    const uc = semesterCourses.find((c) => c.course.code === courseCode);
    if (!uc) return;
    const current = (uc as { selectedGroups?: Record<string, string> | null }).selectedGroups ?? {};
    updateGroups.mutate({
      userCourseId: uc.id,
      selectedGroups: { ...current, [type]: groupCode },
    });
  };

  // Google Calendar sync
  const googleStatus = api.schedule.getGoogleStatus.useQuery();
  const syncToGoogle = api.schedule.syncToGoogle.useMutation({
    onSuccess: (data) =>
      toast.success(
        data.synced > 0
          ? `${t("syncSuccess")} (${data.synced})`
          : t("syncSuccess"),
      ),
    onError: () => toast.error(t("syncFailed")),
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

  // "Share my week" (#3/#16): the timetable as WhatsApp text, ending with a
  // link to the landing page — the second viral loop.
  const handleWhatsAppShare = () => {
    const sessions = scheduleData?.sessions;
    if (!sessions || sessions.length === 0) {
      toast.error(t("exportEmpty"));
      return;
    }
    const label = semesterOptions.find((o) => o.key === activeSemester)?.label ?? activeSemester;
    const text = buildWeekShareText(sessions, {
      semesterLabel: label,
      isHe: locale === "he",
      appUrl: `${window.location.origin}/${locale}`,
    });
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
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

          {/* Share the week on WhatsApp — same dress as the ICS button */}
          {semesterCourses.length > 0 && viewMode !== "exams" && (
            <button
              type="button"
              onClick={handleWhatsAppShare}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground/70 transition-colors hover:bg-foreground/5 hover:text-foreground"
              title={locale === "he" ? "שיתוף השבוע בוואטסאפ" : "Share week on WhatsApp"}
            >
              <Share2 className="size-3.5" />
              <span className="hidden sm:inline">{locale === "he" ? "שיתוף בוואטסאפ" : "Share on WhatsApp"}</span>
            </button>
          )}

          {/* Google Calendar — connected: sync now. NOT connected: offer to
              connect, so an unconnected student can DISCOVER and start calendar
              sync from the calendar itself, not only after they've already
              connected in settings (#30). */}
          {semesterCourses.length > 0 && viewMode !== "exams" && parsedSemester && (
            googleStatus.data?.connected ? (
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
            ) : (
              <Link
                href="/settings"
                className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-emerald-600 transition-colors hover:bg-emerald-500/20 dark:text-emerald-400"
                title={locale === "he" ? "חברו את יומן Google כדי לסנכרן את המערכת" : "Connect Google Calendar to sync your timetable"}
              >
                <CalendarDays className="size-3.5" />
                <span>{locale === "he" ? "חברו ליומן Google" : "Connect Google Calendar"}</span>
              </Link>
            )
          )}
        </div>
      </div>

      {/* Honest ידיעון note — next year's schedule isn't published yet */}
      {yedionCaveat && semesterCourses.length > 0 && viewMode !== "exams" && (
        <p className="-mt-2 text-xs leading-relaxed text-amber-600/80 dark:text-amber-400/80">
          {locale === "he"
            ? `שימו לב: השעות והמיקומים לסמסטר הקרוב מוצגים לפי ידיעון ${hebrewYearLabel(yedionCaveat.published)} — ידיעון ${hebrewYearLabel(yedionCaveat.upcoming)} טרם פורסם, וייתכנו עדכונים.`
            : `Heads up: next semester's hours and rooms follow the ${yedionCaveat.published}/${yedionCaveat.published + 1} catalog — the ${yedionCaveat.upcoming}/${yedionCaveat.upcoming + 1} one isn't published yet, so details may shift.`}
        </p>
      )}

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
        <div className="animate-stagger-3 space-y-3">
          {/* E5 (note 38): the weak gantt left this tab for good — full exam
              planning (interactive skyline, drag, share) lives in ONE place. */}
          <Link
            href="/exam-planner"
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent-brand/10 px-3 py-1.5 text-xs font-semibold text-accent-brand transition-colors hover:bg-accent-brand/20"
          >
            {locale === "he" ? "לתכנון המבחנים המלא ←" : "Full exam planning →"}
          </Link>
          <ExamSchedule />
        </div>
      ) : semesterCourses.length > 0 ? (
        <div className="animate-stagger-3">
          {scheduleLoading ? (
            <div className="flex min-h-[30vh] items-center justify-center">
              <Loader2 className="size-5 animate-spin text-foreground/80" />
              <span className="ms-2 text-sm text-muted-foreground">{tCommon("loading")}</span>
            </div>
          ) : (
            <>
              {unchosen.size > 0 && (
                <div className="mb-3 space-y-2 rounded-xl border border-amber-500/35 bg-amber-500/[0.07] p-3.5">
                  <p className="text-xs font-bold text-amber-700 dark:text-amber-400">
                    {isHe
                      ? "יש קורסים שעוד לא בחרתם בהם קבוצה — המערכת מציגה בינתיים את הקבוצה הראשונה:"
                      : "Some courses have no chosen group yet — showing the first group meanwhile:"}
                  </p>
                  {[...unchosen.entries()].map(([code, info]) => (
                    <div key={code} className="space-y-1.5">
                      <p className="text-xs font-semibold text-foreground/75">{info.nameHe}</p>
                      {[...info.types.entries()].map(([type, opts]) => (
                        <div key={type} className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] text-foreground/50">
                            {isHe
                              ? (type === "tutorial" ? "תרגיל" : type === "lab" ? "מעבדה" : type === "lecture" ? "הרצאה" : type)
                              : (type.charAt(0).toUpperCase() + type.slice(1))}:
                          </span>
                          {opts.map((o) => (
                            <button
                              key={o.code}
                              type="button"
                              disabled={updateGroups.isPending}
                              onClick={() => chooseGroup(code, type, o.code)}
                              className="rounded-full border border-amber-500/40 bg-card px-2.5 py-1 text-[11px] font-medium text-foreground/70 transition-colors hover:border-amber-500 hover:bg-amber-500/10 disabled:opacity-50"
                            >
                              <bdi dir="ltr">{o.label}</bdi>
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
              <WeeklyTimetable sessions={displaySessions} />
            </>
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

  // The gantt tab was removed after three owner notes in three waves — it
  // painted a full-width bar per course and a CONSTANT weekly load (zero
  // information beyond the course list), plus duplicate rows on retakes (#35).
  const tabs = [
    { mode: "weekly" as const, icon: CalendarDays, label: t("weekly") },
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
