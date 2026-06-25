"use client";

import { useLocale, useTranslations } from "next-intl";
import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { YEAR_CONFIG, SEMESTER_CONFIG } from "@/lib/constants";
import { OnboardingCourseCard } from "./onboarding-course-card";
import { SemesterAnalyticsBar } from "./semester-analytics-bar";
import type { GeneratedPlanCourse, SemesterAnalytics, CourseWithSchedule } from "@/lib/plan-generator";

interface SemesterGridProps {
  planned: GeneratedPlanCourse[];
  allCourses: CourseWithSchedule[];
  analytics: SemesterAnalytics[];
}

export function SemesterGrid({ planned, allCourses, analytics }: SemesterGridProps) {
  const locale = useLocale();
  const isHe = locale === "he";
  const courseMap = new Map(allCourses.map((c) => [c.id, c]));

  return (
    <div className="w-full max-w-3xl space-y-4">
      {([1, 2, 3] as const).map((year) => (
        <div key={year}>
          {/* Year label */}
          <div className="mb-2 flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground/70">
              {isHe ? YEAR_CONFIG[year].nameHe : YEAR_CONFIG[year].nameEn}
            </span>
          </div>

          {/* Two-column grid: Fall | Spring */}
          <div className="grid grid-cols-2 gap-3">
            {(["FALL", "SPRING"] as const).map((sem) => {
              const semAnalytics = analytics.find(
                (a) => a.year === year && a.semester === sem
              );
              const semCourses = planned.filter(
                (pc) => pc.plannedYear === year && pc.plannedSemester === sem
              );

              return (
                <SemesterDropZone
                  key={`${year}-${sem}`}
                  year={year}
                  semester={sem}
                  courses={semCourses}
                  courseMap={courseMap}
                  analytics={semAnalytics}
                  isHe={isHe}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

interface SemesterDropZoneProps {
  year: number;
  semester: "FALL" | "SPRING";
  courses: GeneratedPlanCourse[];
  courseMap: Map<string, CourseWithSchedule>;
  analytics?: SemesterAnalytics;
  isHe: boolean;
}

function SemesterDropZone({
  year,
  semester,
  courses,
  courseMap,
  analytics,
  isHe,
}: SemesterDropZoneProps) {
  const t = useTranslations("onboarding");
  const semCfg = SEMESTER_CONFIG[semester];

  const { setNodeRef, isOver } = useDroppable({
    id: `${year}-${semester}`,
    data: { year, semester },
  });

  const credits = courses.reduce((sum, pc) => {
    return sum + (courseMap.get(pc.courseId)?.credits ?? 0);
  }, 0);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-xl border p-3 transition-all min-h-[120px]",
        isOver
          ? "border-foreground/50 bg-foreground/5 shadow-sm"
          : "border-border/40 bg-card/20"
      )}
    >
      {/* Semester header */}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-foreground/50">
          {isHe ? semCfg.short : semCfg.shortEn}
        </span>
        <span className="font-mono text-[10px] text-foreground/60">
          {credits} {t("nz")}
        </span>
      </div>

      {/* Course list */}
      <div className="space-y-1">
        {courses.map((pc) => {
          const course = courseMap.get(pc.courseId);
          if (!course) return null;
          return (
            <OnboardingCourseCard
              key={pc.courseId}
              course={course}
              locked={pc.locked}
            />
          );
        })}
        {courses.length === 0 && (
          <div className={cn(
            "flex h-16 items-center justify-center rounded-lg border border-dashed text-[10px]",
            isOver ? "border-foreground/30 text-foreground/50" : "border-border/30 text-foreground/20"
          )}>
            {isOver ? (isHe ? "שחרר כאן" : "Drop here") : (isHe ? "אין קורסים" : "No courses")}
          </div>
        )}
      </div>

      {/* Analytics bar */}
      {analytics && analytics.courseCount > 0 && (
        <div className="mt-2 border-t border-border/20 pt-2">
          <SemesterAnalyticsBar analytics={analytics} />
        </div>
      )}
    </div>
  );
}
