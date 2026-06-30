"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  BookOpen,
  Clock,
  Trash2,
  ArrowRightLeft,
  X,
  ChevronDown,
  CheckSquare,
  Square,
  Plus,
  Loader2,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { DISCIPLINE_CONFIG, ALL_DISCIPLINE_IDS, SEMESTER_CONFIG, YEAR_CONFIG } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { api } from "@/lib/trpc/react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  PopoverClose,
} from "@/components/ui/popover";
import type { UserCourseWithCourse } from "@/types/degree";
import type { Discipline, Semester } from "@/types/enums";
import { Bidi } from "@/lib/bidi";

// ─── Types ───────────────────────────────────────────────────────────

interface GanttViewProps {
  courses: UserCourseWithCourse[];
}

interface GroupedCourses {
  discipline: Discipline;
  courses: UserCourseWithCourse[];
}

// ─── Academic Calendar Constants ─────────────────────────────────────

/** Real TAU academic calendar 2025-2026 */
const ACADEMIC_CALENDAR = {
  FALL: {
    start: new Date(2025, 9, 19),  // Oct 19, 2025
    end: new Date(2026, 0, 16),    // Jan 16, 2026
    examStart: new Date(2026, 0, 25), // Jan 25, 2026
    examEnd: new Date(2026, 1, 27),   // Feb 27, 2026
    totalWeeks: 13,
    examWeeks: 5,
  },
  SPRING: {
    start: new Date(2026, 2, 8),   // Mar 8, 2026
    end: new Date(2026, 5, 12),    // Jun 12, 2026
    examStart: new Date(2026, 5, 21), // Jun 21, 2026
    examEnd: new Date(2026, 6, 25),   // Jul 25, 2026
    totalWeeks: 14,
    examWeeks: 5,
  },
  SUMMER: {
    start: new Date(2026, 6, 26),  // Jul 26, 2026
    end: new Date(2026, 7, 27),    // Aug 27, 2026
    examStart: new Date(2026, 8, 1),  // Sep 1, 2026
    examEnd: new Date(2026, 8, 15),   // Sep 15, 2026
    totalWeeks: 5,
    examWeeks: 2,
  },
} as const;

const MONTH_NAMES_HE = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
const MONTH_NAMES_EN = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ─── Constants ───────────────────────────────────────────────────────

const ROW_HEIGHT = 48; // px
// Column widths — base (desktop) values; shrunk on narrow viewports inside the component.
const WEEK_COL_WIDTH = 56; // px min
const LABEL_COL_WIDTH = 200; // px
const WEEK_COL_WIDTH_NARROW = 36; // px min (phones)
const LABEL_COL_WIDTH_NARROW = 124; // px (phones)

// Semester move-to options
const SEMESTER_SLOTS: { year: number; semester: Semester }[] = [
  { year: 1, semester: "FALL" },
  { year: 1, semester: "SPRING" },
  { year: 2, semester: "FALL" },
  { year: 2, semester: "SPRING" },
  { year: 3, semester: "FALL" },
  { year: 3, semester: "SPRING" },
];

// ─── Helpers ─────────────────────────────────────────────────────────

/** Get the date for start of a specific week in the semester */
function getWeekStartDate(semesterKey: "FALL" | "SPRING" | "SUMMER", weekNum: number): Date {
  const cal = ACADEMIC_CALENDAR[semesterKey];
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;

  if (weekNum <= cal.totalWeeks) {
    return new Date(cal.start.getTime() + (weekNum - 1) * msPerWeek);
  }
  // Exam weeks
  const examWeekIndex = weekNum - cal.totalWeeks - 1;
  return new Date(cal.examStart.getTime() + examWeekIndex * msPerWeek);
}

