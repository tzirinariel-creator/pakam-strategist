"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
  Check,
  GraduationCap,
  AlertTriangle,
} from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { DisciplineBadge } from "@/components/catalog/discipline-badge";
import { DISCIPLINE_CONFIG, CREDIT_REQUIREMENTS } from "@/lib/constants";
import { passBarFor } from "@/lib/grade-sheet";
import { isCurrentlyStudying } from "@/lib/semester-clock";
import { api } from "@/lib/trpc/react";
import { invalidatePlanData } from "@/lib/trpc/invalidate-plan";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { UserCourseWithCourse } from "@/types/degree";
import type { CourseStatus } from "@/types/enums";
import { Bidi } from "@/lib/bidi";
import { cn } from "@/lib/utils";

interface CourseCardProps {
  userCourse: UserCourseWithCourse;
  /** Whether DnD is disabled (e.g. while modal is open) */
  disabled?: boolean;
  /** Derived year of study — lets a PLANNED course of the current semester show
   *  as "בלימוד" (present) instead of "מתוכנן" (#4/#22). */
  currentYear?: number;
}

const STATUS_ICON: Record<CourseStatus, React.ReactNode> = {
  PLANNED: <Clock className="size-3.5 text-muted-foreground" />,
  IN_PROGRESS: <BookOpen className="size-3.5 text-blue-400" />,
  COMPLETED: <CheckCircle2 className="size-3.5 text-emerald-400" />,
  FAILED: <XCircle className="size-3.5 text-red-400" />,
  EXEMPT: <ShieldCheck className="size-3.5 text-amber-400" />,
};

