"use client";

import { useState, useEffect, useRef } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  CheckCircle2,
  Clock,
  XCircle,
  BookOpen,
  ShieldCheck,
  GripVertical,
  Trash2,
} from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { DisciplineBadge } from "@/components/catalog/discipline-badge";
import { DISCIPLINE_CONFIG } from "@/lib/constants";
import { api } from "@/lib/trpc/react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import type { UserCourseWithCourse } from "@/types/degree";
import type { CourseStatus } from "@/types/enums";
import { cn } from "@/lib/utils";

interface CourseCardProps {
  userCourse: UserCourseWithCourse;
  /** Whether DnD is disabled (e.g. while modal is open) */
  disabled?: boolean;
}

const STATUS_ICON: Record<CourseStatus, React.ReactNode> = {
  PLANNED: <Clock className="size-3.5 text-muted-foreground" />,
  IN_PROGRESS: <BookOpen className="size-3.5 text-blue-400" />,
  COMPLETED: <CheckCircle2 className="size-3.5 text-emerald-400" />,
  FAILED: <XCircle className="size-3.5 text-red-400" />,
  EXEMPT: <ShieldCheck className="size-3.5 text-amber-400" />,
};

export function CourseCard({ userCourse, disabled }: CourseCardProps) {
  const t = useTranslations("courseStatus");
  const tPlanner = useTranslations("planner");
  const locale = useLocale();
  const isHe = locale === "he";
  const { course } = userCourse;
  const courseName = isHe ? course.nameHe : (course.nameEn ?? course.nameHe);
  const config = DISCIPLINE_CONFIG[course.discipline];
  const [confirmRemove, setConfirmRemove] = useState(false);

  const utils = api.useUtils();
  const removeMutation = api.plan.removeCourse.useMutation({
    onSuccess: () => {
      void utils.plan.getUserPlan.invalidate();
      void utils.plan.getCredits.invalidate();
      void utils.plan.getGraduationScore.invalidate();
      toast.success(tPlanner("courseRemoved"));
    },
    onError: () => {
      toast.error(tPlanner("removeError"));
    },
  });

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: userCourse.id,
    data: {
      type: "course-card",
      userCourse,
    },
    disabled: disabled ?? confirmRemove,
  });

  const style = transform
    ? {
        transform: CSS.Translate.toString(transform),
        zIndex: 50,
      }
    : undefined;

  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
    };
  }, []);

  const handleRemoveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (confirmRemove) {
      // Clear the auto-dismiss timeout before executing
      if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
      removeMutation.mutate({ userCourseId: userCourse.id });
      setConfirmRemove(false);
    } else {
      setConfirmRemove(true);
      // Auto-dismiss confirm after 3s, with safe cleanup
      if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
      confirmTimeoutRef.current = setTimeout(() => setConfirmRemove(false), 3000);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative flex items-center gap-2 rounded-lg border border-border/60 bg-card p-2.5 transition-all",
        "hover:border-foreground/40 hover:shadow-md hover:shadow-foreground/5",
        isDragging && "opacity-50 shadow-lg shadow-foreground/20 ring-2 ring-foreground/40",
        confirmRemove && "border-red-400/50 bg-red-500/5",
        !disabled && !confirmRemove && "cursor-grab active:cursor-grabbing",
      )}
      {...(confirmRemove ? {} : { ...attributes, ...listeners })}
    >
      {/* Discipline color strip (start side = right in RTL) */}
      <div
        className="absolute inset-y-0 start-0 w-1 rounded-s-lg"
        style={{ backgroundColor: config?.color ?? "hsl(var(--muted-foreground))" }}
      />

      {/* Grip handle */}
      <GripVertical className="size-4 shrink-0 text-muted-foreground/40 group-hover:text-muted-foreground/70 ms-1" />

      {/* Course info */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          {STATUS_ICON[userCourse.status]}
          <span className="line-clamp-2 text-sm font-medium leading-tight" title={`${course.code} — ${courseName}`}>
            {courseName}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-muted-foreground/60">{course.code}</span>
          <DisciplineBadge
            discipline={userCourse.disciplineOverride ?? course.discipline}
            className="text-[10px] px-1.5 py-0"
          />
          {userCourse.grade !== null && userCourse.status === "COMPLETED" && (
            <GradeWithTooltip
              grade={userCourse.grade}
              courseType={course.courseType}
              credits={course.credits}
              isHe={isHe}
            />
          )}
        </div>
      </div>

      {/* Credits */}
      <div className="flex shrink-0 flex-col items-center">
        <span className="text-sm font-bold text-foreground/80">
          {course.credits}
        </span>
        <span className="text-[9px] text-muted-foreground leading-none">
          {t(userCourse.status)}
        </span>
      </div>

      {/* Remove button — shows on hover */}
      <button
        type="button"
        onClick={handleRemoveClick}
        onPointerDown={(e) => e.stopPropagation()}
        className={cn(
          "absolute -top-1.5 -end-1.5 z-20 flex items-center justify-center rounded-full border transition-all",
          confirmRemove
            ? "size-auto gap-1 border-red-400/60 bg-red-500/90 px-2 py-0.5 text-[10px] font-medium text-white"
            : "size-5 border-border/60 bg-card text-muted-foreground/50 opacity-0 hover:border-red-400/60 hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100 focus:opacity-100 focus:ring-2 focus:ring-red-400/60 focus:outline-none",
        )}
        title={tPlanner("removeCourse")}
      >
        {confirmRemove ? (
          <span>{tPlanner("removeCourse")}?</span>
        ) : (
          <Trash2 className="size-2.5" />
        )}
      </button>
    </div>
  );
}

