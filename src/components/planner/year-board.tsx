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
  /** השנה שהסטודנט *לומד* בה — מזינה את תגית "בלימוד". בחופשה אין כזו. */
  currentYear: number;
  /** השנה שהסטודנט *מתכנן* — הסמסטר הקרוב שמלמדים בו. זה הטאב שנפתח. */
  planningYear: number;
  /** הסמסטר הקרוב שמלמדים בו — הטאב שנפתח בטלפון. */
  planningSemester: Semester;
}

export function YearBoard({
  courses,
  currentYear,
  planningYear,
  planningSemester,
}: YearBoardProps) {
  const tYear = useTranslations("year");
  const tCredits = useTranslations("credits");
  const isHe = useLocale() === "he";

  // null = the student has not picked a tab, so show the year they are actually
  // in. Resolved HERE rather than seeded into the store, so an explicit tab
  // click still wins and nothing has to race the profile query. (#23/#24/#27)
  const selectedYearRaw = usePlannerStore((s) => s.selectedYear);
  // `planningYear`, לא `currentYear`. בזמן לימודים הם זהים; בחופשת הסמסטר —
  // כלומר בדיוק בימים שבהם נפתח הבידינג — הם נבדלים בשנה שלמה, והלוח נפתח על
  // השנה שהסתיימה במקום על זו שמגישים עליה. נמדד ב-2.9.2026.
  const selectedYear = selectedYearRaw ?? planningYear;
  const setSelectedYear = usePlannerStore((s) => s.setSelectedYear);

  // Ariel, #3, 2.9: "ההמלצה והתהליך הטבעי לכל משתמש כרגע היא לתכנן שני
  // סמסטרים א וב׳ של השנה שהוא עושה! הם יכולים להיות אפילו באותו חלון עם
  // טאבים שונים."
  //
  // The two semesters were a `grid-cols-1 md:grid-cols-2`: side by side on a
  // desktop, STACKED on a phone. Measured on 375×812: סמסטר א׳ began at 1465px
  // and סמסטר ב׳ at 2117px, so on the device most students use you could never
  // see both at once, and comparing them meant scrolling a screen and a half
  // and holding the first one in your head. For a task whose whole nature is
  // balancing one semester against the other — and which the bidding submits
  // together — that is the wrong shape.
  //
  // So on a phone they become tabs, exactly as he suggested. From `md` up,
  // where both genuinely fit, nothing changes: two columns, no tabs.
  // Moving a course between them without dragging already exists on the card
  // itself, so the tab boundary costs nothing.
  // ברירת המחדל היא הסמסטר הקרוב, לא "FALL" קבוע — אחרת סטודנט שפותח את הלוח
  // באמצע סמסטר א׳ כדי לתכנן את ב׳ נוחת על הטאב הלא־נכון.
  const [mobileSemester, setMobileSemester] = useState<Semester>(planningSemester);

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
              className="animate-fade-in inline-flex items-center gap-1 text-xs font-medium text-status-green"
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

        {/* Semester tabs — PHONE ONLY. Hidden from `md` up, where both columns
            are visible at once and a tab would only hide half the answer. */}
        <div className="flex items-center gap-1 rounded-lg border border-border/50 bg-card/30 p-1 md:hidden">
          {SEMESTERS.map((semester) => {
            const isActive = mobileSemester === semester;
            const credits = getCoursesForSlot(selectedYear, semester).reduce(
              (sum, uc) => sum + uc.course.credits,
              0,
            );
            return (
              <button
                key={semester}
                type="button"
                onClick={() => setMobileSemester(semester)}
                aria-pressed={isActive}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all",
                  isActive
                    ? "border border-foreground/30 bg-foreground/15 text-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-card/60 hover:text-foreground",
                )}
              >
                <span className="font-bold">
                  {isHe
                    ? semester === "FALL"
                      ? "סמסטר א׳"
                      : "סמסטר ב׳"
                    : semester === "FALL"
                      ? "Semester A"
                      : "Semester B"}
                </span>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                    isActive
                      ? "bg-foreground/20 text-foreground"
                      : "bg-muted/50 text-muted-foreground",
                  )}
                >
                  {credits} {tCredits("title")}
                </span>
              </button>
            );
          })}
        </div>

        {/* Semester columns for selected year — סתיו ואביב בלבד.
            On a phone only the tabbed one renders; from `md` both do. */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {SEMESTERS.map((semester) => (
            <div
              key={`${selectedYear}-${semester}`}
              className={cn(mobileSemester === semester ? "block" : "hidden", "md:block")}
            >
              <SemesterColumn
                year={selectedYear}
                semester={semester}
                courses={getCoursesForSlot(selectedYear, semester)}
                currentYear={currentYear}
              />
            </div>
          ))}
        </div>

        {/* רשת-ביטחון: קורסים שמשובצים לסמסטר קיץ (אין לזה עמודה) */}
        {summerCourses.length > 0 && (
          <div className="rounded-xl border border-amber-400/50 bg-amber-50/60 p-3 dark:bg-amber-950/20">
            <p className="text-sm font-semibold text-status-amber">
              {isHe
                ? "יש קורסים שמשובצים לסמסטר קיץ"
                : "Some courses are placed in a summer semester"}
            </p>
            <p className="mt-0.5 text-xs text-status-amber/80/70">
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
                    className="shrink-0 rounded-md border border-amber-400/60 px-2 py-1 text-[11px] font-semibold text-status-amber transition-colors hover:bg-amber-100 disabled:opacity-50 dark:hover:bg-amber-900/30"
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
