"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { useLocale } from "next-intl";
import { AlertTriangle, ZoomIn, ZoomOut } from "lucide-react";
import { courseColor } from "@/lib/course-color";
import { cn } from "@/lib/utils";
import { israelDayKeyMs, storedDateKeyMs } from "@/lib/civil-day";
import {
  classifyExamAvailability,
  isExamAssessed,
  type ExamAvailabilityCourse,
} from "@/lib/exam-availability";
import { yedionExamDates } from "@/lib/yedion-assessments";
import type { CourseWithSchedule } from "@/lib/plan-generator";

// ─── Types ───────────────────────────────────────────────────────────

/**
 * Everything in this component is keyed by a CIVIL DAY KEY (the UTC-midnight
 * epoch ms of a calendar date, from `@/lib/civil-day`) rather than by a raw
 * instant. Two reasons, both of which used to be live bugs:
 *
 *  1. Exam dates are DATE-ONLY values stored at UTC midnight = 02:00/03:00 in
 *     Israel. The old cutoff compared them to `Date.now()`, so from 03:01 on
 *     the morning of the exam the row silently VANISHED from the timeline —
 *     on the one day the student needs it most. Every other consumer
 *     (days-until, the countdown list, the planner picker) uses a
 *     start-of-today test; this is now the same test.
 *  2. Columns and sittings were bucketed by LOCAL date components, which is
 *     right only for a client whose zone is UTC+2/+3. Keys are zone-independent
 *     by construction, so a student opening this abroad sees the same grid.
 */
type DayKey = number;

const MS_PER_DAY = 86_400_000;

interface ExamEvent {
  courseId: string;
  courseName: string;
  color: string;
  /** Civil-day key of מועד א׳, or null when it has no upcoming sitting. */
  moedA: DayKey | null;
  moedB: DayKey | null;
  /** True when מועד א׳ came from a date the STUDENT typed, not the catalog. */
  manual: boolean;
}

/** One sitting on the timeline — the unit conflicts and gaps are measured in. */
interface Sitting {
  courseId: string;
  key: DayKey;
}

interface ExamGanttProps {
  courses: CourseWithSchedule[];
  /** Injectable clock — the call site never passes it; the tests always do. */
  now?: Date;
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * A day key rendered as a HOST-LOCAL midnight Date, purely for DISPLAY. Its
 * local Y/M/D equal the civil date, so `getDay()`, `getDate()` and
 * `toLocaleDateString()` all describe the right day in any timezone. Never use
 * the returned Date for arithmetic — that is what keys are for.
 */
function keyToDate(key: DayKey): Date {
  const d = new Date(key);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** "YYYY-MM-DD" (what /exam-planner writes to localStorage) → a day key. */
function manualDateKey(value: string | undefined): DayKey | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
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

/**
 * Scroll offset that parks the focus column two columns in from the sticky
 * course label. The label is `position: sticky` — it does NOT consume scroll
 * distance — so the old `labelWidth + …` here pushed the focus column UNDER it:
 * at the phone tokens (88px label, 30px columns) roughly 93% of the column a
 * student was scrolled to was covered by the label. Exported because jsdom has
 * no layout, so this is the only honest way to regression-test it.
 */
export function focusScrollOffset(focusCol: number, dayWidth: number): number {
  return Math.max(0, focusCol - 2) * dayWidth;
}

/**
 * What the student told /exam-planner about their own exams, on this device:
 * a date they typed for a course the catalog has no sitting for, and the
 * courses they marked as assessed by a paper instead of an exam. Both are the
 * student's own knowledge and both must hold on EVERY screen — a date typed on
 * one page reading "no exam dates" on another is the app contradicting itself.
 */
interface StudentOverrides {
  /** course code → "YYYY-MM-DD" */
  manualDates: Record<string, string>;
  /** course codes with no sitting to draw */
  altAssessment: Set<string>;
}

const NO_OVERRIDES: StudentOverrides = { manualDates: {}, altAssessment: new Set() };

function readStudentOverrides(): StudentOverrides {
  if (typeof window === "undefined") return NO_OVERRIDES;
  let manualDates: Record<string, string> = {};
  let altAssessment = new Set<string>();
  try {
    const raw: unknown = JSON.parse(localStorage.getItem("pk-manual-exam-dates") ?? "{}");
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      manualDates = raw as Record<string, string>;
    }
  } catch {
    /* storage blocked or corrupt — fall back to the catalog alone */
  }
  try {
    const raw: unknown = JSON.parse(localStorage.getItem("pk-alt-assessment") ?? "[]");
    if (Array.isArray(raw)) altAssessment = new Set(raw as string[]);
  } catch {
    /* ditto */
  }
  return { manualDates, altAssessment };
}

// ─── Component ───────────────────────────────────────────────────────

export function ExamGantt({ courses, now }: ExamGanttProps) {
  const locale = useLocale();
  const isHe = locale === "he";
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hoveredExam, setHoveredExam] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  // Narrow viewport → smaller columns so more of the timeline fits without scrolling.
  const [isNarrow, setIsNarrow] = useState(false);
  // Read AFTER mount, never during render: the server has no localStorage, and
  // seeding state from it would render two different trees and break hydration.
  const [overrides, setOverrides] = useState<StudentOverrides>(NO_OVERRIDES);

