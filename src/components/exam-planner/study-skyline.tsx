"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { Flag, AlertTriangle, GraduationCap, Coffee } from "lucide-react";
import type {
  ExamPlanResult,
  ExamRecommendation,
} from "@/lib/exam-planner";
import { cn } from "@/lib/utils";
import { AskKingButton } from "@/components/ui/ask-king-button";

// ─────────────────────────────────────────────────────────────────────
// Study Skyline — a study-spread timeline for the exam planner.
//
// One horizontal day-axis (today → last exam). Each day is a bottom-anchored
// stack of course-colored study blocks; the bar HEIGHT is that day's total
// study hours summed across ALL courses (the engine emits ~1 session/course/
// day, so per-course ramps look flat — but summing courses gives real dynamic
// range). Exams are red pennants. A pinned verdict rail answers the three
// anxiety questions — when to start, how heavy is today, which day is worst —
// without any scrolling. Read-only + pure; renders identically from the live
// client-computed plan (preview) or the persisted plan (committed).
// ─────────────────────────────────────────────────────────────────────

const DIFFICULTY_ALPHA: Record<string, string> = {
  high: "ff",
  medium: "e6",
  low: "b3",
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** LOCAL-midnight day key. MUST be local (not toISOString/UTC): for Israel
 *  (UTC+2/+3) a local-midnight Date serialized as UTC shifts to the previous
 *  day and misaligns a session with its column. Days and sessions must use the
 *  SAME function so they always match. */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, n: number): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() + n);
  return x;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000);
}

const HE_WEEKDAYS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];
const EN_WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

interface CourseBar {
  courseCode: string;
  courseName: string;
  color: string;
  hours: number;
  difficulty: string;
}

interface ExamAnchor {
  courseCode: string;
  courseName: string;
  color: string;
  moed: "A" | "B";
  isClash: boolean;
}

interface DayItem {
  kind: "day";
  date: Date;
  key: string;
  bars: CourseBar[];
  sumHours: number;
  isWeekend: boolean;
  isToday: boolean;
  exams: ExamAnchor[];
  isFirstStudy: boolean;
}

interface RestItem {
  kind: "rest";
  from: Date;
  to: Date;
  count: number;
}

type SkyItem = DayItem | RestItem;

export interface SkylineModel {
  items: SkyItem[];
  maxDayHours: number;
  todayHours: number;
  todayCourses: number;
  peak: { weekday: number; date: Date; hours: number } | null;
  firstExam: { courseName: string; color: string; days: number; moed: "A" | "B" } | null;
  hasOverload: boolean;
  courses: { courseCode: string; courseName: string; color: string; totalHours: number; examDate: Date; moed: "A" | "B" }[];
}

