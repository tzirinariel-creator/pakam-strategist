"use client";

import { useMemo, useState, useEffect } from "react";
import { useLocale } from "next-intl";
import { CalendarDays } from "lucide-react";
import { usePlannerStore } from "@/stores/planner-store";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";
import {
  LiveTimetable,
  type SessionGroupSelections,
} from "@/components/onboarding/semester-planner/live-timetable";
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
  const allCourses = (coursesQuery.data ?? []) as CourseWithSchedule[];
  const courseById = useMemo(
    () => new Map(allCourses.map((c) => [c.id, c])),
    [allCourses]
  );

  // Default the semester to the student's current one (until they toggle it).
  const profileQuery = api.user.getProfile.useQuery();
  const [semester, setSemester] = useState<"FALL" | "SPRING">("FALL");
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (touched) return;
    const cur = profileQuery.data?.currentSemester;
    if (cur === "FALL" || cur === "SPRING") setSemester(cur);
  }, [profileQuery.data?.currentSemester, touched]);

  // Planned courses for the selected (year, semester), resolved to catalog
  // courses (with sessions) plus their saved per-course group selections.
  const { semCourses, groupSelections } = useMemo(() => {
    const out: CourseWithSchedule[] = [];
    const groups: SessionGroupSelections = {};
    for (const uc of courses) {
      if (uc.plannedYear !== selectedYear || uc.plannedSemester !== semester) continue;
      const c = courseById.get(uc.courseId);
      if (!c) continue;
      out.push(c);
      // selectedGroups is on the runtime row (getUserPlan) but missing from the
      // hand-written UserCourseWithCourse type — read it via a narrow cast.
      const sel = (uc as { selectedGroups?: unknown }).selectedGroups;
      if (sel && typeof sel === "object") {
        groups[c.code] = sel as Record<string, string>;
      }
    }
    return { semCourses: out, groupSelections: groups };
  }, [courses, selectedYear, semester, courseById]);

  const yearLabel = isHe
    ? YEAR_CONFIG[selectedYear as 1 | 2 | 3]?.nameHe ?? `שנה ${selectedYear}`
    : YEAR_CONFIG[selectedYear as 1 | 2 | 3]?.nameEn ?? `Year ${selectedYear}`;

  return (
    <div className="data-card flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 text-foreground/60" />
          <h2 className="text-sm font-bold text-foreground/80">
            {isHe ? "מערכת השעות שלך" : "Your timetable"}
          </h2>
        </div>
        {/* Fall / Spring toggle */}
        <div className="flex overflow-hidden rounded-md border border-border/60 text-xs">
          {(["FALL", "SPRING"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setSemester(s);
                setTouched(true);
              }}
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
      </div>

      <p className="text-[11px] text-foreground/45">
        {isHe
          ? `${yearLabel} · מתעדכן כשאתה מזיז קורסים בלוח`
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
              ? "אין קורסים בסמסטר הזה — הוסף או גרור קורסים ללוח."
              : "No courses this semester — add or drag courses on the board."}
          </p>
        </div>
      ) : (
        <LiveTimetable
          courses={semCourses}
          currentSemester={semester}
          sessionGroupSelections={groupSelections}
        />
      )}
    </div>
  );
}
