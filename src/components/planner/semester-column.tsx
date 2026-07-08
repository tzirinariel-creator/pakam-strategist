"use client";

import { useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { CourseCard } from "./course-card";
import { SEMESTER_CONFIG } from "@/lib/constants";
import { usePlannerStore } from "@/stores/planner-store";
import type { UserCourseWithCourse } from "@/types/degree";
import type { Semester } from "@/types/enums";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

interface SemesterColumnProps {
  year: number;
  semester: Semester;
  courses: UserCourseWithCourse[];
  currentYear: number;
}

export function SemesterColumn({ year, semester, courses, currentYear }: SemesterColumnProps) {
  const t = useTranslations("planner");
  const tCredits = useTranslations("credits");
  const locale = useLocale();
  const openAddModal = usePlannerStore((s) => s.openAddModal);

  // Droppable ID encodes both year and semester: "1-FALL", "2-SPRING", etc.
  const droppableId = `${year}-${semester}`;

  const { isOver, setNodeRef } = useDroppable({
    id: droppableId,
    data: {
      type: "semester-column",
      year,
      semester,
    },
  });

  const totalCredits = courses.reduce((sum, uc) => sum + uc.course.credits, 0);
  const semConfig = SEMESTER_CONFIG[semester];

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-[280px] flex-col rounded-xl border border-border/60 bg-card/50 transition-all",
        isOver && "border-foreground/70 shadow-lg shadow-sm ring-1 ring-foreground/30",
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/40 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-foreground">
            {locale === "he" ? semConfig.nameHe : (semConfig.nameEn ?? semester)}
          </h3>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="font-bold text-foreground/80">{totalCredits}</span>
          <span>{tCredits("title")}</span>
        </div>
      </div>

      {/* Course list */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-1.5 p-2">
          {courses.length === 0 && (
            <div className={cn(
              "flex min-h-[100px] items-center justify-center rounded-lg border border-dashed border-border/40 text-xs text-muted-foreground/60",
              isOver && "border-foreground/50 bg-foreground/5 text-foreground/70",
            )}>
              {isOver ? t("dropHere") : t("emptySlot")}
            </div>
          )}

          {courses.map((uc) => (
            <CourseCard key={uc.id} userCourse={uc} currentYear={currentYear} />
          ))}
        </div>
      </ScrollArea>

      {/* Add course button */}
      <div className="border-t border-border/40 p-2">
        <button
          type="button"
          onClick={() => openAddModal(year, semester)}
          className={cn(
            "flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/50 p-2",
            "text-xs text-muted-foreground transition-all",
            "hover:border-foreground/50 hover:bg-foreground/5 hover:text-foreground",
          )}
        >
          <Plus className="size-3.5" />
          {t("addCourse")}
        </button>
      </div>
    </div>
  );
}
