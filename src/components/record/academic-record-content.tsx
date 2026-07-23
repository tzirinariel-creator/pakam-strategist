"use client";

import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { Calculator } from "lucide-react";
import { api } from "@/lib/trpc/react";
import { invalidatePlanData } from "@/lib/trpc/invalidate-plan";
import { calculateGrades } from "@/lib/grade-calculator";
import { deriveYearOfStudy } from "@/lib/academic-calendar";
import { computeHonorsDistance } from "@/lib/honors";
import { prefersHigherGrade, type MiluimGroupKey } from "@/lib/miluim";
import { isCurrentlyStudying } from "@/lib/semester-clock";
import { ThemedLoader } from "@/components/ui/themed-loader";
import dynamic from "next/dynamic";
// PERF1: the scanner (zod + parsing engine) loads when the record page mounts
// it, not in every page that shares the record chunk graph.
const GradeSheetScanner = dynamic(
  () => import("@/components/record/grade-sheet-scanner").then((m) => m.GradeSheetScanner),
  { ssr: false },
);
import { maybeNudgeCourseReview, ReviewNudgeHost } from "@/components/catalog/review-nudge";
import { BinaryAdvisor } from "@/components/record/binary-advisor";
import { toast } from "sonner";
import {
  SEMESTER_CONFIG,
  YEAR_CONFIG,
  CREDIT_REQUIREMENTS,
} from "@/lib/constants";
import type { UserCourseWithCourse } from "@/types/degree";
import type { CourseStatus, Semester } from "@/types/enums";
import type { CourseWithSchedule } from "@/lib/plan-generator";
import { getPastSemesters } from "@/components/onboarding/step-history";
import { ForecastStrip } from "@/components/record/forecast-strip";
import { SummaryCard } from "@/components/record/summary-card";
import { CourseRow } from "@/components/record/course-row";
import { InProgressSection } from "@/components/record/in-progress-section";
import { AddCourse } from "@/components/record/add-course";
import { EmptyState } from "@/components/record/empty-state";

// ─────────────────────────────────────────────────────────────────────────
// My Academic Record — a single always-available place to SEE / ADD / EDIT /
// REMOVE every COMPLETED course, grouped by year·semester, with a running
// summary (completed credits, weighted average, focus-area progress).
//
// Complements the Grade Forecast (graduation/) — that screen owns the
// weighted graduation-score formula + reverse calculator over the WHOLE plan;
// this screen owns management of the PAST (COMPLETED) record only. The two
// cross-link so there's no dead-end.
// ─────────────────────────────────────────────────────────────────────────

const SEM_ORDER: Record<Semester, number> = { FALL: 0, SPRING: 1, SUMMER: 2 };

// -----------------------------------------------------------------------
// Main content
// -----------------------------------------------------------------------

interface SemesterGroup {
  year: number;
  semester: Semester;
  key: string;
  courses: UserCourseWithCourse[];
}

