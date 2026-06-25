"use client";

import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/trpc/react";
import { ThemedLoader } from "@/components/ui/themed-loader";
import { SemesterPlanner, type PlannedSemester } from "@/components/onboarding/semester-planner/index";
import { useRouter } from "@/i18n/navigation";
import type { CourseWithSchedule } from "@/lib/plan-generator";
import { getProgramById } from "@/lib/programs/registry";
import type { OnboardingData } from "@/components/onboarding/onboarding-wizard";
import type { SessionGroupSelections } from "@/components/onboarding/semester-planner/live-timetable";

export function SemesterPlannerPage() {
  const t = useTranslations("planner");
  const router = useRouter();
  const utils = api.useUtils();

  // Load profile data
  const profileQuery = api.user.getProfile.useQuery();
  // Load all courses
  const coursesQuery = api.course.list.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });
  // Save mutation
  const savePlan = api.plan.savePlan.useMutation();

  const isLoading = profileQuery.isLoading || coursesQuery.isLoading;

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
    amiramScore: (profile as Record<string, unknown>)?.amiramScore as number | null ?? null,
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

      // Show success feedback before navigating
      toast.success(t("planSaved"));
      router.push("/planner");
    } catch {
      toast.error(t("saveError"));
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      {/* Back link */}
      <button
        onClick={() => router.push("/planner")}
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
      />
    </div>
  );
}
