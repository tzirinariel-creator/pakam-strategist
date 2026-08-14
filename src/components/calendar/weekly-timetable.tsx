"use client";

import { useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";
import { useTranslations, useLocale } from "next-intl";
import { AlertTriangle, MapPin, Repeat, User } from "lucide-react";
import { courseColor } from "@/lib/course-color";
import { sessionTypeNameFor } from "@/lib/group-options";
import { cn } from "@/lib/utils";
import {
  dedupeMeetings,
  findConflictPairs,
  conflictIds as conflictIdsOf,
  conflictPartners as conflictPartnersOf,
  describeConflictPair,
  describeConflictPartner,
  formatHourRange,
  type ConflictCandidate,
} from "@/lib/timetable-conflicts";
import type { Discipline, DayOfWeek } from "@/types/enums";
import { hhmmToHours } from "@/lib/time-of-day";

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
  /** Optional — only the planner/calendar paths carry them. Both feed the
   *  on-grid detail card, which is the whole point of holding the real ידיעון. */
  groupCode?: string | null;
  lecturerName?: string | null;
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
  groupCode: string | null;
  lecturerName: string | null;
  startTimeStr: string;
  endTimeStr: string;
}

interface WeeklyTimetableProps {
  sessions: ScheduleSessionData[];
  /** Hover-preview sessions (#2): rendered as DASHED ghost blocks — "כאן יהיה
   *  משהו" per the design line — excluded from conflicts and the stats bar.
   *  Desktop-grid only (hover has no mobile equivalent; the agenda skips it). */
  previewSessions?: ScheduleSessionData[];
  /** On-grid group picking (#2). When true, blocks whose courseCode is in
   *  `multiGroupCourseCodes` become the tap target that fires `onPickGroup`.
   *  When absent, the timetable stays purely read-only (unchanged path). */
  interactive?: boolean;
  /** Fired when the student taps a swappable course block. The caller opens the
   *  GroupPickerPopover for this course, anchored to `anchor` — the element that
   *  was actually tapped, so the picker lands next to it instead of at the
   *  middle of a very tall agenda list. */
  onPickGroup?: (courseCode: string, anchor: HTMLElement) => void;
  /** Course codes that offer a tutorial/lab group CHOICE — only these are
   *  tappable (a single-group course has nothing to pick). */
  multiGroupCourseCodes?: Set<string>;
  /** `courseCode|sessionType` (lowercased) pairs whose group on this grid is
   *  the app's DEFAULT — the student never picked it. Those blocks are drawn
   *  dashed and labelled "ברירת מחדל" instead of stating "תרגול · קבוצה 03" as
   *  settled fact. Without this the grid presented our guess and the student's
   *  decision in exactly the same ink. */
  defaultedGroupKeys?: Set<string>;
  /** Editor context (#2): switch agenda→grid already at @lg (~512px) instead
   *  of @2xl, so a 1280px laptop with the sidebar open still sees a SCHEDULE
   *  in the planning rail — not a list. */
  preferGrid?: boolean;
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

// The visible window. It is the FLOOR, not the ceiling: `useHourWindow` widens
// it when a real meeting falls outside, so an 08:00 lab or a 20:00–22:00 seminar
// is never silently clipped off the bottom of the box.
const DEFAULT_HOURS_START = 8;
const DEFAULT_HOURS_END = 20;
const MIN_HOUR = 6;
const MAX_HOUR = 23;

// Density, measured against TauPlan (13.8/2026): their row is 40px and the whole
// teaching week therefore lands in one 600px card with no scrolling — that, more
// than any colour, is what makes their grid feel calm. Ours was 64px, so a 12-hour
// week ran to 768px and always spilled past the fold. 48px is the compromise: the
// week fits on one screen, and a Hebrew course name still gets two readable lines.
const ROW_HEIGHT = 48; // px per hour
const TIME_COL_WIDTH = 48; // px
const HEADER_HEIGHT = 40; // px
/** Width of the hover/focus detail card, and the room it may need to grow. */
const DETAIL_WIDTH = 232; // px
/** Worst observed card (2-line name + lecturer + room + two clash lines). The
 *  grid box clips overflow, so the card anchors by its TOP in the upper half of
 *  the week and by its BOTTOM in the lower half — either way it grows into the
 *  ~288px of clear space on the other side and is never cut off. */
const DETAIL_MAX_HEIGHT = 280; // px
/** More clashes than this in one card and it stops being readable. */
const DETAIL_MAX_CONFLICT_LINES = 2;

// ─── Helpers ────────────────────────────────────────────────────────



function sessionsToSlots(sessions: ScheduleSessionData[], locale: string): TimeSlot[] {
  return sessions.map((s) => ({
    day: DAY_MAP[s.dayOfWeek],
    startHour: hhmmToHours(s.startTime),
    endHour: hhmmToHours(s.endTime),
    courseId: s.id,
    courseName: locale === "he" ? s.course.nameHe : (s.course.nameEn ?? s.course.nameHe),
    courseCode: s.course.code,
    discipline: s.course.discipline as Discipline,
    credits: s.course.credits,
    room: s.room,
    building: s.building,
    sessionType: s.sessionType,
    groupCode: s.groupCode ?? null,
    lecturerName: s.lecturerName ?? null,
    startTimeStr: s.startTime,
    endTimeStr: s.endTime,
  }));
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

export function WeeklyTimetable({
  sessions,
  previewSessions,
  preferGrid,
  interactive,
  onPickGroup,
  multiGroupCourseCodes,
  defaultedGroupKeys,
}: WeeklyTimetableProps) {
  const t = useTranslations("calendar");
  const locale = useLocale();
  const isRTL = locale === "he";
  const isHe = locale === "he";

  // Which block's detail card is open (hover on a pointer device, focus on a
  // keyboard). One at a time; `null` = nothing open.
  const [detailId, setDetailId] = useState<string | null>(null);

  // Keep Sun–Fri (0–5); Saturday (6) is always excluded. Friday is included so its
  // sessions count toward conflicts AND stats and are never silently dropped — the
  // Friday column/section only renders when at least one Friday session exists.
  // `dedupeMeetings` first: the catalog holds true duplicate rows for a handful
  // of meetings, and painting them twice both halved the column and made the
  // meeting "clash with itself" (see the module's note).
  const slots = useMemo(
    () =>
      sessionsToSlots(dedupeMeetings(sessions), locale).filter(
        (s) => s.day >= 0 && s.day <= 5,
      ),
    [sessions, locale]
  );

  // Conflicts, from the shared pure module. We no longer stop at "there is a
  // clash": every clashing block knows WHICH course it clashes with, on what
  // day, for exactly which minutes — the sentence a student can act on, and the
  // thing neither TauPlan nor bid-it does at all.
  const conflictPairs = useMemo(
    () =>
      findConflictPairs(
        slots.map<ConflictCandidate>((s) => ({
          id: s.courseId,
          day: s.day,
          startHour: s.startHour,
          endHour: s.endHour,
          courseCode: s.courseCode,
          courseName: s.courseName,
        })),
      ),
    [slots],
  );
  const conflictIds = useMemo(() => conflictIdsOf(conflictPairs), [conflictPairs]);
  const conflictPartners = useMemo(
    () => conflictPartnersOf(conflictPairs),
    [conflictPairs],
  );

  const layoutSlots = useMemo(() => computeOverlapLayout(slots), [slots]);
  // Ghost layer — separate pipeline, never feeds conflicts/stats.
  const previewSlots = useMemo(
    () =>
      sessionsToSlots(dedupeMeetings(previewSessions ?? []), locale).filter(
        (s) => s.day >= 0 && s.day <= 5,
      ),
    [previewSessions, locale]
  );

  // The visible hour window — the 8–20 default, widened only by real meetings
  // (previews included, or a ghost block would land outside the box).
  const { hoursStart, hoursEnd } = useMemo(() => {
    let lo = DEFAULT_HOURS_START;
    let hi = DEFAULT_HOURS_END;
    for (const s of [...slots, ...previewSlots]) {
      if (Number.isFinite(s.startHour)) lo = Math.min(lo, Math.floor(s.startHour));
      if (Number.isFinite(s.endHour)) hi = Math.max(hi, Math.ceil(s.endHour));
    }
    return {
      hoursStart: Math.max(MIN_HOUR, lo),
      hoursEnd: Math.min(MAX_HOUR, Math.max(hi, lo + 1)),
    };
  }, [slots, previewSlots]);
  const hours = useMemo(
    () => Array.from({ length: hoursEnd - hoursStart }, (_, i) => i + hoursStart),
    [hoursStart, hoursEnd],
  );
  const gridHeight = (hoursEnd - hoursStart) * ROW_HEIGHT;

  // Current time
  const now = new Date();
  const currentDay = now.getDay(); // 0=Sun
  const currentHour = now.getHours() + now.getMinutes() / 60;

  // Show Sun–Thu by default (standard Israeli academic week); add Friday only when
  // there's at least one Friday session, so we never render an always-empty column.
  const hasFriday = useMemo(() => slots.some((s) => s.day === 5), [slots]);
  const dayOrder: TimeSlot["day"][] = hasFriday ? [0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4];
  const dayCount = dayOrder.length;
  const colWidthPct = 100 / dayCount;

  const isWeekday = dayOrder.includes(currentDay as TimeSlot["day"]);
  const isInTimeRange = currentHour >= hoursStart && currentHour <= hoursEnd;

  // Stats — derived from the rendered slots so counts match what's shown.
  const totalSessions = slots.length;
  const uniqueCourses = new Set(slots.map((s) => s.courseCode)).size;
  const totalHours = slots.reduce((sum, s) => sum + (s.endHour - s.startHour), 0);

  const dayLabel = (day: number) => {
    const key = DAY_KEYS[day];
    return key != null ? t(`days.${key}`) : "";
  };

  // ONE label source (lib/group-options). The messages files carried a second
  // copy of these six words, which is how `tutorial` came to be spelled two
  // different ways across the app (deferred-3).
  const typeLabel = (sessionType: string) => sessionTypeNameFor(sessionType, isHe);

  /** "תרגול · קבוצה 05" — the line TauPlan shows, plus the word for the group. */
  const typeAndGroup = (slot: TimeSlot) =>
    slot.groupCode
      ? `${typeLabel(slot.sessionType)} · ${isHe ? "קבוצה" : "group"} ${slot.groupCode}`
      : typeLabel(slot.sessionType);

  /** Is this block here because the student chose it, or because we defaulted? */
  const isDefaultedSlot = (slot: TimeSlot) =>
    defaultedGroupKeys?.has(`${slot.courseCode}|${(slot.sessionType ?? "").toLowerCase()}`) ?? false;

  const defaultedLabel = isHe ? "ברירת מחדל" : "our default";

  // The plain sentences behind the clash markers, capped so a badly-built week
  // doesn't turn the top of the page into a wall of red.
  const conflictLines = useMemo(
    () =>
      conflictPairs.map((p) => ({
        key: `${p.aId}|${p.bId}`,
        ...describeConflictPair(p, dayLabel(p.day), isHe),
      })),
    // dayLabel/isHe come from the translation hooks; `t` is stable per locale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conflictPairs, isHe, locale],
  );
  const shownConflictLines = conflictLines.slice(0, 3);

  const detailSlot = useMemo(
    () => layoutSlots.find((s) => s.courseId === detailId) ?? null,
    [layoutSlots, detailId],
  );

  return (
    // @container: the agenda↔grid switch below keys off THIS element's width,
    // not the viewport — so the same component shows a readable day-agenda in the
    // narrow planner rail (~380px) and the full grid on a wide calendar page,
    // instead of cramming 5 columns into a sliver (#14/#18).
    <div className="@container flex flex-col gap-3">
      {/* Summary line. Was a bordered card with pipe dividers and a red pill —
          four competing boxes stacked above a grid that already had plenty.
          TauPlan carries ONE number ("סך השעות: 14") at 70% opacity beside the
          semester tabs; this is the same restraint, with our extra counts. */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
        <span>
          <span className="font-semibold text-foreground/70 tabular-nums">
            {Math.round(totalHours)}
          </span>{" "}
          {t("hrsPerWeek")}
        </span>
        <span aria-hidden className="text-border">·</span>
        <span>
          <span className="font-semibold text-foreground/70 tabular-nums">{uniqueCourses}</span>{" "}
          {t("coursesCount")}
        </span>
        <span aria-hidden className="text-border">·</span>
        <span>
          <span className="font-semibold text-foreground/70 tabular-nums">{totalSessions}</span>{" "}
          {t("sessionsCount")}
        </span>
      </div>

      {/* Named clashes. The competitors detect none at all (TauPlan silently
          splits the column in two), and our own old copy was the bare word
          "חפיפות" — the student saw red and still had to guess which two
          courses and when. One quiet row, full sentences, no icon per line. */}
      {conflictLines.length > 0 && (
        <div className="flex gap-2 rounded-lg border border-red-500/25 bg-red-500/[0.05] px-3 py-2">
          <AlertTriangle className="mt-px size-3.5 shrink-0 text-red-500/80" />
          <ul className="min-w-0 flex-1 space-y-0.5 text-[11px] leading-relaxed text-red-700/90 dark:text-red-300/90">
            {shownConflictLines.map((line) => (
              <li key={line.key} className="truncate">
                {line.lead}{" "}
                <bdi dir="ltr" className="tabular-nums">{line.range}</bdi>
              </li>
            ))}
            {conflictLines.length > shownConflictLines.length && (
              <li className="text-red-700/60 dark:text-red-300/60">
                {isHe
                  ? `ועוד ${conflictLines.length - shownConflictLines.length} חפיפות`
                  : `and ${conflictLines.length - shownConflictLines.length} more`}
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Agenda — vertical list grouped by day. Shown when the CONTAINER is
          narrow (planner rail / phone), hidden once there's room for the grid.
          This is the one place we are already ahead of TauPlan, which keeps six
          56px columns at 375px and clips every course name. */}
      <div className={cn("flex flex-col gap-2.5", preferGrid ? "@lg:hidden" : "@2xl:hidden")}>
        {dayOrder.map((dayIdx) => {
          const dayKey = DAY_KEYS[dayIdx];
          const isToday = dayIdx === currentDay;
          const daySlots = slots
            .filter((s) => s.day === dayIdx)
            .sort((a, b) => a.startHour - b.startHour);
          // Ghost previews for this day (#2) — the agenda variant must show
          // them too, or narrow containers lose the hover-preview entirely.
          const dayPreviews = previewSlots
            .filter((s) => s.day === dayIdx)
            .sort((a, b) => a.startHour - b.startHour);

          return (
            <div
              key={`agenda-${dayIdx}`}
              className="overflow-hidden rounded-lg border border-border bg-card"
            >
              <div
                className={cn(
                  "relative flex items-center justify-between border-b border-border bg-muted/40 px-3 py-1.5 text-[13px] font-semibold",
                  isToday ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <span>{dayKey != null ? t(`days.${dayKey}`) : ""}</span>
                {daySlots.length > 0 && (
                  <span className="text-[11px] font-normal tabular-nums text-muted-foreground/60">
                    {daySlots.length}
                  </span>
                )}
                {isToday && (
                  <span
                    aria-hidden
                    className="absolute inset-x-0 bottom-0 h-0.5 bg-accent-brand/70"
                  />
                )}
              </div>

              {daySlots.length === 0 && dayPreviews.length === 0 ? (
                <div className="px-3 py-2.5 text-xs text-muted-foreground/40">—</div>
              ) : (
                <ul className="divide-y divide-border/50">
                  {daySlots.map((slot) => {
                    // ONE colour per course, keyed on the code — the same value
                    // the plan card and the grid block use. Was the discipline
                    // colour, which made the agenda row and the card disagree.
                    const color = courseColor(slot.courseCode);
                    const partners = conflictPartners.get(slot.courseId) ?? [];
                    const locationText = [slot.building, slot.room].filter(Boolean).join(", ");
                    const canPick =
                      interactive && !!onPickGroup && (multiGroupCourseCodes?.has(slot.courseCode) ?? false);

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
                        <bdi
                          dir="ltr"
                          className="mt-0.5 shrink-0 text-[11px] leading-tight tabular-nums text-muted-foreground/80"
                        >
                          {slot.startTimeStr}
                          <br />
                          {slot.endTimeStr}
                        </bdi>
                        <div className="flex min-w-0 flex-1 flex-col">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold text-foreground/90">
                              {slot.courseName}
                            </span>
                            {canPick && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onPickGroup!(slot.courseCode, e.currentTarget);
                                }}
                                className="flex min-h-[32px] shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-foreground/55 transition-colors hover:bg-foreground/5 hover:text-accent-brand"
                                title={isHe ? "החלף קבוצה" : "Change group"}
                                aria-label={isHe ? "החלף קבוצה" : "Change group"}
                              >
                                <Repeat className="size-3" />
                                <span>{isHe ? "החליפו קבוצה" : "Swap group"}</span>
                              </button>
                            )}
                          </div>
                          <span className="truncate text-[11px] text-muted-foreground">
                            {slot.courseCode} · {typeAndGroup(slot)}
                            {isDefaultedSlot(slot) && (
                              <span className="text-amber-700 dark:text-amber-400">
                                {` · ${defaultedLabel}`}
                              </span>
                            )}
                          </span>
                          {slot.lecturerName && (
                            <span className="mt-0.5 truncate text-[11px] text-muted-foreground">
                              {slot.lecturerName}
                            </span>
                          )}
                          {locationText && (
                            <span className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                              <MapPin className="size-3 shrink-0 opacity-60" />
                              {locationText}
                            </span>
                          )}
                          {partners.map((p) => {
                            const d = describeConflictPartner(p, dayLabel(p.day), isHe);
                            return (
                              <span
                                key={p.otherId}
                                className="mt-1 text-[11px] font-medium text-red-600 dark:text-red-400"
                              >
                                {d.lead}{" "}
                                <bdi dir="ltr" className="tabular-nums">{d.range}</bdi>
                              </span>
                            );
                          })}
                        </div>
                      </li>
                    );
                  })}
                  {/* Ghost rows — the hovered pool course, dashed, before the click (#2) */}
                  {dayPreviews.map((slot) => {
                    const color = courseColor(slot.courseCode);
                    return (
                      <li
                        key={`preview-${slot.courseId}`}
                        className="flex gap-2.5 border-2 border-dashed px-3 py-2.5 opacity-75"
                        style={{ borderColor: color }}
                      >
                        <bdi dir="ltr" className="mt-0.5 shrink-0 text-[11px] leading-tight tabular-nums text-muted-foreground/80">
                          {slot.startTimeStr}
                          <br />
                          {slot.endTimeStr}
                        </bdi>
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm font-semibold text-foreground/70">
                            {slot.courseName}
                          </span>
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

      {/* Timetable grid — shown once the CONTAINER is wide enough to fit the
          columns without shrinking them into unreadable slivers. */}
      <div className={cn("hidden overflow-hidden rounded-lg border border-border bg-card", preferGrid ? "@lg:block" : "@2xl:block")}>
        <div className="w-full">
          {/* Day headers — one soft tint, one weight, no filled "today" block. */}
          <div
            className="flex border-b border-border bg-muted/40"
            style={{ paddingInlineStart: `${TIME_COL_WIDTH}px` }}
          >
            {dayOrder.map((dayIdx) => {
              const dayKey = DAY_KEYS[dayIdx];
              const isToday = dayIdx === currentDay;
              return (
                <div
                  key={dayIdx}
                  className={cn(
                    "relative flex flex-1 items-center justify-center text-[13px] font-semibold",
                    isToday ? "text-foreground" : "text-muted-foreground",
                  )}
                  style={{ height: `${HEADER_HEIGHT}px` }}
                >
                  {dayKey != null ? t(`days.${dayKey}`) : ""}
                  {/* "Today" is a 2px rule under the name, not a filled cell —
                      a tinted column head read as a selected state. */}
                  {isToday && (
                    <span
                      aria-hidden
                      className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-accent-brand/70"
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Body: time labels + grid + course blocks */}
          <div className="relative flex">
            {/* Time labels column — muted, top-aligned against their own hour
                line, the way TauPlan sets them (measured: slate-400, top of row). */}
            <div
              className="shrink-0 border-e border-border bg-muted/20"
              style={{ width: `${TIME_COL_WIDTH}px` }}
            >
              {hours.map((hour) => (
                <div
                  key={hour}
                  className="flex items-start justify-center border-b border-border pt-1 text-[11px] font-medium tabular-nums text-muted-foreground/70"
                  style={{ height: `${ROW_HEIGHT}px` }}
                >
                  <bdi dir="ltr">{String(hour).padStart(2, "0")}:00</bdi>
                </div>
              ))}
            </div>

            {/* Grid area */}
            <div className="relative flex-1" style={{ height: `${gridHeight}px` }}>
              {/* ONE hairline, one weight, everywhere. The old grid drew three
                  different rules at once — solid hour lines at /30, dashed
                  half-hour lines at /15 and vertical dividers at /20 — which is
                  most of why the empty grid read as noisy rather than as a table.
                  The dashed half-hour rules are gone entirely; the block itself
                  carries its exact time. */}
              {hours.map((hour) => (
                <div
                  key={`line-${hour}`}
                  className="absolute start-0 end-0 border-b border-border"
                  style={{ top: `${(hour - hoursStart) * ROW_HEIGHT}px` }}
                />
              ))}

              {/* Vertical day dividers — same hairline as the hour lines. */}
              {dayOrder.slice(1).map((_, idx) => (
                <div
                  key={`vline-${idx + 1}`}
                  className="absolute top-0 bottom-0 border-e border-border"
                  style={{ insetInlineStart: `${((idx + 1) / dayCount) * 100}%` }}
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
                      insetInlineStart: `${(colIndex / dayCount) * 100}%`,
                      width: `${colWidthPct}%`,
                    }}
                  />
                );
              })()}

              {/* Current time indicator. Was a 2px RED line with a red dot — the
                  same colour the grid uses for a clash, so "it is 14:20" and
                  "these two courses collide" shouted in one voice. Red is now
                  reserved for conflicts; the clock speaks in the brand accent. */}
              {isWeekday && isInTimeRange && (
                <div
                  className="pointer-events-none absolute z-30 start-0 end-0"
                  style={{ top: `${(currentHour - hoursStart) * ROW_HEIGHT}px` }}
                >
                  <div className="relative flex items-center">
                    <div className="absolute start-0 size-1.5 rounded-full bg-accent-brand" />
                    <div className="h-px w-full bg-accent-brand/50" />
                  </div>
                </div>
              )}

              {/* Preview ghost blocks (#2) — dashed, discipline-tinted border,
                  transparent fill, on top of real blocks but click-through. */}
              {previewSlots.map((slot) => {
                const colIndex = dayOrder.indexOf(slot.day);
                if (colIndex === -1) return null;
                const topPx = Math.round((slot.startHour - hoursStart) * ROW_HEIGHT);
                const heightPx = Math.round((slot.endHour - slot.startHour) * ROW_HEIGHT);
                const color = courseColor(slot.courseCode);
                return (
                  <div
                    key={`preview-${slot.courseId}`}
                    className="pointer-events-none absolute z-20 flex flex-col overflow-hidden rounded-md border border-dashed p-1.5 opacity-80"
                    style={{
                      top: `${topPx + 1}px`,
                      height: `${heightPx - 2}px`,
                      insetInlineStart: `calc(${(colIndex / dayCount) * 100}% + 1px)`,
                      width: `calc(${colWidthPct}% - 2px)`,
                      borderColor: color,
                    }}
                  >
                    <span className="truncate text-[11px] font-semibold leading-tight text-foreground/70">
                      {slot.courseName}
                    </span>
                    <bdi dir="ltr" className="truncate text-[11px] tabular-nums text-muted-foreground">
                      {formatHourRange(slot.startHour, slot.endHour)}
                    </bdi>
                  </div>
                );
              })}

              {/* Course blocks — flat fill, one hairline border in the course's
                  own hue, 6px radius, nearly flush with the column. No 3px
                  accent bar, no drop shadow, no brightness jump on hover: those
                  five effects on every block were the "busy" in "busy and
                  broken". Colour identity now comes from the fill + border, the
                  way TauPlan's does (measured: bg-blue-100 / border-blue-700 at
                  10% / rounded-md / no shadow). */}
              {layoutSlots.map((slot) => {
                const colIndex = dayOrder.indexOf(slot.day);
                if (colIndex === -1) return null;

                const topPx = Math.round((slot.startHour - hoursStart) * ROW_HEIGHT);
                const heightPx = Math.round((slot.endHour - slot.startHour) * ROW_HEIGHT);

                const slotWidthPct = colWidthPct / slot.totalOverlap;
                const basePct = (colIndex / dayCount) * 100;
                const subCol = isRTL
                  ? (slot.totalOverlap - 1 - slot.subColumn)
                  : slot.subColumn;
                const slotLeftPct = basePct + subCol * slotWidthPct;

                const hasConflict = conflictIds.has(slot.courseId);
                const isDefaulted = isDefaultedSlot(slot);
                const color = courseColor(slot.courseCode);

                const locationText = [slot.building, slot.room]
                  .filter(Boolean)
                  .join(", ");

                const isNarrow = slot.totalOverlap > 1;
                const isShort = heightPx < ROW_HEIGHT;
                const canPickGroup =
                  interactive &&
                  !!onPickGroup &&
                  (multiGroupCourseCodes?.has(slot.courseCode) ?? false);

                const openPicker = (anchor: HTMLElement) => {
                  onPickGroup!(slot.courseCode, anchor);
                };

                return (
                  <div
                    key={slot.courseId}
                    className={cn(
                      "absolute z-10 flex flex-col overflow-hidden rounded-md border transition-colors",
                      isNarrow ? "p-1" : "p-1.5",
                      canPickGroup && "cursor-pointer",
                      "hover:z-20 focus-visible:z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-brand/60",
                    )}
                    style={{
                      top: `${topPx + 1}px`,
                      height: `${heightPx - 2}px`,
                      insetInlineStart: `calc(${slotLeftPct}% + 1px)`,
                      width: `calc(${slotWidthPct}% - 2px)`,
                      backgroundColor: `color-mix(in srgb, ${color} 14%, var(--card))`,
                      // A clash keeps the same calm shape and only changes the
                      // hairline's colour — no ring, no offset, no halo.
                      borderColor: hasConflict
                        ? "rgba(239, 68, 68, 0.7)"
                        : `color-mix(in srgb, ${color} 40%, transparent)`,
                      // Dashed = "we put this here, you didn't". The one visual
                      // difference between our guess and the student's decision.
                      borderStyle: isDefaulted ? "dashed" : "solid",
                    }}
                    onMouseEnter={() => setDetailId(slot.courseId)}
                    onMouseLeave={() => setDetailId((cur) => (cur === slot.courseId ? null : cur))}
                    onFocus={() => setDetailId(slot.courseId)}
                    onBlur={() => setDetailId((cur) => (cur === slot.courseId ? null : cur))}
                    {...(canPickGroup
                      ? {
                          role: "button",
                          tabIndex: 0,
                          "aria-label": isHe
                            ? `${slot.courseName} — החליפו קבוצה`
                            : `${slot.courseName} — swap group`,
                          onClick: (e: MouseEvent<HTMLDivElement>) =>
                            openPicker(e.currentTarget),
                          onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openPicker(e.currentTarget);
                            }
                          },
                        }
                      : { tabIndex: 0 })}
                  >
                    {/* Course name + the swap affordance, INLINE. The old
                        affordance was a pill floating on top of the block with
                        its own ring and shadow, permanently visible on every
                        multi-group course — it covered the name it sat on. */}
                    <div className="flex items-start gap-1">
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate font-semibold leading-tight text-foreground/90",
                          isNarrow || isShort ? "text-[11px]" : "text-xs",
                        )}
                      >
                        {slot.courseName}
                      </span>
                      {canPickGroup && (
                        <Repeat
                          aria-hidden
                          className="mt-px size-3 shrink-0 text-foreground/35"
                        />
                      )}
                    </div>

                    {/* Type + group — TauPlan's second line, plus the group word.
                        `text-foreground/70`, not `text-muted-foreground`:
                        measured live on the tinted block, muted grey came in at
                        3.97:1 against the fill (11px normal weight needs 4.5).
                        The tint is what costs it, so the fix belongs on the
                        block, not on the token. */}
                    {!isShort && (
                      <span className="mt-0.5 truncate text-[11px] text-foreground/70">
                        {isNarrow ? typeLabel(slot.sessionType) : typeAndGroup(slot)}
                        {isDefaulted && (
                          <span className="text-amber-700 dark:text-amber-400">
                            {` · ${defaultedLabel}`}
                          </span>
                        )}
                      </span>
                    )}

                    {/* Bottom row: location + time */}
                    {heightPx >= ROW_HEIGHT * 1.5 && !isNarrow && (
                      <div className="mt-auto flex flex-col gap-0.5">
                        {locationText && (
                          <span className="flex items-center gap-1 truncate text-[11px] text-foreground/70">
                            <MapPin className="size-2.5 shrink-0 opacity-60" />
                            {locationText}
                          </span>
                        )}
                        <bdi dir="ltr" className="text-[11px] tabular-nums text-foreground/65">
                          {formatHourRange(slot.startHour, slot.endHour)}
                        </bdi>
                      </div>
                    )}

                    {/* Narrow block: just the start time */}
                    {isNarrow && !isShort && (
                      <bdi dir="ltr" className="mt-auto text-[11px] tabular-nums text-foreground/65">
                        {slot.startTimeStr}
                      </bdi>
                    )}
                  </div>
                );
              })}

              {/* Detail card — hover on a pointer device, focus on a keyboard.
                  TauPlan shows NOTHING on hover (verified 13.8), and neither
                  did we beyond a native `title` tooltip that arrives after half
                  a second, is unstyled and cannot hold the clash sentence. This
                  is where the real ידיעון pays off: full name, group, lecturer,
                  room and exact hours, plus what the block collides with.
                  `pointer-events-none` so it can never swallow a click. */}
              {detailSlot && (() => {
                const colIndex = dayOrder.indexOf(detailSlot.day);
                if (colIndex === -1) return null;
                const color = courseColor(detailSlot.courseCode);
                const topPx = Math.round((detailSlot.startHour - hoursStart) * ROW_HEIGHT);
                const bottomPx = Math.round((detailSlot.endHour - hoursStart) * ROW_HEIGHT);
                // Grow away from the nearer edge — the grid box clips overflow.
                const vert =
                  topPx > gridHeight / 2
                    ? { bottom: `${Math.max(0, gridHeight - bottomPx)}px` }
                    : { top: `${Math.max(0, Math.min(topPx, gridHeight - DETAIL_MAX_HEIGHT))}px` };
                const basePct = (colIndex / dayCount) * 100;
                // Open toward the middle of the grid so the card never runs off
                // the near edge, whichever half the block sits in.
                const towardStart = colIndex >= dayCount / 2;
                const side = towardStart
                  ? { insetInlineEnd: `calc(${100 - basePct}% + 6px)` }
                  : { insetInlineStart: `calc(${basePct + colWidthPct}% + 6px)` };
                const locationText = [detailSlot.building, detailSlot.room]
                  .filter(Boolean)
                  .join(", ");
                const partners = conflictPartners.get(detailSlot.courseId) ?? [];

                return (
                  <div
                    role="tooltip"
                    className="pointer-events-none absolute z-40 flex flex-col gap-1 rounded-lg border border-border bg-card p-2.5 shadow-lg"
                    style={{ width: `${DETAIL_WIDTH}px`, ...vert, ...side }}
                  >
                    <div className="flex items-start gap-1.5">
                      <span
                        aria-hidden
                        className="mt-1 size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-xs font-semibold leading-snug text-foreground">
                        {detailSlot.courseName}
                      </span>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      <bdi dir="ltr" className="tabular-nums">{detailSlot.courseCode}</bdi>
                      {" · "}
                      {typeAndGroup(detailSlot)}
                      {isDefaultedSlot(detailSlot) && (
                        <span className="text-amber-700 dark:text-amber-400">
                          {` · ${defaultedLabel}`}
                        </span>
                      )}
                    </span>
                    <span className="text-[11px] text-foreground/70">
                      {dayLabel(detailSlot.day)}{" "}
                      <bdi dir="ltr" className="tabular-nums">
                        {formatHourRange(detailSlot.startHour, detailSlot.endHour)}
                      </bdi>
                    </span>
                    {detailSlot.lecturerName && (
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <User className="size-2.5 shrink-0 opacity-60" />
                        {detailSlot.lecturerName}
                      </span>
                    )}
                    {locationText && (
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <MapPin className="size-2.5 shrink-0 opacity-60" />
                        {locationText}
                      </span>
                    )}
                    <span className="text-[11px] text-muted-foreground">
                      <bdi dir="ltr" className="tabular-nums">{detailSlot.credits}</bdi>{" "}
                      {isHe ? "ש״ס" : "credits"}
                    </span>
                    {partners.slice(0, DETAIL_MAX_CONFLICT_LINES).map((p) => {
                      const d = describeConflictPartner(p, dayLabel(p.day), isHe);
                      return (
                        <span
                          key={p.otherId}
                          className="mt-0.5 text-[11px] font-medium leading-snug text-red-600 dark:text-red-400"
                        >
                          {d.lead}{" "}
                          <bdi dir="ltr" className="tabular-nums">{d.range}</bdi>
                        </span>
                      );
                    })}
                    {interactive && (multiGroupCourseCodes?.has(detailSlot.courseCode) ?? false) && (
                      <span className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-accent-brand">
                        <Repeat className="size-2.5 shrink-0" />
                        {isHe ? "לחצו להחלפת קבוצה" : "Click to swap group"}
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
