"use client";

import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "next-intl";
import { toast } from "sonner";
import { CalendarDays, Maximize2, X } from "lucide-react";
import { usePlannerStore } from "@/stores/planner-store";
import { getAcademicNow } from "@/lib/academic-calendar";
import { api } from "@/lib/trpc/react";
import { invalidatePlanData } from "@/lib/trpc/invalidate-plan";
import { cn } from "@/lib/utils";
import {
  LiveTimetable,
  type SessionGroupSelections,
} from "@/components/onboarding/semester-planner/live-timetable";
import { courseHasMultipleGroups } from "@/components/onboarding/semester-planner/session-group-selector";
import { YEAR_CONFIG, SEMESTER_CONFIG } from "@/lib/constants";
import type { CourseWithSchedule } from "@/lib/plan-generator";
import type { UserCourseWithCourse } from "@/types/degree";

interface PlannerLiveTimetableProps {
  /** The user's full plan (from getUserPlan) — re-rendered on every plan edit. */
  courses: UserCourseWithCourse[];
}

/**
 * #21 — the live weekly timetable that sits next to the plan board. It derives
 * its grid from the in-memory plan (getUserPlan) joined with the catalog's
 * schedule sessions, so it re-renders the moment a drag/move/remove invalidates
 * getUserPlan — no separate fetch, no page change to see clashes. It follows the
 * board's selected year (shared planner store) and offers a Fall/Spring toggle.
 */
