"use client";

import { useState, useCallback } from "react";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { api } from "@/lib/trpc/react";
import { StepWelcome } from "./step-welcome";
import { StepProfile } from "./step-profile";
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

const TOTAL_STEPS = 4; // Welcome → Profile → SemesterPlanner → Ready

function getDefaultSemester(): "FALL" | "SPRING" {
  const month = new Date().getMonth(); // 0-indexed
  // Mar(2)-Jul(6) = SPRING, Aug(7)-Feb(1) = FALL
  // August is FALL because students register for the upcoming academic year
  return month >= 2 && month <= 6 ? "SPRING" : "FALL";
}

export function OnboardingWizard() {
  const t = useTranslations("onboarding");
  const [step, setStep] = useState(0);
  const [plannedSemesters, setPlannedSemesters] = useState<PlannedSemester[] | null>(null);
  const [sessionGroupSelections, setSessionGroupSelections] = useState<SessionGroupSelections>({});

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

  const goNext = useCallback(() => {
    setStep((prev) => Math.min(prev + 1, TOTAL_STEPS - 1));
  }, []);

  const goBack = useCallback(() => {
    setStep((prev) => Math.max(prev - 1, 0));
  }, []);

  // Called when SemesterPlanner finishes (user clicks "Finish planning")
  const handlePlanFinish = useCallback(
    (semesters: PlannedSemester[], selections: SessionGroupSelections) => {
      setPlannedSemesters(semesters);
      setSessionGroupSelections(selections);
      setStep(TOTAL_STEPS - 1); // Go to StepReady
    },
    []
  );

  // Progress: step 1 = 50%, step 2 = full planning (no progress bar shown)
  const showProgressBar = step === 1;
  // Profile step requires a focus area to be selected before proceeding
  const canProceed = step === 1 && data.focusArea !== null;

  return (
    <div className="bg-mesh relative mx-auto flex min-h-[80vh] w-full max-w-4xl flex-col px-4 py-8 md:px-8">
      {/* Progress bar — only on Profile step */}
      {showProgressBar && (
        <div className="animate-fade-in mb-8">
          {/* Step counter */}
          <div className="mb-2 flex items-center justify-between text-xs text-foreground/40">
            <span>
              {t("step")} 1 {t("of")} 2
            </span>
            <span>50%</span>
          </div>
          {/* Bar */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
            <div
              className="progress-gradient h-full rounded-full transition-all duration-500 ease-out"
              style={{ width: "50%" }}
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
            {step === 1 && <StepProfile data={data} onUpdate={updateData} />}
            {step === 2 && (
              <SemesterPlanner
                data={data}
                allCourses={allCourses}
                isLoadingCourses={coursesQuery.isLoading}
                onFinish={handlePlanFinish}
              />
            )}
            {step === 3 && (
              <StepReady
                data={data}
                plannedSemesters={plannedSemesters}
                allCourses={allCourses}
                sessionGroupSelections={sessionGroupSelections}
              />
            )}
          </div>
        </PlannerErrorBoundary>
      </div>

      {/* Navigation buttons — only on Profile step (step 1) */}
      {step === 1 && (
        <div className="mt-8 flex items-center justify-between">
          <button
            onClick={goBack}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm text-foreground/50 transition-all hover:bg-foreground/5 hover:text-foreground/70"
          >
            <ChevronRight className="h-4 w-4" />
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
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
