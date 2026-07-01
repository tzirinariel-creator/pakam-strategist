"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { ArrowRight, AlertTriangle, Target, Eye } from "lucide-react";
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
  const isHe = useLocale() === "he";
  const router = useRouter();
  const utils = api.useUtils();

  // The gap the home sent us here to close (Project 1 — home↔planner bridge).
  // The "my status" hero passes ?goal=<the top unmet requirement> so the planner
  // opens in context, not as a generic screen.
  const goal = useSearchParams().get("goal");

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
      // Return HOME (not to the board) so the student immediately SEES the
      // status update — closing the home<->planning loop that was the heart of
      // the disconnect (מסלול E). The dashboard shows the same unmissable green
      // banner from ?saved=1 (the transient toast alone was easy to miss in the
      // navigation transition over the slow prod DB — the core of #18).
      toast.success(t("planSaved"));
      router.push("/dashboard?saved=1");
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

      {/* Focus banner — the gap the home sent us to close (Project 1 bridge). */}
      {goal && (
        <div className="flex items-start gap-2.5 rounded-xl border border-accent-brand/30 bg-accent-brand/[0.06] px-4 py-3">
          <Target className="mt-0.5 size-4 shrink-0 text-accent-brand" />
          <p className="text-sm leading-relaxed text-foreground/75">
            {isHe ? "באת לסגור: " : "You're here to close: "}
            <span className="font-semibold text-foreground/90">{goal}</span>
            {isHe
              ? ". תכננו את הסמסטר ובחרו קורסים שיקדמו אתכם לשם."
              : ". Plan the semester and pick courses that move you toward it."}
          </p>
        </div>
      )}

      {/* What-if preview banner — the planner's running numbers (credits, degree
          progress, workload) update live as you drag courses, but they're not
          persisted until you finish. This makes the "it's a preview until you
          save" contract explicit so a live number is never mistaken for saved
          state (Project 1 step 9). Sticks below the top bar while you edit. */}
      {dirty && (
        <div className="sticky top-[calc(var(--banner-offset,0px)_+_4rem)] z-20 -mx-4 flex flex-wrap items-center gap-x-2 gap-y-0.5 border-y border-amber-400/30 bg-amber-400/[0.08] px-4 py-2 text-xs backdrop-blur-sm md:-mx-6 md:px-6">
          <Eye className="size-3.5 shrink-0 text-amber-500" />
          <span className="font-medium text-foreground/80">
            {isHe ? "תצוגה מקדימה — השינויים עדיין לא נשמרו" : "Preview — your changes aren't saved yet"}
          </span>
          <span className="text-foreground/45">
            {isHe ? "· המספרים מתעדכנים חי; סיימו את התכנון כדי לשמור" : "· numbers update live; finish planning to save"}
          </span>
        </div>
      )}

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
