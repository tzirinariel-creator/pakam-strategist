"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, Clock, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { TYPE_META, dayKey, taskHours, type StudyTask } from "@/components/exam-planner/exam-planner-utils";

// ── Agenda — TODAY-first, hours-aware, with inline done / push / remove ──
export function Agenda({
  byDay,
  isHe,
  onToggle,
  onDelete,
  onPush,
  onPushDay,
  courses,
  onQuickAdd,
  focusDay,
}: {
  byDay: [string, StudyTask[]][];
  isHe: boolean;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onPush: (t: StudyTask) => void;
  onPushDay: (list: StudyTask[]) => void;
  courses: { code: string; name: string; color: string | null }[];
  onQuickAdd: (dayKey: string, course: { code: string; name: string; color: string | null }) => void;
  /** Skyline day-click target — n bumps so re-clicking the same day re-scrolls. */
  focusDay: { key: string; n: number } | null;
}) {
  const [showTail, setShowTail] = useState(false);
  const [addingDay, setAddingDay] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const todayKey = dayKey(new Date());
  // Only future/today days (a past auto-generated session is noise once it's gone).
  const upcoming = byDay.filter(([k]) => k >= todayKey);

  // Skyline day-click (#37): open the tail if needed, scroll to the day card,
  // flash a ring for 2s. Runs before the empty-state return (hooks order).
  useEffect(() => {
    if (!focusDay) return;
    const inTail = upcoming.slice(3).some(([k]) => k === focusDay.key);
    if (inTail) setShowTail(true);
    const raf = requestAnimationFrame(() => {
      document
        .getElementById(`agenda-day-${focusDay.key}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    setHighlight(focusDay.key);
    const t = setTimeout(() => setHighlight(null), 2000);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire per click (n bump), not on list churn
  }, [focusDay]);

  if (upcoming.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/50 bg-foreground/[0.02] p-8 text-center text-sm text-foreground/45">
        {isHe ? "אין משימות קרובות. הוסף מבחנים כדי לבנות תוכנית." : "No upcoming tasks. Add exams to build a plan."}
      </div>
    );
  }
  const head = upcoming.slice(0, 3);
  const tail = upcoming.slice(3);

  const dayTotal = (list: StudyTask[]) => list.reduce((s, t) => s + (taskHours(t) ?? 0), 0);

  const renderDay = (key: string, list: StudyTask[], isToday: boolean) => {
    const [yy, mm, dd] = key.split("-").map(Number);
    const d = new Date(yy!, mm! - 1, dd!);
    const hours = dayTotal(list);
    const hasMovable = list.some((t) => t.taskType !== "exam" && !t.completed);
    // Load tint echoes the skyline thresholds (2.5 / 5h).
    const loadColor = hours >= 5 ? "bg-red-400/70" : hours >= 2.5 ? "bg-amber-400/70" : "bg-emerald-400/70";
    return (
      <div
        key={key}
        id={`agenda-day-${key}`}
        className={cn(
          "data-card p-3.5",
          isToday && "border-accent-brand/40 ring-1 ring-accent-brand/20",
          highlight === key && "ring-2 ring-accent-brand/40",
        )}
      >
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
          <span className={cn("text-sm font-bold", isToday ? "text-accent-brand" : "text-foreground/80")}>
            {isToday ? (isHe ? "היום" : "Today") : d.toLocaleDateString(isHe ? "he-IL" : "en-US", { weekday: "long", day: "numeric", month: "short" })}
          </span>
          {isToday && <span className="text-[11px] text-foreground/45">{d.toLocaleDateString(isHe ? "he-IL" : "en-US", { day: "numeric", month: "short" })}</span>}
          {hours > 0 && (
            <span className="ms-auto flex items-center gap-1.5">
              <span className="h-1.5 w-10 overflow-hidden rounded-full bg-foreground/10">
                <span className={cn("block h-full rounded-full", loadColor)} style={{ width: `${Math.min((hours / 6) * 100, 100)}%` }} />
              </span>
              <span className="font-mono text-[11px] tabular-nums text-foreground/60">
                <Clock className="mb-0.5 me-0.5 inline size-3" /><bdi dir="ltr">{hours}</bdi> {isHe ? "שע׳" : "h"}
              </span>
            </span>
          )}
          <span className={cn("flex items-center gap-1", hours === 0 && "ms-auto")}>
            {courses.length > 0 && (
              <button
                type="button"
                onClick={() => setAddingDay((a) => (a === key ? null : key))}
                className="rounded-md px-1.5 py-0.5 text-[11px] font-medium text-foreground/45 transition-colors hover:bg-foreground/10 hover:text-foreground/70"
              >
                {isHe ? "+ לימוד" : "+ study"}
              </button>
            )}
            {hasMovable && (
              <button
                type="button"
                onClick={() => onPushDay(list)}
                className="rounded-md px-1.5 py-0.5 text-[11px] font-medium text-foreground/45 transition-colors hover:bg-foreground/10 hover:text-foreground/70"
              >
                {isHe ? "דחו יום" : "Push day"}
              </button>
            )}
          </span>
        </div>
        {addingDay === key && courses.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {courses.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => {
                  onQuickAdd(key, c);
                  setAddingDay(null);
                }}
                className="flex items-center gap-1.5 rounded-lg border border-border/50 px-2 py-1 text-xs text-foreground/70 transition-colors hover:bg-foreground/5"
              >
                <span className="size-2 rounded-full" style={{ backgroundColor: c.color ?? "var(--accent-brand)" }} />
                {c.name}
              </button>
            ))}
          </div>
        )}
        <div className="space-y-1.5">
          {list.map((t) => {
            const meta = TYPE_META[t.taskType] ?? TYPE_META.custom!;
            const Icon = meta.icon;
            const h = taskHours(t);
            const isExam = t.taskType === "exam";
            return (
              <div key={t.id} className="flex items-center gap-2 rounded-lg border border-border/40 p-2" style={{ borderInlineStartWidth: 3, borderInlineStartColor: t.color ?? "var(--border)" }}>
                {!isExam && (
                  <button type="button" onClick={() => onToggle(t.id)} className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors", t.completed ? "border-emerald-400 bg-emerald-400 text-white" : "border-foreground/25 hover:border-foreground/40")} aria-label={isHe ? "סמנו שהושלם" : "toggle done"}>
                    {t.completed && <Check className="size-3" />}
                  </button>
                )}
                <Icon className={cn("size-3.5 shrink-0", isExam ? "text-accent-brand" : "text-foreground/40")} />
                <span className={cn("min-w-0 flex-1 truncate text-sm", t.completed ? "text-foreground/40 line-through" : "text-foreground/80")}>{t.title}</span>
                {/* The unit was glued to the number ("3שע׳") — the same defect
                    class as the miluim "10ש״ס" fix. A real space, always. */}
                {h != null && <span className="shrink-0 font-mono text-[11px] tabular-nums text-foreground/45"><bdi dir="ltr">{h}</bdi> {isHe ? "שע׳" : "h"}</span>}
                <span className="shrink-0 rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-[11px] text-foreground/50">{isHe ? meta.he : meta.en}</span>
                {!isExam && (
                  <button type="button" onClick={() => onPush(t)} className="shrink-0 rounded-md p-1 text-foreground/30 transition-colors hover:bg-foreground/10 hover:text-foreground/60" title={isHe ? "דחו ביום" : "Push a day"} aria-label={isHe ? "דחו ביום" : "push a day"}>
                    <span className="text-xs font-bold">+1</span>
                  </button>
                )}
                <button type="button" onClick={() => onDelete(t.id)} className="shrink-0 rounded-md p-1 text-foreground/30 transition-colors hover:bg-red-500/10 hover:text-red-400" aria-label={isHe ? "הסר" : "delete"}>
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="animate-stagger-3 flex flex-col gap-3">
      {head.map(([key, list]) => renderDay(key, list, key === todayKey))}
      {tail.length > 0 && (
        <>
          {showTail && tail.map(([key, list]) => renderDay(key, list, false))}
          <button type="button" onClick={() => setShowTail((s) => !s)} className="flex items-center justify-center gap-1.5 rounded-xl border border-border/50 bg-foreground/[0.02] px-4 py-2 text-xs font-medium text-foreground/55 transition-colors hover:bg-foreground/[0.04]">
            <ChevronDown className={cn("size-3.5 transition-transform", showTail && "rotate-180")} />
            {showTail ? (isHe ? "הסתר" : "Hide") : isHe ? `שאר התוכנית (${tail.length} ימים)` : `Rest of the plan (${tail.length} days)`}
          </button>
        </>
      )}
    </div>
  );
}
