"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarDays } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const TASK_TYPES = ["study", "assignment", "exam", "custom"] as const;
type TaskType = (typeof TASK_TYPES)[number];

const TASK_COLORS: Record<TaskType, string> = {
  study: "#3b82f6",
  assignment: "#f59e0b",
  exam: "#ef4444",
  custom: "#6B7280",
};

export interface TaskFormData {
  title: string;
  startDate: string;
  endDate: string;
  taskType: TaskType;
  courseCode?: string;
  color?: string;
  notes?: string;
}

interface AddTaskModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: TaskFormData) => void;
  isSubmitting?: boolean;
  courseCodes?: string[];
  initialData?: Partial<TaskFormData>;
}

export function AddTaskModal({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
  courseCodes = [],
  initialData,
}: AddTaskModalProps) {
  const locale = useLocale();
  const isHe = locale === "he";
  const t = useTranslations("studyPlanner");

  const today = new Date().toISOString().slice(0, 10);
  const [title, setTitle] = useState(initialData?.title ?? "");
  const [startDate, setStartDate] = useState(initialData?.startDate ?? today);
  const [endDate, setEndDate] = useState(initialData?.endDate ?? today);
  const [taskType, setTaskType] = useState<TaskType>(initialData?.taskType as TaskType ?? "study");
  const [courseCode, setCourseCode] = useState(initialData?.courseCode ?? "");
  const [notes, setNotes] = useState(initialData?.notes ?? "");

  const canSubmit = title.trim().length > 0 && startDate && endDate && endDate >= startDate;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({
      title: title.trim(),
      startDate,
      endDate,
      taskType,
      courseCode: courseCode || undefined,
      color: TASK_COLORS[taskType],
      notes: notes.trim() || undefined,
    });
  };

  const taskTypeLabels: Record<TaskType, string> = {
    study: t("typeStudy"),
    assignment: t("typeAssignment"),
    exam: t("typeExam"),
    custom: t("typeCustom"),
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-foreground/60" />
            {initialData ? t("editTask") : t("addTask")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Title */}
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground/60">
              {t("taskTitle")}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("taskTitlePlaceholder")}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:border-foreground/30 focus:outline-none"
              autoFocus
            />
          </div>

          {/* Task type selector */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground/60">
              {t("taskType")}
            </label>
            <div className="flex gap-1.5">
              {TASK_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setTaskType(type)}
                  className={cn(
                    "flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-all",
                    taskType === type
                      ? "text-white shadow-sm"
                      : "bg-foreground/5 text-foreground/50 hover:bg-foreground/10"
                  )}
                  style={taskType === type ? { backgroundColor: TASK_COLORS[type] } : undefined}
                >
                  {taskTypeLabels[type]}
                </button>
              ))}
            </div>
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground/60">
                {t("startDate")}
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (e.target.value > endDate) setEndDate(e.target.value);
                }}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-foreground/30 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground/60">
                {t("endDate")}
              </label>
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-foreground/30 focus:outline-none"
              />
            </div>
          </div>

          {/* Course (optional) */}
          {courseCodes.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground/60">
                {t("linkedCourse")}
              </label>
              <select
                value={courseCode}
                onChange={(e) => setCourseCode(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-foreground/30 focus:outline-none"
              >
                <option value="">{t("noCourse")}</option>
                {courseCodes.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground/60">
              {t("notes")}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("notesPlaceholder")}
              rows={2}
              className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:border-foreground/30 focus:outline-none"
            />
          </div>
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg px-4 py-2 text-sm text-foreground/50 transition-colors hover:bg-foreground/5"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            className={cn(
              "rounded-lg px-5 py-2 text-sm font-medium transition-all",
              canSubmit && !isSubmitting
                ? "bg-foreground text-background hover:scale-[1.02] press-scale"
                : "cursor-not-allowed bg-foreground/20 text-foreground/40"
            )}
          >
            {isSubmitting ? t("saving") : t("save")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