  useEffect(() => setOverrides(readStudentOverrides()), []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setIsNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // "Today" as the student's civil day — the cutoff AND the highlighted column.
  const todayKey = useMemo(() => israelDayKeyMs(now ?? new Date()), [now]);

  // Build exam events
  const events = useMemo<ExamEvent[]>(() => {
    // examDateA/B are a SINGLE global field per course, overwritten with the
    // last-scraped period — so in July a FALL plan carries stale (now-past)
    // SPRING dates. Drop past dates (same guard as workload-calculator) so the
    // gantt never paints a past exam as upcoming or raises a false "conflict"
    // alarm on exams that already happened (launch audit 24.7). "Past" is a
    // civil-day test: an exam TODAY is still ahead of you.
    const upcoming = (raw: Date | string | null): DayKey | null => {
      if (!raw) return null;
      const key = storedDateKeyMs(raw);
      return Number.isNaN(key) || key < todayKey ? null : key;
    };
    const result: ExamEvent[] = [];
    for (const c of courses) {
      // A PAPER / REFERAT / NONE course has no sitting to draw — the single
      // predicate the planner's empty state uses, not a second copy of it.
      if (!isExamAssessed(c)) continue;
      if (overrides.altAssessment.has(c.code)) continue;
      // The ידיעון board leads, exactly as on /exam-planner.
      //
      // This gantt read `examDateA/B` alone — the scraped CATALOG, which holds
      // תשפ״ו. Every one of those dates is behind us, `upcoming()` nulls them,
      // and a course with no surviving date is skipped outright by the
      // `continue` below. So the semester a student is planning right now drew
      // almost no exams at all, silently: no message, no empty state, just
      // missing rows.
      //
      // That is the SAME defect exam-date-source.ts was written for, where it
      // hid 22 of 23 sittings on /exam-planner. It was fixed there and never
      // carried across to here, so the fix covered the screen it was found on
      // and not the screen beside it.
      //
      // Order: ידיעון (the year being planned) → catalog (the year before) →
      // the student's own typed date, which beats both because they can see a
      // notice board we cannot. Each candidate is validity-filtered FIRST, so a
      // stale higher-priority entry can never mask a usable one below it.
      const yedion = yedionExamDates(c.code);
      const publishedA = upcoming(yedion.examDateA) ?? upcoming(c.examDateA);
      const publishedB = upcoming(yedion.examDateB) ?? upcoming(c.examDateB);
      const manualKey =
        publishedA == null && publishedB == null
          ? (() => {
              const k = manualDateKey(overrides.manualDates[c.code]);
              return k != null && k >= todayKey ? k : null;
            })()
          : null;
      const moedA = publishedA ?? manualKey;
      const moedB = publishedB;
      if (moedA == null && moedB == null) continue;
      result.push({
        courseId: c.id,
        courseName: isHe ? c.nameHe : (c.nameEn ?? c.nameHe),
        // The course's own colour, matching its block on the weekly grid and
        // its card on the board. A CSS variable, so it follows the theme —
        // hence the color-mix() calls below where hex+alpha used to be
        // concatenated (a var cannot take an "…25" alpha suffix).
        color: courseColor(c.code),
        moedA,
        moedB,
        manual: manualKey != null,
      });
    }
    result.sort((a, b) => {
      const first = (e: ExamEvent) => Math.min(e.moedA ?? Infinity, e.moedB ?? Infinity);
      return first(a) - first(b);
    });
    return result;
  }, [courses, isHe, todayKey, overrides]);

  // Every sitting on the timeline, earliest first — מועד ב׳ included. Conflicts
  // and tight gaps used to read מועד א׳ only, so the single most common shape
  // (א׳ already sat, ב׳ still ahead) rendered a row that could never warn, and
  // two ב׳ sittings on the same day were never flagged at all.
  const sittings = useMemo<Sitting[]>(() => {
    const out: Sitting[] = [];
    for (const e of events) {
      if (e.moedA != null) out.push({ courseId: e.courseId, key: e.moedA });
      if (e.moedB != null) out.push({ courseId: e.courseId, key: e.moedB });
    }
    return out.sort((a, b) => a.key - b.key);
  }, [events]);

  // Calculate timeline range
  const { startKey, totalDays } = useMemo(() => {
    if (sittings.length === 0) return { startKey: todayKey, totalDays: 0 };
    const min = sittings[0]!.key - 2 * MS_PER_DAY;
    const max = sittings[sittings.length - 1]!.key + 2 * MS_PER_DAY;
    return { startKey: min, totalDays: Math.round((max - min) / MS_PER_DAY) };
  }, [sittings, todayKey]);

  // On phones, shrink the base day width and label column so more days fit per screen.
  const baseDayWidth = isNarrow ? 30 : 44;
  const dayWidth = Math.round(baseDayWidth * zoomLevel);
  const rowHeight = 36;
  const labelWidth = isNarrow ? 88 : 120;

  // Generate day columns
  const days = useMemo(() => {
    const result: { key: DayKey; date: Date; dayNum: number; isWeekend: boolean; isToday: boolean }[] = [];
    for (let i = 0; i <= totalDays; i++) {
      const key = startKey + i * MS_PER_DAY;
      const date = keyToDate(key);
      const dayOfWeek = date.getDay();
      result.push({
        key,
        date,
        dayNum: date.getDate(),
        isWeekend: dayOfWeek === 5 || dayOfWeek === 6,
        isToday: key === todayKey,
      });
    }
    return result;
  }, [totalDays, startKey, todayKey]);

  // Month bands. Without these the timeline is a bare run of day numbers —
  // "…29 30 1 2 3…" — and the only place a month appeared was a `title`
  // tooltip, which does not exist on a phone. One header cell per month run.
  const monthRuns = useMemo(() => {
    const multiYear = days.length > 0 && days[0]!.date.getFullYear() !== days[days.length - 1]!.date.getFullYear();
    const runs: { label: string; span: number }[] = [];
    for (const d of days) {
      const label = d.date.toLocaleDateString(isHe ? "he-IL" : "en-US", {
        month: "short",
        ...(multiYear ? { year: "numeric" as const } : {}),
      });
      const last = runs[runs.length - 1];
      if (last && last.label === label) last.span++;
      else runs.push({ label, span: 1 });
    }
    return runs;
  }, [days, isHe]);

  // Column to bring into view on mount: today if it's in range, else the nearest sitting.
  const focusCol = useMemo(() => {
    if (days.length === 0) return 0;
    const colOf = (key: DayKey) => Math.round((key - startKey) / MS_PER_DAY);
    if (todayKey >= startKey && colOf(todayKey) <= totalDays) return colOf(todayKey);
    let best = 0;
    let bestDist = Infinity;
    for (const s of sittings) {
      const dist = Math.abs(s.key - todayKey);
      if (dist < bestDist) {
        bestDist = dist;
        best = colOf(s.key);
      }
    }
    return best;
  }, [days, sittings, startKey, totalDays, todayKey]);

  // On mount, scroll the timeline so the relevant region is visible (not hidden off-screen).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || focusCol <= 0) return;
    const offset = focusScrollOffset(focusCol, dayWidth);
    if (isHe) {
      // RTL: scrollLeft is negative and grows leftward as content scrolls.
      el.scrollLeft = -offset;
    } else {
      el.scrollLeft = offset;
    }
    // Run once after first paint; dayWidth settles synchronously with isNarrow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusCol]);

  // Detect conflicts — two DIFFERENT courses sitting on the same day, at any
  // מועד. A course's own א׳ and ב׳ can never clash with each other.
  const conflicts = useMemo(() => {
    const byDay = new Map<DayKey, Set<string>>();
    for (const s of sittings) {
      const set = byDay.get(s.key) ?? new Set<string>();
      set.add(s.courseId);
      byDay.set(s.key, set);
    }
    const courseIds = new Set<string>();
    const dayKeys = new Set<DayKey>();
    for (const [key, ids] of byDay) {
      if (ids.size < 2) continue;
      dayKeys.add(key);
      for (const id of ids) courseIds.add(id);
    }
    return { courseIds, dayKeys };
  }, [sittings]);

  // Tight gaps — 1 or 2 days between two sittings of different courses. ZERO
  // days is a CONFLICT and is reported as one: counting it here as well made a
  // single same-day clash raise two separate warnings for the same fact.
  const tightGaps = useMemo(() => {
    const gaps: { courseA: string; courseB: string; days: number }[] = [];
    for (let i = 0; i < sittings.length; i++) {
      for (let j = i + 1; j < sittings.length; j++) {
        const gapDays = Math.round((sittings[j]!.key - sittings[i]!.key) / MS_PER_DAY);
        if (gapDays > 2) break;
        if (gapDays === 0) continue;
        if (sittings[i]!.courseId === sittings[j]!.courseId) continue;
        gaps.push({ courseA: sittings[i]!.courseId, courseB: sittings[j]!.courseId, days: gapDays });
      }
    }
    return gaps;
  }, [sittings]);

  // ─── Empty state ──────────────────────────────────────────────────
  // Four different situations used to print one sentence — "אין מועדי בחינה
  // לקורסים שנבחרו" — which reads like a bug when the real cause is that TAU
  // hasn't published the timetable. Same classifier the exam planner uses, fed
  // the same civil days this grid is built from so the two can never disagree.

  if (events.length === 0) {
    const todayLocal = keyToDate(todayKey);
    const asCivilDate = (raw: Date | string | null): Date | null => {
      if (!raw) return null;
      const key = storedDateKeyMs(raw);
      return Number.isNaN(key) ? null : keyToDate(key);
    };
    const forClassifier: ExamAvailabilityCourse[] = courses.map((c) => {
      // A date the student typed counts exactly like a published one, so a
      // course they dated (in the past) reads "all-past", never "not-published".
      const manual = manualDateKey(overrides.manualDates[c.code]);
      return {
        code: c.code,
        // A course the student marked "עבודה במקום מבחן" on /exam-planner is a
        // paper here too — otherwise this screen contradicts that one.
        submissionType: overrides.altAssessment.has(c.code) ? "PAPER" : c.submissionType,
        examDateA: asCivilDate(c.examDateA) ?? (manual != null ? keyToDate(manual) : null),
        examDateB: asCivilDate(c.examDateB),
      };
    });
    const { reason } = classifyExamAvailability(forClassifier, todayLocal);
    const message =
      reason === "no-plan"
        ? isHe
          ? "עדיין לא בחרתם קורסים לסמסטר הזה — הוסיפו קורס והמועדים שלו יופיעו כאן."
          : "You haven't picked any courses for this semester yet — add one and its sittings appear here."
        : reason === "no-exam-courses"
          ? isHe
            ? "אף קורס שבחרתם לא נבחן בבחינה — כולם מסתיימים בעבודה או ברפרט, אז אין מועדים לצייר."
            : "None of the courses you picked ends in an exam — they're all papers or referats, so there are no sittings to draw."
          : reason === "not-published"
            ? isHe
              ? "לאף קורס שבחרתם אין עדיין תאריך בחינה בקטלוג — האוניברסיטה טרם פרסמה את הלוח. לא נמציא תאריכים; אפשר להזין תאריך משלכם בעמוד תכנון המבחנים והוא יופיע גם כאן."
              : "Not one of the courses you picked has an exam date in the catalog yet — the university hasn't published the timetable. We won't invent dates; enter your own on the exam-planner page and it shows up here too."
            : isHe
              ? "כל מועדי הבחינה של הקורסים שבחרתם כבר עברו — מועדים שחלפו אינם מוצגים כאן."
              : "Every sitting for the courses you picked is already behind you — past sittings aren't shown here.";

    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <p className="max-w-md text-xs leading-relaxed text-foreground/60">{message}</p>
      </div>
    );
  }