export function CourseCard({ userCourse, disabled, currentYear }: CourseCardProps) {
  const t = useTranslations("courseStatus");
  const tPlanner = useTranslations("planner");
  const locale = useLocale();
  const isHe = locale === "he";
  const { course } = userCourse;
  const courseName = isHe ? course.nameHe : (course.nameEn ?? course.nameHe);
  const config = DISCIPLINE_CONFIG[course.discipline];
  // A PLANNED course of the current semester shows as "בלימוד" (present) —
  // derived, non-destructive; the stored status is untouched (#4/#22).
  const studyingNow =
    currentYear != null &&
    isCurrentlyStudying(
      { plannedYear: userCourse.plannedYear, plannedSemester: userCourse.plannedSemester, status: userCourse.status },
      currentYear,
    );
  const displayStatus: CourseStatus = studyingNow ? "IN_PROGRESS" : userCourse.status;
  const [confirmRemove, setConfirmRemove] = useState(false);

  const utils = api.useUtils();
  const removeMutation = api.plan.removeCourse.useMutation({
    onSuccess: () => {
      // Full set (incl. checkCompliance) — removing a course can flip a
      // requirement's status, same as every other planner surface. (audit #7)
      invalidatePlanData(utils);
      toast.success(tPlanner("courseRemoved"));
    },
    onError: () => {
      toast.error(tPlanner("removeError"));
    },
  });

  const updateMutation = api.plan.updateCourse.useMutation({
    onSuccess: () => {
      invalidatePlanData(utils);
    },
    onError: () => {
      toast.error(tPlanner("statusSaveError"));
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

  const disciplineColor = config?.color ?? "hsl(var(--muted-foreground))";

  const style = {
    ...(confirmRemove
      ? {}
      : { backgroundColor: `color-mix(in oklch, var(--card) 92%, ${disciplineColor})` }),
    ...(transform
      ? {
          transform: CSS.Translate.toString(transform),
          zIndex: 50,
        }
      : {}),
  };

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
        "group relative flex items-center gap-2 rounded-lg border border-border/60 p-2.5 transition-all hover-lift",
        "hover:border-foreground/40",
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
          {STATUS_ICON[displayStatus]}
          <span className="font-display line-clamp-2 text-sm font-medium leading-tight" title={`${course.code} — ${courseName}`}>
            {courseName}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-muted-foreground/60">{course.code}</span>
          <DisciplineBadge
            discipline={userCourse.disciplineOverride ?? course.discipline}
            className="text-[11px] px-1.5 py-0"
          />
          {userCourse.grade !== null && userCourse.status === "COMPLETED" && !userCourse.isBinary && (
            <GradeWithTooltip
              grade={userCourse.grade}
              courseType={course.courseType}
              credits={course.credits}
              isHe={isHe}
            />
          )}
          {userCourse.isBinary && userCourse.status === "COMPLETED" && (
            <span
              className="inline-flex items-center rounded-full bg-amber-500/15 px-1.5 py-0 text-[11px] font-medium text-amber-600"
              title={tPlanner("binaryHint")}
            >
              {tPlanner("binaryBadge")}
            </span>
          )}
        </div>
      </div>

      {/* Credits */}
      <div className="flex shrink-0 flex-col items-center">
        <span className="text-sm font-bold tabular text-foreground/80">
          {course.credits}
        </span>
        <span className="text-[11px] text-muted-foreground leading-none">
          {t(displayStatus)}
        </span>
      </div>

      {/* Mark-completed + grade + binary control */}
      <CompletionControl
        key={`${userCourse.status}-${userCourse.grade ?? ""}-${userCourse.isBinary}`}
        userCourseId={userCourse.id}
        status={userCourse.status}
        grade={userCourse.grade}
        isBinary={userCourse.isBinary}
        courseType={course.courseType}
        onUpdate={(input) => updateMutation.mutate(input)}
      />

      {/* Remove button — shows on hover */}
      <button
        type="button"
        onClick={handleRemoveClick}
        onPointerDown={(e) => e.stopPropagation()}
        className={cn(
          "absolute -top-1.5 -end-1.5 z-20 flex items-center justify-center rounded-full border transition-all",
          confirmRemove
            ? "size-auto gap-1 border-red-400/60 bg-red-500/90 px-2 py-0.5 text-[11px] font-medium text-white"
            : "size-5 border-border/60 bg-card text-muted-foreground/50 opacity-100 hover:border-red-400/60 hover:bg-red-500/10 hover:text-red-400 focus:opacity-100 focus:ring-2 focus:ring-red-400/60 focus:outline-none md:opacity-0 md:group-hover:opacity-100",
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

// -----------------------------------------------------------------------
// Completion + grade control — lets a returning student mark a planned
// course as already COMPLETED and enter its grade, right from the card.
// -----------------------------------------------------------------------

interface CompletionUpdate {
  userCourseId: string;
  status?: CourseStatus;
  grade?: number | null;
  isBinary?: boolean;
}

function CompletionControl({
  userCourseId,
  status,
  grade,
  isBinary,
  courseType,
  onUpdate,
}: {
  userCourseId: string;
  status: CourseStatus;
  grade: number | null;
  isBinary: boolean;
  courseType: string;
  onUpdate: (input: CompletionUpdate) => void;
}) {
  const tPlanner = useTranslations("planner");
  const isHe = useLocale() === "he";
  const isCompleted = status === "COMPLETED";
  // Seminar papers can't be pass/fail-converted (excluded type per the מתווה).
  const binaryEligible = courseType !== "SEMINAR";

  // Local mirror for snappy toggling; parent re-keys this control on isBinary.
  const [binaryOn, setBinaryOn] = useState(isBinary);
  const toggleBinary = useCallback(() => {
    const next = !binaryOn;
    setBinaryOn(next);
    onUpdate({ userCourseId, isBinary: next });
  }, [binaryOn, onUpdate, userCourseId]);

  // Local grade input mirrors the server value; debounced save on change/blur.
  const [gradeValue, setGradeValue] = useState<string>(
    grade !== null ? String(grade) : "",
  );

  // A FAILED course (grade below the passing bar) can never be converted to
  // binary — binary is for a course you passed but want off your GPA (#10). It
  // also doesn't count toward the degree until retaken (#31). Driven off the
  // live input so the warning/guard react as the student types, not 600ms late.
  const gradeNum = parseInt(gradeValue, 10);
  const isFailingGrade =
    gradeValue !== "" && !isNaN(gradeNum) && gradeNum < CREDIT_REQUIREMENTS.PASSING_GRADE;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The parent re-keys this control whenever the server status/grade changes,
  // so local state initializes fresh from props — no sync effect needed.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleToggle = useCallback(() => {
    if (isCompleted) {
      // Un-mark: revert to PLANNED, clear the grade, AND clear the binary flag —
      // a PLANNED course must never carry a pass/fail conversion.
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setGradeValue("");
      setBinaryOn(false);
      onUpdate({ userCourseId, status: "PLANNED", grade: null, isBinary: false });
    } else {
      onUpdate({ userCourseId, status: "COMPLETED" });
    }
  }, [isCompleted, onUpdate, userCourseId]);

  const commitGrade = useCallback(
    (raw: string) => {
      if (raw === "") {
        // Cleared — drop the grade but keep the course COMPLETED.
        onUpdate({ userCourseId, grade: null });
        return;
      }
      const num = parseInt(raw, 10);
      if (isNaN(num)) return;
      const clamped = Math.max(0, Math.min(100, num));
      // Honest completion (#22/#30): a failing grade marks the course FAILED,
      // not a silent COMPLETED. Binary (pass/fail) courses aren't graded this
      // way. ENGLISH passes at 70, everything else at 60.
      const status: CourseStatus = binaryOn
        ? "COMPLETED"
        : clamped >= passBarFor(courseType)
          ? "COMPLETED"
          : "FAILED";
      // A FAILED course never carries a binary (pass/fail) flag — same invariant
      // as un-marking (a non-COMPLETED row must not stay flagged binary).
      onUpdate({
        userCourseId,
        status,
        grade: clamped,
        ...(status === "FAILED" ? { isBinary: false } : {}),
      });
    },
    [onUpdate, userCourseId, binaryOn, courseType],
  );

  const handleGradeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      let next: string;
      if (raw === "") {
        next = "";
      } else {
        const num = parseInt(raw, 10);
        if (isNaN(num) || num < 0 || num > 100) return; // reject invalid keystroke
        next = String(num);
      }
      setGradeValue(next);
      // Debounce the network write so typing stays smooth.
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => commitGrade(next), 600);
    },
    [commitGrade],
  );

  const handleGradeBlur = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    commitGrade(gradeValue);
  }, [commitGrade, gradeValue]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          title={tPlanner("markCompleted")}
          aria-label={tPlanner("markCompleted")}
          className={cn(
            "shrink-0 flex items-center justify-center rounded-md p-1 transition-all focus:outline-none focus:ring-2 focus:ring-foreground/30",
            isCompleted
              ? "text-emerald-400 hover:bg-emerald-400/10"
              : "text-muted-foreground/50 hover:text-foreground/70 hover:bg-foreground/5 opacity-100 focus:opacity-100 md:opacity-0 md:group-hover:opacity-100",
          )}
        >
          <GraduationCap className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        sideOffset={6}
        className="w-60 space-y-3 p-3"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Completed toggle */}
        <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-foreground/80">
          <button
            type="button"
            role="switch"
            aria-checked={isCompleted}
            onClick={handleToggle}
            className={cn(
              "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-foreground/30",
              isCompleted ? "bg-emerald-500" : "bg-foreground/20",
            )}
          >
            <span
              className={cn(
                "inline-block h-3 w-3 transform rounded-full bg-white transition-transform",
                isCompleted ? "translate-x-3.5 rtl:-translate-x-3.5" : "translate-x-0.5 rtl:-translate-x-0.5",
              )}
            />
          </button>
          <span>{tPlanner("markCompleted")}</span>
        </label>

        {/* Grade input — only when completed */}
        {isCompleted && (
          <div className="animate-in fade-in duration-150 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-foreground/60">{tPlanner("gradeLabel")}</span>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={gradeValue}
                  onChange={handleGradeChange}
                  onBlur={handleGradeBlur}
                  placeholder="0–100"
                  dir="ltr"
                  aria-invalid={isFailingGrade}
                  className={cn(
                    "w-20 rounded-md border bg-background/50 px-2 py-1.5",
                    "font-mono text-sm text-center",
                    "placeholder:text-foreground/20",
                    "focus:outline-none focus:ring-1 transition-all",
                    isFailingGrade
                      ? "border-amber-400/60 text-amber-600 focus:border-amber-400 focus:ring-amber-400/30 dark:text-amber-400"
                      : "border-border/50 text-foreground focus:border-foreground/35 focus:ring-foreground/20",
                  )}
                />
              </div>
              {grade !== null && !isFailingGrade && (
                <Check className="size-3.5 text-emerald-400" />
              )}
            </div>
            {isFailingGrade && (
              <p className="flex items-center gap-1 text-xs leading-tight text-amber-600 dark:text-amber-500">
                <AlertTriangle className="size-3 shrink-0" />
                {isHe
                  ? "ציון נכשל — הקורס לא נספר לקרדיט עד שתעבור אותו מחדש."
                  : "Failing — this course won't count toward credit until you retake and pass it."}
              </p>
            )}
          </div>
        )}

        {/* Binary (pass/fail) conversion — miluim benefit. Only for completed,
            non-seminar courses with a PASSING numeric grade: a failed course can
            never be converted to binary (#10). */}
        {isCompleted && binaryEligible && grade !== null && !isFailingGrade && (
          <div className="space-y-1.5 border-t border-border/30 pt-3">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-foreground/80">
              <button
                type="button"
                role="switch"
                aria-checked={binaryOn}
                onClick={toggleBinary}
                className={cn(
                  "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-foreground/30",
                  binaryOn ? "bg-amber-500" : "bg-foreground/20",
                )}
              >
                <span
                  className={cn(
                    "inline-block h-3 w-3 transform rounded-full bg-white transition-transform",
                    binaryOn ? "translate-x-3.5 rtl:-translate-x-3.5" : "translate-x-0.5 rtl:-translate-x-0.5",
                  )}
                />
              </button>
              <span>{tPlanner("markBinary")}</span>
            </label>
            <p className="text-xs leading-tight text-foreground/45">
              {tPlanner("binaryHint")}
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
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
          <p className="text-xs" dir="auto"><Bidi text={tooltipText} /></p>
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
  const disciplineColor = config?.color ?? "hsl(var(--muted-foreground))";

  return (
    <div
      className={cn(
        "relative flex items-center gap-2 rounded-lg border border-foreground/60 p-2.5 shadow-xl shadow-foreground/20 ring-2 ring-foreground/40",
        "cursor-grabbing",
      )}
      style={{ backgroundColor: `color-mix(in oklch, var(--card) 92%, ${disciplineColor})` }}
    >
      <div
        className="absolute inset-y-0 start-0 w-1 rounded-s-lg"
        style={{ backgroundColor: disciplineColor }}
      />

      <GripVertical className="size-4 shrink-0 text-foreground/80 ms-1" />

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-display line-clamp-2 text-sm font-medium leading-tight">
          {courseName}
        </span>
        <DisciplineBadge
          discipline={userCourse.disciplineOverride ?? course.discipline}
          className="text-[11px] px-1.5 py-0"
        />
      </div>

      <span className="shrink-0 text-sm font-bold tabular text-foreground/80">
        {course.credits}
      </span>
    </div>
  );
}
