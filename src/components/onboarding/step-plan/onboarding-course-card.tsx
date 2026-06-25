"use client";

import { useLocale, useTranslations } from "next-intl";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { DISCIPLINE_CONFIG } from "@/lib/constants";
import { CourseDetailPopover } from "./course-detail-popover";
import type { CourseWithSchedule } from "@/lib/plan-generator";

interface OnboardingCourseCardProps {
  course: CourseWithSchedule;
  locked: boolean;
}

export function OnboardingCourseCard({ course, locked }: OnboardingCourseCardProps) {
  const locale = useLocale();
  const t = useTranslations("onboarding");
  const isHe = locale === "he";
  const cfg = DISCIPLINE_CONFIG[course.discipline as keyof typeof DISCIPLINE_CONFIG];

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: course.id,
    disabled: locked,
    data: { course },
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  return (
    <CourseDetailPopover course={course}>
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        className={cn(
          "group flex items-center gap-1.5 rounded-lg border px-2 py-1.5 transition-all cursor-pointer",
          isDragging && "opacity-30",
          locked
            ? "border-foreground/20 bg-foreground/5"
            : "border-border/40 bg-card/40 hover:border-border/60 hover:bg-card/60"
        )}
      >
        {/* Drag handle or lock icon */}
        {locked ? (
          <Lock className="h-3 w-3 shrink-0 text-foreground/40" />
        ) : (
          <div {...listeners} className="cursor-grab active:cursor-grabbing touch-none">
            <GripVertical className="h-3 w-3 shrink-0 text-foreground/20 group-hover:text-foreground/40 transition-colors" />
          </div>
        )}

        {/* Discipline dot */}
        <div
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: cfg?.color ?? "gray" }}
        />

        {/* Course name */}
        <span className="flex-1 truncate text-xs text-foreground/70">
          {isHe ? course.nameHe : (course.nameEn ?? course.nameHe)}
        </span>

        {/* Mandatory/elective badge */}
        {locked ? (
          <span className="shrink-0 rounded-full bg-foreground/10 px-1.5 py-0.5 text-[8px] font-medium text-foreground/70">
            {t("mandatory")}
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-foreground/5 px-1.5 py-0.5 text-[8px] font-medium text-foreground/30">
            {t("elective")}
          </span>
        )}

        {/* Credits */}
        <span className="shrink-0 font-mono text-[10px] text-foreground/30">
          {course.credits}
        </span>
      </div>
    </CourseDetailPopover>
  );
}

/** Lightweight version for the DragOverlay */
export function OnboardingCourseCardOverlay({ course }: { course: CourseWithSchedule }) {
  const locale = useLocale();
  const isHe = locale === "he";
  const cfg = DISCIPLINE_CONFIG[course.discipline as keyof typeof DISCIPLINE_CONFIG];

  return (
    <div
      className="flex items-center gap-1.5 rounded-lg border border-foreground/40 bg-card px-2 py-1.5 shadow-lg shadow-foreground/10"
      style={{ width: 240 }}
    >
      <GripVertical className="h-3 w-3 shrink-0 text-foreground/60" />
      <div
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: cfg?.color ?? "gray" }}
      />
      <span className="flex-1 truncate text-xs text-foreground/80">
        {isHe ? course.nameHe : (course.nameEn ?? course.nameHe)}
      </span>
      <span className="shrink-0 font-mono text-[10px] text-foreground/40">
        {course.credits}
      </span>
    </div>
  );
}