  // ─── Render — Grid-based Gantt ─────────────────────────────────────

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-display text-xs font-medium text-foreground/60">
            {isHe ? "ציר זמן מבחנים" : "Exam Timeline"}
          </span>
          {conflicts.courseIds.size > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-500">
              <AlertTriangle className="h-2.5 w-2.5" />
              {isHe ? "התנגשות" : "Conflict"}
            </span>
          )}
          {tightGaps.length > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-500">
              {isHe ? "צפוף" : "Tight"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoomLevel((z) => Math.max(0.6, z - 0.2))}
            aria-label={isHe ? "הקטנת התצוגה" : "Zoom out"}
            className="rounded p-1 text-foreground/60 hover:text-foreground/90 hover:bg-foreground/5 transition-all"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setZoomLevel((z) => Math.min(1.8, z + 0.2))}
            aria-label={isHe ? "הגדלת התצוגה" : "Zoom in"}
            className="rounded p-1 text-foreground/60 hover:text-foreground/90 hover:bg-foreground/5 transition-all"
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
            {/* Month band — the only place the month is legible on a phone */}
            <tr>
              <th
                className="sticky start-0 z-20 border-e border-b border-border/20 bg-card"
                style={{ width: `${labelWidth}px`, minWidth: `${labelWidth}px` }}
              />
              {monthRuns.map((m, i) => (
                <th
                  key={`mo-${i}`}
                  colSpan={m.span}
                  className="overflow-hidden border-e border-b border-border/20 px-1 text-[10px] font-semibold whitespace-nowrap text-foreground/60 py-0.5"
                >
                  {m.label}
                </th>
              ))}
            </tr>
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
                    "border-e border-b border-border/10 text-[10px] font-normal text-foreground/60 py-0.5",
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
                className="sticky start-0 z-20 border-e border-b border-border/20 bg-card px-2 text-start text-[11px] font-medium text-foreground/60"
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
                        : "text-foreground/60 font-normal",
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
              const hasConflict = conflicts.courseIds.has(event.courseId);
              const isHovered = hoveredExam === event.courseId;
              // A course's sitting clashes only if ITS OWN day is a clash day —
              // a course flagged on מועד ב׳ must not paint a warning on א׳ too.
              const clashA = event.moedA != null && conflicts.dayKeys.has(event.moedA);
              const clashB = event.moedB != null && conflicts.dayKeys.has(event.moedB);

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
                  {days.map((d) => {
                    const isMoedA = d.key === event.moedA;
                    const isMoedB = d.key === event.moedB;
                    // Is this cell between moedA and moedB?
                    const isBetween =
                      event.moedA != null &&
                      event.moedB != null &&
                      d.key > event.moedA &&
                      d.key < event.moedB;

                    return (
                      <td
                        key={d.key}
                        className={cn(
                          "border-e border-b border-border/8 relative",
                          d.isToday && "bg-foreground/[0.03]",
                          d.isWeekend && !isMoedA && !isMoedB && "bg-foreground/[0.01]",
                        )}
                        style={{
                          width: `${dayWidth}px`,
                          ...(isBetween
                            ? { backgroundColor: `color-mix(in srgb, ${event.color} 3%, transparent)` }
                            : {}),
                        }}
                      >
                        {/* Moed A cell */}
                        {isMoedA && (
                          <div
                            className={cn(
                              "absolute inset-1 flex items-center justify-center rounded-md text-[10px] font-bold cursor-default",
                              clashA ? "ring-1 ring-red-500/60" : "",
                            )}
                            style={{
                              backgroundColor: `color-mix(in srgb, ${event.color} 15%, transparent)`,
                              color: event.color,
                              borderBottom: `2px solid ${event.color}`,
                            }}
                            title={[
                              `${event.courseName} — ${isHe ? "מועד א׳" : "Moed A"}: ${formatDateFull(d.date, locale)}`,
                              event.manual ? (isHe ? "תאריך שהזנתם" : "your date") : "",
                              clashA ? (isHe ? "התנגשות: מבחן נוסף באותו יום" : "Conflict: another exam the same day") : "",
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          >
                            A
                            {clashA && (
                              <AlertTriangle className="absolute -top-1 -end-1 h-2.5 w-2.5 text-red-500" />
                            )}
                          </div>
                        )}

                        {/* Moed B cell */}
                        {isMoedB && (
                          <div
                            className={cn(
                              "absolute inset-1 flex items-center justify-center rounded-md text-[10px] font-medium cursor-default border border-dashed",
                              clashB ? "ring-1 ring-red-500/60" : "",
                            )}
                            style={{
                              backgroundColor: `color-mix(in srgb, ${event.color} 6%, transparent)`,
                              color: `color-mix(in srgb, ${event.color} 60%, transparent)`,
                              borderColor: `color-mix(in srgb, ${event.color} 25%, transparent)`,
                            }}
                            title={[
                              `${event.courseName} — ${isHe ? "מועד ב׳" : "Moed B"}: ${formatDateFull(d.date, locale)}`,
                              clashB ? (isHe ? "התנגשות: מבחן נוסף באותו יום" : "Conflict: another exam the same day") : "",
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          >
                            B
                            {clashB && (
                              <AlertTriangle className="absolute -top-1 -end-1 h-2.5 w-2.5 text-red-500" />
                            )}
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
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-foreground/60">
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-4 rounded-sm bg-foreground/15 flex items-center justify-center text-[10px] font-bold text-foreground/60">A</div>
          <span>{isHe ? "מועד א׳" : "Moed A"}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-4 rounded-sm border border-dashed border-foreground/20 flex items-center justify-center text-[10px] text-foreground/60">B</div>
          <span>{isHe ? "מועד ב׳" : "Moed B"}</span>
        </div>
        {conflicts.courseIds.size > 0 && (
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
              ? tightGaps.length === 1
                ? "זוג מבחנים אחד בפער של פחות משלושה ימים"
                : `${tightGaps.length} זוגות מבחנים בפער של פחות משלושה ימים`
              : `${tightGaps.length} exam pair${tightGaps.length === 1 ? "" : "s"} less than three days apart`}
          </div>
        </div>
      )}
    </div>
  );
}
