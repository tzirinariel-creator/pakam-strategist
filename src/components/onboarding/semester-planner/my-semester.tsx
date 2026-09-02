"use client";

import { useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Lock, X, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { DISCIPLINE_CONFIG } from "@/lib/constants";
import { CourseDetailPopover } from "../step-plan/course-detail-popover";
import { Bidi } from "@/lib/bidi";
import { defaultedSessionTypes, resolveGroupSelections } from "@/lib/session-groups";
import { sessionTypeNameFor } from "@/lib/group-options";
import type { CourseWithSchedule } from "@/lib/plan-generator";

interface MySemesterProps {
  mandatoryCourses: CourseWithSchedule[];
  selectedCourses: CourseWithSchedule[];
  totalCredits: number;
  onRemoveCourse: (courseId: string) => void;
  onDeleteCustomCourse?: (id: string) => void;
  customCourseIds?: Set<string>;
  /** The student's per-course picks — read only to SAY which group is on the
   *  grid and whether that was a decision or our default. Choosing itself lives
   *  in the rail beside the timetable now. */
  sessionGroupSelections?: Record<string, Record<string, string>>;
  /** The semester this view represents — so the group selector shows only THIS
   *  semester's groups for a course offered in both (matches the on-grid picker). */
  currentSemester?: "FALL" | "SPRING";
}


interface GroupedCourse {
  course: CourseWithSchedule;
  isMandatory: boolean;
}

export function MySemester({
  mandatoryCourses,
  selectedCourses,
  totalCredits,
  onRemoveCourse,
  onDeleteCustomCourse,
  customCourseIds,
  sessionGroupSelections,
  currentSemester,
}: MySemesterProps) {
  const t = useTranslations("onboarding");
  const locale = useLocale();
  const isHe = locale === "he";

  // A course offered in BOTH semesters carries sessions for both; the group
  // selector must show only THIS semester's groups (same rule as the on-grid
  // picker: keep a session with no semester tag, else match the current one).
  const sessionsForSemester = (sessions: CourseWithSchedule["scheduleSessions"]) =>
    (sessions ?? []).filter((s) => !currentSemester || !s.semester || s.semester === currentSemester);

  /** One quiet line per multi-group course: which group is on the grid, and
   *  whether that was a decision or our default. It reads the SAME resolution
   *  the grid draws — a list that states a group as fact while the grid shows a
   *  default is the confusion this whole screen was reported for. */
  const groupSummary = (course: CourseWithSchedule) => {
    const semSessions = sessionsForSemester(course.scheduleSessions);
    const resolved = resolveGroupSelections(semSessions, sessionGroupSelections?.[course.code]);
    if (resolved.length === 0) return null;
    const defaulted = new Set(
      defaultedSessionTypes(semSessions, sessionGroupSelections?.[course.code]),
    );
    return (
      <div className="ms-6 flex flex-wrap gap-x-2 gap-y-0.5">
        {resolved.map((r) => (
          <span
            key={r.sessionType}
            className={cn(
              "text-[10px]",
              defaulted.has(r.sessionType)
                ? "text-status-amber"
                : "text-foreground/60",
            )}
          >
            {sessionTypeNameFor(r.sessionType, isHe)} {isHe ? "קבוצה" : "group"}{" "}
            <Bidi text={r.groupCode} />
            {defaulted.has(r.sessionType) && (isHe ? " · ברירת מחדל" : " · our default")}
          </span>
        ))}
      </div>
    );
  };

  // Group all courses by discipline
  const disciplineGroups = useMemo(() => {
    const groups = new Map<string, GroupedCourse[]>();

    // Add mandatory courses
    for (const course of mandatoryCourses) {
      const key = course.discipline || "GENERAL";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push({ course, isMandatory: true });
    }

    // Add selected elective courses
    for (const course of selectedCourses) {
      const key = course.discipline || "GENERAL";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push({ course, isMandatory: false });
    }

    // Sort discipline groups by program-defined order (sortOrder)
    const sortedEntries = [...groups.entries()].sort(([a], [b]) => {
      const orderA = DISCIPLINE_CONFIG[a]?.sortOrder ?? 999;
      const orderB = DISCIPLINE_CONFIG[b]?.sortOrder ?? 999;
      return orderA - orderB;
    });

    return sortedEntries;
  }, [mandatoryCourses, selectedCourses]);

  const allCourses = [...mandatoryCourses, ...selectedCourses];

  return (
    <div className="flex flex-col">
      {/* Header with credit counter */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground/70">
          {t("mySemester")}
        </h3>
        <div className="flex items-baseline gap-1">
          <span className="font-mono text-lg font-bold text-foreground/80">
            {totalCredits}
          </span>
          <span className="text-[10px] text-foreground/60">{t("nz")}</span>
        </div>
      </div>

      {/* Course list grouped by discipline */}
      <div className="space-y-3">
        {allCourses.length === 0 ? (
          <p className="py-4 text-center text-xs text-foreground/60">
            {t("noCoursesSemester")}
          </p>
        ) : (
          disciplineGroups.map(([discipline, items]) => {
            const cfg = DISCIPLINE_CONFIG[discipline ];
            const disciplineName = isHe
              ? cfg?.nameHe ?? discipline
              : cfg?.nameEn ?? discipline;
            const groupCredits = items.reduce(
              (sum, item) => sum + item.course.credits,
              0
            );

            return (
              <div key={discipline} className="space-y-1">
                {/* Discipline header */}
                <div className="flex items-center gap-2 px-1">
                  <div
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: cfg?.color ?? "gray" }}
                  />
                  <span className="flex-1 text-[11px] font-semibold text-foreground/60">
                    {disciplineName}
                  </span>
                  <span className="font-mono text-[10px] text-foreground/60">
                    {groupCredits} {t("nz")}
                  </span>
                </div>

                {/* Courses in this discipline */}
                {items.map(({ course, isMandatory }) =>
                  isMandatory ? (
                    <div key={course.id} className="space-y-1">
                      <CourseDetailPopover course={course}>
                        {/* Real <button> so the detail popover is keyboard-openable
                            (Radix asChild won't make a bare div focusable) (#audit-r4). */}
                        <button type="button" className="flex w-full items-center gap-2 rounded-lg border border-foreground/15 bg-foreground/5 px-2.5 py-1.5 cursor-pointer ms-3 text-start">
                          <Lock className="h-3 w-3 shrink-0 text-foreground/60" />
                          <span className="flex-1 truncate text-xs text-foreground/70">
                            {isHe
                              ? course.nameHe
                              : (course.nameEn ?? course.nameHe)}
                          </span>
                          {course.courseType === "ENGLISH" && (
                            <span className="shrink-0 rounded bg-foreground/8 px-1 text-[10px] font-medium text-foreground/70" title={isHe ? "נלמד באנגלית" : "Taught in English"}>EN</span>
                          )}
                          <span className="shrink-0 rounded-full bg-foreground/8 px-1.5 py-0.5 text-[10px] font-medium text-foreground/70">
                            {t("mandatory")}
                          </span>
                          <span className="shrink-0 font-mono text-[10px] text-foreground/60">
                            {course.credits}
                          </span>
                        </button>
                      </CourseDetailPopover>
                      {/* The group chips used to live here — a second, poorer
                          picker (one meeting per group, no clash flag) two
                          screen-heights below the grid it changed. Choosing now
                          happens in the rail beside the timetable, or on the
                          block itself. This list is the course list again. */}
                      {groupSummary(course)}
                    </div>
                  ) : (
                    <div key={course.id} className="space-y-1">
                    <CourseDetailPopover course={course}>
                      <div className={cn(
                        "group flex items-center gap-2 rounded-lg border px-2.5 py-1.5 cursor-pointer transition-all hover:border-border/60 ms-3",
                        customCourseIds?.has(course.id)
                          ? "border-dashed border-border/60 bg-card/30"
                          : "border-border/40 bg-card/40"
                      )}>
                        <span className="flex-1 truncate text-xs text-foreground/70">
                          {isHe
                            ? course.nameHe
                            : (course.nameEn ?? course.nameHe)}
                        </span>
                        {course.courseType === "ENGLISH" && (
                          <span className="shrink-0 rounded bg-foreground/8 px-1 text-[10px] font-medium text-foreground/70" title={isHe ? "נלמד באנגלית" : "Taught in English"}>EN</span>
                        )}
                        {customCourseIds?.has(course.id) && (
                          <span className="shrink-0 rounded-full bg-foreground/5 px-1.5 py-0.5 text-[10px] font-medium text-foreground/70">
                            {isHe ? "ידני" : "Custom"}
                          </span>
                        )}
                        <span className="shrink-0 font-mono text-[10px] text-foreground/60">
                          {course.credits}
                        </span>
                        {customCourseIds?.has(course.id) && onDeleteCustomCourse && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteCustomCourse(course.id);
                            }}
                            className="shrink-0 rounded-full p-2 sm:p-0.5 text-foreground/60 opacity-60 transition-all hover:bg-red-400/10 hover:text-status-red hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent-brand/50 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                            aria-label={isHe ? "מחיקת קורס ידני" : "Delete custom course"}
                            title={isHe ? "מחיקת קורס ידני" : "Delete custom course"}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveCourse(course.id);
                          }}
                          className="shrink-0 rounded-full p-2 sm:p-0.5 text-foreground/60 opacity-60 transition-all hover:bg-red-400/10 hover:text-status-red hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent-brand/50 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                          aria-label={isHe ? "הסר" : "Remove"}
                          title={isHe ? "הסר" : "Remove"}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </CourseDetailPopover>
                    {groupSummary(course)}
                    </div>
                  )
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
