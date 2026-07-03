"use client";

import { useState, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Search, Plus, Loader2, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DisciplineBadge } from "@/components/catalog/discipline-badge";
import { SEMESTER_CONFIG, YEAR_CONFIG } from "@/lib/constants";
import { toast } from "sonner";
import { usePlannerStore } from "@/stores/planner-store";
import { api } from "@/lib/trpc/react";
import { invalidatePlanData } from "@/lib/trpc/invalidate-plan";
import { detectTimeConflicts, formatConflict, type SessionInfo } from "@/lib/conflict-detector";
import { cn } from "@/lib/utils";

export function AddCourseModal() {
  const t = useTranslations("planner");
  const tCommon = useTranslations("common");
  const tCredits = useTranslations("credits");
  const tCatalog = useTranslations("catalog");
  const locale = useLocale();
  const isHe = locale === "he";

  const showAddCourseModal = usePlannerStore((s) => s.showAddCourseModal);
  const targetSemester = usePlannerStore((s) => s.targetSemester);
  const targetYear = usePlannerStore((s) => s.targetYear);
  const closeAddModal = usePlannerStore((s) => s.closeAddModal);

  const [search, setSearch] = useState("");

  // Fetch course catalog (now includes scheduleSessions)
  const { data: allCourses, isLoading: catalogLoading } = api.course.list.useQuery(
    search.length >= 2 ? { search } : undefined,
    { enabled: showAddCourseModal },
  );

  // Fetch user plan to know which courses are already added
  const { data: planData } = api.plan.getUserPlan.useQuery(undefined, {
    enabled: showAddCourseModal,
  });

  // Fetch existing schedule for the target semester (for conflict detection)
  const { data: scheduleData } = api.schedule.getScheduleForSemester.useQuery(
    { year: targetYear ?? 1, semester: (targetSemester ?? "FALL") as "FALL" | "SPRING" | "SUMMER" },
    { enabled: showAddCourseModal && !!targetYear && !!targetSemester },
  );

  // Build existing sessions map for conflict detection
  const existingSessions = useMemo<SessionInfo[]>(() => {
    if (!scheduleData?.sessions) return [];
    return scheduleData.sessions.map((s) => ({
      id: s.id,
      courseCode: s.courseCode,
      courseName: isHe ? s.course.nameHe : (s.course.nameEn ?? s.course.nameHe),
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      sessionType: s.sessionType,
    }));
  }, [scheduleData?.sessions]);

  const utils = api.useUtils();
  const addCourseMutation = api.plan.addCourse.useMutation({
    onSuccess: () => {
      // Adding a course changes credits, forecast and compliance (#23).
      invalidatePlanData(utils);
      void utils.schedule.getScheduleForSemester.invalidate();
      toast.success(t("courseAdded"));
    },
    onError: () => {
      toast.error(tCommon("error"));
    },
  });

  // Courses already in the plan (by courseId)
  const existingCourseIds = new Set(
    planData?.courses.map((uc) => uc.courseId) ?? [],
  );

  // Build conflict map: courseId → conflict descriptions
  const conflictMap = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!allCourses || existingSessions.length === 0 || !targetSemester) return map;

    for (const course of allCourses) {
      // Get sessions for this course that match the target semester
      const courseSessions: SessionInfo[] = (course.scheduleSessions ?? [])
        .filter((s) => s.semester === targetSemester)
        .map((s) => ({
          id: s.id,
          courseCode: s.courseCode,
          courseName: isHe ? course.nameHe : (course.nameEn ?? course.nameHe),
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
          sessionType: s.sessionType,
        }));

      if (courseSessions.length === 0) continue;

      const conflicts = detectTimeConflicts(existingSessions, courseSessions);
      if (conflicts.length > 0) {
        map.set(
          course.id,
          conflicts.map((c) => formatConflict(c, locale === "he" ? "he" : "en")),
        );
      }
    }
    return map;
  }, [allCourses, existingSessions, targetSemester, locale]);

  const handleAddCourse = (courseId: string) => {
    if (!targetYear || !targetSemester) return;

    addCourseMutation.mutate(
      {
        courseId,
        plannedYear: targetYear,
        plannedSemester: targetSemester,
      },
      {
        onSuccess: () => {
          closeAddModal();
          setSearch("");
        },
      },
    );
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      closeAddModal();
      setSearch("");
    }
  };

  const yearConfig = targetYear
    ? (YEAR_CONFIG[targetYear as keyof typeof YEAR_CONFIG] ?? null)
    : null;
  const semConfig = targetSemester
    ? (SEMESTER_CONFIG[targetSemester as keyof typeof SEMESTER_CONFIG] ?? null)
    : null;

  return (
    <Dialog open={showAddCourseModal} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display font-bold text-foreground/80">
            {t("addCourse")}
          </DialogTitle>
          {yearConfig && semConfig && (
            <DialogDescription>
              {t("addingTo", {
                year: isHe ? yearConfig.nameHe : yearConfig.nameEn,
                semester: isHe ? semConfig.nameHe : semConfig.nameEn,
              })}
            </DialogDescription>
          )}
        </DialogHeader>

        {/* Search input */}
        <div className="relative">
          <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tCatalog("searchPlaceholder")}
            aria-label={tCatalog("searchPlaceholder")}
            className="ps-9"
            autoFocus
          />
        </div>

        {/* Course list */}
        <ScrollArea className="h-[360px]">
          <div className="flex flex-col gap-1">
            {catalogLoading && (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="size-5 animate-spin text-foreground/80" />
                <span className="ms-2 text-sm text-muted-foreground">
                  {tCommon("loading")}
                </span>
              </div>
            )}

            {!catalogLoading && allCourses?.length === 0 && (
              <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                {tCommon("noResults")}
              </div>
            )}

            {allCourses?.map((course) => {
              const alreadyAdded = existingCourseIds.has(course.id);
              const isAdding =
                addCourseMutation.isPending &&
                addCourseMutation.variables?.courseId === course.id;
              const conflicts = conflictMap.get(course.id);
              const hasConflict = conflicts && conflicts.length > 0;

              return (
                <button
                  key={course.id}
                  type="button"
                  disabled={alreadyAdded || isAdding}
                  onClick={() => handleAddCourse(course.id)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border border-transparent p-2.5 text-start transition-all",
                    alreadyAdded
                      ? "opacity-40 cursor-not-allowed"
                      : "hover:border-foreground/30 hover:bg-foreground/5 cursor-pointer",
                    hasConflict && !alreadyAdded && "border-amber-400/30 bg-amber-400/5",
                  )}
                >
                  {/* Course info */}
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {isHe ? course.nameHe : (course.nameEn ?? course.nameHe)}
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {course.code}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <DisciplineBadge
                        discipline={course.discipline}
                        className="text-[10px] px-1.5 py-0"
                      />
                      <span className="text-[10px] text-muted-foreground">
                        <span className="tabular">{course.credits}</span> {tCredits("title")}
                      </span>
                    </div>
                    {/* Conflict warning */}
                    {hasConflict && !alreadyAdded && (
                      <div className="flex items-start gap-1 mt-0.5">
                        <AlertTriangle className="size-3 shrink-0 text-amber-400 mt-0.5" />
                        <span className="text-[10px] leading-tight text-amber-400">
                          {conflicts[0]}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Add icon */}
                  <div className="shrink-0">
                    {isAdding ? (
                      <Loader2 className="size-4 animate-spin text-foreground/80" />
                    ) : alreadyAdded ? (
                      <span className="text-[10px] text-muted-foreground">
                        {t("alreadyAdded")}
                      </span>
                    ) : (
                      <Plus className="size-4 text-foreground/80" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
