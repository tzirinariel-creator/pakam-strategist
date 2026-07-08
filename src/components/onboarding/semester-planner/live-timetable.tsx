"use client";

import { useMemo, useState, useRef, useLayoutEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { CalendarX2 } from "lucide-react";
import { WeeklyTimetable, type ScheduleSessionData } from "@/components/calendar/weekly-timetable";
import { GroupPickerPopover } from "@/components/planner/group-picker-popover";
import { type SessionInfo } from "@/lib/conflict-detector";
import { filterSessionsBySelectedGroups } from "./session-group-selector";
import type { CourseWithSchedule } from "@/lib/plan-generator";
import type { DayOfWeek } from "@/types/enums";

// Map of courseCode → { sessionType → groupCode }
export type SessionGroupSelections = Record<string, Record<string, string>>;

interface LiveTimetableProps {
  courses: CourseWithSchedule[];
  currentSemester: "FALL" | "SPRING";
  sessionGroupSelections?: SessionGroupSelections;
  /** Hovered (not yet selected) session group — rendered as dashed preview
   *  blocks so the choice is VISIBLE before it's made (#2). */
  groupPreview?: { courseCode: string; sessionType: string; groupCode: string } | null;
  /** On-grid group picking (#2). When true, blocks for a course in
   *  `multiGroupCourseCodes` get a tap affordance that opens a group picker
   *  anchored to the grid. When absent, the timetable stays purely read-only
   *  (byte-identical to the calendar view). */
  interactive?: boolean;
  /** Course codes that offer a real group CHOICE — only these get the tap
   *  affordance and picker. */
  multiGroupCourseCodes?: Set<string>;
  /** Persists a group pick. Same signature as the sidebar selector, so both
   *  paths write to the exact same state. */
  onSelectSessionGroup?: (courseCode: string, sessionType: string, groupCode: string) => void;
}

/**
 * Thin adapter: transforms CourseWithSchedule[] into ScheduleSessionData[]
 * filtered by selected session groups, then passes them to the existing WeeklyTimetable.
 * Zero API calls — pure client-side mapping.
 */
export function LiveTimetable({
  courses,
  currentSemester,
  sessionGroupSelections,
  groupPreview,
  interactive,
  multiGroupCourseCodes,
  onSelectSessionGroup,
}: LiveTimetableProps) {
  const t = useTranslations("onboarding");
  const locale = useLocale();
  const isHe = locale === "he";

  // On-grid picker: which course's picker to render, plus a monotonic nonce.
  // Tapping the "החלף קבוצה" affordance on a block bumps the nonce and sets the
  // courseCode; the GroupPickerPopover is keyed by both, so every tap remounts a
  // fresh instance whose hidden trigger auto-clicks open — even re-tapping the
  // same course after an outside-click close. Only meaningful when `interactive`.
  const [picker, setPicker] = useState<{ courseCode: string; nonce: number } | null>(null);
  const pickerCourseCode = picker?.courseCode ?? null;
  // Hidden trigger for the currently-mounted picker; clicked on mount to open.
  const pickerTriggerRef = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (picker) pickerTriggerRef.current?.click();
  }, [picker]);

  const { sessions, coursesWithoutSchedule } = useMemo(() => {
    const result: ScheduleSessionData[] = [];
    const missing: string[] = [];

    for (const course of courses) {
      if (!course.scheduleSessions || course.scheduleSessions.length === 0) {
        missing.push(isHe ? course.nameHe : (course.nameEn ?? course.nameHe));
        continue;
      }

      // A course offered in both semesters carries sessions for each. Keep only
      // the ones that run in the semester being viewed — otherwise SPRING blocks
      // land on the FALL grid and the app invents time conflicts that don't
      // exist. Sessions without a semester tag (rare, e.g. custom courses) are
      // kept rather than hidden.
      const semesterSessions = course.scheduleSessions.filter(
        (s) => !s.semester || s.semester === currentSemester
      );

      // Filter sessions based on user's group selection for this course
      const courseGroupSelections = sessionGroupSelections?.[course.code] ?? {};
      const filteredSessions = filterSessionsBySelectedGroups(
        semesterSessions,
        courseGroupSelections
      );

      for (const session of filteredSessions) {
        result.push({
          id: `${course.id}-${session.dayOfWeek}-${session.startTime}-${session.groupCode ?? ""}`,
          courseCode: course.code,
          dayOfWeek: session.dayOfWeek as DayOfWeek,
          startTime: session.startTime,
          endTime: session.endTime,
          room: session.room ?? null,
          building: session.building ?? null,
          sessionType: session.sessionType,
          course: {
            code: course.code,
            nameHe: course.nameHe,
            nameEn: course.nameEn,
            discipline: course.discipline,
            credits: course.credits,
          },
        });
      }
    }

    return { sessions: result, coursesWithoutSchedule: missing };
  }, [courses, isHe, currentSemester, sessionGroupSelections]);

  // Dashed preview blocks for the HOVERED group (#2) — only when it differs
  // from the currently-selected one (previewing the selected group adds noise).
  const previewSessions = useMemo(() => {
    if (!groupPreview) return [];
    const course = courses.find((c) => c.code === groupPreview.courseCode);
    if (!course?.scheduleSessions) return [];
    const selected =
      sessionGroupSelections?.[groupPreview.courseCode]?.[groupPreview.sessionType.toLowerCase()] ??
      sessionGroupSelections?.[groupPreview.courseCode]?.[groupPreview.sessionType];
    if (selected === groupPreview.groupCode) return [];
    const out: ScheduleSessionData[] = [];
    for (const session of course.scheduleSessions) {
      if (session.semester && session.semester !== currentSemester) continue;
      if ((session.sessionType ?? "") !== groupPreview.sessionType) continue;
      if ((session.groupCode ?? "") !== groupPreview.groupCode) continue;
      out.push({
        id: `${course.id}-${session.dayOfWeek}-${session.startTime}-${session.groupCode ?? ""}-preview`,
        courseCode: course.code,
        dayOfWeek: session.dayOfWeek as DayOfWeek,
        startTime: session.startTime,
        endTime: session.endTime,
        room: session.room ?? null,
        building: session.building ?? null,
        sessionType: session.sessionType,
        course: {
          code: course.code,
          nameHe: course.nameHe,
          nameEn: course.nameEn,
          discipline: course.discipline,
          credits: course.credits,
        },
      });
    }
    return out;
  }, [groupPreview, courses, currentSemester, sessionGroupSelections]);

  // ─── On-grid group picker (#2) ──────────────────────────────────────
  // The course whose picker is currently open.
  const pickerCourse = useMemo(
    () =>
      pickerCourseCode
        ? courses.find((c) => c.code === pickerCourseCode) ?? null
        : null,
    [pickerCourseCode, courses]
  );

  // Every session already fixed on the grid for OTHER courses — passed to the
  // picker so it can pre-flag which candidate group would clash. Built from the
  // same semester-filtered + group-selected `sessions` that the grid shows, so
  // what's flagged matches what's visible. Sessions of the open course itself
  // are excluded (its own lecture+tutorial aren't a clash with each other, and
  // the picker adds this course's OTHER-type sessions internally).
  const otherSessions = useMemo<SessionInfo[]>(() => {
    if (!pickerCourse) return [];
    return sessions
      .filter((s) => s.courseCode !== pickerCourse.code)
      .map((s) => ({
        id: s.id,
        courseCode: s.courseCode,
        courseName: isHe ? s.course.nameHe : (s.course.nameEn ?? s.course.nameHe),
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
        sessionType: s.sessionType,
      }));
  }, [pickerCourse, sessions, isHe]);

  // All courses exist but none have schedule sessions
  if (sessions.length === 0 && courses.length > 0) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border/30 py-6 text-center">
        <CalendarX2 className="h-4 w-4 text-foreground/20" />
        <p className="text-xs text-foreground/30">
          {t("coursesWithoutSchedule", { count: courses.length })}
        </p>
      </div>
    );
  }

  if (sessions.length === 0) {
    return null;
  }

  // Interactive picking is armed only when the caller both flips `interactive`
  // and hands us a persist handler. The read-only calendar/planner-sidebar path
  // supplies neither, so this stays false there and the render below is
  // byte-identical to before (no `relative`, no picker, plain WeeklyTimetable).
  const pickingEnabled = !!interactive && !!onSelectSessionGroup;

  return (
    <div className={pickingEnabled ? "relative space-y-2" : "space-y-2"}>
      <WeeklyTimetable
        sessions={sessions}
        previewSessions={previewSessions}
        interactive={pickingEnabled || undefined}
        multiGroupCourseCodes={pickingEnabled ? multiGroupCourseCodes : undefined}
        onPickGroup={
          pickingEnabled
            ? (courseCode) =>
                setPicker((prev) => ({ courseCode, nonce: (prev?.nonce ?? 0) + 1 }))
            : undefined
        }
      />

      {/* On-grid group picker (#2) — reuses the shared GroupPickerPopover so the
          clash pre-flagging + option layout stay identical to the sidebar. It's
          keyed by course+nonce so each tap remounts and auto-opens via the
          hidden trigger. Anchored to a centred point over the grid. Only rendered
          in interactive mode with a persist handler, so the read-only calendar
          path never mounts any of this. */}
      {interactive && onSelectSessionGroup && pickerCourse && (
        <GroupPickerPopover
          key={`${picker!.courseCode}-${picker!.nonce}`}
          course={pickerCourse}
          selectedGroups={sessionGroupSelections?.[pickerCourse.code] ?? {}}
          otherSessions={otherSessions}
          onPickGroup={onSelectSessionGroup}
          currentSemester={currentSemester}
        >
          <button
            ref={pickerTriggerRef}
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            className="pointer-events-none absolute start-1/2 top-1/2 size-0 -translate-x-1/2 -translate-y-1/2 opacity-0"
          />
        </GroupPickerPopover>
      )}
      {/* Warning for courses that couldn't be shown on the timetable */}
      {coursesWithoutSchedule.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-dashed border-amber-500/20 bg-amber-500/5 px-3 py-2">
          <CalendarX2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500/60" />
          <div className="text-xs leading-relaxed text-amber-600/70">
            <span className="font-medium">
              {t("coursesWithoutSchedule", { count: coursesWithoutSchedule.length })}
            </span>
            <span className="text-foreground/40">
              {" — "}{coursesWithoutSchedule.join(", ")}
            </span>
            <p className="mt-0.5 text-foreground/30">
              {t("coursesWithoutScheduleExplain")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
