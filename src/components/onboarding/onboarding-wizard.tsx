"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { getPlanningAnchor } from "@/lib/academic-calendar";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import { api } from "@/lib/trpc/react";
import { StepWelcome } from "./step-welcome";
import { StepProfile } from "./step-profile";
import {
  StepHistory,
  getPastSemesters,
  buildDefaultCompleted,
  type CompletedCourse,
} from "./step-history";
import { SemesterPlanner, type PlannedSemester } from "./semester-planner/index";
import { StepReady } from "./step-ready";
import { PlannerErrorBoundary } from "./planner-error-boundary";
import type { CourseWithSchedule } from "@/lib/plan-generator";
import type { SessionGroupSelections } from "./semester-planner/live-timetable";
import { getProgramById } from "@/lib/programs/registry";

export interface OnboardingData {
  program: string | null;
  year: number;
  semester: "FALL" | "SPRING";
  focusArea: string | null;
  miluimGroup: "NONE" | "GROUP_A" | "GROUP_B" | "GROUP_C" | "GROUP_G";
  /** AMIRANT English placement score (50–150 scale). DB column stays `amiramScore`. */
  amirantScore: number | null;
  /** #23 — English level straight off the grade sheet (no number). Overrides the
   *  score when set — for a student who knows their level but not their score. */
  englishLevel: string | null;
  /**
   * Optional per-semester miluim inputs captured in step-profile (days served +
   * combat status). When set, step-ready upserts ONE MiluimSemester for the
   * student's starting {year, semester}. Absent → no per-semester row written,
   * so behavior is unchanged for users who skip miluim.
   */
  miluimDays?: number | null;
  miluimCombat?: boolean;
  /** Group C via career service (not 35+ reserve days) — drives the label. */
  miluimCareerService?: boolean;
  /** Personal address — name + gender for a personalized, gendered UI. */
  firstName?: string | null;
  lastName?: string | null;
  gender?: "male" | "female" | null;
}

// Welcome → Profile → History → SemesterPlanner → Ready
// (History is skipped for a fresh year-1-FALL student — see goNext/goBack.)
const TOTAL_STEPS = 5;
const STEP_WELCOME = 0;
const STEP_PROFILE = 1;
const STEP_HISTORY = 2;
const STEP_PLANNER = 3;
const STEP_READY = 4;

function getDefaultSemester(year: number): "FALL" | "SPRING" {
  // A first-year student's "starting now" is almost always the fall intake —
  // the standard PPE cohort begins in סמסטר א׳. (persona review #26)
  // Everyone else gets the PLANNING ANCHOR from the academic calendar — the
  // month heuristic was replaced by the verified TAU date table (#39).
  if (year <= 1) return "FALL";
  return getPlanningAnchor().semester;
}

// In-progress onboarding is persisted here so a refresh or an accidental
// back/forward never wipes a half-built plan (reported #13). Cleared by
// step-ready once the plan is saved.
const ONBOARDING_STATE_KEY = "pakamon-onboarding-state";

