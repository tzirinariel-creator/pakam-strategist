"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  Calculator,
  GraduationCap,
  BookOpen,
  Target,
  Check,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  FolderOpen,
  Award,
} from "lucide-react";
import { api } from "@/lib/trpc/react";
import { invalidatePlanData } from "@/lib/trpc/invalidate-plan";
import { ThemedLoader } from "@/components/ui/themed-loader";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  GRADE_WEIGHTS,
  DISCIPLINE_CONFIG,
  SEMESTER_CONFIG,
  YEAR_CONFIG,
} from "@/lib/constants";
import { roundScore, countsTowardAverage, courseTypeCountsTowardAverage, canonicalAttempts } from "@/lib/grade-calculator";
import { computeHonorsDistance, HONORS_YEARLY_BAR } from "@/lib/honors";
import { deriveYearOfStudy } from "@/lib/academic-calendar";
import type { UserCourseWithCourse, GradeBreakdown } from "@/types/degree";
import type { CourseStatus, Semester } from "@/types/enums";

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

interface SemesterGroup {
  year: number;
  semester: Semester;
  key: string;
  courses: UserCourseWithCourse[];
}

// -----------------------------------------------------------------------
// Debounced grade input component
// -----------------------------------------------------------------------

function GradeInput({
  userCourseId,
  initialGrade,
  initialStatus,
  onSave,
  placeholder,
  savedSignal,
}: {
  userCourseId: string;
  initialGrade: number | null;
  initialStatus: CourseStatus;
  onSave: (id: string, grade: number | null, status: CourseStatus) => void;
  placeholder: string;
  /** Bumped by the parent when THIS course's save mutation succeeds. */
  savedSignal: number;
}) {
  const [value, setValue] = useState<string>(
    initialGrade !== null ? String(initialGrade) : ""
  );
  const [saved, setSaved] = useState(false);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;

      // Allow empty
      if (raw === "") {
        setValue("");
        return;
      }

      // Only allow numeric input (integers 0-100)
      const num = parseInt(raw, 10);
      if (isNaN(num)) return;
      if (num < 0 || num > 100) return;

      setValue(String(num));
    },
    []
  );

  // Save immediately on blur — blur already means the user finished editing,
  // so there's no debounce timer that could be lost on unmount (e.g. navigating
  // away or collapsing the semester). The save fires synchronously here.
  const handleBlur = useCallback(() => {
    const num = parseInt(value, 10);

    if (value === "" || isNaN(num)) {
      // Cleared — remove the grade but KEEP the status (#30: deletion never
      // silently changes status; /record behaved this way, /graduation used
      // to revert — now they agree). A toast offers the in-progress action.
      if (initialGrade !== null) {
        onSave(userCourseId, null, initialStatus);
      }
      return;
    }

    const grade = Math.max(0, Math.min(100, num));
    const newStatus: CourseStatus =
      initialStatus === "PLANNED" || initialStatus === "IN_PROGRESS"
        ? "COMPLETED"
        : initialStatus;

    onSave(userCourseId, grade, newStatus);
  }, [value, userCourseId, initialStatus, initialGrade, onSave]);

  // Show the "saved" checkmark only when the parent confirms the mutation
  // actually succeeded (savedSignal bump), never on the fire-and-forget call —
  // a failed/aborted save no longer shows a false "saved".
  useEffect(() => {
    if (savedSignal === 0) return;
    setSaved(true);
    const id = setTimeout(() => setSaved(false), 1500);
    return () => clearTimeout(id);
  }, [savedSignal]);

  return (
    <div className="relative">
      <input
        type="number"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={cn(
          "w-20 rounded-md border border-border/50 bg-background/50 px-2 py-1.5",
          "font-mono text-sm text-foreground text-center",
          "placeholder:text-foreground/20",
          "focus:border-foreground/35 focus:outline-none focus:ring-1 focus:ring-foreground/20",
          "transition-all",
          saved && "border-emerald-400/50 ring-1 ring-emerald-400/30"
        )}
        dir="ltr"
      />
      {saved && (
        <Check className="absolute -end-5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-emerald-400 animate-in fade-in" />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------
// Status badge component
// -----------------------------------------------------------------------

function StatusBadge({
  status,
  t,
}: {
  status: CourseStatus;
  t: ReturnType<typeof useTranslations<"grades">>;
}) {
  const statusConfig: Record<
    CourseStatus,
    { label: string; className: string }
  > = {
    COMPLETED: {
      label: t("completed"),
      className: "bg-emerald-400/15 text-emerald-400 border-emerald-400/30",
    },
    IN_PROGRESS: {
      label: t("inProgress"),
      className: "bg-blue-400/15 text-blue-400 border-blue-400/30",
    },
    PLANNED: {
      label: t("planned"),
      className: "bg-foreground/10 text-foreground/50 border-foreground/20",
    },
    FAILED: {
      label: t("failed"),
      className: "bg-red-400/15 text-red-400 border-red-400/30",
    },
    EXEMPT: {
      label: t("exempt"),
      className: "bg-purple-400/15 text-purple-400 border-purple-400/30",
    },
  };

  const cfg = statusConfig[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        cfg.className
      )}
    >
      {cfg.label}
    </span>
  );
}

// -----------------------------------------------------------------------
// Discipline badge
// -----------------------------------------------------------------------

function DisciplineBadge({ discipline, locale }: { discipline: string; locale: string }) {
  const cfg = DISCIPLINE_CONFIG[discipline] ?? DISCIPLINE_CONFIG["GENERAL"];
  if (!cfg) return <span className="text-xs">{discipline}</span>;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        cfg.badgeClass
      )}
    >
      {locale === "he" ? cfg.nameHe : cfg.nameEn}
    </span>
  );
}