export function PlannerLiveTimetable({ courses }: PlannerLiveTimetableProps) {
  const isHe = useLocale() === "he";
  const selectedYear = usePlannerStore((s) => s.selectedYear);

  // Catalog WITH schedule sessions (cached) — resolves each planned course's grid.
  const coursesQuery = api.course.list.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });
  // Reference-stable (`?? []` mints a new array every render while loading —
  // the onboarding wizard's hydration render-loop class of bug, fixed 10.7).
  const allCourses = useMemo(
    () => (coursesQuery.data ?? []) as CourseWithSchedule[],
    [coursesQuery.data],
  );
  const courseById = useMemo(
    () => new Map(allCourses.map((c) => [c.id, c])),
    [allCourses]
  );

  // The semester lives in the SHARED planner store (null = follow the
  // profile's current semester) so the bidding alert + worksheet follow the
  // same toggle instead of silently diverging (audit finding).
  const selectedSemester = usePlannerStore((s) => s.selectedSemester);
  const setSelectedSemester = usePlannerStore((s) => s.setSelectedSemester);
  // Default the semester from the CALENDAR, not the stale stored
  // profile.currentSemester — the stored value reproduced the #39 "why is
  // מבוא-ללוגיקה here" complaint by defaulting to last semester (audit 22.7).
  // The user's explicit toggle (selectedSemester) still wins.
  const calendarSemester = getAcademicNow().semester === "SPRING" ? "SPRING" : "FALL";
  const semester = selectedSemester ?? calendarSemester;
  const setSemester = setSelectedSemester;

  // The sidebar timetable is only ~380px wide, so 5 day-columns become
  // unreadable slivers (the #14 "can't see anything" complaint). Rather than
  // rewrite the working grid, offer a full-width overlay where the same grid
  // finally has room to breathe. Esc to close + lock body scroll while open,
  // move focus into the dialog on open (and trap Tab there), restore it to
  // the expand trigger on close — aria-modal is a promise, not a decoration.
  const [expanded, setExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const expandBtnRef = useRef<HTMLButtonElement>(null);
  // Backdrop close is armed only when the mousedown STARTED on the backdrop —
  // a text-selection drag that ends over the backdrop must not close it.
  const backdropArmed = useRef(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!expanded) return;
    closeBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
      if (e.key === "Tab") {
        // Minimal focus trap: keep Tab inside the dialog panel.
        const panel = panelRef.current;
        if (!panel) return;
        const focusables = panel.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const trigger = expandBtnRef.current;
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      trigger?.focus();
    };
  }, [expanded]);

  // Planned courses for the selected (year, semester), resolved to catalog
  // courses (with sessions) plus their saved per-course group selections. Also
  // maps each course code back to its UserCourse row id, so an on-grid group
  // pick can persist to the right row (#2 on the main planner).
  const { semCourses, groupSelections, userCourseIdByCode } = useMemo(() => {
    const out: CourseWithSchedule[] = [];
    const groups: SessionGroupSelections = {};
    const idByCode = new Map<string, string>();
    for (const uc of courses) {
      if (uc.plannedYear !== selectedYear || uc.plannedSemester !== semester) continue;
      const c = courseById.get(uc.courseId);
      if (!c) continue;
      out.push(c);
      idByCode.set(c.code, uc.id);
      // selectedGroups is on the runtime row (getUserPlan) but missing from the
      // hand-written UserCourseWithCourse type — read it via a narrow cast.
      const sel = (uc as { selectedGroups?: unknown }).selectedGroups;
      if (sel && typeof sel === "object") {
        groups[c.code] = sel as Record<string, string>;
      }
    }
    return { semCourses: out, groupSelections: groups, userCourseIdByCode: idByCode };
  }, [courses, selectedYear, semester, courseById]);

  // Course codes offering a real group CHOICE this semester — reuses the same
  // detector as the onboarding planner + sidebar, so the on-grid affordance
  // appears on exactly the courses that have something to pick.
  const multiGroupCourseCodes = useMemo(() => {
    const set = new Set<string>();
    for (const c of semCourses) {
      const sessions = (c.scheduleSessions ?? []).filter(
        (s) => !s.semester || s.semester === semester
      );
      if (courseHasMultipleGroups(sessions)) set.add(c.code);
    }
    return set;
  }, [semCourses, semester]);

  // Persist an on-grid group pick to the course's UserCourse row. Merges the new
  // sessionType→group into the row's existing selectedGroups (never dropping the
  // other types) and invalidates the plan set so the grid re-renders with the
  // course sitting in its new slot.
  const utils = api.useUtils();
  const updateCourse = api.plan.updateCourse.useMutation({
    onSuccess: () => invalidatePlanData(utils),
    onError: () =>
      toast.error(isHe ? "לא הצלחנו לשמור את הקבוצה" : "Couldn't save the group"),
  });
  const handleSelectSessionGroup = useCallback(
    (courseCode: string, sessionType: string, groupCode: string) => {
      const userCourseId = userCourseIdByCode.get(courseCode);
      if (!userCourseId) return;
      const prev = groupSelections[courseCode] ?? {};
      updateCourse.mutate({
        userCourseId,
        selectedGroups: { ...prev, [sessionType]: groupCode },
      });
    },
    [userCourseIdByCode, groupSelections, updateCourse]
  );

  const yearLabel = isHe
    ? YEAR_CONFIG[selectedYear as 1 | 2 | 3]?.nameHe ?? `שנה ${selectedYear}`
    : YEAR_CONFIG[selectedYear as 1 | 2 | 3]?.nameEn ?? `Year ${selectedYear}`;

  return (
    <>
    <div className="data-card flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 text-foreground/60" />
          <h2 className="text-sm font-bold text-foreground/80">
            {isHe ? "מערכת השעות שלכם" : "Your timetable"}
          </h2>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Fall / Spring toggle */}
          <div className="flex overflow-hidden rounded-md border border-border/60 text-xs">
            {(["FALL", "SPRING"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSemester(s)}
                className={cn(
                  "px-2.5 py-1 transition-colors",
                  semester === s
                    ? "bg-foreground text-background"
                    : "text-foreground/55 hover:bg-foreground/5"
                )}
              >
                {isHe ? SEMESTER_CONFIG[s].short : SEMESTER_CONFIG[s].shortEn}
              </button>
            ))}
          </div>
          {/* Expand to a full-width view */}
          {semCourses.length > 0 && (
            <button
              type="button"
              ref={expandBtnRef}
              onClick={() => setExpanded(true)}
              className="flex size-7 items-center justify-center rounded-md border border-border/60 text-foreground/55 transition-colors hover:bg-foreground/5 hover:text-foreground/80"
              aria-label={isHe ? "הגדלת מערכת השעות" : "Expand timetable"}
              title={isHe ? "פתיחה במסך מלא" : "Expand to full view"}
            >
              <Maximize2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      <p className="text-[11px] text-foreground/45">
        {isHe
          ? `${yearLabel} · מתעדכן כשמזיזים קורסים בלוח`
          : `${yearLabel} · updates as you move courses on the board`}
      </p>

      {coursesQuery.isLoading ? (
        <div className="py-10 text-center text-xs text-foreground/40">
          {isHe ? "טוען מערכת…" : "Loading timetable…"}
        </div>
      ) : semCourses.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
          <CalendarDays className="size-7 text-foreground/15" />
          <p className="text-xs text-foreground/40">
            {isHe
              ? "אין קורסים בסמסטר הזה — הוסיפו או גררו קורסים ללוח."
              : "No courses this semester — add or drag courses on the board."}
          </p>
        </div>
      ) : (
        <LiveTimetable
          courses={semCourses}
          currentSemester={semester}
          sessionGroupSelections={groupSelections}
          interactive
          multiGroupCourseCodes={multiGroupCourseCodes}
          onSelectSessionGroup={handleSelectSessionGroup}
        />
      )}
    </div>

    {/* Full-width overlay — the same grid, finally with room to read. Not a
        .data-card (unlayered .data-card overrides `fixed`). Portaled to
        <body> because the planner sidebar has an `animate-stagger-3` transform
        that would otherwise trap a `fixed` child inside the 380px column. */}
    {expanded && mounted && createPortal(
      <div
        className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm sm:p-6"
        onMouseDown={(e) => { backdropArmed.current = e.target === e.currentTarget; }}
        onClick={(e) => {
          if (backdropArmed.current && e.target === e.currentTarget) setExpanded(false);
          backdropArmed.current = false;
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="timetable-overlay-title"
      >
        <div
          ref={panelRef}
          className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-2xl"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border/50 p-4">
            <div className="flex items-center gap-2">
              <CalendarDays className="size-4 text-foreground/60" />
              <h2 id="timetable-overlay-title" className="text-sm font-bold text-foreground/85">
                {isHe ? `מערכת השעות שלכם · ${yearLabel}` : `Your timetable · ${yearLabel}`}
              </h2>
            </div>
            <button
              type="button"
              ref={closeBtnRef}
              onClick={() => setExpanded(false)}
              className="flex size-8 items-center justify-center rounded-md text-foreground/50 transition-colors hover:bg-foreground/5 hover:text-foreground/80"
              aria-label={isHe ? "סגור" : "Close"}
            >
              <X className="size-4" />
            </button>
          </div>
          {/* The expanded overlay stays READ-ONLY: its backdrop sits at z-[80]
              while the group-picker popover (Radix, portaled to <body>) renders
              at z-50, so an interactive picker here would open behind the
              backdrop. Picking is available in the inline view above. */}
          <div className="overflow-auto p-4">
            <LiveTimetable
              courses={semCourses}
              currentSemester={semester}
              sessionGroupSelections={groupSelections}
            />
          </div>
        </div>
      </div>,
      document.body,
    )}
    </>
  );
}