function loadOnboardingState(): {
  step?: number;
  data?: Partial<OnboardingData>;
  plannedSemesters?: PlannedSemester[] | null;
  sessionGroupSelections?: SessionGroupSelections;
  completedCourses?: Record<string, CompletedCourse>;
  removedCourseCodes?: string[];
} | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ONBOARDING_STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function OnboardingWizard() {
  const t = useTranslations("onboarding");
  const locale = useLocale();
  const BackChevron = locale === "he" ? ChevronRight : ChevronLeft;
  const NextChevron = locale === "he" ? ChevronLeft : ChevronRight;
  const [step, setStep] = useState(0);
  const [plannedSemesters, setPlannedSemesters] = useState<PlannedSemester[] | null>(null);
  const [sessionGroupSelections, setSessionGroupSelections] = useState<SessionGroupSelections>({});
  // Past academic record ("Your history") — keyed by courseCode.
  const [completedCourses, setCompletedCourses] = useState<Record<string, CompletedCourse>>({});
  // Whether we've seeded the history map with the default mandatory pre-fill.
  const historySeeded = useRef(false);
  // Course codes the student EXPLICITLY un-checked in the history step. The
  // reconcile effect must never re-seed one of these — otherwise a course they
  // said they didn't take reappears checked and is saved as COMPLETED (#audit-r4).
  const removedCodes = useRef<Set<string>>(new Set());

  // Wrap the history-map setter so a removal (a code that was present and is now
  // gone) is remembered, and a (re)add clears that memory.
  const handleCompletedChange = useCallback((next: Record<string, CompletedCourse>) => {
    setCompletedCourses((prev) => {
      for (const code of Object.keys(prev)) {
        if (!next[code]) removedCodes.current.add(code);
      }
      for (const code of Object.keys(next)) removedCodes.current.delete(code);
      return next;
    });
  }, []);

  // Prefetch courses immediately so they're ready by step 2. Retry on failure:
  // the whole wizard depends on this list, and a single dropped request on a
  // flaky mobile network must not leave the student with an empty catalog.
  const coursesQuery = api.course.list.useQuery(undefined, {
    retry: 2,
    staleTime: 5 * 60 * 1000, // 5 minutes — course list rarely changes
  });
  // MUST be reference-stable: the history-reconcile effect below depends on
  // `allCourses` and setStates a fresh object. A bare `?? []` mints a NEW array
  // every render while the query loads → effect re-fires → render loop until
  // React throws "Maximum update depth exceeded" (hydration burst, caught 10.7).
  const allCourses = useMemo(
    () => (coursesQuery.data ?? []) as CourseWithSchedule[],
    [coursesQuery.data],
  );

  const [data, setData] = useState<OnboardingData>({
    program: getProgramById(null).programCode, // Default program, user selects in StepWelcome
    year: 1,
    semester: getDefaultSemester(1),
    focusArea: null,
    miluimGroup: "NONE",
    amirantScore: null,
    englishLevel: null,
    miluimCareerService: false,
    firstName: null,
    lastName: null,
    gender: null,
  });

  const updateData = useCallback((updates: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...updates }));
  }, []);

  // The history step ("Your history") is shown only for students who arrive
  // mid-degree — i.e. they have at least one past semester. A fresh
  // year-1-FALL student has none, so the step is skipped entirely.
  const hasHistory = useMemo(
    () => getPastSemesters(data.year, data.semester).length > 0,
    [data.year, data.semester]
  );

  // Resolve the history step's completed courses (keyed by code) to catalog
  // ids, so the planner can exclude already-done courses from its pool and
  // count their credits toward the running degree total (fixes #18: a mid-degree
  // student's completed history was invisible inside the planner).
  const completedCourseIdList = useMemo(() => {
    const idByCode = new Map(allCourses.map((c) => [c.code, c.id]));
    return Object.values(completedCourses)
      .map((cc) => idByCode.get(cc.courseCode))
      .filter((id): id is string => Boolean(id));
  }, [allCourses, completedCourses]);

  // Seed the history map with the default mandatory pre-fill the first time
  // the student reaches the history step (year/semester are now final).
  const seedHistory = useCallback(() => {
    if (historySeeded.current) return;
    historySeeded.current = true;
    setCompletedCourses(
      buildDefaultCompleted(allCourses, data.year, data.semester)
    );
  }, [allCourses, data.year, data.semester]);

  // ── Persist in-progress onboarding (fixes #13) ──────────────────────────
  // Two-pass: restore once after mount (avoids any SSR hydration mismatch),
  // then persist on every change. The `hydrated` gate prevents the first
  // persist from overwriting saved state with defaults before restore applies.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const s = loadOnboardingState();
    if (s) {
      if (typeof s.step === "number") setStep(s.step);
      if (s.data) setData((d) => ({ ...d, ...s.data }));
      if (s.plannedSemesters) setPlannedSemesters(s.plannedSemesters);
      if (s.sessionGroupSelections) setSessionGroupSelections(s.sessionGroupSelections);
      if (s.completedCourses) {
        setCompletedCourses(s.completedCourses);
        if (Object.keys(s.completedCourses).length > 0) historySeeded.current = true;
      }
      if (s.removedCourseCodes) removedCodes.current = new Set(s.removedCourseCodes);
    }
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(
        ONBOARDING_STATE_KEY,
        JSON.stringify({ step, data, plannedSemesters, sessionGroupSelections, completedCourses, removedCourseCodes: [...removedCodes.current] })
      );
    } catch {
      /* storage full / disabled — non-fatal */
    }
  }, [hydrated, step, data, plannedSemesters, sessionGroupSelections, completedCourses]);

  // Keep the pre-filled history IN SYNC with the year/semester anchor. Whenever
  // it changes, drop any completed course that's no longer in a past semester (a
  // student who lowers to year-1-FALL keeps NONE — so a fresh student is never
  // silently recorded as having completed courses), and pre-fill any newly-past
  // mandatory — WITHOUT clobbering grades/edits the student already entered
  // (fixes the stale-map + one-shot-seed bugs, #audit-r3).
  useEffect(() => {
    if (!hydrated) return;
    const past = getPastSemesters(data.year, data.semester);
    const pastKeys = new Set(past.map((s) => `${s.year}-${s.semester}`));
    setCompletedCourses((prev) => {
      const kept: typeof prev = {};
      for (const [code, cc] of Object.entries(prev)) {
        if (pastKeys.has(`${cc.plannedYear}-${cc.plannedSemester}`)) kept[code] = cc;
      }
      const seed = buildDefaultCompleted(allCourses, data.year, data.semester);
      for (const [code, cc] of Object.entries(seed)) {
        // Never re-seed a course the student explicitly un-checked (#audit-r4).
        if (!kept[code] && !removedCodes.current.has(code)) kept[code] = cc;
      }
      return kept;
    });
    historySeeded.current = pastKeys.size > 0;
  }, [hydrated, data.year, data.semester, allCourses]);

  const goNext = useCallback(() => {
    setStep((prev) => {
      // From Profile: go to History if the student has one, else skip to Planner.
      if (prev === STEP_PROFILE) {
        if (hasHistory) {
          seedHistory();
          return STEP_HISTORY;
        }
        return STEP_PLANNER;
      }
      return Math.min(prev + 1, TOTAL_STEPS - 1);
    });
  }, [hasHistory, seedHistory]);

  const goBack = useCallback(() => {
    setStep((prev) => {
      // From Planner: go back to History if it exists, else to Profile.
      if (prev === STEP_PLANNER) {
        return hasHistory ? STEP_HISTORY : STEP_PROFILE;
      }
      return Math.max(prev - 1, 0);
    });
  }, [hasHistory]);

  // Called when SemesterPlanner finishes (user clicks "Finish planning")
  const handlePlanFinish = useCallback(
    (semesters: PlannedSemester[], selections: SessionGroupSelections) => {
      setPlannedSemesters(semesters);
      setSessionGroupSelections(selections);
      setStep(STEP_READY); // Go to StepReady
    },
    []
  );

  // Progress bar shows on the Profile step. Total user-facing steps depends on
  // whether the history step is present.
  const showProgressBar = step === STEP_PROFILE;
  const profileTotalSteps = hasHistory ? 3 : 2;
  // Profile step has sensible defaults (year/semester) and focus area is
  // genuinely optional — "undecided" (null) is a valid choice the hint
  // actively recommends — so never gate Next on it.
  const canProceed = step === STEP_PROFILE;

  return (
    <div className="bg-mesh -m-2 min-h-full w-auto sm:-m-4 md:-m-6">
    <div className="relative mx-auto flex min-h-[80vh] w-full max-w-4xl flex-col px-4 py-8 md:px-8">
      {/* Progress bar — only on Profile step */}
      {showProgressBar && (
        <div className="animate-fade-in mb-8">
          {/* Step counter */}
          <div className="mb-2 flex items-center justify-between text-xs text-foreground/40">
            <span className="tabular">
              {t("step")} 1 {t("of")} {profileTotalSteps}
            </span>
            <span className="tabular">{Math.round((1 / profileTotalSteps) * 100)}%</span>
          </div>
          {/* Bar */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
            <div
              className="progress-gradient h-full rounded-full transition-all duration-500 ease-out"
              style={{ width: `${(1 / profileTotalSteps) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Step content */}
      <div className="flex-1">
        <PlannerErrorBoundary>
          <div key={step} className="animate-fade-in">
            {step === 0 && (
              <StepWelcome
                onNext={goNext}
                selectedProgram={data.program}
                onProgramSelect={(code) => updateData({ program: code })}
              />
            )}
            {step === STEP_PROFILE && <StepProfile data={data} onUpdate={updateData} />}
            {/* Q11(א): the history + planner steps are unusable without the
                catalog. When course.list failed (after its retries), say so
                honestly and offer a retry — never a silent empty screen. */}
            {(step === STEP_HISTORY || step === STEP_PLANNER) && coursesQuery.isError ? (
              <div className="mx-auto flex max-w-sm flex-col items-center gap-4 py-16 text-center">
                <p className="text-sm font-semibold text-foreground/80">
                  {locale === "he" ? "לא הצלחנו לטעון את קטלוג הקורסים" : "We couldn't load the course catalog"}
                </p>
                <p className="text-xs text-foreground/50">
                  {locale === "he"
                    ? "בלי הקטלוג אי אפשר לבנות את התוכנית. בדקו את החיבור ונסו שוב."
                    : "The plan can't be built without the catalog. Check your connection and try again."}
                </p>
                <button
                  type="button"
                  onClick={() => void coursesQuery.refetch()}
                  className="rounded-xl bg-foreground px-6 py-2.5 text-sm font-bold text-background transition-transform hover:scale-[1.02]"
                >
                  {locale === "he" ? "נסו שוב" : "Try again"}
                </button>
              </div>
            ) : (
              <>
                {step === STEP_HISTORY && (
                  <StepHistory
                    data={data}
                    allCourses={allCourses}
                    isLoadingCourses={coursesQuery.isLoading}
                    value={completedCourses}
                    onChange={handleCompletedChange}
                    onNext={goNext}
                    onBack={goBack}
                  />
                )}
                {step === STEP_PLANNER && (
                  <SemesterPlanner
                    data={data}
                    allCourses={allCourses}
                    isLoadingCourses={coursesQuery.isLoading}
                    onFinish={handlePlanFinish}
                    externalCompletedCourseIds={completedCourseIdList}
                  />
                )}
              </>
            )}
            {step === STEP_READY && (
              <StepReady
                data={data}
                plannedSemesters={plannedSemesters}
                completedCourses={Object.values(completedCourses)}
                allCourses={allCourses}
                sessionGroupSelections={sessionGroupSelections}
              />
            )}
          </div>
        </PlannerErrorBoundary>
      </div>

      {/* Navigation buttons — only on Profile step (History/Planner/Ready
          render their own controls). */}
      {step === STEP_PROFILE && (
        <div className="mt-8 flex items-center justify-between">
          <button
            onClick={goBack}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm text-foreground/50 transition-all hover:bg-foreground/5 hover:text-foreground/70"
          >
            <BackChevron className="h-4 w-4" />
            {t("back")}
          </button>

          <button
            onClick={goNext}
            disabled={!canProceed}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-6 py-2.5 text-sm font-medium shadow-sm transition-all",
              canProceed
                ? "bg-foreground text-background hover:scale-[1.02] press-scale"
                : "bg-foreground/30 text-background/50 cursor-not-allowed"
            )}
          >
            {t("next")}
            <NextChevron className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
    </div>
  );
}