// -----------------------------------------------------------------------
// Semester GPA mini display
// -----------------------------------------------------------------------

function SemesterGpaDisplay({
  courses,
  label,
}: {
  courses: UserCourseWithCourse[];
  label: string;
}) {
  const graded = canonicalAttempts(courses.filter(countsTowardAverage));
  if (graded.length === 0) return null;

  const totalCredits = graded.reduce((sum, c) => sum + c.course.credits, 0);
  const weightedSum = graded.reduce(
    (sum, c) => sum + (c.grade ?? 0) * c.course.credits,
    0
  );
  const gpa = totalCredits > 0 ? weightedSum / totalCredits : 0;

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-foreground/50">{label}:</span>
      <span className="font-mono tabular font-semibold text-foreground/80">
        {gpa.toFixed(1)}
      </span>
    </div>
  );
}

// -----------------------------------------------------------------------
// Collapsible semester section
// -----------------------------------------------------------------------

function SemesterSection({
  group,
  onSaveGrade,
  savedSignals,
  t,
  locale,
}: {
  group: SemesterGroup;
  onSaveGrade: (id: string, grade: number | null, status: CourseStatus) => void;
  /** Per-course success counters, bumped on a confirmed save. */
  savedSignals: Record<string, number>;
  t: ReturnType<typeof useTranslations<"grades">>;
  locale: string;
}) {
  const [expanded, setExpanded] = useState(true);

  const yearCfg = YEAR_CONFIG[group.year as keyof typeof YEAR_CONFIG];
  const semCfg = SEMESTER_CONFIG[group.semester];
  const yearLabel = locale === "he" ? yearCfg?.nameHe : yearCfg?.nameEn;
  const semLabel = locale === "he" ? semCfg?.nameHe : semCfg?.nameEn;

  return (
    <div className="data-card overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-5 py-4 text-start transition-colors hover:bg-foreground/[0.02]"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground/10">
            <BookOpen className="h-4 w-4 text-foreground/80" />
          </div>
          <div>
            <span className="font-bold text-foreground/90">
              {yearLabel} — {semLabel}
            </span>
            <span className="ms-3 text-xs text-foreground/40">
              {group.courses.length} {t("course")}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="hidden sm:block">
            <SemesterGpaDisplay
              courses={group.courses}
              label={t("semesterGpa")}
            />
          </div>
          {expanded ? (
            <ChevronUp className="h-4 w-4 shrink-0 text-foreground/40" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-foreground/40" />
          )}
        </div>
      </button>

      {/* Courses table */}
      {expanded && (
        <div className="border-t border-border/30">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/20 text-foreground/50">
                  <th className="px-5 py-2.5 text-start font-medium">
                    {t("course")}
                  </th>
                  <th className="px-3 py-2.5 text-start font-medium">
                    {/* discipline */}
                  </th>
                  <th className="px-3 py-2.5 text-center font-medium">
                    {t("credits")}
                  </th>
                  <th className="px-3 py-2.5 text-center font-medium">
                    {t("status")}
                  </th>
                  <th className="px-3 py-2.5 text-center font-medium">
                    {t("grade")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {group.courses.map((uc) => (
                  <tr
                    key={uc.id}
                    className="border-b border-border/10 transition-colors hover:bg-foreground/[0.02]"
                  >
                    <td className="px-5 py-3 font-medium text-foreground/80">
                      {locale === "he" ? uc.course.nameHe : (uc.course.nameEn ?? uc.course.nameHe)}
                    </td>
                    <td className="px-3 py-3">
                      <DisciplineBadge
                        discipline={
                          uc.disciplineOverride ?? uc.course.discipline
                        }
                        locale={locale}
                      />
                    </td>
                    <td className="px-3 py-3 text-center font-mono text-foreground/60">
                      {uc.course.credits}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <StatusBadge status={uc.status} t={t} />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-center">
                        <GradeInput
                          userCourseId={uc.id}
                          initialGrade={uc.grade}
                          initialStatus={uc.status}
                          onSave={onSaveGrade}
                          placeholder="0–100"
                          savedSignal={savedSignals[uc.id] ?? 0}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------
// Weight breakdown visual bar
// -----------------------------------------------------------------------

function WeightBreakdownBar({
  breakdown,
  t,
}: {
  breakdown: GradeBreakdown;
  t: ReturnType<typeof useTranslations<"grades">>;
}) {
  const courseContribution =
    breakdown.courseAverage !== null
      ? breakdown.courseAverage * GRADE_WEIGHTS.COURSES
      : null;
  const seminarContribution =
    breakdown.seminarPaperAverage !== null
      ? breakdown.seminarPaperAverage * GRADE_WEIGHTS.SEMINAR_PAPERS
      : null;
  const referatContribution =
    breakdown.referatGrade !== null
      ? breakdown.referatGrade * GRADE_WEIGHTS.REFERAT
      : null;

  const segments = [
    {
      label: t("coursesWeight"),
      weight: GRADE_WEIGHTS.COURSES,
      grade: breakdown.courseAverage,
      contribution: courseContribution,
      color: "bg-blue-500",
      textColor: "text-blue-400",
    },
    {
      label: t("seminarsWeight"),
      weight: GRADE_WEIGHTS.SEMINAR_PAPERS,
      grade: breakdown.seminarPaperAverage,
      contribution: seminarContribution,
      color: "bg-purple-500",
      textColor: "text-purple-400",
    },
    {
      label: t("referatWeight"),
      weight: GRADE_WEIGHTS.REFERAT,
      grade: breakdown.referatGrade,
      contribution: referatContribution,
      color: "bg-teal-500",
      textColor: "text-teal-400",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Stacked bar */}
      <div className="flex h-6 w-full overflow-hidden rounded-full bg-foreground/5">
        {segments.map((seg) => (
          <div
            key={seg.label}
            className={cn(
              "flex items-center justify-center text-[10px] font-bold text-white transition-all duration-700",
              seg.color,
              seg.grade === null && "opacity-30"
            )}
            style={{ width: `${seg.weight * 100}%` }}
          >
            {Math.round(seg.weight * 100)}%
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="grid gap-3 sm:grid-cols-3">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-2 text-sm">
            <div className={cn("h-3 w-3 rounded-sm", seg.color)} />
            <div className="flex flex-col">
              <span className="text-xs font-medium text-foreground/70">
                {seg.label}
              </span>
              <span className={cn("font-mono tabular text-base font-semibold", seg.textColor)}>
                {seg.grade !== null
                  ? roundScore(seg.grade)?.toFixed(1)
                  : "--"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------
// Score Dashboard section
// -----------------------------------------------------------------------

function ScoreDashboard({
  breakdown,
  allCourses,
  t,
}: {
  breakdown: GradeBreakdown;
  allCourses: UserCourseWithCourse[];
  t: ReturnType<typeof useTranslations<"grades">>;
}) {
  const score = roundScore(breakdown.weightedScore);
  // Raw (single toFixed(1) at render), NOT roundScore→toFixed(1) — a pre-round to
  // 2 decimals then a display-round to 1 can bump 84.949→85.0 while the identical
  // overallGpa beside it (raw) shows 84.9. One rounding, so they agree (#audit-r3).
  const courseAvg = breakdown.courseAverage;

  // Overall GPA — same definition as everywhere else (excludes seminar,
  // binary and English), so it matches the course-average shown beside it.
  // canonicalAttempts collapses grade-improvement retakes to the DETERMINING
  // sitting — without it a retaken course double-counted and the two averages
  // on this very card diverged (audit launch-blocker A1).
  const completed = canonicalAttempts(allCourses.filter(countsTowardAverage));
  const totalCreditsCompleted = completed.reduce(
    (s, c) => s + c.course.credits,
    0
  );
  const weightedGradeSum = completed.reduce(
    (s, c) => s + (c.grade ?? 0) * c.course.credits,
    0
  );
  const overallGpa =
    totalCreditsCompleted > 0 ? weightedGradeSum / totalCreditsCompleted : null;

  // Color coding
  const getScoreColor = (s: number) => {
    if (s >= 90) return "text-emerald-400";
    if (s >= 80) return "text-foreground/80";
    if (s >= 70) return "text-amber-400";
    if (s >= 60) return "text-orange-400";
    return "text-red-400";
  };

  return (
    <div className="data-card space-y-6 p-6">
      <div className="flex items-center gap-3">
        <GraduationCap className="h-5 w-5 text-foreground/80" />
        <h3 className="font-display font-bold text-lg text-foreground/90">
          {t("graduationScore")}
        </h3>
      </div>

      {/* Big score */}
      <div className="flex items-center justify-center py-2">
        {score !== null ? (
          <div className="flex items-baseline gap-1" dir="ltr">
            <span
              className={cn(
                "font-display tabular text-5xl font-bold tabular-nums tracking-tight",
                getScoreColor(score)
              )}
            >
              {score.toFixed(2)}
            </span>
            <span className="text-lg text-foreground/40">/100</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <span className="font-mono text-4xl font-bold text-foreground/20">
              --.-
            </span>
            <span className="text-xs text-foreground/40">
              {/* score not yet computed */}
            </span>
          </div>
        )}
      </div>

      {/* GPAs */}
      <div className="flex items-center justify-center gap-8 text-sm">
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs text-foreground/50">{t("overallGpa")}</span>
          <span className="font-display tabular text-xl font-semibold text-foreground/80">
            {overallGpa !== null ? overallGpa.toFixed(1) : "--"}
          </span>
        </div>
        <div className="h-8 w-px bg-border" />
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs text-foreground/50">
            {t("coursesWeight")}
          </span>
          <span className="font-display tabular text-xl font-semibold text-foreground/80">
            {courseAvg !== null ? courseAvg.toFixed(1) : "--"}
          </span>
        </div>
      </div>

      {/* Weight breakdown bar */}
      <div className="border-t border-border/30 pt-4">
        <h4 className="mb-3 text-sm font-medium text-foreground/60">
          {t("weightBreakdown")}
        </h4>
        <WeightBreakdownBar breakdown={breakdown} t={t} />
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------
// Reverse calculator section
// -----------------------------------------------------------------------

function ReverseCalculator({
  allCourses,
  t,
}: {
  allCourses: UserCourseWithCourse[];
  t: ReturnType<typeof useTranslations<"grades">>;
}) {
  const [target, setTarget] = useState(80);

  const result = useMemo(() => {
    const completed = canonicalAttempts(allCourses.filter(countsTowardAverage));
    // Remaining courses must share the SAME population as `completed`: only those
    // whose TYPE counts toward the average (not seminar/English/binary). Counting
    // planned non-average courses into the divisor produced a wrong "needed
    // average" (too high / false "impossible") (#audit-r3).
    const remaining = allCourses.filter(
      (c) =>
        (c.status === "PLANNED" || c.status === "IN_PROGRESS") &&
        courseTypeCountsTowardAverage(c)
    );

    const completedCredits = completed.reduce(
      (s, c) => s + c.course.credits,
      0
    );
    const remainingCredits = remaining.reduce(
      (s, c) => s + c.course.credits,
      0
    );
    const totalCredits = completedCredits + remainingCredits;

    const currentWeightedSum = completed.reduce(
      (s, c) => s + (c.grade ?? 0) * c.course.credits,
      0
    );

    if (remainingCredits === 0 || totalCredits === 0) {
      return {
        neededAvg: null,
        remainingCount: remaining.length,
        remainingCredits,
        status: "no-remaining" as const,
      };
    }

    // neededAvg = (target * totalCredits - currentWeightedSum) / remainingCredits
    const neededAvg =
      (target * totalCredits - currentWeightedSum) / remainingCredits;

    if (neededAvg > 100) {
      return {
        neededAvg,
        remainingCount: remaining.length,
        remainingCredits,
        status: "impossible" as const,
      };
    }

    if (neededAvg <= 0) {
      return {
        neededAvg: 0,
        remainingCount: remaining.length,
        remainingCredits,
        status: "already-achieved" as const,
      };
    }

    return {
      neededAvg,
      remainingCount: remaining.length,
      remainingCredits,
      status: "possible" as const,
    };
  }, [allCourses, target]);

  return (
    <div className="data-card space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Target className="h-5 w-5 text-foreground/80" />
        <div>
          <h3 className="font-display font-bold text-lg text-foreground/90">
            {t("reverseCalc")}
          </h3>
          <p className="text-xs text-foreground/50">{t("reverseCalcDesc")}</p>
        </div>
      </div>

      {/* Target slider */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-foreground/70">
            {t("targetScore")}
          </label>
          <span className="font-mono tabular text-2xl font-bold text-foreground/80">
            {target}
          </span>
        </div>
        <input
          type="range"
          min={60}
          max={100}
          step={1}
          aria-label={t("targetScore")}
          value={target}
          onChange={(e) => setTarget(parseInt(e.target.value, 10))}
          className={cn(
            "w-full cursor-pointer appearance-none rounded-full h-2",
            "bg-foreground/10",
            "[&::-webkit-slider-thumb]:appearance-none",
            "[&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5",
            "[&::-webkit-slider-thumb]:rounded-full",
            "[&::-webkit-slider-thumb]:bg-foreground",
            "[&::-webkit-slider-thumb]:shadow-md",
            "[&::-webkit-slider-thumb]:cursor-pointer",
            "[&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5",
            "[&::-moz-range-thumb]:rounded-full",
            "[&::-moz-range-thumb]:bg-foreground",
            "[&::-moz-range-thumb]:border-0",
            "[&::-moz-range-thumb]:cursor-pointer"
          )}
          dir="ltr"
        />
        <div className="flex justify-between text-xs text-foreground/30" dir="ltr">
          <span>60</span>
          <span>70</span>
          <span>80</span>
          <span>90</span>
          <span>100</span>
        </div>
      </div>

      {/* Result */}
      {result.status === "no-remaining" ? (
        <div className="rounded-lg border border-foreground/10 bg-foreground/[0.03] px-5 py-4 text-center text-sm text-foreground/50">
          {t("noCourses")}
        </div>
      ) : result.status === "impossible" ? (
        <div className="rounded-lg border border-red-400/20 bg-red-400/5 px-5 py-4">
          <div className="flex items-center gap-2 text-red-400">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm font-medium">{t("impossible")}</span>
          </div>
        </div>
      ) : result.status === "already-achieved" ? (
        <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 px-5 py-4">
          <div className="flex items-center gap-2 text-emerald-400">
            <Check className="h-4 w-4" />
            <span className="text-sm font-medium">{t("possible")}</span>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-foreground/15 bg-foreground/5 px-5 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <span className="text-xs text-foreground/50">
                {t("neededAvg")}
              </span>
              <div className="font-display tabular text-3xl font-bold text-foreground/80">
                {result.neededAvg !== null ? result.neededAvg.toFixed(1) : "--"}
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-foreground/50">
                {t("remainingCourses")}
              </span>
              <div className="font-mono tabular text-3xl font-bold text-foreground/70">
                {result.remainingCount}
              </div>
              <span className="text-xs text-foreground/40">
                ({result.remainingCredits} {t("credits")})
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------
// Empty state
// -----------------------------------------------------------------------

function EmptyState({ t, locale }: { t: ReturnType<typeof useTranslations<"grades">>; locale: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="data-card mx-auto w-full max-w-lg text-center">
        <div className="mb-6 flex justify-center">
          <Calculator className="h-16 w-16 text-foreground/80" />
        </div>
        <h1 className="mb-3 font-display font-bold text-3xl text-foreground/80">
          {t("title")}
        </h1>
        <p className="mb-6 text-lg text-foreground/70">{t("noCoursesDesc")}</p>
        <a
          href={`/${locale}/planner`}
          className="inline-flex items-center gap-2 rounded-full border border-foreground/20 bg-foreground/10 px-6 py-2.5 font-bold text-sm font-medium text-foreground/80 transition-colors hover:bg-foreground/15"
        >
          <GraduationCap className="h-4 w-4" />
          {t("goToPlanner")}
        </a>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------
// Main Grade Calculator Content
// -----------------------------------------------------------------------

export function GradeCalculatorContent() {
  const t = useTranslations("grades");
  const tRecord = useTranslations("record");
  const locale = useLocale();
  const isHe = locale === "he";

  // Fetch all plan data. refetchOnMount: "always" so navigating to this screen
  // always pulls a fresh snapshot — a grade written on /record (or here) is
  // never masked by a stale per-page QueryClient cache (staleTime is 30s).
  const planQuery = api.plan.getUserPlan.useQuery(undefined, {
    retry: false,
    refetchOnMount: "always",
  });
  const gradeQuery = api.plan.getGraduationScore.useQuery(undefined, {
    retry: false,
  });

  // Per-course "saved" counters — bumped only on a confirmed mutation success,
  // so the GradeInput checkmark reflects a real save (never a fire-and-forget
  // call that later failed).
  const [savedSignals, setSavedSignals] = useState<Record<string, number>>({});

  // Mutation for updating a course grade
  const utils = api.useUtils();
  const updateCourseMutation = api.plan.updateCourse.useMutation({
    onSuccess: (_data, variables) => {
      // A grade change can flip earned credits + compliance too, not just the
      // forecast — invalidate the whole set (#23).
      invalidatePlanData(utils);
      setSavedSignals((prev) => ({
        ...prev,
        [variables.userCourseId]: (prev[variables.userCourseId] ?? 0) + 1,
      }));
      toast.success(t("gradeSaved"));
    },
    onError: () => {
      toast.error(t("gradeSaveError"));
    },
  });

  // Handle grade save
  const handleSaveGrade = useCallback(
    (userCourseId: string, grade: number | null, status: CourseStatus) => {
      // grade === null clears the grade (backend accepts a nullable grade).
      updateCourseMutation.mutate({ userCourseId, grade, status });
      // Deleting a grade keeps the status — but offer the in-progress action
      // instead of a silent decision (#30).
      if (grade === null && status === "COMPLETED") {
        toast(isHe ? "הציון הוסר — הקורס עדיין מסומן כ'הושלם'" : "Grade removed — course still marked completed", {
          action: {
            label: isHe ? "סמן כ'בלימוד'" : "Mark in-progress",
            onClick: () => updateCourseMutation.mutate({ userCourseId, status: "IN_PROGRESS" }),
          },
        });
      }
    },
    [updateCourseMutation, isHe]
  );

  // Group courses by year+semester
  const semesterGroups = useMemo((): SemesterGroup[] => {
    const courses = planQuery.data?.courses ?? [];
    const grouped: Record<string, UserCourseWithCourse[]> = {};

    for (const uc of courses) {
      const key = `${uc.plannedYear}-${uc.plannedSemester}`;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key]!.push(uc);
    }

    return Object.entries(grouped)
      .map(([key, courses]) => {
        const parts = key.split("-");
        const year = parseInt(parts[0] ?? "1", 10);
        const semester = (parts[1] ?? "FALL") as Semester;
        return { year, semester, key, courses };
      })
      .sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year;
        const semOrder: Record<Semester, number> = {
          FALL: 0,
          SPRING: 1,
          SUMMER: 2,
        };
        return semOrder[a.semester] - semOrder[b.semester];
      });
  }, [planQuery.data?.courses]);

  // Grade breakdown
  const gradeBreakdown: GradeBreakdown = gradeQuery.data ?? {
    courseAverage: null,
    seminarPaperAverage: null,
    referatGrade: null,
    weightedScore: null,
    completedCredits: 0,
    totalGradedCourses: 0,
  };

  const allCourses = planQuery.data?.courses ?? [];

  // Loading state
  const isLoading = planQuery.isLoading || gradeQuery.isLoading;

  if (isLoading) {
    return <ThemedLoader />;
  }

  // Empty state
  if (allCourses.length === 0) {
    return <EmptyState t={t} locale={locale} />;
  }

  return (
    <div className="bg-mesh space-y-8 p-4 md:p-6">
      {/* Page header */}
      <div className="animate-stagger-1 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display font-bold text-3xl text-foreground/80">
            {t("title")}
          </h1>
          <p className="mt-1 text-foreground/50">{t("subtitle")}</p>
        </div>
        {/* Cross-link to My Academic Record (manage completed courses) */}
        <Link
          href="/record"
          className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border bg-card/60 px-4 py-2 text-sm font-medium text-foreground/70 transition-colors hover:border-foreground/30 hover:text-foreground/90"
        >
          <FolderOpen className="h-4 w-4" />
          {tRecord("crossLinkFromGrades")}
        </Link>
      </div>

      {/* Section 2: Score Dashboard + Section 3: Reverse Calculator */}
      <div className="animate-stagger-2 grid gap-6 lg:grid-cols-2">
        <ScoreDashboard
          breakdown={gradeBreakdown}
          allCourses={allCourses}
          t={t}
        />
        <ReverseCalculator allCourses={allCourses} t={t} />
      </div>

      {/* Note #25 — distance to honors (approved). Computed aid, year-tagged;
          the transcript has no honors field, so nothing here pretends to be
          an official status. */}
      <HonorsDistanceCard allCourses={allCourses} t={t} />

      {/* Section 1: Per-Course Grade Entry */}
      <div className="animate-stagger-3 space-y-4">
        <div className="flex items-center gap-3">
          <Calculator className="h-5 w-5 text-foreground/80" />
          <h2 className="font-display font-bold text-xl text-foreground/90">
            {t("courseGrades")}
          </h2>
        </div>

        <div className="space-y-4">
          {semesterGroups.map((group) => (
            <SemesterSection
              key={group.key}
              group={group}
              onSaveGrade={handleSaveGrade}
              savedSignals={savedSignals}
              t={t}
              locale={locale}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Note #25: distance to honors ────────────────────────────────────
// Yearly weighted average vs the dean's-list bar. Honest by construction:
// same exclusions as the GPA, year-tagged policy, percentile caveat, and the
// binary-25% trap surfaced right here.
function HonorsDistanceCard({
  allCourses,
  t,
}: {
  allCourses: UserCourseWithCourse[];
  t: ReturnType<typeof useTranslations>;
}) {
  const profileQuery = api.user.getProfile.useQuery();
  const year = deriveYearOfStudy(
    profileQuery.data?.startYear,
    profileQuery.data?.currentYear ?? 1,
  );
  const d = computeHonorsDistance(allCourses, year);

  return (
    <div className="animate-stagger-3 data-card space-y-3 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Award className="h-5 w-5 text-foreground/80" />
        <h3 className="font-display font-bold text-lg text-foreground/90">
          {t("honorsTitle")}
        </h3>
        <span className="rounded-full bg-foreground/8 px-2 py-0.5 text-[10px] text-foreground/50">
          {t("honorsTag")}
        </span>
      </div>

      {d.yearlyAverage === null ? (
        <p className="text-sm text-foreground/55">{t("honorsNoData", { year: d.year })}</p>
      ) : (
        <>
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-3xl font-bold text-foreground/85">
              {d.yearlyAverage.toFixed(1)}
            </span>
            <span className="text-sm text-foreground/55">
              {t("honorsYearAvg", { year: d.year })} · / {HONORS_YEARLY_BAR}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-foreground/10">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                d.gap === 0 ? "bg-emerald-500" : "bg-accent-brand",
              )}
              style={{ width: `${Math.min(100, (d.yearlyAverage / HONORS_YEARLY_BAR) * 100)}%` }}
            />
          </div>
          <p className="text-sm text-foreground/60">
            {d.gap === 0
              ? t("honorsAtBar")
              : t("honorsGapText", { gap: d.gap!.toFixed(1) })}
          </p>
          <p className="text-xs text-foreground/40">
            {t("honorsBasis", { count: d.courseCount, credits: d.credits })} · {t("honorsBinaryNote")}
          </p>
        </>
      )}
    </div>
  );
}