export function AcademicRecordContent() {
  const t = useTranslations("record");
  const locale = useLocale();
  const isHe = locale === "he";

  // A "?scan=1" link (the end-of-semester rite, the home "enter grades" CTA)
  // opens the record straight at the grade-sheet scanner — one door for
  // "enter my grades" (#25, grades-door consolidation).
  const scannerRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get("scan") === "1") {
      const t = setTimeout(() => scannerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
      return () => clearTimeout(t);
    }
  }, [searchParams]);

  // Lets the empty-state CTA jump to (and focus) the add-course form below.
  const addCourseRef = useRef<HTMLDivElement>(null);
  const scrollToAddCourse = useCallback(() => {
    const el = addCourseRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.querySelector<HTMLInputElement>('input[type="text"]')?.focus({
      preventScroll: true,
    });
  }, []);

  const utils = api.useUtils();
  // refetchOnMount: "always" so navigating to this screen always pulls a fresh
  // snapshot — a grade written on /graduation is never masked by a stale
  // per-page QueryClient cache (global staleTime is 30s).
  const planQuery = api.plan.getUserPlan.useQuery(undefined, {
    retry: false,
    refetchOnMount: "always",
  });
  const profileQuery = api.user.getProfile.useQuery(undefined, { retry: false });
  // Gate the credits query behind a successful plan load. getCredits throws
  // NOT_FOUND when no User row exists yet (e.g. visiting /record before
  // onboarding), so running it unconditionally spams query errors. The plan
  // query is the screen's user-existence check; once it resolves we know the
  // user exists and getCredits is safe. Focus-area progress just shows 0/empty
  // until then — a graceful degrade, not an error.
  const creditsQuery = api.plan.getCredits.useQuery(undefined, {
    retry: false,
    enabled: planQuery.isSuccess,
  });
  const catalogQuery = api.course.list.useQuery(undefined, {
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  // The predicted FINAL grade (78% courses · 18% seminars · 4% referat) — the
  // SAME source /graduation reads, so the record forecast strip and the
  // calculator never disagree. Grades are entered here; this only reads.
  const gradeQuery = api.plan.getGraduationScore.useQuery(undefined, {
    retry: false,
  });

  const invalidateAll = useCallback(() => invalidatePlanData(utils), [utils]);

  // Per-course "saved" counters — bumped only on a confirmed mutation success,
  // so the GradeInput checkmark reflects a real save (never a fire-and-forget
  // call that later failed).
  const [savedSignals, setSavedSignals] = useState<Record<string, number>>({});

  const updateCourseMutation = api.plan.updateCourse.useMutation({
    onSuccess: (_data, variables) => {
      invalidateAll();
      setSavedSignals((prev) => ({
        ...prev,
        [variables.userCourseId]: (prev[variables.userCourseId] ?? 0) + 1,
      }));
      // S1 — the record is the second grade door: a locked grade (real write,
      // grade + COMPLETED) offers the 10-second cohort contribution once.
      if (variables.grade != null && variables.status === "COMPLETED") {
        const uc = (planQuery.data?.courses ?? []).find((c) => c.id === variables.userCourseId);
        if (uc) {
          maybeNudgeCourseReview(uc.course.code, isHe ? uc.course.nameHe : (uc.course.nameEn ?? uc.course.nameHe), isHe);
        }
      }
    },
    onError: (e) =>
      toast.error(
        e.message === "COURSE_ALREADY_IN_SEMESTER"
          ? isHe
            ? "הקורס כבר נמצא בסמסטר הזה"
            : "This course is already in that semester"
          : t("saveError"),
      ),
  });
  const removeCourseMutation = api.plan.removeCourse.useMutation({
    onSuccess: () => {
      invalidateAll();
      toast.success(t("removed"));
    },
    onError: () => toast.error(t("saveError")),
  });
  const addCompletedMutation = api.plan.saveCompletedCourses.useMutation({
    onSuccess: () => {
      invalidateAll();
      toast.success(t("added"));
    },
    onError: () => toast.error(t("saveError")),
  });

  const handleSaveGrade = useCallback(
    (userCourseId: string, grade: number | null, status: CourseStatus) => {
      // A FAILED course never keeps a binary (pass/fail) flag — same invariant
      // the planner card enforces, so a re-failed course can't linger as binary.
      updateCourseMutation.mutate({
        userCourseId,
        grade,
        status,
        ...(status === "FAILED" ? { isBinary: false } : {}),
      });
      // Deleting a grade keeps the status — offer the in-progress action rather
      // than deciding silently, matching /graduation exactly (#30).
      if (grade === null && status === "COMPLETED") {
        toast(isHe ? "הציון הוסר — הקורס עדיין מסומן כ'הושלם'" : "Grade removed — course still marked completed", {
          action: {
            label: isHe ? "סמנו כ׳בלימוד׳" : "Mark in-progress",
            onClick: () => updateCourseMutation.mutate({ userCourseId, status: "IN_PROGRESS" }),
          },
        });
      }
    },
    [updateCourseMutation, isHe]
  );

  const handleRemove = useCallback(
    (userCourseId: string) => {
      removeCourseMutation.mutate({ userCourseId });
    },
    [removeCourseMutation]
  );

  const profile = profileQuery.data;
  const focusArea = profile?.focusArea ?? null;

  // Valid PAST placements for an added course — every (year, semester) strictly
  // before the student's current one. The picker defaults to the most recent of
  // these (one step before current), so courses land in the right year·semester
  // bucket and the year-1 transition-gate average stays correct. The onboarding
  // flow only ever uses FALL/SPRING, so SUMMER current → treat as FALL boundary.
  const pastSemesters = useMemo(() => {
    const year = profile?.currentYear ?? 1;
    const semester: "FALL" | "SPRING" =
      profile?.currentSemester === "SPRING" ? "SPRING" : "FALL";
    return getPastSemesters(year, semester);
  }, [profile?.currentYear, profile?.currentSemester]);

  const handleAdd = useCallback(
    (course: CourseWithSchedule, placement: { year: number; semester: Semester }) => {
      addCompletedMutation.mutate({
        courses: [
          {
            courseCode: course.code,
            plannedYear: placement.year,
            plannedSemester: placement.semester,
            grade: null,
          },
        ],
      });
    },
    [addCompletedMutation]
  );

  // The student's derived year-of-study (#4/#22) — the same anchor the planner
  // and clock use, so "in progress now" survives semester rollover on its own.
  const currentYear = deriveYearOfStudy(
    profile?.startYear,
    profile?.currentYear ?? 1,
  );

  // Distance to honors for the CURRENT study year — a computed aid (same
  // exclusions as the GPA), null when no graded course this year yet. Same
  // function /graduation uses, so the two never diverge.
  const honors = useMemo(
    () => computeHonorsDistance(planQuery.data?.courses ?? [], currentYear, profile?.miluimGroup),
    [planQuery.data?.courses, currentYear, profile?.miluimGroup],
  );

  // The PRESENT courses: PLANNED rows whose (year, semester) is the live
  // teaching/exams window right now. Derived, never stored.
  const inProgressCourses = useMemo(
    () =>
      (planQuery.data?.courses ?? []).filter((uc) =>
        isCurrentlyStudying(
          {
            plannedYear: uc.plannedYear,
            plannedSemester: uc.plannedSemester,
            status: uc.status,
          },
          currentYear,
        ),
      ),
    [planQuery.data?.courses, currentYear],
  );

  // Only COMPLETED courses belong in the academic record.
  const completedCourses = useMemo(
    () =>
      (planQuery.data?.courses ?? []).filter((uc) => uc.status === "COMPLETED"),
    [planQuery.data?.courses]
  );

  // Course ids already present anywhere in the plan — so add-search never
  // offers a course the student already has (matches addCourse idempotency).
  const existingCourseIds = useMemo(
    () => new Set((planQuery.data?.courses ?? []).map((uc) => uc.courseId)),
    [planQuery.data?.courses]
  );

  const semesterGroups = useMemo((): SemesterGroup[] => {
    const grouped: Record<string, UserCourseWithCourse[]> = {};
    for (const uc of completedCourses) {
      const key = `${uc.plannedYear}-${uc.plannedSemester}`;
      (grouped[key] ??= []).push(uc);
    }
    return Object.entries(grouped)
      .map(([key, courses]) => {
        const parts = key.split("-");
        const year = parseInt(parts[0] ?? "1", 10);
        const semester = (parts[1] ?? "FALL") as Semester;
        return { year, semester, key, courses };
      })
      .sort((a, b) =>
        a.year !== b.year
          ? a.year - b.year
          : SEM_ORDER[a.semester] - SEM_ORDER[b.semester]
      );
  }, [completedCourses]);

  // Credits earned toward the 150 — the SAME capped/EXEMPT-aware figure the
  // dashboard hero and King show (breakdown.earned), not a raw sum of
  // course.credits that would ignore EXEMPT courses and the practice/law-foundation
  // caps and so disagree with Home (#audit-r2).
  const completedCredits = creditsQuery.data?.breakdown.earned ?? 0;
  const weightedAvg = useMemo(() => {
    // Call the CANONICAL engine (the same calculateGrades the server's
    // getGraduationScore, the dashboard, the King and /graduation all use)
    // instead of re-deriving the weighted average here. A hand-rolled copy of
    // this loop is exactly what produced launch-blocker A1 (two conflicting
    // averages shown to the same student): the filters drifted apart over time.
    // Computing it client-side (rather than reading the server query) keeps the
    // number live while the student types grades; routing it through the shared
    // engine means it can no longer diverge from everywhere else.
    return calculateGrades(completedCourses, {
      preferHigherGrade: prefersHigherGrade((profile?.miluimGroup ?? "NONE") as MiluimGroupKey),
    }).courseAverage;
  }, [completedCourses, profile?.miluimGroup]);

  const focusCredits = creditsQuery.data?.breakdown.focusArea ?? 0;
  const focusTarget =
    creditsQuery.data?.breakdown.focusAreaTarget ?? CREDIT_REQUIREMENTS.FOCUS_AREA_MIN;

  // Note: creditsQuery is intentionally excluded — it's gated behind the plan
  // query (enabled: planQuery.isSuccess), so a disabled query reads as
  // isLoading and would otherwise pin the loader forever. Focus-area progress
  // degrades to 0/empty until credits arrive.
  const isLoading = planQuery.isLoading || profileQuery.isLoading;

  if (isLoading) {
    return <ThemedLoader />;
  }

  const catalog = (catalogQuery.data ?? []) as CourseWithSchedule[];
  const isEmpty = completedCourses.length === 0;
  // Does the student have ANY course (planned, in-progress, etc.) — not just
  // completed ones? Drives whether the empty state offers an onboarding link.
  const hasAnyCourses = (planQuery.data?.courses ?? []).length > 0;

  return (
    <div className="bg-mesh space-y-8 p-4 md:p-6">
      {/* Header */}
      <div className="animate-stagger-1 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground/85">
            {t("title")}
          </h1>
          <p className="mt-1 text-foreground/50">{t("subtitle")}</p>
        </div>
        {/* Cross-link to the Grade Forecast */}
        <Link
          href="/graduation"
          className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border bg-card/60 px-4 py-2 text-sm font-medium text-foreground/70 transition-colors hover:border-foreground/30 hover:text-foreground/90"
        >
          <Calculator className="h-4 w-4" />
          {t("crossLinkGrades")}
        </Link>
      </div>

      {/* Show the strip whenever there's EITHER a final-score forecast (year 3)
          OR an honors figure — the honors gap is computable from day one, so a
          year-2 student at a 96 average must see it, not nothing (launch audit 24.7). */}
      {!isEmpty && (gradeQuery.data?.weightedScore != null || honors.yearlyAverage != null) && (
        <div className="animate-stagger-2">
          <ForecastStrip
            weightedScore={gradeQuery.data?.weightedScore ?? null}
            honors={honors}
            t={t}
          />
        </div>
      )}

      {!isEmpty && (
        <div className="animate-stagger-2">
          <SummaryCard
            completedCredits={completedCredits}
            weightedAvg={weightedAvg}
            focusCredits={focusCredits}
            focusTarget={focusTarget}
            hasFocus={focusArea != null}
            t={t}
          />
        </div>
      )}

      <ReviewNudgeHost />
      {/* AI grade-sheet scanner — upload a Yedion photo/PDF, review, apply. */}
      <div ref={scannerRef} className="animate-stagger-2">
        <GradeSheetScanner />
      </div>

      {/* Miluim binary-conversion advisor — exact average impact, advisory only.
          Renders nothing for non-miluim students or when out of quota. */}
      <div className="animate-stagger-2">
        <BinaryAdvisor />
      </div>

      {/* In progress now — the derived PRESENT, above the completed past. Only
          renders when the student has live courses this teaching window. */}
      {inProgressCourses.length > 0 && (
        <div className="animate-stagger-2">
          <InProgressSection
            courses={inProgressCourses}
            locale={locale}
            isHe={isHe}
            onSaveGrade={handleSaveGrade}
            savedSignals={savedSignals}
            t={t}
          />
        </div>
      )}

      {/* Completed courses grouped by year·semester */}
      {isEmpty ? (
        <div className="animate-stagger-2">
          <EmptyState
            hasAnyCourses={hasAnyCourses}
            onAddFirstCourse={scrollToAddCourse}
            t={t}
          />
        </div>
      ) : (
        <div className="animate-stagger-3 space-y-4">
          {semesterGroups.map((group) => {
            const yearCfg = YEAR_CONFIG[group.year as keyof typeof YEAR_CONFIG];
            const semCfg = SEMESTER_CONFIG[group.semester];
            const yearLabel = isHe ? yearCfg?.nameHe : yearCfg?.nameEn;
            const semLabel = isHe ? semCfg?.nameHe : semCfg?.nameEn;
            const groupCredits = group.courses.reduce(
              (s, c) => s + c.course.credits,
              0
            );
            return (
              <div key={group.key} className="data-card overflow-hidden">
                <div className="flex items-center justify-between border-b border-border/30 px-5 py-4">
                  <span className="font-bold text-foreground/90">
                    {yearLabel} — {semLabel}
                  </span>
                  <span className="text-xs text-foreground/40">
                    {group.courses.length} {isHe ? (group.courses.length === 1 ? "קורס" : "קורסים") : (group.courses.length === 1 ? "course" : "courses")} · {groupCredits} {t("credits")}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/20 text-foreground/50">
                        <th className="px-5 py-2.5 text-start font-medium">{t("course")}</th>
                        <th className="hidden px-3 py-2.5 text-start font-medium sm:table-cell">
                          {t("discipline")}
                        </th>
                        <th className="px-3 py-2.5 text-center font-medium">{t("credits")}</th>
                        <th className="px-3 py-2.5 text-center font-medium">{t("grade")}</th>
                        <th className="px-3 py-2.5 text-center font-medium">{t("actions")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.courses.map((uc) => (
                        <CourseRow
                          key={uc.id}
                          uc={uc}
                          focusArea={focusArea}
                          locale={locale}
                          isHe={isHe}
                          onSaveGrade={handleSaveGrade}
                          onRemove={handleRemove}
                          savedSignal={savedSignals[uc.id] ?? 0}
                          t={t}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add a past course — always available */}
      <div ref={addCourseRef} className="animate-stagger-4">
        <AddCourse
          catalog={catalog}
          existingCourseIds={existingCourseIds}
          focusArea={focusArea}
          pastSemesters={pastSemesters}
          isHe={isHe}
          onAdd={handleAdd}
          isSaving={addCompletedMutation.isPending}
          t={t}
        />
      </div>
    </div>
  );
}
