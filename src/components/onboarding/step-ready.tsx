"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { PartyPopper, Calendar, BookOpen, Check, GraduationCap, RefreshCw, AlertTriangle } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { api } from "@/lib/trpc/react";
import { useRouter } from "@/i18n/navigation";
import { DISCIPLINE_CONFIG, FOCUS_DISCIPLINE_IDS, SEMESTER_CONFIG, YEAR_CONFIG } from "@/lib/constants";
import type { OnboardingData } from "./onboarding-wizard";
import type { PlannedSemester } from "./semester-planner/index";
import type { CourseWithSchedule } from "@/lib/plan-generator";
import type { SessionGroupSelections } from "./semester-planner/live-timetable";

interface StepReadyProps {
  data: OnboardingData;
  plannedSemesters: PlannedSemester[] | null;
  allCourses: CourseWithSchedule[];
  sessionGroupSelections?: SessionGroupSelections;
}

export function StepReady({ data, plannedSemesters, allCourses, sessionGroupSelections }: StepReadyProps) {
  const t = useTranslations("onboarding");
  const locale = useLocale();
  const isHe = locale === "he";
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const didSave = useRef(false);

  const updateProfile = api.user.updateProfile.useMutation();
  const savePlanMutation = api.plan.savePlan.useMutation();
  const utils = api.useUtils();

  // Build the flat course list from planned semesters
  const courseMap = new Map(allCourses.map((c) => [c.id, c]));
  const flattenedCourses = (plannedSemesters ?? []).flatMap((sem) =>
    sem.courseIds.map((courseId) => {
      const courseCode = courseMap.get(courseId)?.code;
      const groups = courseCode ? sessionGroupSelections?.[courseCode] : undefined;
      return {
        courseId,
        plannedYear: sem.year,
        plannedSemester: sem.semester as "FALL" | "SPRING",
        ...(groups && Object.keys(groups).length > 0 ? { selectedGroups: groups } : {}),
      };
    })
  );
  const totalCourseCount = flattenedCourses.length;
  const totalCredits = flattenedCourses.reduce(
    (sum, c) => sum + (courseMap.get(c.courseId)?.credits ?? 0),
    0
  );

  // Timeout helper — ensures no network call hangs forever
  const withTimeout = useCallback(<T,>(promise: Promise<T>, ms: number): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Request timed out")), ms)
      ),
    ]);
  }, []);

  // Save function — can be called for initial save or retry
  const doSave = useCallback(async () => {
    setIsSaving(true);
    setSaveError(false);
    try {
      // 1. Update user profile (including miluim + amiram) — 15s timeout
      await withTimeout(
        updateProfile.mutateAsync({
          currentYear: data.year,
          currentSemester: data.semester,
          ...(data.focusArea ? { focusArea: data.focusArea } : {}),
          miluimGroup: data.miluimGroup,
          amiramScore: data.amiramScore,
        }),
        15000,
      );

      // 2. Bulk save all courses in a single request — 20s timeout
      await withTimeout(
        savePlanMutation.mutateAsync({
          courses: flattenedCourses,
        }),
        20000,
      );

      // 3. Invalidate caches (fire-and-forget, don't block on refetch)
      utils.plan.getUserPlan.invalidate();
      utils.plan.getCredits.invalidate();
      utils.user.getProfile.invalidate();
      // Try to refetch, but don't block on it — 5s timeout
      try {
        await withTimeout(utils.plan.getUserPlan.refetch(), 5000);
      } catch {
        // Non-critical — dashboard will refetch on its own
      }

      setHasSaved(true);

      // Signal to dashboard that onboarding data was saved successfully.
      // This survives page navigation / React Query cache isolation.
      if (typeof window !== "undefined") {
        localStorage.setItem("pakamon-onboarding-complete", Date.now().toString());
      }
    } catch (error) {
      console.error("Failed to save onboarding plan:", error);
      setSaveError(true);
      toast.error(t("saveFailedMessage"));
    } finally {
      setIsSaving(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save on mount
  useEffect(() => {
    if (didSave.current || !plannedSemesters || plannedSemesters.length === 0) return;
    didSave.current = true;
    doSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Focus area display
  const focusDisplay = data.focusArea
    ? DISCIPLINE_CONFIG[data.focusArea]
    : null;

  // Show "continue anyway" after 6 seconds of saving
  const [savingTooLong, setSavingTooLong] = useState(false);
  useEffect(() => {
    if (!isSaving) {
      setSavingTooLong(false);
      return;
    }
    const timer = setTimeout(() => setSavingTooLong(true), 6000);
    return () => clearTimeout(timer);
  }, [isSaving]);

  // Saving state — show a nice themed animation
  if (isSaving) {
    return (
      <div className="flex flex-col items-center justify-center text-center min-h-[50vh] gap-5">
        <div className="relative">
          <div className="h-24 w-24 animate-spin rounded-full border-4 border-foreground/10 border-t-foreground/50" />
          <div className="absolute inset-0 flex items-center justify-center">
            <GraduationCap className="h-10 w-10 text-foreground/50" />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium text-foreground/70 animate-pulse">
            {t("savingCoursesCount", { count: totalCourseCount })}
          </p>
          <p className="text-xs text-foreground/40">
            {t("allDoneSavingDesc")}
          </p>
        </div>
        {savingTooLong && (
          <button
            type="button"
            onClick={() => {
              // Navigate to dashboard WITHOUT marking onboarding complete.
              // This way the user can re-trigger onboarding if save failed.
              setIsSaving(false);
              router.push("/dashboard");
            }}
            className="animate-fade-in rounded-lg border border-foreground/20 px-5 py-2 text-sm font-medium text-foreground/50 transition-colors hover:bg-foreground/5"
          >
            {t("continueWithoutSaving")}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center text-center">
      {/* Confetti dots — deterministic positions to avoid hydration mismatch */}
      {hasSaved && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {Array.from({ length: 20 }).map((_, i) => {
            const phi = (i * 0.618033988749895) % 1;
            const phi2 = ((i * 3 + 7) * 0.618033988749895) % 1;
            return (
              <div
                key={i}
                className="absolute h-2 w-2 rounded-full"
                style={{
                  backgroundColor: [
                    "hsl(var(--foreground))",
                    ...FOCUS_DISCIPLINE_IDS.map((id) => DISCIPLINE_CONFIG[id]?.color ?? "hsl(var(--foreground))"),
                  ][i % (1 + FOCUS_DISCIPLINE_IDS.length)],
                  left: `${10 + phi * 80}%`,
                  top: `${phi2 * 40}%`,
                  opacity: 0.3 + (phi * 0.4),
                  animation: `confetti-float ${2 + phi * 3}s ease-in-out ${phi2 * 2}s infinite alternate`,
                }}
              />
            );
          })}
        </div>
      )}

      {/* Hero */}
      <div className="animate-stagger-1 mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-foreground/10 shadow-sm">
        {hasSaved ? (
          <PartyPopper className="h-10 w-10 text-foreground/80" />
        ) : (
          <Check className="h-10 w-10 text-foreground/80" />
        )}
      </div>

      <h2 className="animate-stagger-1 text-foreground text-3xl font-bold">
        {hasSaved
          ? t("allDoneReadyTitle")
          : saveError
            ? t("saveFailedTitle")
            : t("allDone")}
      </h2>
      <p className="animate-stagger-2 mt-2 text-foreground/50">
        {hasSaved
          ? t("allDoneReadyDesc")
          : saveError
            ? t("saveFailedDesc")
            : t("allDoneDesc")}
      </p>

      {/* Summary card */}
      <div className="animate-stagger-3 mt-8 w-full max-w-sm">
        <div className="data-card space-y-4 p-6">
          <h3 className="text-sm font-medium text-foreground/40">
            {t("summary")}
          </h3>

          <div className="space-y-3">
            {/* Program */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground/50">
                {t("chooseProgram")}
              </span>
              <span className="text-sm font-medium text-foreground/80">
                {t("ppe")}
              </span>
            </div>

            {/* Year */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground/50">
                {t("yourYear")}
              </span>
              <span className="text-sm font-medium text-foreground/80">
                {data.year === 1
                  ? t("yearA")
                  : data.year === 2
                    ? t("yearB")
                    : t("yearC")}
              </span>
            </div>

            {/* Semester */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground/50">
                {t("yourSemester")}
              </span>
              <span className="text-sm font-medium text-foreground/80">
                {data.semester === "FALL" ? t("semesterA") : t("semesterB")}
              </span>
            </div>

            {/* Focus area */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground/50">
                {t("yourFocus")}
              </span>
              <span
                className={cn(
                  "text-sm font-medium",
                  focusDisplay?.textClass ?? "text-foreground/60"
                )}
              >
                {(isHe ? focusDisplay?.nameHe : focusDisplay?.nameEn) ?? t("undecided")}
              </span>
            </div>

            {/* Semesters planned */}
            {plannedSemesters && plannedSemesters.length > 0 && (
              <div className="border-t border-border pt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground/50">
                    {t("planCoursesCount")}
                  </span>
                  <span className="font-mono text-lg font-bold text-foreground/80">
                    {totalCourseCount}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground/50">
                    {t("totalCreditsLabel")}
                  </span>
                  <span className="font-mono text-lg font-bold text-foreground/80">
                    {totalCredits}
                  </span>
                </div>
                {/* Per-semester mini breakdown */}
                <div className="space-y-1 pt-1">
                  {plannedSemesters.map((sem) => {
                    const semCredits = sem.courseIds.reduce(
                      (s, id) => s + (courseMap.get(id)?.credits ?? 0),
                      0
                    );
                    const yearLabel = isHe
                      ? YEAR_CONFIG[sem.year as 1 | 2 | 3]?.nameHe
                      : YEAR_CONFIG[sem.year as 1 | 2 | 3]?.nameEn;
                    const semLabel = isHe
                      ? SEMESTER_CONFIG[sem.semester]?.short
                      : SEMESTER_CONFIG[sem.semester]?.shortEn;
                    return (
                      <div key={`${sem.year}-${sem.semester}`} className="flex items-center justify-between text-xs text-foreground/40">
                        <span>{yearLabel} · {semLabel}</span>
                        <span className="font-mono">
                          {sem.courseIds.length} {t("courses")} · {semCredits} {t("nz")}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CTA buttons — only show after save completes */}
      {hasSaved && (
        <div className="animate-stagger-4 mt-8 flex w-full max-w-sm flex-col gap-3">
          <button
            onClick={() => router.push("/dashboard?from=onboarding")}
            className="flex items-center justify-center gap-2 rounded-xl bg-foreground px-6 py-3.5 font-bold text-background shadow-sm transition-all hover:scale-[1.02] press-scale"
          >
            <Calendar className="h-5 w-5" />
            {t("goToDashboard")}
          </button>

          <button
            onClick={() => router.push("/catalog")}
            className="flex items-center justify-center gap-2 rounded-xl border-2 border-border px-6 py-3 text-sm font-medium text-foreground/70 transition-all hover:border-foreground/30 hover:text-foreground/90"
          >
            <BookOpen className="h-4 w-4" />
            {t("exploreCatalog")}
          </button>
        </div>
      )}

      {/* Error state — show retry and error message */}
      {saveError && !hasSaved && (
        <div className="animate-stagger-4 mt-8 flex w-full max-w-sm flex-col gap-3">
          <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-start">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            <div>
              <p className="text-sm font-medium text-red-400">
                {t("saveFailedTitle")}
              </p>
              <p className="mt-0.5 text-xs text-foreground/50">
                {t("saveFailedDesc")}
              </p>
            </div>
          </div>
          <button
            disabled={isSaving}
            onClick={() => {
              if (isSaving) return; // Guard against double-click
              didSave.current = false;
              doSave();
            }}
            className="flex items-center justify-center gap-2 rounded-xl bg-foreground px-6 py-3.5 font-bold text-background shadow-sm transition-all hover:scale-[1.02] press-scale disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", isSaving && "animate-spin")} />
            {t("retryButton")}
          </button>
          <button
            onClick={() => router.push("/dashboard")}
            className="flex items-center justify-center gap-2 rounded-xl border-2 border-border px-6 py-3 text-sm font-medium text-foreground/60 transition-all hover:border-foreground/30"
          >
            {t("continueWithoutSaving")}
          </button>
        </div>
      )}
    </div>
  );
}
