"use client";

import { useState, useCallback, useRef, useMemo } from "react";
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
  amiramScore: number | null;
}

// Welcome → Profile → History → SemesterPlanner → Ready
// (History is skipped for a fresh year-1-FALL student — see goNext/goBack.)
const TOTAL_STEPS = 5;
const STEP_WELCOME = 0;
const STEP_PROFILE = 1;
const STEP_HISTORY = 2;
const STEP_PLANNER = 3;
const STEP_READY = 4;

function getDefaultSemester(): "FALL" | "SPRING" {
  const month = new Date().getMonth(); // 0-indexed
  // Mar(2)-Jul(6) = SPRING, Aug(7)-Feb(1) = FALL
  // August is FALL because students register for the upcoming academic year
  return month >= 2 && month <= 6 ? "SPRING" : "FALL";
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

  // Prefetch courses immediately so they're ready by step 2
  const coursesQuery = api.course.list.useQuery(undefined, {
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes — course list rarely changes
  });
  const allCourses = (coursesQuery.data ?? []) as CourseWithSchedule[];

  const [data, setData] = useState<OnboardingData>({
    program: getProgramById(null).programCode, // Default program, user selects in StepWelcome
    year: 1,
    semester: getDefaultSemester(),
    focusArea: null,
    miluimGroup: "NONE",
    amiramScore: null,
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

  // Seed the history map with the default mandatory pre-fill the first time
  // the student reaches the history step (year/semester are now final).
  const seedHistory = useCallback(() => {
    if (historySeeded.current) return;
    historySeeded.current = true;
    setCompletedCourses(
      buildDefaultCompleted(allCourses, data.year, data.semester)
    );
  }, [allCourses, data.year, data.semester]);

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
    <div className="bg-mesh relative mx-auto flex min-h-[80vh] w-full max-w-4xl flex-col px-4 py-8 md:px-8">
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
            {step === STEP_HISTORY && (
              <StepHistory
                data={data}
                allCourses={allCourses}
                isLoadingCourses={coursesQuery.isLoading}
                value={completedCourses}
                onChange={setCompletedCourses}
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
              />
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
  );
}
