"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  Plus,
  CheckCircle2,
  Circle,
  Trash2,
  CalendarDays,
  BookOpen,
  FileText,
  ClipboardCheck,
  NotebookPen,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/trpc/react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AddTaskModal, type TaskFormData } from "./add-task-modal";

const TASK_TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  study: BookOpen,
  assignment: FileText,
  exam: ClipboardCheck,
  custom: NotebookPen,
};

const TASK_TYPE_COLORS: Record<string, string> = {
  study: "#3b82f6",
  assignment: "#f59e0b",
  exam: "#ef4444",
  custom: "#6B7280",
};

function formatTaskDate(date: Date | string, isHe: boolean): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString(isHe ? "he-IL" : "en-US", {
    month: "short",
    day: "numeric",
  });
}

function daysBetween(a: Date | string, b: Date | string): number {
  const da = typeof a === "string" ? new Date(a) : a;
  const db = typeof b === "string" ? new Date(b) : b;
  return Math.ceil((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24));
}

export function StudyPlannerWidget({
  isHe,
  hideWhenEmpty = false,
}: {
  isHe: boolean;
  /** On the dashboard / exam board, render nothing until there's a plan to show
   *  — an empty "add a task" card there is just clutter. The full manager at
   *  /exam-planner keeps its own empty state. (#10) */
  hideWhenEmpty?: boolean;
}) {
  const t = useTranslations("studyPlanner");
  const Arrow = isHe ? ArrowLeft : ArrowRight;
  const heDays = (n: number) => (n === 1 ? "בעוד יום" : n === 2 ? "בעוד יומיים" : `בעוד ${n} ימים`);
  const utils = api.useUtils();

  const [showAddModal, setShowAddModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Fetch tasks
  const tasksQuery = api.studyTask.list.useQuery(undefined, { retry: 1 });

  // Mutations
  const createTask = api.studyTask.create.useMutation({
    onSuccess: () => {
      utils.studyTask.list.invalidate();
      toast.success(t("taskCreated"));
      setShowAddModal(false);
    },
    onError: () => toast.error(t("taskError")),
  });

  const toggleTask = api.studyTask.toggleComplete.useMutation({
    onSuccess: () => {
      utils.studyTask.list.invalidate();
      toast.success(t("taskUpdated"));
    },
    onError: () => toast.error(t("taskError")),
  });

  const deleteTask = api.studyTask.delete.useMutation({
    onSuccess: () => {
      utils.studyTask.list.invalidate();
      setDeletingId(null);
      toast.success(t("taskDeleted"));
    },
    onError: () => toast.error(t("taskError")),
  });

  // Process tasks — group into active and completed
  const { activeTasks, completedCount, totalCount, planStartsInDays, planStartDate } = useMemo(() => {
    const tasks = tasksQuery.data?.tasks ?? [];
    const now = new Date();

    // Sort: overdue first, then by start date
    const active = tasks
      .filter((t) => !t.completed)
      .sort((a, b) => {
        const aEnd = new Date(a.endDate);
        const bEnd = new Date(b.endDate);
        const aOverdue = aEnd < now;
        const bOverdue = bEnd < now;
        if (aOverdue && !bOverdue) return -1;
        if (!aOverdue && bOverdue) return 1;
        return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
      });

    // How far off the FIRST piece of work is. Null once the plan is close
    // enough that the rows are the answer to "what now" — three weeks, the
    // same horizon the revision engine itself starts scheduling at, so the
    // card switches to the list exactly when there is something to do.
    const first = active[0];
    const daysToStart = first ? daysBetween(now, new Date(first.startDate)) : null;
    const notYet = daysToStart != null && daysToStart > 21 ? daysToStart : null;

    return {
      activeTasks: active,
      completedCount: tasks.filter((t) => t.completed).length,
      totalCount: tasks.length,
      planStartsInDays: notYet,
      planStartDate: notYet != null && first ? new Date(first.startDate) : null,
    };
  }, [tasksQuery.data]);

  // The date AND the distance: a date alone makes you count, a countdown alone
  // makes you check the calendar. Both, once.
  const planStartLabel =
    planStartsInDays != null && planStartDate
      ? isHe
        ? `ב-${planStartDate.toLocaleDateString("he-IL", { day: "numeric", month: "long" })}, ${heDays(planStartsInDays)}`
        : `on ${planStartDate.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}, in ${planStartsInDays} days`
      : "";

  // Get course codes for the modal
  const planQuery = api.plan.getUserPlan.useQuery(undefined, { retry: 1 });
  const courseCodes = useMemo(() => {
    const courses = planQuery.data?.courses ?? [];
    return [...new Set(courses.map((c) => {
      // The plan returns course objects — extract code
      const course = (c as { course?: { code?: string } }).course;
      return course?.code ?? "";
    }).filter(Boolean))];
  }, [planQuery.data]);

  const handleCreateTask = (data: TaskFormData) => {
    createTask.mutate({
      title: data.title,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      taskType: data.taskType as "study" | "assignment" | "exam" | "custom",
      courseCode: data.courseCode,
      color: data.color,
      notes: data.notes,
    });
  };

  // Dashboard / exam board: stay invisible until there's an actual plan to show.
  if (hideWhenEmpty && (tasksQuery.isLoading || totalCount === 0)) {
    return null;
  }

  if (tasksQuery.isLoading) {
    return (
      <div className="data-card p-5">
        <div className="flex items-center gap-3 mb-4">
          <CalendarDays className="h-5 w-5 text-foreground/60" />
          <h3 className="text-base font-semibold text-foreground/80">{t("title")}</h3>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-foreground/10 border-t-foreground/50" />
        </div>
      </div>
    );
  }

  const now = new Date();

  return (
    <>
      <div className="data-card p-5">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <CalendarDays className="h-5 w-5 text-foreground/60" />
          <h3 className="text-base font-semibold text-foreground/80">{t("title")}</h3>
          {totalCount > 0 && (
            <span dir="ltr" className="ms-auto text-xs text-foreground/60">
              {completedCount}/{totalCount}
            </span>
          )}
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className={cn(
              "flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-all hover:scale-105 press-scale",
              "bg-foreground/10 text-foreground/70 hover:bg-foreground/15",
              totalCount === 0 && "ms-auto"
            )}
          >
            <Plus className="h-3.5 w-3.5" />
            {t("add")}
          </button>
        </div>

        {/* Empty state */}
        {totalCount === 0 && (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-foreground/5">
              <CalendarDays className="h-6 w-6 text-foreground/60" />
            </div>
            <p className="text-sm text-foreground/60">{t("emptyTitle")}</p>
            <p className="text-xs text-foreground/60">{t("emptyDesc")}</p>
          </div>
        )}

        {/* Ariel, 22-20, applied where it bites a second time. Measured on the
            live home screen on 1.9.2026: this card showed six rows, all
            "לימוד: מיקרו כלכלה ב׳ + תרגיל", each labelled 125 / 126 / 127 /
            128 / 129 days away, under a heading reading "0/50".

            They were not duplicates — they are six consecutive January revision
            days, and the plan is correct. The card was simply answering "what
            is next" on a screen that is read as "what now". A student six days
            before the registration round sees a to-do list with nothing ticked
            and reads it as being behind, when in truth there is nothing to do
            for four months.

            So when the plan has not started, the card says that in one line
            instead of six. Nothing is hidden: the count, the date and the way
            through to the planner are all here. */}
        {activeTasks.length > 0 && planStartsInDays != null && (
          <Link
            href="/exam-planner"
            className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-foreground/[0.02] px-3 py-2.5 transition-colors hover:bg-foreground/[0.04]"
          >
            <div className="min-w-0">
              <p className="text-sm text-foreground/75">
                {isHe
                  ? `התוכנית מתחילה ${planStartLabel}`
                  : `Your plan starts ${planStartLabel}`}
              </p>
              <p className="mt-0.5 text-xs text-foreground/60">
                {isHe
                  ? `${activeTasks.length} מטלות מחכות שם — אין מה לעשות איתן היום.`
                  : `${activeTasks.length} tasks waiting there — nothing to do about them today.`}
              </p>
            </div>
            <Arrow className="size-4 shrink-0 text-foreground/60" />
          </Link>
        )}

        {/* Task list */}
        {activeTasks.length > 0 && planStartsInDays == null && (
          <div className="space-y-1.5">
            {activeTasks.slice(0, 6).map((task) => {
              const endDate = new Date(task.endDate);
              const startDate = new Date(task.startDate);
              const isOverdue = endDate < now;
              const daysLeft = daysBetween(now, endDate);
              const totalDays = Math.max(1, daysBetween(startDate, endDate));
              const elapsed = Math.max(0, daysBetween(startDate, now));
              const progressPct = Math.min(100, (elapsed / totalDays) * 100);
              const TaskIcon = TASK_TYPE_ICONS[task.taskType] ?? NotebookPen;
              const taskColor = task.color ?? TASK_TYPE_COLORS[task.taskType] ?? "#6B7280";

              return (
                <div
                  key={task.id}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-lg border px-3 py-2 transition-all",
                    isOverdue
                      ? "border-red-500/20 bg-red-500/5"
                      : "border-border/50 bg-background/50 hover:border-border"
                  )}
                >
                  {/* Toggle button */}
                  <button
                    type="button"
                    onClick={() => toggleTask.mutate({ id: task.id })}
                    className="shrink-0 text-foreground/60 transition-colors hover:text-status-green"
                  >
                    <Circle className="h-4 w-4" />
                  </button>

                  {/* Task icon + info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <TaskIcon
                        className="h-3 w-3 shrink-0"
                        style={{ color: taskColor }}
                      />
                      <span className="truncate text-sm font-medium text-foreground/80">
                        {task.title}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      {/* Mini progress bar */}
                      <div className="h-1 w-12 overflow-hidden rounded-full bg-foreground/10">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${progressPct}%`,
                            backgroundColor: isOverdue ? "#ef4444" : taskColor,
                          }}
                        />
                      </div>
                      <span className={cn(
                        "text-[10px]",
                        isOverdue ? "font-medium text-status-red" : "text-foreground/60"
                      )}>
                        {isOverdue
                          ? t("overdue")
                          : daysLeft === 0
                            ? t("dueToday")
                            : t("daysLeft", { count: daysLeft })}
                      </span>
                      {task.courseCode && (
                        <span className="text-[10px] text-foreground/60">
                          {task.courseCode}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Date range. NO dir="ltr": a he-IL short date is "10 ביולי",
                      i.e. it CONTAINS a Hebrew word — forcing LTR pushes the
                      month past the day and reorders the two ends of the range
                      (measured). Natural RTL flow renders it correctly. */}
                  <span className="hidden text-[10px] text-foreground/60 sm:block">
                    {formatTaskDate(task.startDate, isHe)} – {formatTaskDate(task.endDate, isHe)}
                  </span>

                  {/* Delete */}
                  {deletingId === task.id ? (
                    <button
                      type="button"
                      onClick={() => deleteTask.mutate({ id: task.id })}
                      className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-status-red transition-colors hover:bg-red-500/10"
                    >
                      {t("confirmDelete")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDeletingId(task.id)}
                      className="shrink-0 text-foreground/20 opacity-0 transition-all group-hover:opacity-100 hover:text-status-red"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}

            {activeTasks.length > 6 && (
              <p className="pt-1 text-center text-xs text-foreground/60">
                {t("moreTasksHidden", { count: activeTasks.length - 6 })}
              </p>
            )}
          </div>
        )}

        {/* Completed summary */}
        {completedCount > 0 && (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-foreground/60">
            <CheckCircle2 className="h-3 w-3 text-status-green/60" />
            {t("completedCount", { count: completedCount })}
          </div>
        )}

        {/* Link to the full exam-period planner — the compact view leads to the
            place you generate/edit the whole plan (#10). */}
        <Link
          href="/exam-planner"
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-foreground/60 transition-colors hover:text-foreground/80"
        >
          {isHe ? "למתכנן המבחנים המלא" : "Open the full exam planner"}
          <Arrow className="h-3 w-3" />
        </Link>
      </div>

      {/* Add task modal */}
      <AddTaskModal
        open={showAddModal}
        onOpenChange={(open) => {
          setShowAddModal(open);
          if (!open) setDeletingId(null);
        }}
        onSubmit={handleCreateTask}
        isSubmitting={createTask.isPending}
        courseCodes={courseCodes}
      />
    </>
  );
}
