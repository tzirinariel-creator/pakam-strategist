"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { useLocale } from "next-intl";
import { AlertTriangle, ZoomIn, ZoomOut } from "lucide-react";
import { DISCIPLINE_CONFIG } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { CourseWithSchedule } from "@/lib/plan-generator";
import type { Discipline } from "@/types/enums";

// ─── Types ───────────────────────────────────────────────────────────

interface ExamEvent {
  courseId: string;
  courseName: string;
  courseCode: string;
  discipline: Discipline;
  credits: number;
  color: string;
  moedA: Date | null;
  moedB: Date | null;
}

interface ExamGanttProps {
  courses: CourseWithSchedule[];
}

// ─── Helpers ────────────────────────────────────────────────────────

function daysBetween(a: Date, b: Date): number {
  const dA = new Date(a); dA.setHours(0, 0, 0, 0);
  const dB = new Date(b); dB.setHours(0, 0, 0, 0);
  return Math.round((dB.getTime() - dA.getTime()) / (1000 * 60 * 60 * 24));
}

// Timezone-stable date key built from LOCAL date components. Using toISOString()
// here would key by UTC, which differs from the local-midnight day for any UTC+2/+3
// user (all TAU students) and lands every exam under the wrong column. Both the day
// columns and the moed cells must use this same helper so they align in local time.
function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateFull(date: Date, locale: string): string {
  return date.toLocaleDateString(locale === "he" ? "he-IL" : "en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function getDayName(date: Date, locale: string): string {
  return date.toLocaleDateString(locale === "he" ? "he-IL" : "en-US", {
    weekday: "short",
  });
}

// ─── Component ───────────────────────────────────────────────────────

export function ExamGantt({ courses }: ExamGanttProps) {
  const locale = useLocale();
  const isHe = locale === "he";
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hoveredExam, setHoveredExam] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  // Narrow viewport → smaller columns so more of the timeline fits without scrolling.
  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setIsNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Build exam events
  const events = useMemo<ExamEvent[]>(() => {
    const result: ExamEvent[] = [];
    for (const c of courses) {
      const moedA = c.examDateA ? new Date(c.examDateA) : null;
      const moedB = c.examDateB ? new Date(c.examDateB) : null;
      if (!moedA && !moedB) continue;
      const disc = c.discipline as Discipline;
      const config = DISCIPLINE_CONFIG[disc];
      result.push({
        courseId: c.id,
        courseName: isHe ? c.nameHe : (c.nameEn ?? c.nameHe),
        courseCode: c.code,
        discipline: disc,
        credits: c.credits,
        color: config?.color ?? "#8B949E",
        moedA,
        moedB,
      });
    }
    result.sort((a, b) => {
      const dA = (a.moedA ?? a.moedB)!.getTime();
      const dB = (b.moedA ?? b.moedB)!.getTime();
      return dA - dB;
    });
    return result;
  }, [courses, isHe]);

  // Calculate timeline range
  const { startDate, totalDays } = useMemo(() => {
    if (events.length === 0) return { startDate: new Date(), endDate: new Date(), totalDays: 0 };
    const allDates = events.flatMap((e) => [e.moedA, e.moedB].filter(Boolean) as Date[]);
    const min = new Date(Math.min(...allDates.map((d) => d.getTime())));
    const max = new Date(Math.max(...allDates.map((d) => d.getTime())));
    min.setDate(min.getDate() - 2);
    max.setDate(max.getDate() + 2);
    min.setHours(0, 0, 0, 0);
    max.setHours(0, 0, 0, 0);
    return { startDate: min, endDate: max, totalDays: daysBetween(min, max) };
  }, [events]);

  // On phones, shrink the base day width and label column so more days fit per screen.
  const baseDayWidth = isNarrow ? 30 : 44;
  const dayWidth = Math.round(baseDayWidth * zoomLevel);
  const rowHeight = 36;
  const labelWidth = isNarrow ? 88 : 120;

  // Generate day columns
  const days = useMemo(() => {
    const result: { date: Date; dayNum: number; isWeekend: boolean; isToday: boolean; dateKey: string }[] = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = 0; i <= totalDays; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      d.setHours(0, 0, 0, 0);
      const dayOfWeek = d.getDay();
      result.push({
        date: d,
        dayNum: d.getDate(),
        isWeekend: dayOfWeek === 5 || dayOfWeek === 6,
        isToday: d.getTime() === today.getTime(),
        dateKey: dateKey(d),
      });
    }
    return result;
  }, [totalDays, startDate]);

  // Map date → column index for quick lookup
  const dateToCol = useMemo(() => {
    const map = new Map<string, number>();
    days.forEach((d, i) => map.set(d.dateKey, i));
    return map;
  }, [days]);

  // Column to bring into view on mount: today if it's in range, else the nearest exam.
  const focusCol = useMemo(() => {
    if (days.length === 0) return 0;
    const todayIdx = days.findIndex((d) => d.isToday);
    if (todayIdx >= 0) return todayIdx;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let best = -1;
    let bestDist = Infinity;
    for (const e of events) {
      const d = e.moedA ?? e.moedB;
      if (!d) continue;
      const dist = Math.abs(d.getTime() - today.getTime());
      if (dist < bestDist) {
        bestDist = dist;
        best = dateToCol.get(dateKey(d)) ?? -1;
      }
    }
    return best >= 0 ? best : 0;
  }, [days, events, dateToCol]);

  // On mount, scroll the timeline so the relevant region is visible (not hidden off-screen).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || focusCol <= 0) return;
    // Position the focus column roughly one-third in from the timeline's leading edge.
    const offset = labelWidth + Math.max(0, focusCol - 2) * dayWidth;
    if (isHe) {
      // RTL: scrollLeft is negative and grows leftward as content scrolls.
      el.scrollLeft = -offset;
    } else {
      el.scrollLeft = offset;
    }
    // Run once after first paint; dayWidth/labelWidth settle synchronously with isNarrow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusCol]);

  // Detect conflicts — exams on same day
  const conflictDays = useMemo(() => {
    const dateMap = new Map<string, string[]>();
    for (const e of events) {
      if (e.moedA) {
        const key = dateKey(e.moedA);
        const list = dateMap.get(key) ?? [];
        list.push(e.courseId);
        dateMap.set(key, list);
      }
    }
    const conflicts = new Set<string>();
    for (const [, ids] of dateMap) {
      if (ids.length > 1) {
        for (const id of ids) conflicts.add(id);
      }
    }
    return conflicts;
  }, [events]);

  // Tight gaps
  const tightGaps = useMemo(() => {
    const gaps: { courseA: string; courseB: string; days: number }[] = [];
    const sorted = events.filter((e) => e.moedA).sort((a, b) => a.moedA!.getTime() - b.moedA!.getTime());
    for (let i = 0; i < sorted.length - 1; i++) {
      const cur = sorted[i];
      const next = sorted[i + 1];
      if (!cur?.moedA || !next?.moedA) continue;
      const gapDays = daysBetween(cur.moedA, next.moedA);
      if (gapDays <= 2 && gapDays >= 0) {
        gaps.push({ courseA: cur.courseId, courseB: next.courseId, days: gapDays });
      }
    }
    return gaps;
  }, [events]);

  // ─── Empty state ──────────────────────────────────────────────────

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <p className="text-xs text-foreground/30">
          {isHe ? "אין מועדי בחינה לקורסים שנבחרו" : "No exam dates for selected courses"}
        </p>
      </div>
    );
  }

  // ─── Render — Grid-based Gantt ─────────────────────────────────────

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-display text-xs font-medium text-foreground/50">
            {isHe ? "ציר זמן מבחנים" : "Exam Timeline"}
          </span>
          {conflictDays.size > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-500">
              <AlertTriangle className="h-2.5 w-2.5" />
              {isHe ? "התנגשות" : "Conflict"}
            </span>
          )}
          {tightGaps.length > 0 && conflictDays.size === 0 && (
            <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-500">
              {isHe ? "צפוף" : "Tight"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoomLevel((z) => Math.max(0.6, z - 0.2))}
            className="rounded p-1 text-foreground/30 hover:text-foreground/60 hover:bg-foreground/5 transition-all"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setZoomLevel((z) => Math.min(1.8, z + 0.2))}
            className="rounded p-1 text-foreground/30 hover:text-foreground/60 hover:bg-foreground/5 transition-all"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Gantt table */}
      <div
        ref={scrollRef}
        className="overflow-x-auto rounded-lg border border-border/30 bg-background/50"
        style={{ direction: isHe ? "rtl" : "ltr" }}
      >
        <table className="border-collapse" style={{ minWidth: `${labelWidth + days.length * dayWidth}px` }}>
          {/* ── Header ── */}
          <thead>
            {/* Day-of-week row */}
            <tr>
              <th
                className="sticky start-0 z-20 border-e border-b border-border/20 bg-card"
                style={{ width: `${labelWidth}px`, minWidth: `${labelWidth}px` }}
              />
              {days.map((d, i) => (
                <th
                  key={`dow-${i}`}
                  className={cn(
                    "border-e border-b border-border/10 text-[10px] font-normal text-foreground/25 py-0.5",
                    d.isToday && "bg-foreground/5 font-bold text-foreground/60",
                    d.isWeekend && "bg-foreground/[0.02]",
                  )}
                  style={{ width: `${dayWidth}px`, minWidth: `${dayWidth}px` }}
                >
                  {getDayName(d.date, locale)}
                </th>
              ))}
            </tr>
            {/* Date number row */}
            <tr>
              <th
                className="sticky start-0 z-20 border-e border-b border-border/20 bg-card px-2 text-start text-[11px] font-medium text-foreground/40"
                style={{ width: `${labelWidth}px` }}
              >
                {isHe ? "קורס" : "Course"}
              </th>
              {days.map((d, i) => (
                <th
                  key={`dn-${i}`}
                  className={cn(
                    "border-e border-b border-border/15 text-[10px] font-mono tabular py-1",
                    d.isToday
                      ? "bg-foreground/8 font-bold text-foreground/80"
                      : d.isWeekend
                        ? "bg-foreground/[0.02] text-foreground/20"
                        : "text-foreground/30 font-normal",
                  )}
                  style={{ width: `${dayWidth}px` }}
                >
                  {d.dayNum}
                </th>
              ))}
            </tr>
          </thead>

          {/* ── Body: one row per course ── */}
          <tbody>
            {events.map((event) => {
              const hasConflict = conflictDays.has(event.courseId);
              const isHovered = hoveredExam === event.courseId;
              const moedAKey = event.moedA ? dateKey(event.moedA) : "";
              const moedBKey = event.moedB ? dateKey(event.moedB) : "";
              const moedACol = moedAKey ? dateToCol.get(moedAKey) : undefined;
              const moedBCol = moedBKey ? dateToCol.get(moedBKey) : undefined;

              return (
                <tr
                  key={event.courseId}
                  className={cn(
                    "transition-colors",
                    isHovered && "bg-foreground/[0.03]",
                    hasConflict && "bg-red-500/[0.03]",
                  )}
                  onMouseEnter={() => setHoveredExam(event.courseId)}
                  onMouseLeave={() => setHoveredExam(null)}
                  style={{ height: `${rowHeight}px` }}
                >
                  {/* Course name label — sticky */}
                  <td
                    className="sticky start-0 z-10 border-e border-b border-border/15 bg-card px-2"
                    style={{ width: `${labelWidth}px` }}
                  >
                    <div className="flex items-center gap-1.5">
                      <div
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: event.color }}
                      />
                      <span className="text-[11px] font-medium text-foreground/70 truncate leading-tight">
                        {event.courseName}
                      </span>
                    </div>
                  </td>

                  {/* Day cells */}
                  {days.map((d, colIdx) => {
                    const isMoedA = colIdx === moedACol;
                    const isMoedB = colIdx === moedBCol;
                    // Is this cell between moedA and moedB?
                    const isBetween =
                      moedACol !== undefined &&
                      moedBCol !== undefined &&
                      colIdx > moedACol &&
                      colIdx < moedBCol;

                    return (
                      <td
                        key={colIdx}
                        className={cn(
                          "border-e border-b border-border/8 relative",
                          d.isToday && "bg-foreground/[0.03]",
                          d.isWeekend && !isMoedA && !isMoedB && "bg-foreground/[0.01]",
                          isBetween && "bg-opacity-50",
                        )}
                        style={{
                          width: `${dayWidth}px`,
                          ...(isBetween ? { backgroundColor: `${event.color}06` } : {}),
                        }}
                      >
                        {/* Moed A cell */}
                        {isMoedA && (
                          <div
                            className={cn(
                              "absolute inset-1 flex items-center justify-center rounded-md text-[10px] font-bold cursor-default",
                              hasConflict ? "ring-1 ring-red-500/60" : "",
                            )}
                            style={{
                              backgroundColor: `${event.color}25`,
                              color: event.color,
                              borderBottom: `2px solid ${event.color}`,
                            }}
                            title={`${event.courseName} — ${isHe ? "מועד א׳" : "Moed A"}: ${formatDateFull(event.moedA!, locale)}`}
                          >
                            A
                            {hasConflict && (
                              <AlertTriangle className="absolute -top-1 -end-1 h-2.5 w-2.5 text-red-500" />
                            )}
                          </div>
                        )}

                        {/* Moed B cell */}
                        {isMoedB && (
                          <div
                            className="absolute inset-1 flex items-center justify-center rounded-md text-[10px] font-medium cursor-default border border-dashed"
                            style={{
                              backgroundColor: `${event.color}10`,
                              color: `${event.color}99`,
                              borderColor: `${event.color}40`,
                            }}
                            title={`${event.courseName} — ${isHe ? "מועד ב׳" : "Moed B"}: ${formatDateFull(event.moedB!, locale)}`}
                          >
                            B
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-foreground/30">
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-4 rounded-sm bg-foreground/15 flex items-center justify-center text-[10px] font-bold text-foreground/50">A</div>
          <span>{isHe ? "מועד א׳" : "Moed A"}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-4 rounded-sm border border-dashed border-foreground/20 flex items-center justify-center text-[10px] text-foreground/30">B</div>
          <span>{isHe ? "מועד ב׳" : "Moed B"}</span>
        </div>
        {conflictDays.size > 0 && (
          <div className="flex items-center gap-1">
            <AlertTriangle className="h-2.5 w-2.5 text-red-500" />
            <span className="text-red-500">{isHe ? "התנגשות" : "Conflict"}</span>
          </div>
        )}
      </div>

      {/* Tight gap warnings */}
      {tightGaps.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500/60" />
          <div className="text-xs leading-relaxed text-amber-600/70">
            {isHe
              ? `${tightGaps.length} זוג/ות מבחנים עם פחות מ-3 ימים ביניהם`
              : `${tightGaps.length} exam pair(s) with less than 3 days gap`
            }
          </div>
        </div>
      )}
    </div>
  );
}
