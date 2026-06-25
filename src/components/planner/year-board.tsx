"use client";

import { useState, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useTranslations } from "next-intl";
import { SemesterColumn } from "./semester-column";
import { CourseCardOverlay } from "./course-card";
import { toast } from "sonner";
import { usePlannerStore } from "@/stores/planner-store";
import { api } from "@/lib/trpc/react";
import type { UserCourseWithCourse } from "@/types/degree";
import type { Semester } from "@/types/enums";
import { cn } from "@/lib/utils";

const SEMESTERS: Semester[] = ["FALL", "SPRING", "SUMMER"];
const YEARS = [1, 2, 3] as const;

interface YearBoardProps {
  courses: UserCourseWithCourse[];
}

export function YearBoard({ courses }: YearBoardProps) {
  const t = useTranslations("planner");
  const tYear = useTranslations("year");
  const tCredits = useTranslations("credits");

  const selectedYear = usePlannerStore((s) => s.selectedYear);
  const setSelectedYear = usePlannerStore((s) => s.setSelectedYear);

  const [activeCourse, setActiveCourse] = useState<UserCourseWithCourse | null>(null);

  const utils = api.useUtils();
  const updateCourse = api.plan.updateCourse.useMutation({
    onSuccess: () => {
      utils.plan.getUserPlan.invalidate();
      toast.success(t("courseMoved"));
    },
    onError: () => {
      toast.error(tCredits("error") ?? "Error moving course");
    },
  });

  // Sensors with activation constraints so a click != a drag
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 8 },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 200, tolerance: 5 },
  });
  const sensors = useSensors(pointerSensor, touchSensor);

  // Group courses by year and semester
  const getCoursesForSlot = useCallback(
    (year: number, semester: Semester): UserCourseWithCourse[] => {
      return courses.filter(
        (uc) => uc.plannedYear === year && uc.plannedSemester === semester,
      );
    },
    [courses],
  );

  // Credits per year
  const getYearCredits = useCallback(
    (year: number): number => {
      return courses
        .filter((uc) => uc.plannedYear === year)
        .reduce((sum, uc) => sum + uc.course.credits, 0);
    },
    [courses],
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const { active } = event;
      const uc = courses.find((c) => c.id === active.id);
      if (uc) setActiveCourse(uc);
    },
    [courses],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveCourse(null);
      const { active, over } = event;

      if (!over) return;

      const droppedId = over.id as string; // "year-semester" e.g. "2-SPRING"
      const parts = droppedId.split("-");
      if (parts.length < 2) return;

      const firstPart = parts[0];
      if (!firstPart) return;
      const targetYear = parseInt(firstPart, 10);
      const targetSemester = parts.slice(1).join("-") as Semester;

      if (!SEMESTERS.includes(targetSemester) || isNaN(targetYear)) return;

      // Find the dragged course
      const draggedCourse = courses.find((uc) => uc.id === active.id);
      if (!draggedCourse) return;

      // Skip if dropped in the same slot
      if (
        draggedCourse.plannedYear === targetYear &&
        draggedCourse.plannedSemester === targetSemester
      ) {
        return;
      }

      updateCourse.mutate({
        userCourseId: draggedCourse.id,
        plannedYear: targetYear,
        plannedSemester: targetSemester,
      });
    },
    [courses, updateCourse],
  );

  const handleDragCancel = useCallback(() => {
    setActiveCourse(null);
  }, []);

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex flex-col gap-4">
        {/* Year tabs */}
        <div className="flex items-center gap-1 rounded-lg border border-border/50 bg-card/30 p-1">
          {YEARS.map((year) => {
            const yearCredits = getYearCredits(year);
            const isActive = selectedYear === year;
            return (
              <button
                key={year}
                type="button"
                onClick={() => setSelectedYear(year)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all",
                  isActive
                    ? "bg-foreground/15 text-foreground shadow-sm border border-foreground/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-card/60",
                )}
              >
                <span className="font-bold">{tYear(String(year))}</span>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                    isActive
                      ? "bg-foreground/20 text-foreground"
                      : "bg-muted/50 text-muted-foreground",
                  )}
                >
                  {yearCredits} {tCredits("title")}
                </span>
              </button>
            );
          })}
        </div>

        {/* Semester columns for selected year */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {SEMESTERS.map((semester) => (
            <SemesterColumn
              key={`${selectedYear}-${semester}`}
              year={selectedYear}
              semester={semester}
              courses={getCoursesForSlot(selectedYear, semester)}
            />
          ))}
        </div>
      </div>

      {/* Drag overlay — renders the floating card while dragging */}
      <DragOverlay dropAnimation={null}>
        {activeCourse ? (
          <div className="w-64">
            <CourseCardOverlay userCourse={activeCourse} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
