"use client";

import { useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { AlertTriangle, MapPin, Clock } from "lucide-react";
import { DISCIPLINE_CONFIG } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Discipline, DayOfWeek } from "@/types/enums";

// ─── Types ───────────────────────────────────────────────────────────

export interface ScheduleSessionData {
  id: string;
  courseCode: string;
  dayOfWeek: DayOfWeek;
  startTime: string; // "HH:MM"
  endTime: string;   // "HH:MM"
  room: string | null;
  building: string | null;
  sessionType: string; // "lecture" | "tutorial" | "lab"
  course: {
    code: string;
    nameHe: string;
    nameEn: string | null;
    discipline: string;
    credits: number;
  };
}

export interface TimeSlot {
  day: 0 | 1 | 2 | 3 | 4 | 5; // 0=Sunday, 5=Friday
  startHour: number; // fractional: 10.5 = 10:30
  endHour: number;
  courseId: string;
  courseName: string;
  courseCode: string;
  discipline: Discipline;
  credits: number;
  room: string | null;
  building: string | null;
  sessionType: string;
  startTimeStr: string;
  endTimeStr: string;
}

interface WeeklyTimetableProps {
  sessions: ScheduleSessionData[];
}

// ─── Constants ───────────────────────────────────────────────────────

const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday"] as const;

const DAY_MAP: Record<DayOfWeek, TimeSlot["day"]> = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
};

const HOURS_START = 8;
const HOURS_END = 20;
const TOTAL_HOURS = HOURS_END - HOURS_START; // 12
const HOURS = Array.from({ length: TOTAL_HOURS }, (_, i) => i + HOURS_START);
const ROW_HEIGHT = 64; // px per hour — slightly bigger for readability
const TIME_COL_WIDTH = 56; // px
const HEADER_HEIGHT = 44; // px

// ─── Helpers ────────────────────────────────────────────────────────

function parseTime(timeStr: string): number {
  const parts = timeStr.split(":");
  const h = parseInt(parts[0] ?? "0", 10);
  const m = parseInt(parts[1] ?? "0", 10);
  return h + m / 60;
}

function sessionsToSlots(sessions: ScheduleSessionData[], locale: string): TimeSlot[] {
  return sessions.map((s) => ({
    day: DAY_MAP[s.dayOfWeek],
    startHour: parseTime(s.startTime),
    endHour: parseTime(s.endTime),
    courseId: s.id,
    courseName: locale === "he" ? s.course.nameHe : (s.course.nameEn ?? s.course.nameHe),
    courseCode: s.course.code,
    discipline: s.course.discipline as Discipline,
    credits: s.course.credits,
    room: s.room,
    building: s.building,
    sessionType: s.sessionType,
    startTimeStr: s.startTime,
    endTimeStr: s.endTime,
  }));
}

const SESSION_TYPE_KEYS: Record<string, string> = {
  lecture: "lecture",
  tutorial: "tutorial",
  lab: "lab",
};

// ─── Conflict detection ──────────────────────────────────────────────

function detectConflicts(slots: TimeSlot[]): Set<string> {
  const conflictIds = new Set<string>();
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i]!;
      const b = slots[j]!;
      if (
        a.day === b.day &&
        a.startHour < b.endHour &&
        b.startHour < a.endHour
      ) {
        conflictIds.add(a.courseId);
        conflictIds.add(b.courseId);
      }
    }
  }
  return conflictIds;
}

// ─── Overlap layout ─────────────────────────────────────────────────

interface SlotLayout extends TimeSlot {
  subColumn: number;
  totalOverlap: number;
}

function computeOverlapLayout(slots: TimeSlot[]): SlotLayout[] {
  const byDay = new Map<number, TimeSlot[]>();
  for (const slot of slots) {
    const arr = byDay.get(slot.day) ?? [];
    arr.push(slot);
    byDay.set(slot.day, arr);
  }

  const result: SlotLayout[] = [];

  for (const daySlots of byDay.values()) {
    daySlots.sort((a, b) => a.startHour - b.startHour);

    const groups: TimeSlot[][] = [];
    let current: TimeSlot[] = [];
    let maxEnd = -Infinity;

    for (const slot of daySlots) {
      if (current.length === 0 || slot.startHour < maxEnd) {
        current.push(slot);
        maxEnd = Math.max(maxEnd, slot.endHour);
      } else {
        groups.push(current);
        current = [slot];
        maxEnd = slot.endHour;
      }
    }
    if (current.length > 0) groups.push(current);

    for (const group of groups) {
      const n = group.length;
      for (let i = 0; i < n; i++) {
        result.push({ ...group[i]!, subColumn: i, totalOverlap: n });
      }
    }
  }

  return result;
}

