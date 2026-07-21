"use client";

import { useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Lock, X, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { DISCIPLINE_CONFIG } from "@/lib/constants";
import { CourseDetailPopover } from "../step-plan/course-detail-popover";
import { SessionGroupSelector, courseHasMultipleGroups } from "./session-group-selector";
import type { CourseWithSchedule } from "@/lib/plan-generator";

interface MySemesterProps {
  mandatoryCourses: CourseWithSchedule[];
  selectedCourses: CourseWithSchedule[];
  totalCredits: number;
  onRemoveCourse: (courseId: string) => void;
  onDeleteCustomCourse?: (id: string) => void;
  customCourseIds?: Set<string>;
  sessionGroupSelections?: Record<string, Record<string, string>>;
  onSelectSessionGroup?: (courseCode: string, sessionType: string, groupCode: string) => void;
  /** Hover-preview a group on the live timetable (#2). Null clears. */
  onPreviewGroup?: (p: { courseCode: string; sessionType: string; groupCode: string } | null) => void;
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
  onSelectSessionGroup,
  onPreviewGroup,
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
          <span className="text-[10px] text-foreground/40">{t("nz")}</span>
        </div>
      </div>

      {/* Course list grouped by discipline */}
      <div className="space-y-3">
        {allCourses.length === 0 ? (
          <p className="py-4 text-center text-xs text-foreground/30">
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
                  <span className="flex-1 text-[11px] font-semibold text-foreground/50">
                    {disciplineName}
                  </span>
                  <span className="font-mono text-[10px] text-foreground/30">
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
                          <Lock className="h-3 w-3 shrink-0 text-foreground/30" />
                          <span className="flex-1 truncate text-xs text-foreground/70">
                            {isHe
                              ? course.nameHe
                              : (course.nameEn ?? course.nameHe)}
                          </span>
                          {course.courseType === "ENGLISH" && (
                            <span className="shrink-0 rounded bg-foreground/8 px-1 text-[10px] font-medium text-foreground/50" title={isHe ? "נלמד באנגלית" : "Taught in English"}>EN</span>
                          )}
                          <span className="shrink-0 rounded-full bg-foreground/8 px-1.5 py-0.5 text-[10px] font-medium text-foreground/50">
                            {t("mandatory")}
                          </span>
                          <span className="shrink-0 font-mono text-[10px] text-foreground/30">
                            {course.credits}
                          </span>
                        </button>
                      </CourseDetailPopover>
                      {/* Session group selector — only for courses with multiple lecture/tutorial groups (this semester's) */}
                      {(() => {
                        const semSessions = sessionsForSemester(course.scheduleSessions);
                        return onSelectSessionGroup && courseHasMultipleGroups(semSessions) ? (
                          <div className="ms-6">
                            <SessionGroupSelector
                              courseCode={course.code}
                              courseName={isHe ? course.nameHe : (course.nameEn ?? course.nameHe)}
                              sessions={semSessions}
                              selectedGroups={sessionGroupSelections?.[course.code] ?? {}}
                              onSelectGroup={onSelectSessionGroup}
                              onPreviewGroup={onPreviewGroup}
                            />
                          </div>
                        ) : null;
                      })()}
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
                          <span className="shrink-0 rounded bg-foreground/8 px-1 text-[10px] font-medium text-foreground/50" title={isHe ? "נלמד באנגלית" : "Taught in English"}>EN</span>
                        )}
                        {customCourseIds?.has(course.id) && (
                          <span className="shrink-0 rounded-full bg-foreground/5 px-1.5 py-0.5 text-[10px] font-medium text-foreground/40">
                            {isHe ? "ידני" : "Custom"}
                          </span>
                        )}
                        <span className="shrink-0 font-mono text-[10px] text-foreground/30">
                          {course.credits}
                        </span>
                        {customCourseIds?.has(course.id) && onDeleteCustomCourse && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteCustomCourse(course.id);
                            }}
                            className="shrink-0 rounded-full p-0.5 text-foreground/30 opacity-60 transition-all hover:bg-red-400/10 hover:text-red-400 hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent-brand/50 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                            aria-label={isHe ? "מחק קורס ידני" : "Delete custom course"}
                            title={isHe ? "מחק קורס ידני" : "Delete custom course"}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveCourse(course.id);
                          }}
                          className="shrink-0 rounded-full p-0.5 text-foreground/30 opacity-60 transition-all hover:bg-red-400/10 hover:text-red-400 hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent-brand/50 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                          aria-label={isHe ? "הסר" : "Remove"}
                          title={isHe ? "הסר" : "Remove"}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </CourseDetailPopover>
                    {/* Session-group selector for ELECTIVES too (#2) — a
                        multi-group elective used to silently take group 1.
                        Filtered to THIS semester's sessions. */}
                    {(() => {
                      const semSessions = sessionsForSemester(course.scheduleSessions);
                      return onSelectSessionGroup && courseHasMultipleGroups(semSessions) ? (
                        <div className="ms-6">
                          <SessionGroupSelector
                            courseCode={course.code}
                            courseName={isHe ? course.nameHe : (course.nameEn ?? course.nameHe)}
                            sessions={semSessions}
                            selectedGroups={sessionGroupSelections?.[course.code] ?? {}}
                            onSelectGroup={onSelectSessionGroup}
                            onPreviewGroup={onPreviewGroup}
                          />
                        </div>
                      ) : null;
                    })()}
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
