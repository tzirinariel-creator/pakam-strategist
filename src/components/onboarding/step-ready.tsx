"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { PartyPopper, Calendar, BookOpen, Check, GraduationCap, RefreshCw, AlertTriangle, Download, CalendarDays } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { api } from "@/lib/trpc/react";
import { downloadICSFromSessions } from "@/lib/ics-export";
import { useRouter } from "@/i18n/navigation";
import { DISCIPLINE_CONFIG, FOCUS_DISCIPLINE_IDS, SEMESTER_CONFIG, YEAR_CONFIG } from "@/lib/constants";
import { getCurrentAcademicYear } from "@/lib/miluim";
import type { OnboardingData } from "./onboarding-wizard";
import type { PlannedSemester } from "./semester-planner/index";
import type { CompletedCourse } from "./step-history";
import type { CourseWithSchedule } from "@/lib/plan-generator";
import type { SessionGroupSelections } from "./semester-planner/live-timetable";
import { PersonaPicker } from "@/components/persona/persona-picker";
import { PhilosopherKingCharacter } from "@/components/ui/philosopher-king-character";

interface StepReadyProps {
  data: OnboardingData;
  plannedSemesters: PlannedSemester[] | null;
  /** Past academic record captured in the history step. */
  completedCourses?: CompletedCourse[];
  allCourses: CourseWithSchedule[];
  sessionGroupSelections?: SessionGroupSelections;
}