/** Calculate current week of semester based on real academic calendar. */
function calculateCurrentWeek(semesterKey: "FALL" | "SPRING" | "SUMMER"): number {
  const now = new Date();
  const cal = ACADEMIC_CALENDAR[semesterKey];

  if (now < cal.start || now > cal.examEnd) return 0;

  if (now <= cal.end) {
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    return Math.floor((now.getTime() - cal.start.getTime()) / msPerWeek) + 1;
  }

  if (now < cal.examStart) {
    return cal.totalWeeks;
  }

  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const examWeek = Math.floor((now.getTime() - cal.examStart.getTime()) / msPerWeek) + 1;
  return cal.totalWeeks + Math.min(examWeek, cal.examWeeks);
}

/** Calculate days until exam period (only while the semester is actually active). */
function daysToExams(semesterKey: "FALL" | "SPRING" | "SUMMER"): number {
  const now = new Date();
  const cal = ACADEMIC_CALENDAR[semesterKey];

  // Gate on the semester being active, mirroring calculateCurrentWeek — otherwise a
  // non-active semester (e.g. viewing a Spring plan in October) shows a bogus countdown
  // with no corresponding "NOW" marker.
  if (now < cal.start || now > cal.examEnd) return 0;

  now.setHours(0, 0, 0, 0);
  const examStart = new Date(cal.examStart);
  examStart.setHours(0, 0, 0, 0);
  const diff = examStart.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

/** Group courses by discipline. */
function groupByDiscipline(courses: UserCourseWithCourse[]): GroupedCourses[] {
  const groups = new Map<Discipline, UserCourseWithCourse[]>();

  for (const uc of courses) {
    const disc = (uc.disciplineOverride ?? uc.course.discipline) as Discipline;
    const existing = groups.get(disc);
    if (existing) {
      existing.push(uc);
    } else {
      groups.set(disc, [uc]);
    }
  }

  const disciplineOrder: Discipline[] = ALL_DISCIPLINE_IDS;

  const result: GroupedCourses[] = [];
  for (const disc of disciplineOrder) {
    const group = groups.get(disc);
    if (group && group.length > 0) {
      result.push({ discipline: disc, courses: group });
    }
  }

  return result;
}

/** Workload label based on credit sum active in a week. */
function getWorkloadInfo(
  count: number,
  t: ReturnType<typeof useTranslations>,
): { label: string; bgClass: string } {
  if (count <= 10) return { label: t("light"), bgClass: "bg-emerald-500/5" };
  if (count <= 20) return { label: t("moderate"), bgClass: "bg-foreground/5" };
  return { label: t("heavy"), bgClass: "bg-red-500/8" };
}

/** Detect semester from courses */
function detectSemester(courses: UserCourseWithCourse[]): "FALL" | "SPRING" | "SUMMER" {
  const first = courses[0];
  if (!first) return "FALL";
  const sem = first.plannedSemester;
  if (sem === "SPRING") return "SPRING";
  if (sem === "SUMMER") return "SUMMER";
  return "FALL";
}

/** Build month spans for the header */
function buildMonthSpans(
  semesterKey: "FALL" | "SPRING" | "SUMMER",
  totalWeeks: number,
  isHe: boolean,
): { month: string; span: number }[] {
  const spans: { month: string; span: number }[] = [];
  const monthNames = isHe ? MONTH_NAMES_HE : MONTH_NAMES_EN;
  let currentMonth = -1;
  let currentSpan = 0;

  for (let w = 1; w <= totalWeeks; w++) {
    const date = getWeekStartDate(semesterKey, w);
    const month = date.getMonth();

    if (month !== currentMonth) {
      if (currentSpan > 0) {
        spans.push({ month: monthNames[currentMonth] ?? "", span: currentSpan });
      }
      currentMonth = month;
      currentSpan = 1;
    } else {
      currentSpan++;
    }
  }

  if (currentSpan > 0 && currentMonth >= 0) {
    spans.push({ month: monthNames[currentMonth] ?? "", span: currentSpan });
  }

  return spans;
}

// ─── Course Popover ──────────────────────────────────────────────────

// ─── Task Checklist Sub-component ────────────────────────────────────

function TaskChecklist({
  courseCode,
  isHe,
  t,
}: {
  courseCode: string;
  isHe: boolean;
  t: (key: string) => string;
}) {
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const utils = api.useUtils();

  const tasksQuery = api.studyTask.list.useQuery(undefined, {
    select: (data) => data.tasks.filter((task) => task.courseCode === courseCode),
  });

  const createMutation = api.studyTask.create.useMutation({
    onSuccess: () => {
      setNewTaskTitle("");
      void utils.studyTask.list.invalidate();
    },
  });

  const toggleMutation = api.studyTask.toggleComplete.useMutation({
    onSuccess: () => {
      void utils.studyTask.list.invalidate();
    },
  });

  const deleteMutation = api.studyTask.delete.useMutation({
    onSuccess: () => {
      void utils.studyTask.list.invalidate();
    },
  });

  const tasks = tasksQuery.data ?? [];

  const handleCreate = () => {
    if (!newTaskTitle.trim()) return;
    const now = new Date();
    createMutation.mutate({
      title: newTaskTitle.trim(),
      startDate: now,
      endDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), // 1 week from now
      taskType: "study",
      courseCode,
    });
  };

  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-medium text-foreground/40 uppercase tracking-wider">
        {t("tasks")} {tasks.length > 0 && `(${tasks.length})`}
      </div>

      {tasks.length > 0 && (
        <div className="space-y-0.5 max-h-[120px] overflow-y-auto">
          {tasks.map((task) => (
            <div key={task.id} className="group flex items-center gap-1.5 rounded-md px-1 py-0.5 hover:bg-foreground/5 transition-colors">
              <button
                type="button"
                onClick={() => toggleMutation.mutate({ id: task.id })}
                className="shrink-0 text-foreground/40 hover:text-foreground/70 transition-colors"
              >
                {task.completed ? (
                  <CheckSquare className="size-3.5 text-emerald-400" />
                ) : (
                  <Square className="size-3.5" />
                )}
              </button>
              <span
                className={cn(
                  "flex-1 text-[11px] leading-tight",
                  task.completed ? "line-through text-foreground/30" : "text-foreground/70"
                )}
              >
                {task.title}
              </span>
              <button
                type="button"
                onClick={() => deleteMutation.mutate({ id: task.id })}
                className="shrink-0 opacity-0 group-hover:opacity-100 text-foreground/20 hover:text-destructive transition-all"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Inline add */}
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          type="text"
          value={newTaskTitle}
          onChange={(e) => setNewTaskTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleCreate();
            }
          }}
          placeholder={isHe ? "משימה חדשה..." : "New task..."}
          className="flex-1 bg-transparent text-[11px] text-foreground/70 placeholder:text-foreground/20 outline-none border-b border-transparent focus:border-foreground/20 py-0.5 transition-colors"
        />
        {newTaskTitle.trim() && (
          <button
            type="button"
            onClick={handleCreate}
            disabled={createMutation.isPending}
            className="shrink-0 text-foreground/30 hover:text-foreground/60 transition-colors"
          >
            {createMutation.isPending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Plus className="size-3.5" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Course Popover ─────────────────────────────────────────────────

function CoursePopover({
  uc,
  color,
  children,
}: {
  uc: UserCourseWithCourse;
  color: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("calendar");
  const locale = useLocale();
  const isHe = locale === "he";
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [showMoveOptions, setShowMoveOptions] = useState(false);
  const utils = api.useUtils();

  const removeMutation = api.plan.removeCourse.useMutation({
    onSuccess: () => {
      toast.success(t("courseRemoved"));
      void utils.plan.getUserPlan.invalidate();
    },
  });

  const updateMutation = api.plan.updateCourse.useMutation({
    onSuccess: () => {
      toast.success(t("courseMoved"));
      void utils.plan.getUserPlan.invalidate();
    },
  });

  const discConfig = DISCIPLINE_CONFIG[(uc.disciplineOverride ?? uc.course.discipline) as keyof typeof DISCIPLINE_CONFIG];

  const handleRemove = () => {
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    removeMutation.mutate({ userCourseId: uc.id });
  };

  const handleMove = (year: number, semester: Semester) => {
    updateMutation.mutate({
      userCourseId: uc.id,
      plannedYear: year,
      plannedSemester: semester,
    });
  };

  const currentSlotKey = `${uc.plannedYear}-${uc.plannedSemester}`;

  return (
    <Popover onOpenChange={() => { setConfirmRemove(false); setShowMoveOptions(false); }}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-72 space-y-3 p-4" side="top" sideOffset={8}>
        <PopoverClose className="absolute top-2 end-2 rounded-md p-1 text-foreground/30 hover:text-foreground/60 hover:bg-foreground/5 transition-all">
          <X className="h-3.5 w-3.5" />
        </PopoverClose>

        <div>
          <div className="flex items-center gap-2 pe-6">
            <div
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ backgroundColor: color }}
            />
            <span className="text-sm font-semibold text-foreground/90 leading-tight">
              {isHe ? uc.course.nameHe : (uc.course.nameEn ?? uc.course.nameHe)}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[10px] text-foreground/40">
            <span className="font-mono"><Bidi text={uc.course.code} /></span>
            <span>·</span>
            <span>{uc.course.credits} {t("credits")}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <span
            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]"
            style={{
              borderColor: `${discConfig?.color ?? "gray"}40`,
              color: discConfig?.color ?? "gray",
              backgroundColor: `${discConfig?.color ?? "gray"}10`,
            }}
          >
            {isHe ? discConfig?.nameHe : discConfig?.nameEn}
          </span>
          {uc.course.courseType === "SEMINAR" && (
            <span className="inline-flex items-center rounded-full bg-foreground/5 border border-foreground/15 px-2 py-0.5 text-[10px] text-foreground/60">
              {isHe ? "סמינר" : "Seminar"}
            </span>
          )}
        </div>

        {(uc.course.examDateA || uc.course.examDateB) && (
          <div className="space-y-1">
            <div className="text-[10px] font-medium text-foreground/40 uppercase tracking-wider">
              {t("exams")}
            </div>
            <div className="flex gap-3 text-xs text-foreground/60">
              {uc.course.examDateA && (
                <div className="flex items-center gap-1.5">
                  <span className="text-red-400">{isHe ? "א׳:" : "A:"}</span>
                  <span className="font-mono text-[10px]">
                    {new Date(uc.course.examDateA).toLocaleDateString(isHe ? "he-IL" : "en-GB", {
                      day: "2-digit",
                      month: "short",
                    })}
                  </span>
                </div>
              )}
              {uc.course.examDateB && (
                <div className="flex items-center gap-1.5">
                  <span className="text-amber-400">{isHe ? "ב׳:" : "B:"}</span>
                  <span className="font-mono text-[10px]">
                    {new Date(uc.course.examDateB).toLocaleDateString(isHe ? "he-IL" : "en-GB", {
                      day: "2-digit",
                      month: "short",
                    })}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Task checklist */}
        <TaskChecklist courseCode={uc.course.code} isHe={isHe} t={t} />

        <div className="border-t border-border" />

        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => setShowMoveOptions((v) => !v)}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground/70 hover:bg-foreground/5 transition-colors"
          >
            <ArrowRightLeft className="size-3.5" />
            <span className="flex-1 text-start">{t("moveToSemester")}</span>
            <ChevronDown className={cn("size-3 transition-transform", showMoveOptions && "rotate-180")} />
          </button>

          {showMoveOptions && (
            <div className="ms-6 flex flex-wrap gap-1 animate-in fade-in duration-150">
              {SEMESTER_SLOTS.map(({ year, semester }) => {
                const slotKey = `${year}-${semester}`;
                const isCurrent = slotKey === currentSlotKey;
                const yearCfg = YEAR_CONFIG[year as keyof typeof YEAR_CONFIG];
                const semCfg = SEMESTER_CONFIG[semester];
                const label = isHe
                  ? `${yearCfg?.nameHe ?? year} ${semCfg?.nameHe ?? semester}`
                  : `${yearCfg?.nameEn ?? `Y${year}`} ${semCfg?.nameEn ?? semester}`;

                return (
                  <button
                    key={slotKey}
                    type="button"
                    disabled={isCurrent || updateMutation.isPending}
                    onClick={() => handleMove(year, semester)}
                    className={cn(
                      "rounded-md border px-2 py-1 text-[10px] transition-all",
                      isCurrent
                        ? "border-foreground/20 bg-foreground/10 text-foreground/60 cursor-default"
                        : "border-border text-foreground/50 hover:border-foreground/30 hover:bg-foreground/5 hover:text-foreground/80"
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          <button
            type="button"
            onClick={handleRemove}
            disabled={removeMutation.isPending}
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
              confirmRemove
                ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
                : "text-foreground/50 hover:bg-foreground/5 hover:text-destructive"
            )}
          >
            <Trash2 className="size-3.5" />
            <span>
              {confirmRemove
                ? (isHe ? "לחץ שוב לאישור" : "Click again to confirm")
                : t("removeCourse")}
            </span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Main Component ──────────────────────────────────────────────────

export function GanttView({ courses }: GanttViewProps) {
  const t = useTranslations("calendar");
  const locale = useLocale();
  const isHe = locale === "he";

  const scrollRef = useRef<HTMLDivElement>(null);

  // Narrow viewport → shrink columns so more weeks fit, and pin the label column.
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setIsNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const labelColWidth = isNarrow ? LABEL_COL_WIDTH_NARROW : LABEL_COL_WIDTH;
  const weekColWidth = isNarrow ? WEEK_COL_WIDTH_NARROW : WEEK_COL_WIDTH;

  const semesterKey = useMemo(() => detectSemester(courses), [courses]);
  const cal = ACADEMIC_CALENDAR[semesterKey];
  const TOTAL_WEEKS = cal.totalWeeks + cal.examWeeks;
  const EXAM_WEEK_START = cal.totalWeeks + 1;

  const grouped = useMemo(() => groupByDiscipline(courses), [courses]);
  const currentWeek = useMemo(() => calculateCurrentWeek(semesterKey), [semesterKey]);
  const daysToExamsVal = useMemo(() => daysToExams(semesterKey), [semesterKey]);

  // Build month spans for the month header row
  const monthSpans = useMemo(
    () => buildMonthSpans(semesterKey, TOTAL_WEEKS, isHe),
    [semesterKey, TOTAL_WEEKS, isHe],
  );

  // Compute total credits (constant during teaching weeks)
  const totalCredits = useMemo(
    () => courses.reduce((sum, c) => sum + (c.course.credits ?? 0), 0),
    [courses],
  );

  const weeks = Array.from({ length: TOTAL_WEEKS }, (_, i) => i + 1);

  // On mount, scroll so the current week (or exam period) is in view rather than off-screen.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const focusWeek = currentWeek >= 1 && currentWeek <= TOTAL_WEEKS ? currentWeek : EXAM_WEEK_START;
    const offset = labelColWidth + Math.max(0, focusWeek - 2) * weekColWidth;
    if (offset <= 0) return;
    el.scrollLeft = isHe ? -offset : offset;
    // Run once after first layout; widths settle synchronously with isNarrow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWeek, isNarrow]);

  return (
    <div className="flex flex-col gap-4">
      {/* Summary badges */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Total credits */}
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
          <BookOpen className="size-4 text-foreground/60" />
          <span className="text-sm text-foreground/70">
            <span className="font-semibold text-foreground">{totalCredits}</span>
            {" "}{t("credits")}
            {" · "}
            <span className="font-semibold text-foreground">{courses.length}</span>
            {" "}{isHe ? "קורסים" : "courses"}
          </span>
        </div>

        {/* Exam countdown */}
        {daysToExamsVal > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-red-400/20 bg-red-400/5 px-3 py-2">
            <Clock className="size-4 text-red-400" />
            <span className="tabular text-sm font-medium text-red-400">
              {t("examCountdown", { days: daysToExamsVal })}
            </span>
          </div>
        )}
      </div>

      {/* Workload legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="font-medium">{t("workload")}:</span>
        <div className="flex items-center gap-1.5">
          <div className="size-2.5 rounded-sm bg-emerald-500/30" />
          <span>{t("light")}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="size-2.5 rounded-sm bg-foreground/30" />
          <span>{t("moderate")}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="size-2.5 rounded-sm bg-red-500/30" />
          <span>{t("heavy")}</span>
        </div>
      </div>

      {/* Gantt chart */}
      <div ref={scrollRef} className="overflow-x-auto rounded-lg border border-border bg-card">
        <div style={{ minWidth: `${labelColWidth + TOTAL_WEEKS * weekColWidth}px` }}>
          {/* Month header row */}
          <div className="flex border-b border-border bg-muted/30">
            {/* Sticky leading spacer aligns with the pinned label column */}
            <div
              className="sticky start-0 z-20 shrink-0 border-e border-border bg-muted/30"
              style={{ width: `${labelColWidth}px` }}
            />
            {monthSpans.map((ms, idx) => (
              <div
                key={`month-${idx}`}
                className="flex items-center justify-center border-e border-border/40 py-1.5 text-xs font-semibold text-foreground/70"
                style={{ minWidth: `${weekColWidth * ms.span}px`, flex: ms.span }}
              >
                {ms.month}
              </div>
            ))}
          </div>

          {/* Week headers with dates */}
          <div className="flex border-b border-border">
            {/* Sticky leading spacer aligns with the pinned label column */}
            <div
              className="sticky start-0 z-20 shrink-0 border-e border-border bg-card"
              style={{ width: `${labelColWidth}px` }}
            />
            {weeks.map((week) => {
              const isExam = week >= EXAM_WEEK_START;
              const isCurrent = week === currentWeek;
              const weekDate = getWeekStartDate(semesterKey, week);
              const dayOfMonth = weekDate.getDate();

              return (
                <div
                  key={week}
                  className={cn(
                    "flex flex-1 flex-col items-center justify-center border-e border-border/40 py-1.5 text-xs",
                    isExam && "bg-red-500/8",
                    isCurrent && !isExam && "bg-foreground/10",
                  )}
                  style={{ minWidth: `${weekColWidth}px` }}
                >
                  {/* Date (day of month) */}
                  <span
                    className={cn(
                      "font-mono tabular text-[10px] leading-none",
                      isExam
                        ? "text-red-400/60"
                        : isCurrent
                          ? "text-foreground/60"
                          : "text-muted-foreground/60",
                    )}
                  >
                    {dayOfMonth}
                  </span>
                  {/* Week number */}
                  <span
                    className={cn(
                      "font-medium mt-0.5",
                      isExam
                        ? "text-red-400"
                        : isCurrent
                          ? "text-foreground/80"
                          : "text-muted-foreground",
                    )}
                  >
                    {isExam ? `${isHe ? "מ" : "E"}${week - cal.totalWeeks}` : week}
                  </span>
                  {isCurrent && (
                    <span className="mt-0.5 text-[8px] font-bold text-foreground/70 leading-none">
                      {isHe ? "עכשיו" : "NOW"}
                    </span>
                  )}
                  {week === EXAM_WEEK_START && (
                    <span className="mt-0.5 text-[8px] font-bold text-red-400 leading-none">
                      {isHe ? "בחינות" : "EXAMS"}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Course rows grouped by discipline */}
          {grouped.map((group) => {
            const discConfig = DISCIPLINE_CONFIG[group.discipline];
            const groupCredits = group.courses.reduce((s, c) => s + (c.course.credits ?? 0), 0);
            return (
              <div key={group.discipline}>
                {/* Discipline group header */}
                <div
                  className="flex items-center gap-2 border-b border-border bg-muted/20 px-3 py-1.5"
                  style={{ paddingInlineStart: "12px" }}
                >
                  <div
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: discConfig?.color ?? "gray" }}
                  />
                  <span className="text-xs font-semibold text-foreground">
                    {locale === "he"
                      ? (discConfig?.nameHe ?? group.discipline)
                      : (discConfig?.nameEn ?? group.discipline)}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    (<bdi dir="ltr">{group.courses.length} · {groupCredits}</bdi> {t("credits")})
                  </span>
                </div>

                {/* Course bars */}
                {group.courses.map((uc) => {
                  const color = discConfig?.color ?? "hsl(var(--muted-foreground))";

                  return (
                    <CoursePopover key={uc.id} uc={uc} color={color}>
                      <button
                        type="button"
                        className="flex w-full border-b border-border/40 cursor-pointer hover:bg-foreground/[0.02] transition-colors"
                        style={{ height: `${ROW_HEIGHT}px` }}
                      >
                        {/* Course label — pinned so names stay visible while the timeline scrolls */}
                        <div
                          className="sticky start-0 z-10 flex shrink-0 items-center gap-2 border-e border-border bg-card px-3"
                          style={{ width: `${labelColWidth}px` }}
                        >
                          <BookOpen
                            className="size-3.5 shrink-0"
                            style={{ color }}
                          />
                          <div className="flex min-w-0 flex-1 flex-col text-start">
                            <span className="truncate text-xs font-medium text-foreground">
                              {locale === "he" ? uc.course.nameHe : (uc.course.nameEn ?? uc.course.nameHe)}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              <Bidi text={uc.course.code} />
                            </span>
                          </div>
                          <span
                            className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                            style={{
                              backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
                              color,
                            }}
                          >
                            {uc.course.credits}
                          </span>
                        </div>

                        {/* Week cells with course bar */}
                        <div className="relative flex flex-1">
                          {weeks.map((week) => {
                            const isExam = week >= EXAM_WEEK_START;
                            const isActive = week < EXAM_WEEK_START;

                            return (
                              <div
                                key={`${uc.id}-w${week}`}
                                className={cn(
                                  "flex flex-1 items-center justify-center border-e border-border/20",
                                  isExam && "bg-red-500/5",
                                )}
                                style={{ minWidth: `${weekColWidth}px` }}
                              >
                                {isActive && (
                                  <div
                                    className="mx-0.5 h-6 w-full rounded-sm transition-all hover:brightness-110"
                                    style={{
                                      backgroundColor: `color-mix(in srgb, ${color} 30%, transparent)`,
                                      borderInlineStart: week === 1 ? `2px solid ${color}` : undefined,
                                      borderInlineEnd: week === EXAM_WEEK_START - 1 ? `2px solid ${color}` : undefined,
                                    }}
                                  />
                                )}
                                {isExam && (
                                  <div
                                    className="mx-0.5 h-6 w-full rounded-sm"
                                    style={{
                                      backgroundColor: "color-mix(in srgb, var(--alert-red) 8%, transparent)",
                                      opacity: 0.3,
                                    }}
                                  />
                                )}
                              </div>
                            );
                          })}

                          {/* Current week vertical indicator */}
                          {currentWeek >= 1 && currentWeek <= TOTAL_WEEKS && (
                            <div
                              className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-foreground/60"
                              style={{
                                insetInlineStart: `${((currentWeek - 0.5) / TOTAL_WEEKS) * 100}%`,
                              }}
                            />
                          )}
                        </div>
                      </button>
                    </CoursePopover>
                  );
                })}
              </div>
            );
          })}

          {/* Workload heatmap row */}
          {grouped.length > 0 && (
            <TooltipProvider delayDuration={100}>
              <div className="flex border-b border-border">
                {/* Label — pinned alongside the course labels */}
                <div
                  className="sticky start-0 z-10 flex shrink-0 items-center gap-2 border-e border-border bg-card px-3"
                  style={{ width: `${labelColWidth}px` }}
                >
                  <span className="text-[10px] font-semibold text-foreground/50 uppercase tracking-wider">
                    {isHe ? "עומס שבועי" : "Weekly Load"}
                  </span>
                </div>

                {/* Week cells with heatmap coloring */}
                <div className="relative flex flex-1">
                  {weeks.map((week) => {
                    const isExam = week >= EXAM_WEEK_START;
                    // During teaching weeks, all courses are active
                    const weekCredits = isExam ? 0 : totalCredits;
                    const weekCourses = isExam ? [] : courses;
                    const workloadInfo = getWorkloadInfo(weekCredits, t);

                    return (
                      <Tooltip key={`heatmap-w${week}`}>
                        <TooltipTrigger asChild>
                          <div
                            className={cn(
                              "flex flex-1 items-center justify-center border-e border-border/20 py-2 cursor-default transition-colors",
                              isExam ? "bg-red-500/5" : workloadInfo.bgClass,
                            )}
                            style={{ minWidth: `${weekColWidth}px` }}
                          >
                            <span
                              className={cn(
                                "font-mono text-[10px] font-bold",
                                isExam
                                  ? "text-red-400/40"
                                  : weekCredits <= 10
                                    ? "text-emerald-500/70"
                                    : weekCredits <= 20
                                      ? "text-foreground/40"
                                      : "text-red-400/70",
                              )}
                            >
                              {weekCredits > 0 ? weekCredits : "—"}
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent
                          side="top"
                          className="max-w-[220px] bg-background border border-border p-3"
                        >
                          <div className="space-y-2 text-xs">
                            <div className="font-semibold text-foreground">
                              {isHe ? `שבוע ${week}` : `Week ${week}`}
                              {isExam && (
                                <span className="ms-1.5 text-red-400">
                                  ({isHe ? "בחינות" : "Exams"})
                                </span>
                              )}
                            </div>
                            {weekCourses.length > 0 ? (
                              <>
                                <div className="space-y-1">
                                  {weekCourses.map((uc) => {
                                    const disc = (uc.disciplineOverride ?? uc.course.discipline) as keyof typeof DISCIPLINE_CONFIG;
                                    const dConfig = DISCIPLINE_CONFIG[disc];
                                    return (
                                      <div
                                        key={uc.id}
                                        className="flex items-center justify-between gap-2"
                                      >
                                        <div className="flex items-center gap-1.5 min-w-0">
                                          <div
                                            className="size-2 shrink-0 rounded-full"
                                            style={{ backgroundColor: dConfig?.color ?? "gray" }}
                                          />
                                          <span className="text-foreground/70 truncate">
                                            {isHe ? uc.course.nameHe : (uc.course.nameEn ?? uc.course.nameHe)}
                                          </span>
                                        </div>
                                        <span className="shrink-0 font-mono text-foreground/50">
                                          {uc.course.credits}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                                <div className="border-t border-border pt-1.5 flex items-center justify-between">
                                  <span className="font-medium text-foreground/60">
                                    {isHe ? "סה\"כ" : "Total"}
                                  </span>
                                  <span
                                    className={cn(
                                      "font-mono font-bold",
                                      weekCredits <= 10
                                        ? "text-emerald-500"
                                        : weekCredits <= 20
                                          ? "text-foreground/70"
                                          : "text-red-400",
                                    )}
                                  >
                                    {weekCredits} {isHe ? "ש\"ס" : "cr"}
                                  </span>
                                </div>
                              </>
                            ) : (
                              <span className="text-foreground/40">
                                {isHe ? "תקופת בחינות" : "Exam period"}
                              </span>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}

                  {/* Current week vertical indicator */}
                  {currentWeek >= 1 && currentWeek <= TOTAL_WEEKS && (
                    <div
                      className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-foreground/60"
                      style={{
                        insetInlineStart: `${((currentWeek - 0.5) / TOTAL_WEEKS) * 100}%`,
                      }}
                    />
                  )}
                </div>
              </div>
            </TooltipProvider>
          )}

          {/* Empty state if no groups */}
          {grouped.length === 0 && (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              {t("noSchedule")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
