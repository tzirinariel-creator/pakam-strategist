"use client";

import { useMemo, useState, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Lightbulb, BookOpen, Lock, GripVertical } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { DISCIPLINE_CONFIG, FOCUS_DISCIPLINE_IDS, AMIRNET_CONFIG } from "@/lib/constants";
import { generateDefaultPlan, moveCourseInPlan } from "@/lib/plan-generator";
import type { PlanWarning } from "@/lib/plan-generator";
import { ThemedLoader } from "@/components/ui/themed-loader";
import type { InteractivePlan, CourseWithSchedule } from "@/lib/plan-generator";
import type { OnboardingData } from "../onboarding-wizard";
import { PlanHeader } from "./plan-header";
import { SemesterGrid } from "./semester-grid";
import { IntensityMeter } from "./intensity-meter";
import { PlanWarnings } from "./plan-warnings";
import { OnboardingCourseCardOverlay } from "./onboarding-course-card";

// Backwards-compatible alias for onboarding-wizard
export type { InteractivePlan as GeneratedPlanWithVariants } from "@/lib/plan-generator";

interface StepPlanProps {
  data: OnboardingData;
  onPlanGenerated: (plan: InteractivePlan) => void;
  generatedPlan: InteractivePlan | null;
  allCourses: CourseWithSchedule[];
  isLoadingCourses: boolean;
}