/** Pure, testable: turn an ExamPlanResult into the day-by-day skyline model. */
export function buildSkylineModel(
  plan: ExamPlanResult,
  now: Date = new Date(),
): SkylineModel {
  const today = startOfDay(now);
  const exams = plan.exams
    .slice()
    .sort((a, b) => a.examDate.getTime() - b.examDate.getTime());

  if (exams.length === 0) {
    return {
      items: [], maxDayHours: 0, todayHours: 0, todayCourses: 0,
      peak: null, firstExam: null, hasOverload: false, courses: [],
    };
  }

  // Clash: exams < 3 days apart (mirrors analyzeExamPeriod).
  const clashKeys = new Set<string>();
  for (let i = 1; i < exams.length; i++) {
    if (daysBetween(exams[i - 1]!.examDate, exams[i]!.examDate) < 3) {
      clashKeys.add(dayKey(exams[i - 1]!.examDate));
      clashKeys.add(dayKey(exams[i]!.examDate));
    }
  }

  // Group sessions + exams by local day key.
  const sessionsByDay = new Map<string, Map<string, CourseBar>>();
  for (const s of plan.sessions) {
    const k = dayKey(s.date);
    let m = sessionsByDay.get(k);
    if (!m) sessionsByDay.set(k, (m = new Map()));
    const prev = m.get(s.courseCode);
    if (prev) prev.hours += s.hours;
    else m.set(s.courseCode, { courseCode: s.courseCode, courseName: s.courseName, color: s.color, hours: s.hours, difficulty: s.difficulty });
  }
  const examsByDay = new Map<string, ExamAnchor[]>();
  for (const e of exams) {
    const k = dayKey(e.examDate);
    const list = examsByDay.get(k) ?? [];
    list.push({ courseCode: e.courseCode, courseName: e.courseName, color: e.color, moed: e.moed, isClash: clashKeys.has(k) });
    examsByDay.set(k, list);
  }

  // Walk today → last exam, collapsing runs of ≥3 empty days. Cap generously
  // (90d covers a full exam period incl. a far Moed-B) so a distant exam's
  // study window + pennant are never silently dropped; rest-collapse keeps a
  // long span visually compact.
  const lastExam = exams[exams.length - 1]!.examDate;
  const span = Math.min(90, Math.max(0, daysBetween(today, lastExam)));

  const dayItems: DayItem[] = [];
  let firstStudyMarked = false;
  for (let i = 0; i <= span; i++) {
    const date = addDays(today, i);
    const k = dayKey(date);
    const barMap = sessionsByDay.get(k);
    const bars = barMap ? Array.from(barMap.values()) : [];
    const sumHours = bars.reduce((s, b) => s + b.hours, 0);
    const isFirstStudy = !firstStudyMarked && bars.length > 0;
    if (isFirstStudy) firstStudyMarked = true;
    dayItems.push({
      kind: "day",
      date,
      key: k,
      bars,
      sumHours,
      isWeekend: date.getDay() === 5 || date.getDay() === 6,
      isToday: i === 0,
      exams: examsByDay.get(k) ?? [],
      isFirstStudy,
    });
  }

  // Collapse maximal runs of ≥3 empty (no bars, no exam) days into one rest cell.
  const items: SkyItem[] = [];
  let run: DayItem[] = [];
  const flush = () => {
    if (run.length >= 3) {
      items.push({ kind: "rest", from: run[0]!.date, to: run[run.length - 1]!.date, count: run.length });
    } else {
      items.push(...run);
    }
    run = [];
  };
  for (const d of dayItems) {
    const empty = d.bars.length === 0 && d.exams.length === 0 && !d.isToday;
    if (empty) run.push(d);
    else { flush(); items.push(d); }
  }
  flush();

  const maxDayHours = Math.max(2.5, ...dayItems.map((d) => d.sumHours));
  const todayItem = dayItems[0]!;
  const peakItem = dayItems.filter((d) => d.sumHours > 0).sort((a, b) => b.sumHours - a.sumHours)[0] ?? null;
  const first = exams[0]!;

  return {
    items,
    maxDayHours,
    todayHours: todayItem.sumHours,
    todayCourses: todayItem.bars.length,
    peak: peakItem ? { weekday: peakItem.date.getDay(), date: peakItem.date, hours: peakItem.sumHours } : null,
    firstExam: { courseName: first.courseName, color: first.color, days: Math.max(0, daysBetween(today, first.examDate)), moed: first.moed },
    hasOverload: false, // set by caller from recommendations
    courses: exams.map((e) => ({ courseCode: e.courseCode, courseName: e.courseName, color: e.color, totalHours: e.totalHours, examDate: e.examDate, moed: e.moed })),
  };
}

// ── UI helpers ────────────────────────────────────────────────────────

function moedLabel(moed: "A" | "B", isHe: boolean): string {
  return isHe ? `מועד ${moed === "B" ? "ב׳" : "א׳"}` : `Moed ${moed}`;
}

function countdownClasses(days: number): string {
  if (days <= 0) return "bg-red-500/15 text-red-600";
  if (days <= 2) return "bg-red-500/10 text-red-600";
  if (days <= 7) return "bg-amber-500/10 text-amber-600";
  return "bg-foreground/5 text-foreground/70";
}

/** Natural-Hebrew countdown — never "בעוד 1 ימים". */
function hebCountdown(days: number): string {
  if (days === 1) return "מחר";
  if (days === 2) return "בעוד יומיים";
  return `בעוד ${days} ימים`;
}

// ── Component ─────────────────────────────────────────────────────────

