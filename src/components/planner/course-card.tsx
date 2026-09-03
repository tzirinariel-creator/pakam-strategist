"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { serverSaid } from "@/lib/server-said";
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
  FolderInput,
} from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { DisciplineBadge } from "@/components/catalog/discipline-badge";
import { RequirementMark } from "@/components/shared/requirement-mark";
import { maybeNudgeCourseReview } from "@/components/catalog/review-nudge";
import { ALL_DISCIPLINE_IDS, CREDIT_REQUIREMENTS, DISCIPLINE_CONFIG, SEMESTER_CONFIG, YEAR_CONFIG } from "@/lib/constants";
import { courseColor, courseSurface } from "@/lib/course-color";
import { passBarFor } from "@/lib/constants";
import { isCurrentlyStudying } from "@/lib/semester-clock";
import { isStudentAddedCourse, isDeclaredApproved } from "@/lib/off-catalog";
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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type { UserCourseWithCourse } from "@/types/degree";
import type { CourseStatus, Semester } from "@/types/enums";
import { Bidi } from "@/lib/bidi";
import { cn } from "@/lib/utils";
import { CohortCourseChip } from "@/components/cohort/cohort-course-chip";

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
  IN_PROGRESS: <BookOpen className="size-3.5 text-status-blue" />,
  COMPLETED: <CheckCircle2 className="size-3.5 text-status-green" />,
  FAILED: <XCircle className="size-3.5 text-status-red" />,
  EXEMPT: <ShieldCheck className="size-3.5 text-status-amber" />,
};