export function StepPlan({ data, onPlanGenerated, generatedPlan, allCourses, isLoadingCourses }: StepPlanProps) {
  const t = useTranslations("onboarding");
  const locale = useLocale();
  const isHe = locale === "he";

  const [activeCourse, setActiveCourse] = useState<CourseWithSchedule | null>(null);

  // DnD sensors
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 8 },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 200, tolerance: 5 },
  });
  const sensors = useSensors(pointerSensor, touchSensor);

  // Generate plan on first load
  const plan = useMemo(() => {
    if (allCourses.length === 0) return generatedPlan;
    if (generatedPlan) return generatedPlan;

    const newPlan = generateDefaultPlan(allCourses, data.year, data.focusArea);
    onPlanGenerated(newPlan);
    return newPlan;
  }, [allCourses, data.year, data.focusArea, generatedPlan, onPlanGenerated]);

  // Amiram/English course warnings
  const allWarnings = useMemo(() => {
    if (!plan) return [];
    const warnings: PlanWarning[] = [...plan.warnings];
    const score = data.amiramScore;
    if (score !== null && score !== undefined) {
      let langCourses = 0;
      if (score < AMIRNET_CONFIG.BASIC_THRESHOLD) langCourses = 4;
      else if (score < AMIRNET_CONFIG.ADVANCED_A_THRESHOLD) langCourses = 3;
      else if (score < AMIRNET_CONFIG.ADVANCED_B_THRESHOLD) langCourses = 2;
      else if (score < AMIRNET_CONFIG.EXEMPT_THRESHOLD) langCourses = 1;

      const contentCourses = AMIRNET_CONFIG.PPE_CONTENT_COURSES_REQUIRED;
      const totalEnglish = langCourses + contentCourses;

      warnings.push({
        type: "missing_requirement",
        severity: langCourses > 0 ? "warning" : "info",
        message: langCourses > 0
          ? `Amiram score ${score}: you need ${langCourses} language course${langCourses > 1 ? "s" : ""} + ${contentCourses} content courses in English (${totalEnglish} total). Add them to your plan.`
          : `Amiram score ${score}: exempt from language courses, but you still need ${contentCourses} academic content courses in English.`,
        messageHe: langCourses > 0
          ? `ציון אמיר"ם ${score}: צריך ${langCourses} קורסי שפה + ${contentCourses} קורסי תוכן באנגלית (${totalEnglish} סה״כ). הוסיפו אותם לתוכנית.`
          : `ציון אמיר"ם ${score}: פטור מקורסי שפה, אבל עדיין צריך ${contentCourses} קורסי תוכן אקדמי באנגלית.`,
      });
    }
    return warnings;
  }, [plan, data.amiramScore]);

  // DnD handlers
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const course = allCourses.find((c) => c.id === event.active.id);
      setActiveCourse(course ?? null);
    },
    [allCourses]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveCourse(null);
      if (!plan || !event.over) return;

      const courseId = String(event.active.id);
      const dropData = event.over.data.current as
        | { year: number; semester: "FALL" | "SPRING" }
        | undefined;
      if (!dropData) return;

      // Check if course is locked
      const pc = plan.courses.find((c) => c.courseId === courseId);
      if (pc?.locked) return;

      // Move course and recompute
      const updated = moveCourseInPlan(
        plan,
        courseId,
        dropData.year,
        dropData.semester,
        allCourses
      );
      onPlanGenerated(updated);
    },
    [plan, allCourses, onPlanGenerated]
  );

  const handleDragCancel = useCallback(() => {
    setActiveCourse(null);
  }, []);

  // Loading state
  if (isLoadingCourses) {
    return <ThemedLoader />;
  }

  if (!plan) {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center gap-3">
        <BookOpen className="h-10 w-10 text-foreground/30" />
        <span className="text-sm text-foreground/50">{t("noCourses")}</span>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex flex-col items-center gap-5">
        {/* Title + subtitle */}
        <div className="animate-stagger-1 text-center">
          <h2 className="font-bold text-2xl text-foreground/90">
            {t("planTitle")}
          </h2>
          <p className="mt-1 text-sm text-foreground/50">
            {t("planSubtitle")}
          </p>
          <p className="mt-2 text-xs text-foreground/40">
            {t("planDesc")}
          </p>
        </div>

        {/* Legend — color guide */}
        <div className="animate-stagger-2 w-full max-w-3xl">
          <div className="rounded-xl border border-border/40 bg-card/30 p-3">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px]">
              <span className="text-foreground/40 font-medium">{t("legendTitle")}:</span>
              {/* Mandatory */}
              <div className="flex items-center gap-1.5">
                <Lock className="h-3 w-3 text-foreground/60" />
                <span className="text-foreground/50">{t("legendMandatory")}</span>
              </div>
              {/* Elective */}
              <div className="flex items-center gap-1.5">
                <GripVertical className="h-3 w-3 text-foreground/30" />
                <span className="text-foreground/50">{t("legendElective")}</span>
              </div>
              {/* Discipline colors */}
              {FOCUS_DISCIPLINE_IDS.map((disc) => {
                const cfg = DISCIPLINE_CONFIG[disc];
                if (!cfg) return null;
                return (
                  <div key={disc} className="flex items-center gap-1.5">
                    <div
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: cfg.color }}
                    />
                    <span className="text-foreground/50">
                      {isHe ? cfg.nameHe : cfg.nameEn}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Credit progress + breakdown */}
        <div className="animate-stagger-2">
          <PlanHeader
            totalCredits={plan.totalCredits}
            creditBreakdown={plan.creditBreakdown}
            warningCount={allWarnings.filter((w) => w.severity === "error").length}
          />
        </div>

        {/* Intensity meter */}
        <div className="animate-stagger-3">
          <IntensityMeter analytics={plan.semesterAnalytics} />
        </div>

        {/* Warnings */}
        {allWarnings.length > 0 && (
          <div className="animate-stagger-3">
            <PlanWarnings warnings={allWarnings} />
          </div>
        )}

        {/* Semester grid with DnD */}
        <div className="animate-stagger-4">
          <SemesterGrid
            planned={plan.courses}
            allCourses={allCourses}
            analytics={plan.semesterAnalytics}
          />
        </div>

        {/* Fun fact */}
        <div className="animate-stagger-5 w-full max-w-3xl">
          <div className="data-card flex items-start gap-3 p-4">
            <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-foreground/80" />
            <div>
              <h4 className="text-sm font-medium text-foreground/80">
                {t("didYouKnow")}
              </h4>
              <p className="mt-1 text-sm text-foreground/60">
                {(isHe ? plan.funFacts[0] : plan.funFactsEn[0]) ?? ""}
              </p>
            </div>
          </div>
        </div>

        {/* Note */}
        <p className="animate-stagger-6 text-center text-xs text-foreground/40">
          {t("planNote")}
        </p>
      </div>

      {/* Drag overlay */}
      <DragOverlay dropAnimation={null}>
        {activeCourse && <OnboardingCourseCardOverlay course={activeCourse} />}
      </DragOverlay>
    </DndContext>
  );
}
