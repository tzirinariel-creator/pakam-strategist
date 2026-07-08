"use client";

import { useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { CalendarX2 } from "lucide-react";
import { WeeklyTimetable, type ScheduleSessionData } from "@/components/calendar/weekly-timetable";
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
}

/**
 * Thin adapter: transforms CourseWithSchedule[] into ScheduleSessionData[]
 * filtered by selected session groups, then passes them to the existing WeeklyTimetable.
 * Zero API calls — pure client-side mapping.
 */
export function LiveTimetable({ courses, currentSemester, sessionGroupSelections, groupPreview }: LiveTimetableProps) {
  const t = useTranslations("onboarding");
  const locale = useLocale();
  const isHe = locale === "he";

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

  return (
    <div className="space-y-2">
      <WeeklyTimetable sessions={sessions} previewSessions={previewSessions} />
      {/* Warning for courses that couldn't be shown on the timetable */}
      {coursesWithoutSchedule.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-dashed border-amber-500/20 bg-amber-500/5 px-3 py-2">
          <CalendarX2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500/60" />
          <div className="text-[10px] leading-relaxed text-amber-600/70">
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