interface StudySkylineProps {
  plan: ExamPlanResult;
  recommendations: ExamRecommendation[];
  isHe: boolean;
  now?: Date;
  /** Day-column click → jump to that day in the agenda (#37). Omitted on the
   *  setup-preview skyline, which stays read-only. */
  onDayClick?: (dayKey: string) => void;
  /** E2′ — drag a course's study bar to another day. When present, bars become
   *  draggable (pointer + keyboard) and day columns become drop targets; the
   *  preview skyline omits it and stays read-only. */
  onMoveCourseDay?: (courseCode: string, fromDayKey: string, toDayKey: string) => void;
}

/** E2′ — a draggable study bar. Always calls the hook (rules of hooks);
 *  `disabled` turns it back into the old inert div. */
function StudyBar({
  id,
  disabled,
  label,
  style,
  className,
  title,
}: {
  id: string;
  disabled: boolean;
  label: string;
  style: React.CSSProperties;
  className: string;
  title: string;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, disabled });
  if (disabled) {
    return <div className={className} style={style} title={title} />;
  }
  return (
    <button
      type="button"
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      aria-label={label}
      title={title}
      className={cn(
        className,
        "cursor-grab touch-none border-0 p-0 outline-none focus-visible:ring-2 focus-visible:ring-accent-brand/60 active:cursor-grabbing",
        isDragging && "opacity-40",
      )}
      style={style}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

/** E2′ — a droppable day column wrapper (bars stack inside). */
function DroppableDay({
  id,
  disabled,
  className,
  style,
  children,
}: {
  id: string;
  disabled: boolean;
  className: string;
  style: React.CSSProperties;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled });
  return (
    <div
      ref={disabled ? undefined : setNodeRef}
      className={cn(className, !disabled && isOver && "ring-2 ring-inset ring-accent-brand/60 bg-accent-brand/[0.06]")}
      style={style}
    >
      {children}
    </div>
  );
}