function GradeWithTooltip({
  grade,
  courseType,
  credits,
  isHe,
}: {
  grade: number;
  courseType: string;
  credits: number;
  isHe: boolean;
}) {
  // Determine weight category
  const isSeminar = courseType === "SEMINAR";
  const isReferat = courseType === "PRACTICE"; // referat = practice in the system
  const weight = isSeminar ? "18%" : isReferat ? "4%" : "78%";
  const label = isSeminar
    ? isHe ? "עבודה סמינריונית" : "Seminar paper"
    : isReferat
      ? isHe ? "רפרט" : "Referat"
      : isHe ? "קורס" : "Course";

  // Dynamic color based on grade
  const gradeColor =
    grade >= 85
      ? "text-emerald-400"
      : grade >= 70
        ? "text-foreground/70"
        : grade >= 60
          ? "text-amber-400"
          : "text-red-400";

  const tooltipText = isHe
    ? `${label} | ציון ${grade} | משקל: ${weight} מנוסחת הגמר | ${credits} ש״ס`
    : `${label} | Grade ${grade} | Weight: ${weight} of final score | ${credits} cr.`;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn("text-[10px] font-medium cursor-help", gradeColor)}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {grade}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[200px]">
          <p className="text-xs" dir="auto">{tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * A static version of CourseCard for use inside overlays (DragOverlay).
 * No drag hooks attached.
 */
export function CourseCardOverlay({
  userCourse,
}: {
  userCourse: UserCourseWithCourse;
}) {
  const locale = useLocale();
  const isHe = locale === "he";
  const { course } = userCourse;
  const courseName = isHe ? course.nameHe : (course.nameEn ?? course.nameHe);
  const config = DISCIPLINE_CONFIG[course.discipline];

  return (
    <div
      className={cn(
        "relative flex items-center gap-2 rounded-lg border border-foreground/60 bg-card p-2.5 shadow-xl shadow-foreground/20 ring-2 ring-foreground/40",
        "cursor-grabbing",
      )}
    >
      <div
        className="absolute inset-y-0 start-0 w-1 rounded-s-lg"
        style={{ backgroundColor: config?.color ?? "hsl(var(--muted-foreground))" }}
      />

      <GripVertical className="size-4 shrink-0 text-foreground/80 ms-1" />

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="line-clamp-2 text-sm font-medium leading-tight">
          {courseName}
        </span>
        <DisciplineBadge
          discipline={userCourse.disciplineOverride ?? course.discipline}
          className="text-[10px] px-1.5 py-0"
        />
      </div>

      <span className="shrink-0 text-sm font-bold text-foreground/80">
        {course.credits}
      </span>
    </div>
  );
}
