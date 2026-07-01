"use client";

import { useMemo } from "react";
import { useLocale } from "next-intl";
import { api } from "@/lib/trpc/react";
import { DISCIPLINE_CONFIG, CREDIT_REQUIREMENTS } from "@/lib/constants";
import {
  deriveCurrentGroup,
  binaryCapRemaining,
  getCurrentAcademicYear,
  type MiluimGroupKey,
} from "@/lib/miluim";
import type { QAContext } from "@/lib/degree-qa";

/**
 * Builds the deterministic-QA context from the student's own tRPC data, shared
 * by the /mentor Degree Assistant and the floating assistant so both answer
 * from one source of truth. Returns `ready` = whether the core data has loaded
 * (so the caller can hold the free answer until numbers are real, never guess).
 */
export function useDegreeQAContext(enabled = true): { ctx: QAContext; ready: boolean } {
  const isHe = useLocale() === "he";

  // `enabled` lets the floating assistant defer these 6 queries until the King
  // is actually opened, instead of hitting the DB on every protected page load.
  const opts = { retry: 1, staleTime: 60_000, enabled };
  const creditsQuery = api.plan.getCredits.useQuery(undefined, opts);
  const gradeQuery = api.plan.getGraduationScore.useQuery(undefined, opts);
  const regulationQuery = api.regulation.checkCompliance.useQuery(undefined, opts);
  const profileQuery = api.user.getProfile.useQuery(undefined, opts);
  const semestersQuery = api.user.listMiluimSemesters.useQuery(undefined, opts);
  const planQuery = api.plan.getUserPlan.useQuery(undefined, opts);

  const ctx: QAContext = useMemo(() => {
    const b = creditsQuery.data?.breakdown ?? null;
    const profile = profileQuery.data;
    const focusArea = profile?.focusArea ?? null;
    const focusCfg = focusArea ? DISCIPLINE_CONFIG[focusArea] : null;

    const group = deriveCurrentGroup(
      semestersQuery.data ?? [],
      (profile?.miluimGroup ?? "NONE") as MiluimGroupKey,
      { academicYear: getCurrentAcademicYear(), semester: profile?.currentSemester ?? null },
    );
    // Locale-aware so the English assistant says "Group C", not "קבוצה C".
    const groupName =
      group === "NONE" ? null : `${isHe ? "קבוצה" : "Group"} ${group.replace("GROUP_", "")}`;

    const failedRules = (regulationQuery.data?.results ?? [])
      .filter((r) => !r.passed && (r.severity === "ERROR" || r.severity === "WARNING"))
      .map((r) => ({
        nameHe: r.ruleNameHe,
        nameEn: r.ruleNameEn,
        deficit: Number((r.details as Record<string, unknown> | undefined)?.deficit ?? 0),
      }));

    return {
      isHe,
      effectiveTotal: b?.effectiveTotal ?? 0,
      earned: b?.earned ?? 0,
      planned: b?.planned ?? 0,
      miluimExemption: b?.miluimExemption ?? 0,
      mandatory: b?.mandatory ?? 0,
      elective: b?.elective ?? 0,
      seminar: b?.seminar ?? 0,
      focusAreaCredits: b?.focusArea ?? 0,
      focusAreaTarget: b?.focusAreaTarget ?? CREDIT_REQUIREMENTS.FOCUS_AREA_MIN,
      englishCourseCount: b?.englishCourseCount ?? 0,
      courseAverage: gradeQuery.data?.courseAverage ?? null,
      hasFocusArea: !!focusArea,
      focusAreaNameHe: focusCfg?.nameHe ?? null,
      focusAreaNameEn: focusCfg?.nameEn ?? null,
      currentYear: profile?.currentYear ?? 1,
      amiramScore: profile?.amiramScore ?? null,
      miluimGroupName: groupName,
      binaryRemaining: binaryCapRemaining(profile?.miluimBinaryUsed ?? 0, group),
      failedRules,
      seminarPlannedCount:
        planQuery.data?.courses?.filter((c) => c.course.courseType === "SEMINAR").length ?? 0,
    };
  }, [
    creditsQuery.data,
    gradeQuery.data,
    regulationQuery.data,
    profileQuery.data,
    semestersQuery.data,
    planQuery.data,
    isHe,
  ]);

  const ready = !!creditsQuery.data && !!profileQuery.data;
  return { ctx, ready };
}