export function CourseCard({ userCourse, disabled, currentYear }: CourseCardProps) {
  const t = useTranslations("courseStatus");
  const tPlanner = useTranslations("planner");
  const locale = useLocale();
  const isHe = locale === "he";
  const { course } = userCourse;
  const courseName = isHe ? course.nameHe : (course.nameEn ?? course.nameHe);
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
    // serverSaid מעדיף הודעת־שרת מכוונת (FORBIDDEN / CONFLICT / BAD_REQUEST…)
    // על הנוסח הגנרי. השרת כאן מסביר *למה* אי־אפשר; "נסו שוב" זרק את זה.
    onError: (e) => {
      toast.error(serverSaid(e, tPlanner("removeError")));
    },
  });

  const updateMutation = api.plan.updateCourse.useMutation({
    onSuccess: (_data, variables) => {
      invalidatePlanData(utils);
      // S1 — a grade just LOCKED (real write succeeded, grade + final
      // COMPLETED): offer the 10-second cohort contribution, once per course.
      if (variables.grade != null && variables.status === "COMPLETED") {
        maybeNudgeCourseReview(course.code, isHe ? course.nameHe : (course.nameEn ?? course.nameHe), isHe);
      }
    },
    onError: (e) => {
      toast.error(serverSaid(e, tPlanner("statusSaveError")));
    },
  });

  // Tap-to-move between semesters — the phone-friendly path (dragging the grip
  // is near-impossible one-handed). Reuses the SAME plan.updateCourse the drag
  // handler calls. The board has no SUMMER column, so only FALL/SPRING × 1-3.
  const moveMutation = api.plan.updateCourse.useMutation({
    onSuccess: () => {
      invalidatePlanData(utils);
      toast.success(tPlanner("courseMoved"));
    },
    onError: (e) => {
      if (e.message === "COURSE_ALREADY_IN_SEMESTER") {
        toast.error(isHe ? "הקורס כבר נמצא בסמסטר הזה" : "This course is already in that semester");
        return;
      }
      toast.error(serverSaid(e, tPlanner("statusSaveError")));
    },
  });
  const moveTargets = ([1, 2, 3] as const)
    .flatMap((year) => (["FALL", "SPRING"] as Semester[]).map((semester) => ({ year, semester })))
    .filter((tgt) => !(tgt.year === userCourse.plannedYear && tgt.semester === userCourse.plannedSemester));

  // #8 — the declaration, editable where the course actually lives. Without it
  // a student who added a course by hand could only declare it at ADD time and
  // never change their mind (and never at all for a course a scan added).
  const declareMutation = api.plan.updateCourse.useMutation({
    onSuccess: (_data, variables) => {
      invalidatePlanData(utils);
      toast.success(
        variables.disciplineOverride == null
          ? isHe ? "השיוך הוסר" : "Assignment removed"
          : isHe ? "נשמר. הקורס נספר לתחום שבחרתם" : "Saved. It now counts toward the field you picked",
      );
    },
    onError: (e) => toast.error(serverSaid(e, tPlanner("statusSaveError"))),
  });

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
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

  // ONE colour per course. Keyed on the course CODE, never the discipline —
  // `disciplineOverride` can re-file a course, which used to repaint this card
  // while the grid block (built from course.discipline) kept the old hue.
  const cardColor = courseColor(course.code);

  // #8 — a course the student added themselves, and whether they declared it
  // approved for their degree.
  const studentAdded = isStudentAddedCourse(course);
  const declaredApproved = isDeclaredApproved(userCourse);

  const style = {
    ...(confirmRemove
      ? {}
      : { backgroundColor: courseSurface(course.code, 8) }),
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
      )}
    >
      {/* The course's colour strip (start side = right in RTL). Same value as
          its block on the weekly grid, so the eye can match card→grid without
          reading either label. The discipline is still stated in words by the
          DisciplineBadge below. */}
      <div
        className="absolute inset-y-0 start-0 w-1 rounded-s-lg"
        style={{ backgroundColor: cardColor }}
      />

      {/* Grip handle — THE drag activator (SEC3). The card used to be one big
          role="button" wrapping its own buttons (axe nested-interactive,
          serious): now only this handle carries the dnd role/listeners, so
          inner controls are reachable and keyboard drag still works. */}
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...(confirmRemove ? {} : { ...attributes, ...listeners })}
        aria-label={isHe ? `גררו את ${courseName} לסידור מחדש` : `Drag ${courseName} to rearrange`}
        className={cn(
          "shrink-0 rounded p-0.5 ms-0.5 outline-none focus-visible:ring-2 focus-visible:ring-accent-brand/60",
          !disabled && !confirmRemove && "cursor-grab active:cursor-grabbing",
        )}
      >
        <GripVertical className="size-4 text-muted-foreground group-hover:text-muted-foreground" />
      </button>

      {/* Course info */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          {STATUS_ICON[displayStatus]}
          <span className="font-display line-clamp-2 text-sm font-medium leading-tight" title={`${course.code} — ${courseName}`}>
            {courseName}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-muted-foreground">{course.code}</span>
          {/* אורי כהן גפן, שנה א׳ (2.9): "מה שעדיין לא כל כך ברור לי — מה הם
              הקורסים החובה ומה הבחירה בסמסטר א שנה א". המתכנן הוא המסך שבו
              בוחרים, והוא היחיד שלא אמר את זה. קורס שהסטודנט הוסיף בעצמו
              מחזיר null ונשאר בלי תווית — עליו באמת אין לנו תשובה. */}
          {!studentAdded && <RequirementMark course={course} />}
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
              className="inline-flex items-center rounded-full bg-amber-500/15 px-1.5 py-0 text-[11px] font-medium text-status-amber"
              title={tPlanner("binaryHint")}
            >
              {tPlanner("binaryBadge")}
            </span>
          )}
          {/* ידיעון תשפ״ז migration (13.8) — a course the student still PLANS
              that no longer appears in the new ידיעון. 15 such rows existed on
              real accounts the moment the catalog moved to תשפ״ז, and until now
              they failed silently: the course simply stopped being offered and
              nobody was told. A completed course is history and needs no
              warning — only a forward-looking one does. The wording claims no
              cause (cancelled / re-coded / unpublished are all possible and we
              genuinely don't know which). */}
          {!course.isActive &&
            !studentAdded &&
            userCourse.status !== "COMPLETED" &&
            userCourse.status !== "FAILED" && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-amber-500/12 px-1.5 py-0.5 text-[10px] font-medium text-status-amber"
                title={
                  isHe
                    ? "הקורס לא מופיע בידיעון תשפ״ז. ייתכן שבוטל, שקודו שונה, או שטרם פורסם — לא ידוע לנו מה מבין השלושה. כדאי לאמת מול המזכירות."
                    : "This course is absent from the 2026/27 yedion. It may have been cancelled, re-coded, or simply not published yet — we genuinely don't know which. Worth confirming with the secretariat."
                }
              >
                <AlertTriangle className="size-2.5" />
                {isHe ? "לא בידיעון תשפ״ז" : "Not in 2026/27"}
              </span>
            )}
          {/* #8 — a course the STUDENT added was never in our catalog to begin
              with; calling it "missing from the ידיעון" would invent a cause.
              Show what we actually know, plus their own declaration if made. */}
          {studentAdded && (
            <span
              className={cn(
                "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                declaredApproved
                  ? "bg-emerald-500/12 text-status-green"
                  : "bg-foreground/8 text-foreground/70",
              )}
              title={
                declaredApproved
                  ? isHe
                    ? "אתם הצהרתם שהקורס מאושר לתואר שלכם, והוא נספר לפי התחום שבחרתם. מי שמאשר בפועל היא המזכירות."
                    : "You declared this course is approved for your degree; it counts toward the discipline you chose. The secretariat is what actually approves it."
                  : isHe
                    ? "הוספתם את הקורס בעצמכם — הוא לא בקטלוג שלנו, וזה לא אומר שהוא לא מאושר לכם. אם הוא מאושר לתואר שלכם, הצהירו על כך בתפריט הקורס ונספור אותו בהתאם."
                    : "You added this course yourself — it isn't in our catalog, which doesn't mean it isn't approved for you. If your degree approved it, declare that from the course menu and we'll count it accordingly."
              }
            >
              {declaredApproved
                ? isHe ? "מאושר בהצהרתכם" : "Approved — your declaration"
                : isHe ? "לא בקטלוג שלנו" : "Not in our catalog"}
            </span>
          )}
          {/* 18:19 (#13) — cohort wisdom at the decision moment, right on the
              planned course. Renders only when enough students shared. */}
          {userCourse.status !== "COMPLETED" && (
            <CohortCourseChip courseCode={course.code} isHe={isHe} />
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
        isSaving={updateMutation.isPending}
      />

      {/* Move to another semester — tap-friendly (drag is desktop-only). */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={tPlanner("moveCourse")}
            title={tPlanner("moveCourse")}
            className="flex size-6 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:opacity-100 focus:outline-none md:opacity-0 md:group-hover:opacity-100"
          >
            <FolderInput className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{tPlanner("moveCourse")}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {moveTargets.map((tgt) => (
            <DropdownMenuItem
              key={`${tgt.year}-${tgt.semester}`}
              onClick={() => moveMutation.mutate({ userCourseId: userCourse.id, plannedYear: tgt.year, plannedSemester: tgt.semester })}
            >
              {isHe ? YEAR_CONFIG[tgt.year].nameHe : YEAR_CONFIG[tgt.year].nameEn}
              {" · "}
              {isHe ? SEMESTER_CONFIG[tgt.semester].nameHe : SEMESTER_CONFIG[tgt.semester].nameEn}
            </DropdownMenuItem>
          ))}
          {/* #8 — for a course the student added themselves: declare that it's
              approved for their degree, and what it counts toward. Only for
              off-catalog courses; a catalog course needs no such claim. */}
          {studentAdded && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[11px] font-normal leading-relaxed text-muted-foreground">
                {isHe
                  ? "שייכתם את הקורס לתחום — הוא נספר שם"
                  : "Your declaration: approved for the degree, counts as…"}
              </DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() =>
                  declareMutation.mutate({ userCourseId: userCourse.id, disciplineOverride: null })
                }
              >
                {isHe ? "לא הצהרנו" : "Not declared"}
                {!declaredApproved && " ✓"}
              </DropdownMenuItem>
              {ALL_DISCIPLINE_IDS.map((id) => {
                const cfg = DISCIPLINE_CONFIG[id];
                if (!cfg) return null;
                return (
                  <DropdownMenuItem
                    key={id}
                    onClick={() =>
                      declareMutation.mutate({
                        userCourseId: userCourse.id,
                        disciplineOverride: id as Parameters<
                          typeof declareMutation.mutate
                        >[0]["disciplineOverride"],
                      })
                    }
                  >
                    {isHe ? cfg.nameHe : cfg.nameEn}
                    {userCourse.disciplineOverride === id && " ✓"}
                  </DropdownMenuItem>
                );
              })}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Remove button — shows on hover */}
      <button
        type="button"
        onClick={handleRemoveClick}
        onPointerDown={(e) => e.stopPropagation()}
        className={cn(
          "absolute -top-1.5 -end-1.5 z-20 flex items-center justify-center rounded-full border transition-all",
          confirmRemove
            ? "size-auto gap-1 border-red-400/60 bg-red-500/90 px-2 py-0.5 text-[11px] font-medium text-white"
            : "size-5 border-border/60 bg-card text-muted-foreground opacity-100 hover:border-red-400/60 hover:bg-red-500/10 hover:text-status-red focus:opacity-100 focus:ring-2 focus:ring-red-400/60 focus:outline-none md:opacity-0 md:group-hover:opacity-100",
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
  isSaving,
}: {
  userCourseId: string;
  status: CourseStatus;
  grade: number | null;
  isBinary: boolean;
  courseType: string;
  onUpdate: (input: CompletionUpdate) => void;
  /** האם הכתיבה עדיין באוויר. בלי זה שום דבר על המסך לא זז בזמן הלחיצה. */
  isSaving: boolean;
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
  /** מה שכבר נשמר בשרת. משמש כדי לא לכתוב פעמיים את אותו דבר ביציאה. */
  const committedRef = useRef<string>(grade !== null ? String(grade) : "");
  /** הערך החי, כדי שאפשר יהיה לשמור אותו מתוך cleanup בלי לתלות בו את האפקט. */
  const liveRef = useRef<string>(grade !== null ? String(grade) : "");
  const commitRef = useRef<(raw: string) => void>(() => {});

  // The parent re-keys this control whenever the server status/grade changes,
  // so local state initializes fresh from props — no sync effect needed.
  //
  // ביציאה: אם הסטודנט הקליד ולא איבד פוקוס — למשל סגר את הפופאובר בלחיצה
  // בחוץ, שלא בהכרח מייצרת blur — הערך היה נעלם. עכשיו הוא נשמר פעם אחת.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (liveRef.current !== committedRef.current) commitRef.current(liveRef.current);
    };
  }, []);

  const handleToggle = useCallback(() => {
    if (isCompleted) {
      // Un-mark: revert to PLANNED, clear the grade, AND clear the binary flag —
      // a PLANNED course must never carry a pass/fail conversion.
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setGradeValue("");
      liveRef.current = "";
      committedRef.current = "";
      setBinaryOn(false);
      onUpdate({ userCourseId, status: "PLANNED", grade: null, isBinary: false });
    } else {
      onUpdate({ userCourseId, status: "COMPLETED" });
    }
  }, [isCompleted, onUpdate, userCourseId]);

  const commitGrade = useCallback(
    (raw: string) => {
      committedRef.current = raw;
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
      liveRef.current = next;
      // אין כאן כתיבה, וזה התיקון.
      //
      // קודם כל הקשה תיזמנה כתיבה 600ms אחריה. סטודנט שהקליד "95" ועצר רגע
      // אחרי ה-9 — לחשוב, להסתכל בגיליון, לענות להודעה — קיבל כתיבה אמיתית
      // של ציון 9, ו-9 נמוך מרף המעבר, אז הקורס נשמר **נכשל**. "100" עשה את
      // זה פעמיים בדרך (1, ואז 10). אם הוא סגר את החלון באותו רגע, זה מה
      // שנשאר במסד: קורס חובה שעבר, מסומן ככישלון, עם ציון 9.
      //
      // ציון חלקי אינו ציון. שומרים כשהסטודנט סיים — blur, Enter, או יציאה
      // מהרכיב — ואז פעם אחת, עם הערך המלא.
    },
    [],
  );

  const handleGradeBlur = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (gradeValue !== committedRef.current) commitGrade(gradeValue);
  }, [commitGrade, gradeValue]);

  const handleGradeKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleGradeBlur();
      }
    },
    [handleGradeBlur],
  );

  // ה-cleanup קורא דרך ref כדי שלא יצטרך לרוץ מחדש בכל הקלדה.
  commitRef.current = commitGrade;

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
              ? "text-status-green hover:bg-emerald-400/10"
              : "text-muted-foreground hover:text-foreground/70 hover:bg-foreground/5 opacity-100 focus:opacity-100 md:opacity-0 md:group-hover:opacity-100",
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
        {/* Completed toggle.
            הרכיב הזה מקבל key חדש בכל שינוי סטטוס/ציון מהשרת, ולכן אין לו
            עדכון אופטימי — כלום לא זז בזמן הלחיצה. סטודנט על רשת איטית לחץ
            שוב, ושוב. `aria-busy` + הבהייה + נטרול הכפתור הופכים את ההמתנה
            לנראית בלי לשקר על התוצאה. */}
        <label
          className="flex items-center gap-2 cursor-pointer text-xs font-medium text-foreground/80"
          aria-busy={isSaving}
        >
          <button
            type="button"
            role="switch"
            aria-checked={isCompleted}
            onClick={handleToggle}
            disabled={isSaving}
            className={cn(
              "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-foreground/30",
              isCompleted ? "bg-emerald-500" : "bg-foreground/20",
              isSaving && "opacity-60",
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
          {isSaving && (
            <span className="ms-auto text-[10px] font-normal text-muted-foreground">
              {isHe ? "שומר…" : "Saving…"}
            </span>
          )}
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
                  onKeyDown={handleGradeKeyDown}
                  placeholder="0–100"
                  dir="ltr"
                  aria-invalid={isFailingGrade}
                  className={cn(
                    "w-20 rounded-md border bg-background/50 px-2 py-1.5",
                    "font-mono text-sm text-center",
                    "placeholder:text-foreground/60",
                    "focus:outline-none focus:ring-1 transition-all",
                    isFailingGrade
                      ? "border-amber-400/60 text-status-amber focus:border-amber-400 focus:ring-amber-400/30"
                      : "border-border/50 text-foreground focus:border-foreground/35 focus:ring-foreground/20",
                  )}
                />
              </div>
              {grade !== null && !isFailingGrade && (
                <Check className="size-3.5 text-status-green" />
              )}
            </div>
            {isFailingGrade && (
              <p className="flex items-center gap-1 text-xs leading-tight text-status-amber">
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
            <p className="text-xs leading-tight text-foreground/60">
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
      ? "text-status-green"
      : grade >= 70
        ? "text-foreground/70"
        : grade >= 60
          ? "text-status-amber"
          : "text-status-red";

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
  return (
    <div
      className={cn(
        "relative flex items-center gap-2 rounded-lg border border-foreground/60 p-2.5 shadow-xl shadow-foreground/20 ring-2 ring-foreground/40",
        "cursor-grabbing",
      )}
      style={{ backgroundColor: courseSurface(course.code, 8) }}
    >
      <div
        className="absolute inset-y-0 start-0 w-1 rounded-s-lg"
        style={{ backgroundColor: courseColor(course.code) }}
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
