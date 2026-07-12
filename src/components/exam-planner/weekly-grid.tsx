"use client";

// #40 (Phase 1) — the exam period as an on-screen WEEKLY GRID you co-edit, not
// just a finished timeline. Weeks are rows, the 7 days are columns (RTL: Sunday
// on the right). The engine SEEDS it; the student reshapes it — drag a study
// chip to another day, add one, delete one. It reads from the SAME persisted
// plan as the skyline (they always agree) and reuses the SAME task mutations
// (move-day / quick-add / delete) — no new engine, no new server procedures.
// Phases 2-5 add a capacity model, self-confidence, topic-level and a rebalance
// loop that respects locked blocks; this phase is the editable table itself.

import { useMemo } from "react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { GraduationCap, Plus, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ExamPlanResult } from "@/lib/exam-planner";
import { shortCourseName } from "@/lib/xlsx-export";
import { cn } from "@/lib/utils";

// LOCAL-midnight day helpers — copied from study-skyline.tsx. MUST be local
// (never toISOString/UTC): for Israel (UTC+2/+3) a local-midnight Date
// serialized as UTC shifts to the previous day and misaligns a task with its
// column. Days and tasks must key through the SAME function so they match.
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() + n);
  return x;
}
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Hours a study session is worth — stored in `notes` as "2.5h" by the planner. */
function taskHours(notes: string | null): number {
  if (!notes) return 0;
  const m = notes.match(/([\d.]+)h/);
  return m ? Number(m[1]) || 0 : 0;
}

/** A course color at low opacity for chip fills (hex6 + 8-bit alpha). */
function tint(hex: string | null, alpha: string): string {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return "transparent";
  return `${hex}${alpha}`;
}

export interface GridTask {
  id: string;
  title: string;
  startDate: string | Date;
  endDate: string | Date;
  taskType: string;
  courseCode: string | null;
  color: string | null;
  notes: string | null;
  completed: boolean;
}

interface WeeklyGridProps {
  plan: ExamPlanResult;
  /** dayKey → the real StudyTask rows for that day (with ids, for delete). */
  byDay: [string, GridTask[]][];
  isHe: boolean;
  now?: Date;
  courses: { code: string; name: string; color: string | null }[];
  /** Reuse the parent's moveCourseDay — moves a course's study tasks to a day. */
  onMoveCourseDay?: (courseCode: string, fromDayKey: string, toDayKey: string) => void;
  /** Reuse the parent's quickAdd — a 2.5h study block, survives a re-tune. */
  onQuickAdd?: (dayKey: string, course: { code: string; name: string; color: string | null }) => void;
  /** Reuse the parent's delete mutation. */
  onDelete?: (taskId: string) => void;
  /** Jump to a day in the agenda below. */
  onDayClick?: (dayKey: string) => void;
}

const HE_DAYS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
const EN_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// A draggable study chip. dnd-kit id encodes the source day + course, split on
// "::" in handleDragEnd — the SAME encoding the skyline uses, so both views
// speak the same drag language.
function StudyChip({
  id,
  label,
  hours,
  color,
  isHe,
  draggable,
  onDelete,
}: {
  id: string;
  label: string;
  hours: number;
  color: string | null;
  isHe: boolean;
  draggable: boolean;
  onDelete?: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, disabled: !draggable });
  return (
    <div
      ref={draggable ? setNodeRef : undefined}
      {...(draggable ? attributes : {})}
      {...(draggable ? listeners : {})}
      className={cn(
        "group/chip flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium leading-tight",
        draggable && "cursor-grab touch-none active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-brand/60",
        isDragging && "opacity-40",
      )}
      style={{ backgroundColor: tint(color, "22"), color: color ?? "inherit" }}
      title={isHe ? `${label} · ${hours} שעות` : `${label} · ${hours}h`}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hours > 0 && (
        <span dir="ltr" className="shrink-0 tabular-nums opacity-70">
          {hours}
        </span>
      )}
      {onDelete && (
        <button
          type="button"
          aria-label={isHe ? "מחקו את הבלוק" : "Delete block"}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="shrink-0 rounded-full p-0.5 opacity-0 transition-opacity hover:bg-foreground/10 group-hover/chip:opacity-70"
        >
          <X className="size-2.5" />
        </button>
      )}
    </div>
  );
}

// A droppable day cell. Highlights when a chip hovers over it.
function DayCell({
  id,
  disabled,
  children,
  className,
  onClick,
}: {
  id: string;
  disabled: boolean;
  children: React.ReactNode;
  className: string;
  onClick?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled });
  return (
    <div
      ref={disabled ? undefined : setNodeRef}
      onClick={onClick}
      className={cn(
        className,
        onClick && "cursor-pointer",
        !disabled && isOver && "ring-2 ring-inset ring-accent-brand/60 bg-accent-brand/[0.06]",
      )}
    >
      {children}
    </div>
  );
}

