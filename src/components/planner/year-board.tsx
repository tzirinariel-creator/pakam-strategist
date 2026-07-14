"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useTranslations, useLocale } from "next-intl";
import { CheckCircle2 } from "lucide-react";
import { SemesterColumn } from "./semester-column";
import { CourseCardOverlay } from "./course-card";
import { toast } from "sonner";
import { usePlannerStore } from "@/stores/planner-store";
import { api } from "@/lib/trpc/react";
import { invalidatePlanData } from "@/lib/trpc/invalidate-plan";
import type { UserCourseWithCourse } from "@/types/degree";
import type { Semester } from "@/types/enums";
import { cn } from "@/lib/utils";

// פכ"מ מתוכנן לסתיו ואביב בלבד. אין סמסטר קיץ בלוח — קורס שמשובץ לקיץ
// נמחק בשקט בשמירה הבאה (המתכנן לא מכיר קיץ), לכן קיץ אינו יעד-גרירה ולא
// ניתן להוספה. ההגנה ב-handleDragEnd נשענת על כך ש-SUMMER אינו ברשימה הזו.
const SEMESTERS: Semester[] = ["FALL", "SPRING"];
const YEARS = [1, 2, 3] as const;

interface YearBoardProps {
  courses: UserCourseWithCourse[];
  currentYear: number;
}

export function YearBoard({ courses, currentYear }: YearBoardProps) {
  const tYear = useTranslations("year");
  const tCredits = useTranslations("credits");
  const isHe = useLocale() === "he";

  const selectedYear = usePlannerStore((s) => s.selectedYear);
  const setSelectedYear = usePlannerStore((s) => s.setSelectedYear);

  const [activeCourse, setActiveCourse] = useState<UserCourseWithCourse | null>(null);

  // Unified save feedback (מסלול E): a drag-move persists instantly, so instead
  // of a fleeting toast we show a steady "נשמר ✓" next to the board — the same
  // wording as the green "saved" banner on the planner, so the whole app speaks
  // one save-vocabulary instead of two mechanisms.
  const [showSaved, setShowSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (savedTimer.current) clearTimeout(savedTimer.current);
  }, []);

  const utils = api.useUtils();
  const updateCourse = api.plan.updateCourse.useMutation({
    onSuccess: () => {
      // Moving a course between years/semesters changes per-period credits,
      // graduation forecast and compliance — invalidate the whole set (#23).
      invalidatePlanData(utils);
      setShowSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setShowSaved(false), 2500);
    },
    onError: (e) => {
      // Friendly duplicate message (#35): the server now refuses to move a
      // course into a semester that already holds its retake twin.
      if (e.message === "COURSE_ALREADY_IN_SEMESTER") {
        toast.error(isHe ? "הקורס כבר נמצא בסמסטר הזה" : "This course is already in that semester");
        return;
      }
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
  // Keyboard access (#audit-r4): the card already advertises role=button /
  // aria-roledescription=draggable, so a keyboard user must be able to actually
  // move it — Space/Enter picks up, arrows move, Space drops. Without a
  // KeyboardSensor the board's primary action was pointer-only.
  const keyboardSensor = useSensor(KeyboardSensor);
  const sensors = useSensors(pointerSensor, touchSensor, keyboardSensor);

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

  // רשת-ביטחון: קורסים שכבר משובצים לקיץ (מצב ישן/נדיר). הם לא מוצגים
  // באף עמודה כי אין עמודת-קיץ — אז נציג אותם בנפרד עם דרך-מילוט ברורה,
  // כדי שלא ייעלמו וייאבדו בלי שהמשתמש ידע.
  const summerCourses = courses.filter((uc) => uc.plannedSemester === "SUMMER");

  const moveSummerToSpring = useCallback(
    (uc: UserCourseWithCourse) => {
      updateCourse.mutate({
        userCourseId: uc.id,
        plannedYear: uc.plannedYear,
        plannedSemester: "SPRING",
      });
    },
    [updateCourse],
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
        {/* Steady "saved" indicator next to the board (unified save feedback) */}
        <div className="flex h-4 items-center justify-end">
          {showSaved && (
            <span
              role="status"
              className="animate-fade-in inline-flex items-center gap-1 text-xs font-medium text-emerald-500"
            >
              <CheckCircle2 className="size-3.5" />
              {isHe ? "נשמר" : "Saved"}
            </span>
          )}
        </div>

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

        {/* Semester columns for selected year — סתיו ואביב בלבד */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {SEMESTERS.map((semester) => (
            <SemesterColumn
              key={`${selectedYear}-${semester}`}
              year={selectedYear}
              semester={semester}
              courses={getCoursesForSlot(selectedYear, semester)}
              currentYear={currentYear}
            />
          ))}
        </div>

        {/* רשת-ביטחון: קורסים שמשובצים לסמסטר קיץ (אין לזה עמודה) */}
        {summerCourses.length > 0 && (
          <div className="rounded-xl border border-amber-400/50 bg-amber-50/60 p-3 dark:bg-amber-950/20">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              {isHe
                ? "יש קורסים שמשובצים לסמסטר קיץ"
                : "Some courses are placed in a summer semester"}
            </p>
            <p className="mt-0.5 text-xs text-amber-800/80 dark:text-amber-200/70">
              {isHe
                ? "פכ״מ מתוכנן לסתיו ולאביב בלבד. כדי שהקורסים האלה לא יאבדו, העבירו אותם לאביב."
                : "This degree is planned for fall and spring only. Move these to spring so they aren't lost."}
            </p>
            <div className="mt-2 flex flex-col gap-1.5">
              {summerCourses.map((uc) => (
                <div
                  key={uc.id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-card/70 px-2.5 py-1.5"
                >
                  <span className="truncate text-xs font-medium text-foreground">
                    {isHe ? uc.course.nameHe : (uc.course.nameEn ?? uc.course.nameHe)}
                    <span className="text-muted-foreground"> · {tYear(String(uc.plannedYear))}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => moveSummerToSpring(uc)}
                    disabled={updateCourse.isPending}
                    className="shrink-0 rounded-md border border-amber-400/60 px-2 py-1 text-[11px] font-semibold text-amber-900 transition-colors hover:bg-amber-100 disabled:opacity-50 dark:text-amber-200 dark:hover:bg-amber-900/30"
                  >
                    {isHe ? "העבירו לאביב" : "Move to spring"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
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
