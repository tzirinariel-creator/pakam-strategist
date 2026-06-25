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
  Sparkles,
} from "lucide-react";
import { api } from "@/lib/trpc/react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AddTaskModal, type TaskFormData } from "./add-task-modal";

const TASK_TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  study: BookOpen,
  assignment: FileText,
  exam: ClipboardCheck,
  custom: Sparkles,
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

export function StudyPlannerWidget({ isHe }: { isHe: boolean }) {
  const t = useTranslations("studyPlanner");
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
  const { activeTasks, completedCount, totalCount } = useMemo(() => {
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

    return {
      activeTasks: active,
      completedCount: tasks.filter((t) => t.completed).length,
      totalCount: tasks.length,
    };
  }, [tasksQuery.data]);

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
            <span className="ms-auto text-xs text-foreground/40">
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
              <CalendarDays className="h-6 w-6 text-foreground/30" />
            </div>
            <p className="text-sm text-foreground/50">{t("emptyTitle")}</p>
            <p className="text-xs text-foreground/30">{t("emptyDesc")}</p>
          </div>
        )}

        {/* Task list */}
        {activeTasks.length > 0 && (
          <div className="space-y-1.5">
            {activeTasks.slice(0, 6).map((task) => {
              const endDate = new Date(task.endDate);
              const startDate = new Date(task.startDate);
              const isOverdue = endDate < now;
              const daysLeft = daysBetween(now, endDate);
              const totalDays = Math.max(1, daysBetween(startDate, endDate));
              const elapsed = Math.max(0, daysBetween(startDate, now));
              const progressPct = Math.min(100, (elapsed / totalDays) * 100);
              const TaskIcon = TASK_TYPE_ICONS[task.taskType] ?? Sparkles;
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
                    className="shrink-0 text-foreground/30 transition-colors hover:text-emerald-400"
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
                        isOverdue ? "font-medium text-red-400" : "text-foreground/40"
                      )}>
                        {isOverdue
                          ? t("overdue")
                          : daysLeft === 0
                            ? t("dueToday")
                            : t("daysLeft", { count: daysLeft })}
                      </span>
                      {task.courseCode && (
                        <span className="text-[10px] text-foreground/30">
                          {task.courseCode}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Date range */}
                  <span className="hidden text-[10px] text-foreground/30 sm:block">
                    {formatTaskDate(task.startDate, isHe)} – {formatTaskDate(task.endDate, isHe)}
                  </span>

                  {/* Delete */}
                  {deletingId === task.id ? (
                    <button
                      type="button"
                      onClick={() => deleteTask.mutate({ id: task.id })}
                      className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-red-400 transition-colors hover:bg-red-500/10"
                    >
                      {t("confirmDelete")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDeletingId(task.id)}
                      className="shrink-0 text-foreground/20 opacity-0 transition-all group-hover:opacity-100 hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}

            {activeTasks.length > 6 && (
              <p className="pt-1 text-center text-xs text-foreground/30">
                {t("moreTasksHidden", { count: activeTasks.length - 6 })}
              </p>
            )}
          </div>
        )}

        {/* Completed summary */}
        {completedCount > 0 && (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-foreground/30">
            <CheckCircle2 className="h-3 w-3 text-emerald-400/60" />
            {t("completedCount", { count: completedCount })}
          </div>
        )}
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
