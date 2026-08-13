"use client";

import { useEffect, useRef, useState } from "react";
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
import type { CreditBreakdown } from "@/types/degree";
import { cn } from "@/lib/utils";
import { resolveGoalBucket } from "@/lib/goal-bucket";
import { getProgramById } from "@/lib/programs/registry";
import { getPlanningAnchor, deriveYearOfStudy } from "@/lib/academic-calendar";
import { buildSavePlanPayload } from "@/lib/plan-save-payload";
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

  // Pre-edit credit breakdown (SERVER-computed) captured once at mount — the
  // "before" for the save-return narrative ("עלית מ-X% ל-Y%"). Captured into a
  // ref so a later cache invalidation on save can't overwrite it.
  const creditsQuery = api.plan.getCredits.useQuery();
  const beforeBreakdownRef = useRef<CreditBreakdown | null>(null);
  useEffect(() => {
    // Capture ONCE: the first server value is the true pre-edit baseline; the
    // post-save invalidation must not overwrite it before the stash happens.
    if (beforeBreakdownRef.current === null && creditsQuery.data?.breakdown) {
      beforeBreakdownRef.current = creditsQuery.data.breakdown;
    }
  }, [creditsQuery.data]);
  // The live bucket the ?goal maps to (for the gap-meter in the focus banner).
  const goalBucket = resolveGoalBucket(goal, creditsQuery.data?.breakdown, isHe);

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

  // Same for the student's own discipline attributions (#8) — including the
  // declaration that an off-catalog course is approved for their degree. These
  // ride along on savePlan now, so they must be restored before an edit or the
  // re-save would clear them.
  const initialDisciplineOverrides: Record<string, string> = {};
  for (const uc of plannedUserCourses) {
    if (uc.disciplineOverride) {
      initialDisciplineOverrides[uc.courseId] = uc.disciplineOverride;
    }
  }

  if (isLoading) {
    return <ThemedLoader />;
  }

  const profile = profileQuery.data;
  const allCourses = (coursesQuery.data ?? []) as CourseWithSchedule[];

  // A course the student added themselves is deliberately kept OUT of the
  // public catalog (isActive:false — course.list never returns it), so the
  // planner would otherwise not recognise its own saved rows: the board would
  // show nothing for them and the next save would drop them, DELETING a course
  // the student had already saved. Feed the student's own off-catalog courses
  // back into the pool so they behave like any other planned course (#8).
  const catalogIds = new Set(allCourses.map((c) => c.id));
  const ownOffCatalogCourses = Array.from(
    new Map(
      userCourses
        .filter((uc) => !catalogIds.has(uc.courseId))
        .map((uc) => [
          uc.courseId,
          // No sessions exist for these — they were never scraped.
          { ...(uc.course as unknown as CourseWithSchedule), scheduleSessions: [] },
        ]),
    ).values(),
  );
  const plannerCourses = [...allCourses, ...ownOffCatalogCourses];

  // Build OnboardingData from profile. Year + semester come from the PLANNING
  // ANCHOR (#39): the current semester while it still teaches, otherwise the
  // next one — never the fossilized profile pair.
  const anchor = getPlanningAnchor();
  const data: OnboardingData = {
    program: getProgramById(profile?.programId).programCode,
    year: deriveYearOfStudy(profile?.startYear, profile?.currentYear ?? 1, anchor.startYear),
    semester: anchor.semester,
    focusArea: (profile?.focusArea as OnboardingData["focusArea"]) ?? null,
    miluimGroup: (profile as Record<string, unknown>)?.miluimGroup as OnboardingData["miluimGroup"] ?? "NONE",
    // DB column is still `amiramScore`; map it onto the renamed onboarding field.
    amirantScore: (profile as Record<string, unknown>)?.amiramScore as number | null ?? null,
    // #23 — the directly-declared English level (grade sheet), if the student set it.
    englishLevel: ((profile as Record<string, unknown>)?.englishLevel as string | null) ?? null,
  };

  const handleFinish = async (
    plannedSemesters: PlannedSemester[],
    sessionGroupSelections: SessionGroupSelections,
    disciplineOverrides: Record<string, string>,
  ) => {
    // Build courseId → code map for looking up session group selections. Built
    // over plannerCourses (catalog + the student's own off-catalog courses), so
    // a manually added course is a first-class member of the plan (#8).
    const courseCodeById = new Map(plannerCourses.map((c) => [c.id, c.code]));

    // Convert to the format savePlan expects (see buildSavePlanPayload: it drops
    // ONLY ids that were never registered, which savePlan would reject and which
    // would take the whole save down with them — #18). Custom courses are
    // registered as real Course rows by the planner before we get here, so a
    // leftover `custom-…` id means registration FAILED and the planner has
    // already said so.
    const { courses, droppedIds } = buildSavePlanPayload(
      plannedSemesters,
      courseCodeById,
      sessionGroupSelections,
      disciplineOverrides,
    );
    const droppedCustomCourse = droppedIds.length > 0;

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

      // Stash the pre-edit breakdown so the dashboard can name what moved
      // ("עלית מ-68% ל-74%") instead of a generic "נשמר". Best-effort only —
      // wrapped so a storage failure can NEVER block the save/redirect.
      try {
        const before = beforeBreakdownRef.current;
        if (before) sessionStorage.setItem("pk:saveDelta", JSON.stringify(before));
      } catch {
        /* sessionStorage unavailable — the banner just falls back to generic */
      }
      // Return HOME (not to the board) so the student immediately SEES the
      // status update — closing the home<->planning loop that was the heart of
      // the disconnect (מסלול E). The dashboard shows the same unmissable green
      // banner from ?saved=1 (the transient toast alone was easy to miss in the
      // navigation transition over the slow prod DB — the core of #18).
      if (droppedCustomCourse) {
        // Not a feature gap any more — this only fires when registering the
        // manually added course actually failed, so say that, not "we don't
        // support it".
        toast.error(isHe
          ? "קורס שהוספתם ידנית לא נשמר הפעם — שאר התוכנית נשמרה. נסו להוסיף אותו שוב."
          : "A course you added manually didn't save this time — the rest of the plan did. Try adding it again.");
      }
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
        className="flex items-center gap-1.5 self-start rounded-lg px-3 py-1.5 text-xs text-foreground/70 transition-colors hover:bg-foreground/5 hover:text-foreground/90"
      >
        <ArrowRight className="h-3.5 w-3.5" />
        {t("backToPlanner")}
      </button>

      {/* Focus banner — the gap the home sent us to close. Now carries INTENT:
          when the goal maps to a known requirement bucket it shows the LIVE gap
          status (e.g. "סמינרים — 0/12"), not just an echo of the name. */}
      {goal && (
        <div className="flex items-start gap-2.5 rounded-xl border border-accent-brand/30 bg-accent-brand/[0.06] px-4 py-3">
          <Target className="mt-0.5 size-4 shrink-0 text-accent-brand" />
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-relaxed text-foreground/75">
              {isHe ? "באת לסגור: " : "You're here to close: "}
              <span className="font-semibold text-foreground/90">{goal}</span>
              {goalBucket
                ? isHe
                  ? " — כל קורס שתוסיפו בתחום הזה מקרב אתכם ליעד."
                  : " — every course you add here moves you toward it."
                : isHe
                  ? ". תכננו את הסמסטר ובחרו קורסים שיקדמו אתכם לשם."
                  : ". Plan the semester and pick courses that move you toward it."}
            </p>
            {goalBucket && (
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1.5 w-32 overflow-hidden rounded-full bg-foreground/10">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      goalBucket.met ? "bg-emerald-400" : "bg-accent-brand",
                    )}
                    style={{ width: `${goalBucket.target > 0 ? Math.min((goalBucket.current / goalBucket.target) * 100, 100) : 0}%` }}
                  />
                </div>
                {/* RTL: isolate ONLY the numeric ratio in <bdi>; the Hebrew unit
                    (ש״ס/קורסים) and ✓ stay in natural RTL flow (was dir="ltr" on
                    the whole span, flipping the Hebrew unit — audit 22.7). */}
                <span className="font-mono text-xs tabular-nums text-foreground/70">
                  <bdi dir="ltr">{goalBucket.current}/{goalBucket.target}</bdi> {goalBucket.unit}
                  {goalBucket.met && <span className="text-emerald-500"> ✓</span>}
                </span>
              </div>
            )}
          </div>
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
        allCourses={plannerCourses}
        isLoadingCourses={coursesQuery.isLoading}
        onFinish={handleFinish}
        externalCompletedCourseIds={externalCompletedCourseIds}
        initialPlannedSemesters={initialPlannedSemesters}
        initialSessionGroupSelections={initialSessionGroupSelections}
        initialDisciplineOverrides={initialDisciplineOverrides}
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
