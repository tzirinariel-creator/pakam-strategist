"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/trpc/react";
import { ThemedLoader } from "@/components/ui/themed-loader";
import { SemesterPlanner, type PlannedSemester } from "@/components/onboarding/semester-planner/index";
import { useRouter } from "@/i18n/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { CourseWithSchedule } from "@/lib/plan-generator";
import { getProgramById } from "@/lib/programs/registry";
import type { OnboardingData } from "@/components/onboarding/onboarding-wizard";
import type { SessionGroupSelections } from "@/components/onboarding/semester-planner/live-timetable";

export function SemesterPlannerPage() {
  const t = useTranslations("planner");
  const router = useRouter();
  const utils = api.useUtils();

  // Has the student changed anything that isn't saved yet? Set by the planner on
  // the first edit; cleared on a successful save. Drives the exit guard so the
  // ambiguous back-arrow can't silently throw away an edited plan (#18).
  const [dirty, setDirty] = useState(false);
  // The unsaved-changes confirm dialog (shown when leaving with edits).
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  // Leave for /planner. Guards against silent data-loss: if there are unsaved
  // edits, ask first instead of just discarding them.
  const handleExit = () => {
    if (dirty) {
      setShowLeaveConfirm(true);
      return;
    }
    router.push("/planner");
  };

  // Load profile data
  const profileQuery = api.user.getProfile.useQuery();
  // Load all courses
  const coursesQuery = api.course.list.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });
  // Load the EXISTING plan and re-hydrate the planner from it, so a save
  // preserves the semesters the student isn't editing. COMPLETED history is now
  // protected at the source: savePlan only deletes PLANNED/IN_PROGRESS rows, so
  // earned credits/grades are never touched by a plan edit — no fragile re-write.
  const planQuery = api.plan.getUserPlan.useQuery();
  const savePlan = api.plan.savePlan.useMutation();

  const isLoading =
    profileQuery.isLoading || coursesQuery.isLoading || planQuery.isLoading;

  const userCourses = planQuery.data?.courses ?? [];

  // Split the saved plan: COMPLETED history (preserved as-is, never edited here)
  // vs everything else (PLANNED/IN_PROGRESS — restored into the editable board).
  const completedUserCourses = userCourses.filter((uc) => uc.status === "COMPLETED");
  const plannedUserCourses = userCourses.filter((uc) => uc.status !== "COMPLETED");

  // Restore the editable plan, grouped by year+semester (FALL/SPRING only — the
  // planner board has no SUMMER lane).
  const initialPlannedSemesters: PlannedSemester[] = (() => {
    const map = new Map<string, PlannedSemester>();
    for (const uc of plannedUserCourses) {
      if (uc.plannedSemester !== "FALL" && uc.plannedSemester !== "SPRING") continue;
      const key = `${uc.plannedYear}-${uc.plannedSemester}`;
      const existing = map.get(key);
      if (existing) existing.courseIds.push(uc.courseId);
      else
        map.set(key, {
          year: uc.plannedYear,
          semester: uc.plannedSemester,
          courseIds: [uc.courseId],
        });
    }
    return Array.from(map.values());
  })();

  // Course ids already COMPLETED — excluded from the editable pool and counted
  // toward the running total inside the planner.
  const externalCompletedCourseIds = completedUserCourses.map((uc) => uc.courseId);

  // Restore prior per-course session-group choices so re-saving doesn't drop them.
  const initialSessionGroupSelections: SessionGroupSelections = {};
  for (const uc of plannedUserCourses) {
    if (uc.selectedGroups && typeof uc.selectedGroups === "object") {
      initialSessionGroupSelections[uc.course.code] = uc.selectedGroups as Record<
        string,
        string
      >;
    }
  }

  if (isLoading) {
    return <ThemedLoader />;
  }

  const profile = profileQuery.data;
  const allCourses = (coursesQuery.data ?? []) as CourseWithSchedule[];

  // Build OnboardingData from profile
  const data: OnboardingData = {
    program: getProgramById(profile?.programId).programCode,
    year: profile?.currentYear ?? 1,
    semester: (profile?.currentSemester as "FALL" | "SPRING") ?? "FALL",
    focusArea: (profile?.focusArea as OnboardingData["focusArea"]) ?? null,
    miluimGroup: (profile as Record<string, unknown>)?.miluimGroup as OnboardingData["miluimGroup"] ?? "NONE",
    // DB column is still `amiramScore`; map it onto the renamed onboarding field.
    amirantScore: (profile as Record<string, unknown>)?.amiramScore as number | null ?? null,
  };

  const handleFinish = async (plannedSemesters: PlannedSemester[], sessionGroupSelections: SessionGroupSelections) => {
    // Build courseId → code map for looking up session group selections
    const courseCodeById = new Map(allCourses.map((c) => [c.id, c.code]));

    // Convert to the format savePlan expects, including selectedGroups
    const courses = plannedSemesters.flatMap((sem) =>
      sem.courseIds.map((courseId) => {
        const code = courseCodeById.get(courseId);
        const groups = code ? sessionGroupSelections[code] : undefined;
        return {
          courseId,
          plannedYear: sem.year,
          plannedSemester: sem.semester,
          ...(groups && Object.keys(groups).length > 0 ? { selectedGroups: groups } : {}),
        };
      })
    );

    try {
      // savePlan now replaces only PLANNED/IN_PROGRESS rows; COMPLETED history
      // (with its grades, isBinary, disciplineOverride…) is left untouched, so
      // no re-write is needed and nothing can be lost or stripped on a plan edit.
      await savePlan.mutateAsync({ courses });

      // Invalidate all plan-related caches so other screens see the updated data
      await Promise.all([
        utils.plan.getUserPlan.invalidate(),
        utils.plan.getCredits.invalidate(),
        utils.plan.getGraduationScore.invalidate(),
        utils.schedule.getScheduleForSemester.invalidate(),
        utils.schedule.getExamSchedule.invalidate(),
        utils.regulation.checkCompliance.invalidate(),
      ]);

      // Saved — the edits are now persisted, so the exit guard can stand down.
      setDirty(false);
      // Transient toast PLUS an unmissable confirmation banner on the
      // destination (?saved=1). The toast alone was easy to miss in the
      // navigation transition over the slow prod DB — the core of #18.
      toast.success(t("planSaved"));
      router.push("/planner?saved=1");
    } catch {
      toast.error(t("saveError"));
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      {/* Back link — guarded so unsaved edits aren't thrown away silently (#18) */}
      <button
        onClick={handleExit}
        className="flex items-center gap-1.5 self-start rounded-lg px-3 py-1.5 text-xs text-foreground/50 transition-colors hover:bg-foreground/5 hover:text-foreground/70"
      >
        <ArrowRight className="h-3.5 w-3.5" />
        {t("backToPlanner")}
      </button>

      {/* Semester Planner */}
      <SemesterPlanner
        data={data}
        allCourses={allCourses}
        isLoadingCourses={coursesQuery.isLoading}
        onFinish={handleFinish}
        externalCompletedCourseIds={externalCompletedCourseIds}
        initialPlannedSemesters={initialPlannedSemesters}
        initialSessionGroupSelections={initialSessionGroupSelections}
        isSaving={savePlan.isPending}
        onDirty={() => setDirty(true)}
      />

      {/* Unsaved-changes guard — the back-arrow's silent discard was the heart
          of #18 ("I left — was it saved? nothing popped up"). Now leaving with
          edits asks first and points the student at how to save. */}
      <Dialog open={showLeaveConfirm} onOpenChange={setShowLeaveConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="mb-1 flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-full bg-amber-400/10 text-amber-500">
                <AlertTriangle className="size-5" />
              </span>
              <DialogTitle className="text-base font-bold">
                {t("unsavedTitle")}
              </DialogTitle>
            </div>
            <DialogDescription className="text-start text-sm leading-relaxed text-foreground/60">
              {t("unsavedDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row-reverse">
            <button
              type="button"
              onClick={() => setShowLeaveConfirm(false)}
              className="flex-1 rounded-xl bg-foreground px-5 py-2.5 text-sm font-bold text-background transition-all hover:opacity-90 press-scale"
            >
              {t("unsavedKeepEditing")}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowLeaveConfirm(false);
                setDirty(false);
                router.push("/planner");
              }}
              className="flex-1 rounded-xl border border-border px-5 py-2.5 text-sm font-medium text-foreground/60 transition-colors hover:border-foreground/30 hover:text-foreground/80"
            >
              {t("unsavedLeave")}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
