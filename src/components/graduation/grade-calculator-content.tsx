"use client";

import { GradeSimulator } from "@/components/graduation/grade-simulator";
import { WhatMovesMyAverage } from "@/components/graduation/what-moves-my-average";
import { FuturePlansCard } from "@/components/graduation/future-plans-card";
import { resolveEnglishLevel } from "@/lib/constants";
import { resolveEnglishStanding } from "@/lib/english-standing";
import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  Calculator,
  GraduationCap,
  Target,
  Check,
  AlertTriangle,
  FolderOpen,
  Award,
} from "lucide-react";
import { api } from "@/lib/trpc/react";
import { ThemedLoader } from "@/components/ui/themed-loader";
import { cn } from "@/lib/utils";
import { GRADE_WEIGHTS } from "@/lib/constants";
import { roundScore, countsTowardAverage, courseTypeCountsTowardAverage, canonicalAttempts } from "@/lib/grade-calculator";
import { computeHonorsDistance, HONORS_YEARLY_BAR } from "@/lib/honors";
import { prefersHigherGrade, type MiluimGroupKey } from "@/lib/miluim";
import { deriveYearOfStudy } from "@/lib/academic-calendar";
import type { UserCourseWithCourse, GradeBreakdown } from "@/types/degree";

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
  isHe,
  preferHigherGradeFlag,
}: {
  breakdown: GradeBreakdown;
  allCourses: UserCourseWithCourse[];
  t: ReturnType<typeof useTranslations<"grades">>;
  isHe: boolean;
  preferHigherGradeFlag: boolean;
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
  const completed = canonicalAttempts(allCourses.filter(countsTowardAverage), {
    preferHigherGrade: preferHigherGradeFlag,
  });
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
            <span className="max-w-[16rem] text-center text-xs text-foreground/40">
              {isHe
                ? "ציון הגמר יחושב כשיהיו לכם ציוני סמינריון ורפרט — לקראת סוף התואר"
                : "Your final score is computed once seminar & referat grades are in — near the end of the degree"}
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
  preferHigherGradeFlag,
}: {
  allCourses: UserCourseWithCourse[];
  t: ReturnType<typeof useTranslations<"grades">>;
  preferHigherGradeFlag: boolean;
}) {
  const [target, setTarget] = useState(80);

  const result = useMemo(() => {
    const completed = canonicalAttempts(allCourses.filter(countsTowardAverage), {
      preferHigherGrade: preferHigherGradeFlag,
    });
    // A course already counted as completed (canonicalAttempts keeps a passed
    // course that's being retaken as EARNED, #audit-r6) must not also appear in
    // `remaining` — else its credits land in BOTH completedCredits and
    // remainingCredits, double-counting it in totalCredits and skewing the
    // needed-average (a borderline target could flip to a false "impossible")
    // (QA 13.7). This also keeps the reverse calc consistent with the dashboard.
    const completedCodes = new Set(completed.map((c) => c.course.code));
    // Remaining courses must share the SAME population as `completed`: only those
    // whose TYPE counts toward the average (not seminar/English/binary). Counting
    // planned non-average courses into the divisor produced a wrong "needed
    // average" (too high / false "impossible") (#audit-r3).
    const remaining = allCourses.filter(
      (c) =>
        (c.status === "PLANNED" || c.status === "IN_PROGRESS") &&
        courseTypeCountsTowardAverage(c) &&
        !completedCodes.has(c.course.code)
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
  }, [allCourses, target, preferHigherGradeFlag]);

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
// Main Grade Forecast Content
// -----------------------------------------------------------------------

export function GradeCalculatorContent() {
  const t = useTranslations("grades");
  const tRecord = useTranslations("record");
  const locale = useLocale();

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
  // B/C/G reservists keep the HIGHER exam grade (Ariel 23.7). The local GPA
  // recompute on this card must use the same rule as the server breakdown it
  // sits beside, or the two averages diverge for reservists.
  const profileQuery = api.user.getProfile.useQuery();
  const preferHigherGradeFlag = prefersHigherGrade(
    (profileQuery.data?.miluimGroup ?? "NONE") as MiluimGroupKey,
  );

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

  // Facts the "after the degree" card reports. Every one of these is already
  // shown elsewhere in the app — the card organises them around a direction,
  // it does not compute anything new about the student.
  const futureFacts = useMemo(() => {
    const graded = allCourses.filter(
      (uc) => uc.status === "COMPLETED" && uc.grade != null && countsTowardAverage(uc),
    );
    const totalCredits = graded.reduce((s2, uc) => s2 + (uc.course.credits ?? 0), 0);
    const average =
      totalCredits > 0
        ? Math.round(
            (graded.reduce((s2, uc) => s2 + (uc.grade as number) * (uc.course.credits ?? 0), 0) /
              totalCredits) * 10,
          ) / 10
        : null;

    const completed = allCourses.filter((uc) => uc.status === "COMPLETED");
    const englishInfo = resolveEnglishLevel(
      profileQuery.data?.englishLevel ?? null,
      profileQuery.data?.amiramScore ?? null,
    );
    const standing = englishInfo
      ? resolveEnglishStanding(
          englishInfo,
          completed.map((uc) => ({
            nameHe: uc.course.nameHe,
            courseCode: uc.course.code,
            grade: uc.grade,
            isBinary: uc.isBinary,
            status: uc.status,
          })),
        )
      : null;

    return {
      average,
      focusArea: profileQuery.data?.focusArea ?? null,
      englishRemaining: englishInfo
        ? (standing?.levelCoursesRemaining ?? englishInfo.levelCourses)
        : null,
      englishExempt: englishInfo?.isExempt ?? false,
      seminarsCompleted: completed.filter((uc) => uc.course.courseType === "SEMINAR").length,
      quantitativeCredits: completed
        .filter((uc) => uc.course.discipline === "ECONOMICS")
        .reduce((s2, uc) => s2 + (uc.course.credits ?? 0), 0),
      creditsCompleted: completed.reduce((s2, uc) => s2 + (uc.course.credits ?? 0), 0),
    };
  }, [allCourses, profileQuery.data]);

  // Loading state
  const isLoading = planQuery.isLoading || gradeQuery.isLoading;

  if (isLoading) {
    return <ThemedLoader />;
  }

  // Fetch error → an HONEST error card, never the "you have no courses" empty
  // state. Masquerading a failure as EmptyState would tell a student with a full
  // record they're empty — a false status (audit 22.7). Only show EmptyState
  // once the query has actually SUCCEEDED and returned zero courses.
  if (planQuery.isError || gradeQuery.isError) {
    return (
      <div className="bg-mesh flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-foreground/70">
          {locale === "he" ? "לא הצלחנו לטעון את הנתונים כרגע." : "We couldn't load your data right now."}
        </p>
        <button
          type="button"
          onClick={() => { planQuery.refetch(); gradeQuery.refetch(); }}
          className="rounded-lg bg-accent-brand px-4 py-2 text-sm font-semibold text-accent-brand-fg transition-colors hover:bg-accent-brand-hover"
        >
          {locale === "he" ? "נסו שוב" : "Try again"}
        </button>
      </div>
    );
  }

  // Empty state (only reachable after a SUCCESSFUL fetch returning zero courses)
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

      {/* Ariel, 21.8 — the simulator he asked for, from the screenshots he sent.
          Placed directly under the header because "מה יקרה אם" is the reason
          most students open this screen at all, and the מועד ב׳ decision has a
          deadline. Everything it computes runs through the same
          `calculateGrades` as the numbers below it. */}
      {/* Ariel, on the tenth asking: the simulator "לא מספיק מגניב ולא מספיק
          עוזר ואין בו איזה תובנות או המלצות או חיבור למתי יש מועדי ב׳". This
          leads with the answer — which courses can actually move the average,
          ranked, each with its resit date — so it is above the sandbox rather
          than behind it. */}
      <div className="animate-stagger-1">
        <WhatMovesMyAverage
          courses={allCourses}
          keepsHigherGrade={prefersHigherGrade(
            (profileQuery.data?.miluimGroup ?? "NONE") as MiluimGroupKey,
          )}
        />
      </div>

      {/* Ariel, 21.8 — "מה אחרי התואר". A first version: it reports what the
          app holds about the student for the direction they pick, and states
          that the programme's own bar is not something we hold. */}
      <div className="animate-stagger-1">
        <FuturePlansCard facts={futureFacts} />
      </div>

      <div className="animate-stagger-2">
        <GradeSimulator
          courses={allCourses}
          preferHigherGrade={prefersHigherGrade(
            (profileQuery.data?.miluimGroup ?? "NONE") as MiluimGroupKey,
          )}
        />
      </div>

      {/* Section 2: Score Dashboard + Section 3: Reverse Calculator */}
      <div className="animate-stagger-2 grid gap-6 lg:grid-cols-2">
        <ScoreDashboard
          breakdown={gradeBreakdown}
          allCourses={allCourses}
          t={t}
          isHe={locale === "he"}
          preferHigherGradeFlag={preferHigherGradeFlag}
        />
        <ReverseCalculator allCourses={allCourses} t={t} preferHigherGradeFlag={preferHigherGradeFlag} />
      </div>

      {/* Note #25 — distance to honors (approved). Computed aid, year-tagged;
          the transcript has no honors field, so nothing here pretends to be
          an official status. */}
      <HonorsDistanceCard allCourses={allCourses} t={t} />

      {/* Per-course grades are entered/edited ONLY in the academic record
          (/record). This screen is analysis-only and READS that data — one
          grade surface, one canonical average, no duplicate editable table. */}
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
  const d = computeHonorsDistance(allCourses, year, profileQuery.data?.miluimGroup);

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
          {/* The three real distinctions, with the numbers Ariel corrected on
              21.8, stated as where the cut HAS fallen rather than as bars. */}
          <p className="text-xs leading-relaxed text-foreground/45">{t("honorsBands")}</p>
          <p className="text-xs leading-relaxed text-foreground/40">{t("honorsWhenDecided")}</p>
          <p className="text-xs text-foreground/40">
            {t("honorsBasis", { count: d.courseCount, credits: d.credits })} · {t("honorsBinaryNote")}
          </p>
        </>
      )}
    </div>
  );
}