export function StudySkyline({ plan, recommendations, isHe, now, onDayClick, onMoveCourseDay }: StudySkylineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hoveredCourse, setHoveredCourse] = useState<string | null>(null);
  const [isNarrow, setIsNarrow] = useState(false);

  // E2′ — drag sensors: a small pointer distance so a plain tap still bubbles
  // to the day column's click, plus keyboard dragging (year-board pattern).
  const dragEnabled = !!onMoveCourseDay;
  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 6 } });
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } });
  const keyboardSensor = useSensor(KeyboardSensor);
  const sensors = useSensors(pointerSensor, touchSensor, keyboardSensor);
  const handleDragEnd = (e: DragEndEvent) => {
    const overKey = e.over?.id != null ? String(e.over.id) : null;
    const [fromKey, courseCode] = String(e.active.id).split("::");
    if (overKey && fromKey && courseCode && overKey !== fromKey) {
      onMoveCourseDay?.(courseCode, fromKey, overKey);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setIsNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const model = useMemo(() => {
    const m = buildSkylineModel(plan, now);
    m.hasOverload = recommendations.some((r) => r.kind === "deferB");
    return m;
  }, [plan, recommendations, now]);

  // Layout tokens (phone vs desktop).
  const cellW = isNarrow ? 34 : 48;
  const restW = isNarrow ? 52 : 64;
  const gap = isNarrow ? 6 : 4;
  const usableH = isNarrow ? 118 : 150;
  const cellH = isNarrow ? 150 : 182;
  const pxPerHour = Math.min(40, usableH / model.maxDayHours);

  // Auto-scroll so TODAY sits ~1.5 cells in from the leading edge. RTL sign-
  // flipped exactly like exam-gantt.tsx — getting this wrong flows time the
  // wrong way and lands the student on empty days.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let offset = 0;
    for (const item of model.items) {
      if (item.kind === "day" && item.isToday) break;
      offset += (item.kind === "rest" ? restW : cellW) + gap;
    }
    offset = Math.max(0, offset - 1.5 * (cellW + gap));
    el.scrollLeft = isHe ? -offset : offset;
  }, [model, isHe, cellW, restW, gap]);

  if (model.items.length === 0 || !model.firstExam) return null;

  const { firstExam, peak } = model;

  return (
    // overflow-clip (not hidden): clip doesn't create a scroll container, so
    // the verdict rail's sticky top-0 actually sticks against the viewport.
    // DndContext is inert unless onMoveCourseDay armed the sensors (E2′).
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
    <div className="data-card overflow-clip p-0">
      {/* ── Band 1 · Verdict rail (sticky, never scrolls) ── */}
      <div className="sticky top-0 z-10 flex flex-col gap-2 border-b border-border/60 bg-card/95 p-3 backdrop-blur sm:flex-row sm:items-stretch sm:gap-0">
        {/* Start */}
        <div className="flex items-center gap-2 sm:flex-1 sm:pe-4">
          <Flag className="size-4 shrink-0 text-accent-brand" />
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-foreground/40">{isHe ? "מתחילים מ" : "Start with"}</p>
            <div className="flex items-center gap-1.5">
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: firstExam.color }} />
              <span className="truncate text-sm font-bold text-foreground/85">{firstExam.courseName}</span>
              <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-semibold", countdownClasses(firstExam.days))} dir={isHe ? "rtl" : "ltr"}>
                {firstExam.days <= 0 ? (isHe ? "היום!" : "Today!") : isHe ? hebCountdown(firstExam.days) : `in ${firstExam.days}d`}
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-2 sm:contents">
          {/* Today's load */}
          <div className="flex-1 border-border/60 sm:border-s sm:px-4">
            <p className="text-xs font-medium uppercase tracking-wide text-foreground/40">{isHe ? "העומס היום" : "Today's load"}</p>
            {model.todayHours > 0 ? (
              <p className="text-sm font-bold text-foreground/85" dir={isHe ? "rtl" : "ltr"}>
                {model.todayHours} {isHe ? "שע׳" : "h"}{" "}
                <span className="text-xs font-normal text-foreground/45">
                  · {isHe
                    ? model.todayCourses === 1 ? "קורס אחד" : `${model.todayCourses} קורסים`
                    : `${model.todayCourses} course${model.todayCourses === 1 ? "" : "s"}`}
                </span>
              </p>
            ) : (
              <p className="flex items-center gap-1 text-sm font-bold text-emerald-500">
                <Coffee className="size-3.5" />
                {isHe ? "היום פנוי" : "Free today"}
              </p>
            )}
          </div>

          {/* Peak day */}
          <div className={cn("flex-1 rounded-md border-border/60 sm:border-s sm:px-4", model.hasOverload && "bg-red-400/5")}>
            <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-foreground/40">
              {model.hasOverload && <AlertTriangle className="size-3 text-red-500" />}
              {isHe ? "היום הכי עמוס" : "Heaviest day"}
            </p>
            {peak ? (
              <p className="text-sm font-bold text-foreground/85" dir={isHe ? "rtl" : "ltr"}>
                {isHe ? `יום ${HE_WEEKDAYS[peak.weekday]}׳` : peak.date.toLocaleDateString("en-US", { weekday: "short" })} <span className="text-xs font-normal text-foreground/45">· {peak.hours} {isHe ? "שע׳" : "h"}</span>
              </p>
            ) : (
              <p className="text-sm font-bold text-foreground/45">—</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Band 2 · The skyline ── */}
      <div className="relative">
        <div
          ref={scrollRef}
          tabIndex={0}
          role="region"
          aria-label={isHe ? "ציר הלמידה עד הבחינות" : "Study timeline up to your exams"}
          className="overflow-x-auto px-3 pt-3 focus-visible:outline-2 focus-visible:outline-accent-brand/50"
          style={{ direction: isHe ? "rtl" : "ltr" }}
        >
          <div className="flex items-end" style={{ gap: `${gap}px`, minWidth: "min-content" }}>
            {model.items.map((item, idx) => {
              if (item.kind === "rest") {
                return (
                  <div key={`rest-${idx}`} className="flex shrink-0 flex-col items-center" style={{ width: `${restW}px` }}>
                    <div className="flex items-center justify-center" style={{ height: `${cellH}px` }}>
                      <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-border/40 px-1 py-2 text-center">
                        <Coffee className="size-3.5 text-foreground/25" />
                        <span className="text-xs leading-tight text-foreground/35">{item.count} {isHe ? "ימים חופשיים" : "free days"}</span>
                      </div>
                    </div>
                    <div className="mt-1 h-[26px] w-full border-t border-border/30 pt-0.5 text-center text-[10px] text-foreground/30" dir={isHe ? "rtl" : "ltr"}>
                      {item.from.getDate()}–{item.to.getDate()}
                    </div>
                  </div>
                );
              }

              const hasExam = item.exams.length > 0;
              const clash = item.exams.some((e) => e.isClash);
              // Absolute-hours baseline tint (does NOT renormalize on edits).
              const tint =
                item.sumHours === 0 ? "" :
                item.sumHours <= 2.5 ? "bg-emerald-500/[0.05]" :
                item.sumHours <= 5 ? "bg-foreground/[0.05]" :
                "bg-red-500/[0.06]";

              return (
                // SEC3: the column is NOT a role=button (it contains draggable
                // bar buttons — nested-interactive). Mouse click still jumps to
                // the day; the keyboard path is the date-footer button below.
                <div
                  key={item.key}
                  className={cn("flex shrink-0 flex-col items-center", onDayClick && "cursor-pointer")}
                  style={{ width: `${cellW}px` }}
                  {...(onDayClick ? { onClick: () => onDayClick(item.key) } : {})}
                >
                  {/* Pennant / start marker rail (fixed height so baselines align) */}
                  <div className="relative flex h-5 w-full items-end justify-center">
                    {hasExam && (
                      <div
                        className={cn("flex items-center gap-0.5 rounded-sm px-1 py-px text-[10px] font-bold text-white shadow-sm", clash ? "ring-1 ring-amber-400" : "")}
                        style={{ backgroundColor: "#ef4444", borderInlineStart: `2px solid ${item.exams[0]!.color}` }}
                        title={item.exams.map((e) => `${e.courseName} — ${moedLabel(e.moed, isHe)}`).join(" · ")}
                      >
                        <GraduationCap className="size-2.5" />
                        <span className={item.exams[0]!.moed === "B" ? "opacity-80" : ""}>{item.exams[0]!.moed === "B" ? (isHe ? "ב" : "B") : (isHe ? "א" : "A")}</span>
                      </div>
                    )}
                    {!hasExam && item.isFirstStudy && (
                      <span className="flex items-center gap-0.5 whitespace-nowrap rounded-sm bg-accent-brand/10 px-1 py-px text-[11px] font-semibold text-accent-brand" title={isHe ? "מתחילים כאן" : "Start here"}>
                        <Flag className="size-2" />
                        {isHe ? "כאן" : "here"}
                      </span>
                    )}
                  </div>

                  {/* Bars column — a drop target when dragging is enabled (E2′) */}
                  <DroppableDay
                    id={item.key}
                    disabled={!dragEnabled}
                    className={cn("relative flex w-full flex-col justify-end rounded-t-sm", tint, hasExam && "bg-red-500/[0.06]", item.isToday && "ring-1 ring-inset ring-accent-brand/30")}
                    style={{ height: `${cellH}px` }}
                  >
                    {item.bars.map((b, bi) => {
                      const dim = hoveredCourse != null && hoveredCourse !== b.courseCode;
                      const alpha = DIFFICULTY_ALPHA[b.difficulty] ?? "e6";
                      return (
                        <StudyBar
                          key={`${b.courseCode}-${bi}`}
                          id={`${item.key}::${b.courseCode}`}
                          disabled={!dragEnabled}
                          label={
                            isHe
                              ? `גררו את הלמידה של ${b.courseName} מיום ${item.date.getDate()}.${item.date.getMonth() + 1} ליום אחר`
                              : `Drag ${b.courseName}'s study from ${item.date.getDate()}.${item.date.getMonth() + 1} to another day`
                          }
                          className="w-full rounded-t-[3px] transition-all duration-200 motion-reduce:transition-none"
                          style={{
                            height: `${Math.max(6, b.hours * pxPerHour)}px`,
                            marginTop: bi === 0 ? 0 : 2,
                            backgroundColor: `${b.color}${dim ? "26" : alpha}`,
                            boxShadow: dim ? "none" : `inset 0 0 0 1px ${b.color}`,
                          }}
                          title={`${b.courseName} — ${b.hours} ${isHe ? "שעות" : "h"}`}
                        />
                      );
                    })}
                    {/* baseline ground rule */}
                    <div className="absolute inset-x-0 bottom-0 border-b border-border/40" />
                  </DroppableDay>

                  {/* Date footer — the FOCUSABLE day affordance (SEC3): keyboard
                      users jump to the day here; mouse users can click anywhere
                      on the column. Plain div in the read-only preview. */}
                  {(() => {
                    const inner = (
                      <>
                        <span className={cn("text-[10px] leading-none", item.isToday ? "font-bold text-accent-brand" : item.isWeekend ? "text-foreground/25" : "text-foreground/40")}>
                          {(isHe ? HE_WEEKDAYS : EN_WEEKDAYS)[item.date.getDay()]}
                        </span>
                        {item.isToday ? (
                          <span className="mt-0.5 rounded-full bg-accent-brand px-1 text-[10px] font-bold leading-tight text-accent-brand-fg">{item.date.getDate()}</span>
                        ) : (
                          <span className={cn("font-mono text-[10px] leading-tight tabular-nums", item.isWeekend ? "text-foreground/25" : "text-foreground/45")}>{item.date.getDate()}</span>
                        )}
                      </>
                    );
                    const footerCls = cn("mt-1 flex h-[26px] w-full flex-col items-center justify-center border-t pt-0.5", item.isWeekend ? "border-border/20" : "border-border/30");
                    return onDayClick ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDayClick(item.key);
                        }}
                        aria-label={
                          isHe
                            ? `קפצו ליום ${item.date.getDate()}.${item.date.getMonth() + 1} באג'נדה`
                            : `Jump to ${item.date.getDate()}.${item.date.getMonth() + 1} in the agenda`
                        }
                        className={cn(footerCls, "outline-none focus-visible:ring-2 focus-visible:ring-accent-brand/60")}
                      >
                        {inner}
                      </button>
                    ) : (
                      <div className={footerCls}>{inner}</div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        </div>
        {/* trailing-edge fade — hints more days off-screen. Opaque at the OUTER
            (future) edge, fading toward the content: in RTL the future edge is
            LEFT, so the gradient runs to-r (card at left → transparent inward). */}
        <div className={cn("pointer-events-none absolute inset-y-0 w-8", isHe ? "left-0 bg-gradient-to-r" : "right-0 bg-gradient-to-l", "from-card to-transparent")} />
      </div>

      {/* ── Band 3 · Legend ── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border/40 p-3">
        <AskKingButton
          promptHe="איך אני מפזר/ת נכון את הלמידה עד הבחינות שלי? יש לי יום עמוס במיוחד — עזור/י לי לתכנן אותו."
          promptEn="How do I spread my studying well up to my exams? I have an especially heavy day — help me plan it."
          labelHe="שאל את המלך על הפיזור"
          labelEn="Ask the King about the spread"
          className="order-last inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] font-medium text-accent-brand transition-colors hover:bg-accent-brand/10 hover:text-accent-brand ms-auto"
          iconClassName="size-3"
        />
        {model.courses.map((c) => (
          <button
            key={c.courseCode}
            type="button"
            // Click TOGGLES the highlight (touch/keyboard path; also unsticks
            // iOS, where mouseleave never fires); hover still previews it.
            onClick={() => setHoveredCourse((h) => (h === c.courseCode ? null : c.courseCode))}
            onMouseEnter={() => setHoveredCourse(c.courseCode)}
            onMouseLeave={() => setHoveredCourse(null)}
            onFocus={() => setHoveredCourse(c.courseCode)}
            onBlur={() => setHoveredCourse(null)}
            aria-pressed={hoveredCourse === c.courseCode}
            className={cn("flex items-center gap-1.5 rounded-md px-1.5 py-1 text-start transition-opacity", hoveredCourse && hoveredCourse !== c.courseCode ? "opacity-40" : "")}
          >
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
            <span className="max-w-[130px] truncate text-xs text-foreground/70">{c.courseName}</span>
            <span className="text-[11px] text-foreground/40" dir={isHe ? "rtl" : "ltr"}>{c.totalHours}{isHe ? "ש׳" : "h"} · {moedLabel(c.moed, isHe)}</span>
          </button>
        ))}
      </div>
    </div>
    </DndContext>
  );
}