export function StepReady({ data, plannedSemesters, completedCourses, allCourses, sessionGroupSelections }: StepReadyProps) {
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
  const saveCompletedMutation = api.plan.saveCompletedCourses.useMutation();
  const addScannedMutation = api.plan.addScannedCourse.useMutation();
  const upsertMiluimSemester = api.user.upsertMiluimSemester.useMutation();
  const utils = api.useUtils();

  // Build the flat course list from planned semesters
  const courseMap = new Map(allCourses.map((c) => [c.id, c]));
  // Codes already captured as completed in the history step — these are saved
  // separately as COMPLETED, so exclude them from the planned payload to avoid
  // a duplicate UserCourse for the same course.
  const completedCodes = new Set((completedCourses ?? []).map((c) => c.courseCode));
  // A client-only "custom course" carries a fake courseId (e.g. `custom-<uuid>`)
  // that is NOT a real catalog UUID, so it isn't in courseMap. savePlan validates
  // every courseId with z.string().uuid() and rejects the WHOLE save if any is
  // invalid — so we MUST drop non-catalog ids here. (Persisting custom courses is
  // a deferred feature; we just toast the student that it wasn't saved.)
  let droppedCustomCourse = false;
  const flattenedCourses = (plannedSemesters ?? []).flatMap((sem) =>
    sem.courseIds.flatMap((courseId) => {
      if (!courseMap.has(courseId)) {
        droppedCustomCourse = true;
        return [];
      }
      const courseCode = courseMap.get(courseId)?.code;
      if (courseCode && completedCodes.has(courseCode)) return [];
      const groups = courseCode ? sessionGroupSelections?.[courseCode] : undefined;
      return [
        {
          courseId,
          plannedYear: sem.year,
          plannedSemester: sem.semester as "FALL" | "SPRING",
          ...(groups && Object.keys(groups).length > 0 ? { selectedGroups: groups } : {}),
        },
      ];
    })
  );
  const totalCourseCount = flattenedCourses.length;
  const totalCredits = flattenedCourses.reduce(
    (sum, c) => sum + (courseMap.get(c.courseId)?.credits ?? 0),
    0
  );
  // The save callback is a STABLE useCallback, so it would otherwise freeze
  // render-1's flattenedCourses — which is EMPTY until the course catalog loads
  // (courseMap empty → every planned id dropped). Read the payload through this
  // ref so the save always sends the CURRENT courses, never the empty first one
  // (the plan-not-saved bug, QA 13.7).
  const flattenedRef = useRef(flattenedCourses);
  flattenedRef.current = flattenedCourses;
  // How many courses the student actually planned (before catalog mapping) — used
  // to tell "nothing planned" (legit) apart from "catalog not loaded yet" (wait).
  const plannedCourseCount = (plannedSemesters ?? []).reduce((n, s) => n + s.courseIds.length, 0);

  // Credits the student already COMPLETED (the history step). Surfaced in the
  // summary next to the planned total so a mid-degree student sees their REAL
  // standing toward the degree — not just the single planned semester, which
  // read as "only 21 ש״ס appeared / my history didn't reflect" (#18).
  const creditsByCode = new Map(allCourses.map((c) => [c.code, c.credits]));
  const completedCount = completedCourses?.length ?? 0;
  const completedCredits = (completedCourses ?? []).reduce(
    // A CUSTOM completed course (דוגרי #10, code "CUSTOM-…") isn't in the PPE
    // catalog, so fall back to its own credits — the SAME value addScannedCourse
    // persists (c.credits ?? 2). Without this the summary undercounted vs the
    // dashboard one screen later (QA 13.7).
    (sum, c) => sum + (creditsByCode.get(c.courseCode) ?? c.credits ?? 2),
    0
  );
  const combinedCredits = totalCredits + completedCredits;

  // ─── Calendar sync (final onboarding step) ───────────────────────────
  // Mirrors calendar-content.tsx: pull the saved schedule for the student's
  // starting semester, then offer Google sync / .ics download once saved.
  const tCal = useTranslations("calendar");
  // SUMMER has no teaching .ics range; the saved plan only ever uses FALL/SPRING.
  const syncSemester: "FALL" | "SPRING" = data.semester === "SPRING" ? "SPRING" : "FALL";
  const scheduleQuery = api.schedule.getScheduleForSemester.useQuery(
    { year: data.year, semester: syncSemester },
    { enabled: hasSaved },
  );
  const googleStatus = api.schedule.getGoogleStatus.useQuery(undefined, { enabled: hasSaved });
  const syncToGoogle = api.schedule.syncToGoogle.useMutation({
    onSuccess: () => toast.success(tCal("syncSuccess")),
    onError: () => toast.error(tCal("syncFailed")),
  });

  const scheduleSessions = scheduleQuery.data?.sessions ?? [];
  const hasSchedule = scheduleSessions.length > 0;
  const googleConfigured = googleStatus.data?.configured ?? false;
  const googleConnected = googleStatus.data?.connected ?? false;

  const handleSyncGoogle = useCallback(() => {
    if (googleConnected) {
      syncToGoogle.mutate({ year: data.year, semester: syncSemester });
    } else if (typeof window !== "undefined") {
      // Not yet connected — kick off the OAuth connect flow (same as settings/banner).
      window.location.href = "/api/google/auth";
    }
  }, [googleConnected, syncToGoogle, data.year, syncSemester]);

  const handleDownloadICS = useCallback(() => {
    if (!hasSchedule) {
      toast.error(tCal("exportEmpty"));
      return;
    }
    downloadICSFromSessions(scheduleSessions, syncSemester);
    toast.success(tCal("exportSuccess"));
  }, [hasSchedule, scheduleSessions, syncSemester, tCal]);

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
    // Never persist an EMPTY plan when the student actually planned courses — it
    // means the catalog hasn't mapped yet (courseMap empty). Surface the retry
    // state instead of silently saving nothing over the real plan (QA 13.7).
    // plannedCourseCount is stable (from plannedSemesters, ready at mount);
    // flattenedRef is live.
    if (plannedCourseCount > 0 && flattenedRef.current.length === 0) {
      didSave.current = false; // let the auto-save effect fire again once courses load
      setSaveError(true);
      setIsSaving(false);
      return;
    }
    setIsSaving(true);
    setSaveError(false);
    setSaveStage(0);
    try {
      // 1. Update user profile (including miluim + AMIRANT) — 15s timeout.
      //    The DB column is still `amiramScore` (schema unchanged); the
      //    onboarding field was renamed to `amirantScore` for correctness.
      // #17 (12.7) — profile + miluim are independent writes: run them in
      // PARALLEL (they used to run back-to-back and doubled the wait).
      await Promise.all([
        withTimeout(
        updateProfile.mutateAsync({
          currentYear: data.year,
          currentSemester: data.semester,
          // Always send focusArea (null = "undecided"), so the chosen value is
          // written in the SAME call as year/semester. The old conditional
          // spread omitted the key when undecided, which (a) could never clear a
          // stale focus and (b) was the focus-desync in #22.
          focusArea: data.focusArea ?? null,
          miluimGroup: data.miluimGroup,
          miluimCareerService: data.miluimCareerService ?? false,
          amiramScore: data.amirantScore,
          // #23 — the directly-declared level (grade sheet), overrides the score.
          englishLevel: (data.englishLevel as "EXEMPT" | "ADVANCED_B" | "ADVANCED_A" | "BASIC" | "PRE_BASIC" | null) ?? null,
          // Personal address — name + gender for a personalized, gendered UI.
          firstName: data.firstName ?? null,
          lastName: data.lastName ?? null,
          gender: data.gender ?? null,
        }),
        15000,
      ),
        ...(data.miluimDays != null && data.miluimDays > 0
          ? [
              withTimeout(
                upsertMiluimSemester.mutateAsync({
            academicYear: getCurrentAcademicYear(),
            semester: data.semester,
            daysServed: data.miluimDays,
            isCombat: data.miluimCombat ?? false,
          }),
                15000,
              ),
            ]
          : []),
      ]);

      // 1b. If the student entered miluim days this semester, persist ONE
      //     MiluimSemester for their starting {academicYear, semester}. The
      //     server derives the group from days+combat. Skipped entirely when no
      //     days were entered, so non-serving students write no per-semester row.


      setSaveStage(1);
      // 2. Bulk save all planned courses in a single request — 20s timeout.
      //    NOTE: savePlan replaces all UserCourses, so it MUST run before the
      //    completed-history save below (which upserts COMPLETED courses on top).
      await withTimeout(
        savePlanMutation.mutateAsync({
          courses: flattenedRef.current,
        }),
        20000,
      );

      setSaveStage(2);
      // 2b. Save the past academic record as COMPLETED courses (with grades).
      //     Runs after savePlan so it isn't wiped by savePlan's delete-replace.
      //     Catalog courses go through saveCompletedCourses; CUSTOM courses (a
      //     real elective outside the PPE list, like דוגרי — 18:19 #10) go
      //     through addScannedCourse, which CREATES the Course row first.
      const catalogCompleted = (completedCourses ?? []).filter((c) => !c.customName);
      const customCompleted = (completedCourses ?? []).filter((c) => c.customName);
      const completedPayload = catalogCompleted.map((c) => ({
        courseCode: c.courseCode,
        plannedYear: c.plannedYear,
        plannedSemester: c.plannedSemester,
        grade: c.grade,
      }));
      if (completedPayload.length > 0) {
        await withTimeout(
          saveCompletedMutation.mutateAsync({ courses: completedPayload }),
          20000,
        );
      }
      // Custom courses — one addScannedCourse each (idempotent upsert).
      for (const c of customCompleted) {
        try {
          await withTimeout(
            addScannedMutation.mutateAsync({
              courseCode: c.courseCode.startsWith("CUSTOM-") ? null : c.courseCode,
              courseName: c.customName!,
              credits: c.credits ?? 2,
              grade: c.grade,
              plannedYear: c.plannedYear,
              plannedSemester: c.plannedSemester,
            }),
            15000,
          );
        } catch {
          /* one custom course failing must not abort the whole save */
        }
      }

      setSaveStage(3);
      // 3. Invalidate the NON-gating caches only. Do NOT touch getUserPlan here:
      // DashboardContent gates the whole onboarding wizard — including THIS finale
      // — on getUserPlan's result (hasPlanData). Invalidating/refetching it mid-
      // finale flips hasPlanData→true and unmounts the wizard (and the just-painted
      // celebration) within ~1s — exactly the "finale flashed by / passed in a
      // second" bug (QA 13.7). The finale's CTA navigates to
      // /dashboard?from=onboarding, where PostOnboardingTransition refetches the
      // plan deliberately, so it still loads — just not while the user is reading
      // the celebration.
      utils.plan.getCredits.invalidate();
      utils.plan.getGraduationScore.invalidate();
      utils.user.getProfile.invalidate();

      setHasSaved(true);

      // Signal to dashboard that onboarding data was saved successfully.
      // This survives page navigation / React Query cache isolation.
      if (typeof window !== "undefined") {
        localStorage.setItem("pakamon-onboarding-complete", Date.now().toString());
        // A brand-new student who just onboarded should ALWAYS get the full fresh
        // experience. Clear EVERY stale "already seen / dismissed" flag left over
        // from an earlier run — the test-user reset wipes the DB but NOT the
        // browser, so a "fresh" account was silently suppressing the King intro,
        // the welcome card, the tour and the nudges (QA 13.7 — "still never met
        // the King"). Also drops the in-progress onboarding snapshot (#13).
        for (const k of [
          "pakamon-tour-done",
          "pakamon-onboarding-state",
          "pakamon-welcome-dismissed",
          "pakamon-guide-nudge-done",
          "pakamon-google-banner-dismissed",
          "pk-met-king-card",
        ]) {
          localStorage.removeItem(k);
        }
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

  // Auto-save — but ONLY once the course catalog has actually loaded, so the
  // payload is never empty. If allCourses hasn't arrived (courseMap empty → every
  // planned id dropped) or the planned courses haven't mapped yet, this effect
  // just re-runs when they do (deps on allCourses/flattenedCourses length) instead
  // of persisting an empty plan that silently wipes the plan and shows the
  // celebration over an empty dashboard (QA 13.7 — the plan-not-saved bug).
  useEffect(() => {
    if (didSave.current) return;
    if (!plannedSemesters || plannedSemesters.length === 0) return;
    if (allCourses.length === 0) return; // catalog not loaded → would drop every course
    if (plannedCourseCount > 0 && flattenedCourses.length === 0) return; // planned but nothing mapped yet → wait
    didSave.current = true;
    doSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCourses.length, flattenedCourses.length, plannedCourseCount]);

  // Once the save succeeds, gently tell the student if a manually-added custom
  // course was left out (it carries no real catalog id, so it can't be saved
  // yet — and we filtered it out above so it never breaks the whole save).
  const didToastCustom = useRef(false);
  useEffect(() => {
    if (hasSaved && droppedCustomCourse && !didToastCustom.current) {
      didToastCustom.current = true;
      toast(t("customCourseNotSaved"));
    }
  }, [hasSaved, droppedCustomCourse, t]);

  // Focus area display
  const focusDisplay = data.focusArea
    ? DISCIPLINE_CONFIG[data.focusArea]
    : null;

  // Show "continue anyway" after 6 seconds of saving
  const [savingTooLong, setSavingTooLong] = useState(false);
  // #8 (12.7) — staged progress: the overlay text moves as the save advances,
  // so a slow prod-DB save reads as "working", never "stuck".
  const [saveStage, setSaveStage] = useState(0);
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
        <div className="relative size-24">
          <div className="absolute -inset-2 animate-spin rounded-full border-[3px] border-accent-brand/15 border-t-accent-brand [animation-duration:1100ms]" />
          <div className="absolute inset-0 flex items-center justify-center pk-float">
            <PhilosopherKingCharacter className="size-24" />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium text-foreground/70 animate-pulse">
            {saveStage === 0
              ? (isHe ? "שומרים את הפרופיל שלכם…" : "Saving your profile…")
              : saveStage === 1
                ? t("savingCoursesCount", { count: totalCourseCount })
                : saveStage === 2
                  ? (isHe ? "רושמים את הקורסים שכבר עברתם…" : "Recording your completed courses…")
                  : (isHe ? "רגע אחרון — מסדרים הכול…" : "One moment — wrapping up…")}
          </p>
          <p className="text-xs text-foreground/40">
            {savingTooLong
              ? (isHe ? "לוקח קצת יותר מהרגיל — אנחנו עדיין כאן, שומרים." : "Taking a bit longer than usual — still saving.")
              : t("allDoneSavingDesc")}
          </p>
        </div>
        {savingTooLong && (
          <button
            type="button"
            onClick={() => {
              // Leave WITHOUT marking the save complete (a failed save can
              // re-run onboarding) — but DO tell the dashboard we came from
              // onboarding, so the welcome tour still fires (#18: a slow save
              // + this escape used to silently kill the tour).
              setIsSaving(false);
              router.push("/dashboard?from=onboarding");
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

      <h2 className="animate-stagger-1 font-display text-foreground text-3xl font-bold">
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
                  <span className="font-mono tabular text-lg font-bold text-foreground/80">
                    {totalCourseCount}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground/50">
                    {totalCredits > 0 && completedCount > 0
                      ? isHe ? "ש״ס בתכנון" : "Planned credits"
                      : t("totalCreditsLabel")}
                  </span>
                  <span className="font-mono tabular text-lg font-bold text-foreground/80">
                    {totalCredits}
                  </span>
                </div>

                {/* Completed history + combined total — only for a mid-degree
                    student who recorded past courses. This is the fix for #18:
                    the previous summary showed ONLY the planned semester. */}
                {completedCount > 0 && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-foreground/50">
                        {isHe ? "ש״ס שכבר השלמת" : "Credits already completed"}
                      </span>
                      <span className="font-mono tabular text-lg font-bold text-emerald-500">
                        {completedCredits}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-t border-border pt-2">
                      <span className="text-sm font-medium text-foreground/70">
                        {isHe ? "סה״כ לתואר עד כה" : "Toward your degree so far"}
                      </span>
                      <span className="font-mono tabular text-xl font-bold text-foreground/90">
                        {combinedCredits}
                      </span>
                    </div>
                  </>
                )}
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

      {/* Calendar sync — explicit, guided final step */}
      {hasSaved && (
        <div className="animate-stagger-4 mt-8 w-full max-w-sm">
          <div className="data-card space-y-4 p-6 text-start">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-foreground/70" />
              <h3 className="text-sm font-semibold text-foreground/80">
                {t("syncCalendarTitle")}
              </h3>
            </div>

            {!hasSchedule ? (
              // Empty guard — saved plan has no schedule sessions.
              <p className="text-sm text-foreground/50">
                {t("syncCalendarEmpty")}
              </p>
            ) : (
              <>
                <p className="text-xs text-foreground/45">
                  {t("syncCalendarDesc")}
                </p>
                <div className="flex flex-col gap-2.5">
                  {/* Google — hidden entirely when OAuth isn't configured server-side */}
                  {googleConfigured && (
                    <button
                      onClick={handleSyncGoogle}
                      disabled={syncToGoogle.isPending}
                      className="flex items-center justify-center gap-2 rounded-xl border-2 border-border px-6 py-3 text-sm font-medium text-foreground/80 transition-all hover:border-foreground/30 hover:text-foreground disabled:opacity-50"
                    >
                      <RefreshCw className={cn("h-4 w-4", syncToGoogle.isPending && "animate-spin")} />
                      {t("syncCalendarGoogle")}
                    </button>
                  )}

                  <button
                    onClick={handleDownloadICS}
                    className="flex items-center justify-center gap-2 rounded-xl border-2 border-border px-6 py-3 text-sm font-medium text-foreground/80 transition-all hover:border-foreground/30 hover:text-foreground"
                  >
                    <Download className="h-4 w-4" />
                    {t("syncCalendarICS")}
                  </button>

                  {/* Always clarify the .ics needs importing; the only-option when Google is off. */}
                  <p className="text-[11px] text-foreground/35">
                    {t("syncCalendarICSHint")}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Q5 (notes 17/48) — pick your advisor's voice as the finale's last
          touch. Shared PersonaPicker (same pk-persona the FAB reads); default
          stays the King, so skipping is a valid choice. */}
      {hasSaved && (
        <div className="animate-stagger-4 mt-4 w-full max-w-sm">
          <div className="data-card space-y-3 p-6 text-start">
            <h3 className="text-sm font-semibold text-foreground/80">
              {isHe ? "מי ילווה אתכם בתואר?" : "Who will walk the degree with you?"}
            </h3>
            <p className="text-xs text-foreground/45">
              {isHe
                ? "המלך הפילוסוף — הרעיון של אפלטון: להוביל לפי ידע. חזון ואסטרטגיה בגובה העיניים. הרפרנט — ענייני, פורמלי וקצר. שניהם עונים מאותם נתונים; אפשר להחליף בכל רגע בהגדרות."
                : "The Philosopher King — Plato's idea of leading by knowledge: vision and strategy at eye level. The Referent — matter-of-fact and short. Both answer from the same data; switch anytime in settings."}
            </p>
            <PersonaPicker compact />
          </div>
        </div>
      )}

      {/* CTA buttons — only show after save completes */}
      {hasSaved && (
        <div className="animate-stagger-4 mt-4 flex w-full max-w-sm flex-col gap-3">
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