export function WeeklyGrid({
  plan,
  byDay,
  isHe,
  now,
  courses,
  onMoveCourseDay,
  onQuickAdd,
  onDelete,
  onDayClick,
}: WeeklyGridProps) {
  const today = startOfDay(now ?? new Date());
  const dayNames = isHe ? HE_DAYS : EN_DAYS;
  const codeToName = useMemo(() => new Map(courses.map((c) => [c.code, c.name])), [courses]);
  const taskByDay = useMemo(() => new Map(byDay), [byDay]);
  const examByDay = useMemo(() => {
    const m = new Map<string, ExamPlanResult["exams"]>();
    for (const e of plan.exams) {
      const k = dayKey(new Date(e.examDate));
      (m.get(k) ?? m.set(k, []).get(k)!).push(e);
    }
    return m;
  }, [plan.exams]);

  // Week geometry — ported from the Excel weekly sheet (Sunday snap, 10-week
  // cap) so the on-screen grid and the exported grid line up exactly.
  const { weekStart, weeks } = useMemo(() => {
    const sessionDates = plan.sessions.map((s) => startOfDay(new Date(s.date)).getTime());
    const examDates = plan.exams.map((e) => startOfDay(new Date(e.examDate)).getTime());
    const firstSession = sessionDates.length ? Math.min(...sessionDates) : today.getTime();
    const lastExam = examDates.length ? Math.max(...examDates) : firstSession;
    const rangeStart = startOfDay(new Date(Math.min(today.getTime(), firstSession)));
    const ws = addDays(rangeStart, -rangeStart.getDay());
    // Cap the horizon at today+90 — the SAME window the skyline uses
    // (study-skyline.ts: span = min(90, daysBetween(today, lastExam))) — so a
    // far exam is shown here exactly when the skyline shows it, never silently
    // dropped by a mismatched cap.
    const horizon = Math.min(lastExam, addDays(today, 90).getTime());
    const totalDays = Math.ceil((horizon - ws.getTime()) / 86_400_000) + 1;
    return { weekStart: ws, weeks: Math.max(1, Math.ceil(totalDays / 7)) };
  }, [plan.sessions, plan.exams, today]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const handleDragEnd = (e: DragEndEvent) => {
    const overKey = e.over?.id != null ? String(e.over.id) : null;
    const [fromKey, courseCode] = String(e.active.id).split("::");
    if (overKey && fromKey && courseCode && overKey !== fromKey) {
      onMoveCourseDay?.(courseCode, fromKey, overKey);
    }
  };

  return (
    <div className="data-card p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="font-display text-base font-bold text-foreground/90">
          {isHe ? "הלוח השבועי שלכם" : "Your weekly board"}
        </h3>
        <span className="text-[11px] text-foreground/45">
          {isHe ? "גררו בלוק ליום אחר · הוסיפו · מחקו" : "Drag a block to another day · add · delete"}
        </span>
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div dir={isHe ? "rtl" : "ltr"} className="overflow-x-auto">
          <div className="min-w-[560px] space-y-2">
            {/* Day-name header row */}
            <div className="grid grid-cols-7 gap-1.5">
              {dayNames.map((d, i) => (
                <div
                  key={i}
                  className={cn(
                    "text-center text-[11px] font-medium text-foreground/45",
                    (i === 5 || i === 6) && "text-foreground/30",
                  )}
                >
                  {d}
                </div>
              ))}
            </div>

            {Array.from({ length: weeks }).map((_, w) => (
              <div key={w} className="grid grid-cols-7 gap-1.5">
                {Array.from({ length: 7 }).map((_, d) => {
                  const day = addDays(weekStart, w * 7 + d);
                  const key = dayKey(day);
                  const isToday = key === dayKey(today);
                  const isPast = day.getTime() < today.getTime();
                  const isWeekend = d === 5 || d === 6;
                  const tasks = taskByDay.get(key) ?? [];
                  const exams = examByDay.get(key) ?? [];
                  const nonExam = tasks.filter((t) => t.taskType !== "exam");
                  const dayHours = nonExam.reduce((s, t) => s + taskHours(t.notes), 0);
                  // Aggregate STUDY tasks by course per day into ONE chip. A
                  // course's study for a day is a single draggable unit (like the
                  // skyline's one-bar-per-course-per-day), so dnd-kit ids never
                  // collide and a drag/delete matches moveCourseDay's move-ALL-
                  // of-this-course-that-day semantics. Other task types
                  // (assignment/personal) render individually, non-draggable.
                  const studyGroups = new Map<string, GridTask[]>();
                  const otherTasks: GridTask[] = [];
                  for (const t of nonExam) {
                    if (t.taskType === "study" && t.courseCode) {
                      (studyGroups.get(t.courseCode) ?? studyGroups.set(t.courseCode, []).get(t.courseCode)!).push(t);
                    } else {
                      otherTasks.push(t);
                    }
                  }

                  return (
                    <DayCell
                      key={key}
                      id={key}
                      disabled={!onMoveCourseDay}
                      onClick={onDayClick ? () => onDayClick(key) : undefined}
                      className={cn(
                        "flex min-h-[86px] flex-col gap-1 rounded-lg border p-1.5 transition-colors",
                        isToday
                          ? "border-accent-brand/50 bg-accent-brand/[0.05]"
                          : isWeekend
                            ? "border-border/40 bg-foreground/[0.015]"
                            : "border-border/60 bg-card/40",
                        isPast && "opacity-55",
                      )}
                    >
                      {/* Date + day-hours */}
                      <div className="flex items-center justify-between">
                        <span
                          className={cn(
                            "text-[10px] font-semibold tabular-nums",
                            isToday ? "text-accent-brand" : "text-foreground/40",
                          )}
                          dir="ltr"
                        >
                          {day.getDate()}.{day.getMonth() + 1}
                        </span>
                        {dayHours > 0 && (
                          <span dir="ltr" className="text-[9px] tabular-nums text-foreground/35">
                            {dayHours}h
                          </span>
                        )}
                      </div>

                      {/* Exam pennants — never draggable, they anchor the week. */}
                      {exams.map((ex, i) => (
                        <div
                          key={`ex-${i}`}
                          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-bold"
                          style={{ backgroundColor: tint(ex.color, "26"), color: ex.color }}
                          title={isHe ? `מבחן: ${ex.courseName} (מועד ${ex.moed === "A" ? "א׳" : "ב׳"})` : `Exam: ${ex.courseName} (Moed ${ex.moed})`}
                        >
                          <GraduationCap className="size-2.5 shrink-0" />
                          <span className="min-w-0 flex-1 truncate">{shortCourseName(ex.courseName, 16)}</span>
                        </div>
                      ))}

                      {/* One draggable chip per course's study that day. */}
                      {[...studyGroups.entries()].map(([code, group]) => {
                        const name = codeToName.get(code) || group[0]!.title.replace(/^.*?:\s*/, "");
                        const hours = group.reduce((s, t) => s + taskHours(t.notes), 0);
                        return (
                          <StudyChip
                            key={code}
                            id={`${key}::${code}`}
                            label={shortCourseName(name, 16)}
                            hours={hours}
                            color={group[0]!.color}
                            isHe={isHe}
                            draggable={!!onMoveCourseDay}
                            onDelete={onDelete ? () => group.forEach((t) => onDelete(t.id)) : undefined}
                          />
                        );
                      })}
                      {/* Assignment / personal tasks — individual, not draggable. */}
                      {otherTasks.map((t) => {
                        const name = (t.courseCode && codeToName.get(t.courseCode)) || t.title.replace(/^.*?:\s*/, "");
                        return (
                          <StudyChip
                            key={t.id}
                            id={`${key}::other::${t.id}`}
                            label={shortCourseName(name, 16)}
                            hours={taskHours(t.notes)}
                            color={t.color}
                            isHe={isHe}
                            draggable={false}
                            onDelete={onDelete ? () => onDelete(t.id) : undefined}
                          />
                        );
                      })}

                      {/* Quick-add a study block for one of the exam courses. */}
                      {onQuickAdd && courses.length > 0 && !isPast && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              onClick={(e) => e.stopPropagation()}
                              aria-label={isHe ? "הוסיפו בלוק לימוד" : "Add a study block"}
                              className="mt-auto flex items-center justify-center gap-0.5 rounded-md border border-dashed border-foreground/15 py-0.5 text-[10px] text-foreground/40 transition-colors hover:border-accent-brand/40 hover:text-accent-brand"
                            >
                              <Plus className="size-3" />
                              {isHe ? "לימוד" : "Study"}
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="center" className="max-h-64 overflow-y-auto">
                            {courses.map((c) => (
                              <DropdownMenuItem
                                key={c.code}
                                onClick={() => onQuickAdd(key, c)}
                                className="gap-2 text-xs"
                              >
                                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: c.color ?? "var(--accent-brand)" }} />
                                {shortCourseName(c.name, 28)}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </DayCell>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </DndContext>
    </div>
  );
}