// ─── Component ───────────────────────────────────────────────────────

export function WeeklyTimetable({ sessions }: WeeklyTimetableProps) {
  const t = useTranslations("calendar");
  const locale = useLocale();
  const isRTL = locale === "he";

  // Only keep the days the grid actually renders (Sun–Thu). Friday/Saturday slots
  // are excluded from conflicts AND stats so the counts can't disagree with the view.
  const slots = useMemo(
    () =>
      sessionsToSlots(sessions, locale).filter((s) => s.day >= 0 && s.day <= 4),
    [sessions, locale]
  );
  const conflictIds = useMemo(() => detectConflicts(slots), [slots]);
  const layoutSlots = useMemo(() => computeOverlapLayout(slots), [slots]);

  // Current time
  const now = new Date();
  const currentDay = now.getDay(); // 0=Sun
  const currentHour = now.getHours() + now.getMinutes() / 60;
  const isWeekday = currentDay >= 0 && currentDay <= 4;
  const isInTimeRange = currentHour >= HOURS_START && currentHour <= HOURS_END;

  // Show Sun–Thu by default (standard Israeli academic week)
  // Friday sessions are allowed by the type system but filtered from display
  const dayOrder: TimeSlot["day"][] = [0, 1, 2, 3, 4];
  const gridHeight = TOTAL_HOURS * ROW_HEIGHT;

  // Stats — derived from the rendered slots so counts match what's shown.
  const totalSessions = slots.length;
  const uniqueCourses = new Set(slots.map((s) => s.courseCode)).size;
  const totalHours = slots.reduce((sum, s) => sum + (s.endHour - s.startHour), 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Stats bar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border/50 bg-card/50 px-4 py-2.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Clock className="size-3.5" />
          <span className="font-medium">{Math.round(totalHours)}</span>
          <span>{t("hrsPerWeek")}</span>
        </div>
        <div className="hidden h-3 w-px bg-border sm:block" />
        <span>
          <span className="font-medium text-foreground/70">{uniqueCourses}</span>{" "}
          {t("coursesCount")}
        </span>
        <div className="hidden h-3 w-px bg-border sm:block" />
        <span>
          <span className="font-medium text-foreground/70">{totalSessions}</span>{" "}
          {t("sessionsCount")}
        </span>
        {conflictIds.size > 0 && (
          <>
            <div className="hidden h-3 w-px bg-border sm:block" />
            <span className="flex items-center gap-1 text-red-400">
              <AlertTriangle className="size-3" />
              {Math.ceil(conflictIds.size / 2)} {t("conflict")}
            </span>
          </>
        )}
      </div>

      {/* Mobile agenda — vertical list grouped by day (< md) */}
      <div className="flex flex-col gap-3 md:hidden">
        {dayOrder.map((dayIdx) => {
          const dayKey = DAY_KEYS[dayIdx];
          const isToday = dayIdx === currentDay;
          const daySlots = slots
            .filter((s) => s.day === dayIdx)
            .sort((a, b) => a.startHour - b.startHour);

          return (
            <div
              key={`agenda-${dayIdx}`}
              className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
            >
              <div
                className={cn(
                  "flex items-center justify-between border-b border-border px-3 py-2 text-sm font-semibold",
                  isToday ? "bg-foreground/8 text-foreground" : "bg-muted/30 text-muted-foreground",
                )}
              >
                <span>{dayKey != null ? t(`days.${dayKey}`) : ""}</span>
                {daySlots.length > 0 && (
                  <span className="font-mono text-[11px] font-normal text-muted-foreground/70">
                    {daySlots.length}
                  </span>
                )}
              </div>

              {daySlots.length === 0 ? (
                <div className="px-3 py-3 text-xs text-muted-foreground/40">—</div>
              ) : (
                <ul className="divide-y divide-border/40">
                  {daySlots.map((slot) => {
                    const config = DISCIPLINE_CONFIG[slot.discipline];
                    const color = config?.color ?? "hsl(var(--muted-foreground))";
                    const hasConflict = conflictIds.has(slot.courseId);
                    const sessionTypeKey = SESSION_TYPE_KEYS[slot.sessionType];
                    const sessionTypeText = sessionTypeKey ? t(sessionTypeKey) : slot.sessionType;
                    const locationText = [slot.building, slot.room].filter(Boolean).join(", ");

                    return (
                      <li
                        key={slot.courseId}
                        className="flex gap-2.5 px-3 py-2.5"
                        style={{
                          borderInlineStartWidth: "3px",
                          borderInlineStartStyle: "solid",
                          borderInlineStartColor: color,
                          backgroundColor: `color-mix(in srgb, ${color} 7%, var(--card))`,
                        }}
                      >
                        <span
                          className="mt-0.5 shrink-0 font-mono text-[11px] leading-tight text-muted-foreground/80"
                          dir="ltr"
                        >
                          {slot.startTimeStr}
                          <br />
                          {slot.endTimeStr}
                        </span>
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm font-semibold text-foreground/90">
                            {slot.courseName}
                          </span>
                          <span className="truncate text-[11px] text-muted-foreground">
                            {slot.courseCode} · {sessionTypeText}
                          </span>
                          {locationText && (
                            <span className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                              <MapPin className="size-3 shrink-0 opacity-60" />
                              {locationText}
                            </span>
                          )}
                          {hasConflict && (
                            <span className="mt-1 flex w-fit items-center gap-1 rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-bold text-red-400">
                              <AlertTriangle className="size-2.5" />
                              {t("conflict")}
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {/* Timetable grid — md:+ (no horizontal scroll; columns fill the width) */}
      <div className="hidden rounded-xl border border-border bg-card shadow-sm md:block">
        <div className="w-full">
          {/* Day headers */}
          <div
            className="flex border-b border-border bg-muted/30"
            style={{ paddingInlineStart: `${TIME_COL_WIDTH}px` }}
          >
            {dayOrder.map((dayIdx) => {
              const dayKey = DAY_KEYS[dayIdx];
              const isToday = dayIdx === currentDay;
              return (
                <div
                  key={dayIdx}
                  className={cn(
                    "flex flex-1 items-center justify-center text-sm font-semibold transition-colors",
                    isToday
                      ? "bg-foreground/8 text-foreground"
                      : "text-muted-foreground",
                  )}
                  style={{ height: `${HEADER_HEIGHT}px` }}
                >
                  {dayKey != null ? t(`days.${dayKey}`) : ""}
                </div>
              );
            })}
          </div>

          {/* Body: time labels + grid + course blocks */}
          <div className="relative flex">
            {/* Time labels column */}
            <div
              className="shrink-0 border-e border-border/60 bg-muted/20"
              style={{ width: `${TIME_COL_WIDTH}px` }}
            >
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="flex items-start justify-center border-b border-border/30 pt-1.5 font-mono tabular text-[11px] text-muted-foreground/70"
                  style={{ height: `${ROW_HEIGHT}px` }}
                >
                  <span dir="ltr">{String(hour).padStart(2, "0")}:00</span>
                </div>
              ))}
            </div>

            {/* Grid area */}
            <div className="relative flex-1" style={{ height: `${gridHeight}px` }}>
              {/* Horizontal hour lines */}
              {HOURS.map((hour) => (
                <div
                  key={`line-${hour}`}
                  className="absolute start-0 end-0 border-b border-border/30"
                  style={{ top: `${(hour - HOURS_START) * ROW_HEIGHT}px` }}
                />
              ))}

              {/* Half-hour dashed lines */}
              {HOURS.map((hour) => (
                <div
                  key={`half-${hour}`}
                  className="absolute start-0 end-0 border-b border-dashed border-border/15"
                  style={{ top: `${(hour - HOURS_START + 0.5) * ROW_HEIGHT}px` }}
                />
              ))}

              {/* Vertical day dividers */}
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={`vline-${i}`}
                  className="absolute top-0 bottom-0 border-e border-border/20"
                  style={{ insetInlineStart: `${(i / 5) * 100}%` }}
                />
              ))}

              {/* Today column highlight */}
              {isWeekday && (() => {
                const colIndex = dayOrder.indexOf(currentDay as TimeSlot["day"]);
                if (colIndex === -1) return null;
                return (
                  <div
                    className="pointer-events-none absolute top-0 bottom-0 bg-foreground/[0.02]"
                    style={{
                      insetInlineStart: `${(colIndex / 5) * 100}%`,
                      width: "20%",
                    }}
                  />
                );
              })()}

              {/* Current time indicator */}
              {isWeekday && isInTimeRange && (() => {
                const topPx = (currentHour - HOURS_START) * ROW_HEIGHT;

                return (
                  <div
                    className="pointer-events-none absolute z-30 start-0 end-0"
                    style={{ top: `${topPx}px` }}
                  >
                    <div className="relative flex items-center">
                      <div className="absolute start-0 size-2.5 rounded-full bg-red-500 shadow-sm shadow-red-500/30" />
                      <div className="h-[2px] w-full bg-red-500/60" />
                    </div>
                  </div>
                );
              })()}

              {/* Course blocks */}
              {layoutSlots.map((slot) => {
                const config = DISCIPLINE_CONFIG[slot.discipline];
                const colIndex = dayOrder.indexOf(slot.day);
                if (colIndex === -1) return null;

                const topPx = Math.round((slot.startHour - HOURS_START) * ROW_HEIGHT);
                const heightPx = Math.round((slot.endHour - slot.startHour) * ROW_HEIGHT);

                const colWidthPct = 20;
                const slotWidthPct = colWidthPct / slot.totalOverlap;
                const basePct = (colIndex / 5) * 100;
                const subCol = isRTL
                  ? (slot.totalOverlap - 1 - slot.subColumn)
                  : slot.subColumn;
                const slotLeftPct = basePct + subCol * slotWidthPct;

                const hasConflict = conflictIds.has(slot.courseId);
                const color = config?.color ?? "hsl(var(--muted-foreground))";

                const sessionTypeKey = SESSION_TYPE_KEYS[slot.sessionType];
                const sessionTypeText = sessionTypeKey
                  ? t(sessionTypeKey)
                  : slot.sessionType;

                const locationText = [slot.building, slot.room]
                  .filter(Boolean)
                  .join(", ");

                const isNarrow = slot.totalOverlap > 1;
                const isShort = heightPx < ROW_HEIGHT;

                return (
                  <div
                    key={slot.courseId}
                    className={cn(
                      "absolute z-10 flex flex-col overflow-hidden rounded-lg border-s-[3px] transition-all duration-200",
                      "hover:z-20 hover:shadow-lg hover:brightness-105",
                      isNarrow ? "p-1.5" : "p-2",
                      hasConflict && "ring-2 ring-red-400/60 ring-offset-1 ring-offset-card",
                    )}
                    style={{
                      top: `${topPx + 1}px`,
                      height: `${heightPx - 2}px`,
                      insetInlineStart: `calc(${slotLeftPct}% + 2px)`,
                      width: `calc(${slotWidthPct}% - 4px)`,
                      borderInlineStartColor: color,
                      backgroundColor: `color-mix(in srgb, ${color} 12%, var(--card))`,
                    }}
                    title={`${slot.courseName} (${slot.courseCode})\n${slot.startTimeStr} - ${slot.endTimeStr}\n${sessionTypeText}${locationText ? `\n${locationText}` : ""}`}
                  >
                    {/* Course name */}
                    <span
                      className={cn(
                        "truncate font-semibold leading-tight text-foreground/90",
                        isNarrow || isShort ? "text-[10px]" : "text-xs",
                      )}
                    >
                      {slot.courseName}
                    </span>

                    {/* Course code + type */}
                    {!isShort && (
                      <span className={cn(
                        "mt-0.5 truncate text-muted-foreground",
                        isNarrow ? "text-[9px]" : "text-[10px]",
                      )}>
                        {slot.courseCode} · {sessionTypeText}
                      </span>
                    )}

                    {/* Bottom row: location + time */}
                    {heightPx >= ROW_HEIGHT * 1.2 && !isNarrow && (
                      <div className="mt-auto flex flex-col gap-0.5">
                        {locationText && (
                          <span className="flex items-center gap-1 truncate text-[10px] text-muted-foreground">
                            <MapPin className="size-2.5 shrink-0 opacity-60" />
                            {locationText}
                          </span>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[10px] text-muted-foreground/70" dir="ltr">
                            {slot.startTimeStr}–{slot.endTimeStr}
                          </span>
                          {hasConflict && (
                            <span className="flex items-center gap-0.5 rounded bg-red-500/10 px-1 py-0.5 text-[9px] font-bold text-red-400">
                              <AlertTriangle className="size-2.5" />
                              {t("conflict")}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Narrow block: just time */}
                    {isNarrow && !isShort && (
                      <span className="mt-auto font-mono text-[9px] text-muted-foreground/60" dir="ltr">
                        {slot.startTimeStr}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
