"use client";

import { useMemo } from "react";
import { useLocale } from "next-intl";
import { api } from "@/lib/trpc/react";
import { getAcademicNow } from "@/lib/academic-calendar";
import { DISCIPLINE_CONFIG, CREDIT_REQUIREMENTS } from "@/lib/constants";
import {
  deriveCurrentGroup,
  binaryCapRemaining,
  hasMiluimBinaryBenefit,
  getCurrentAcademicYear,
  type MiluimGroupKey,
} from "@/lib/miluim";
import type { QAContext } from "@/lib/degree-qa";
import { buildRecommendations, type Recommendation } from "@/lib/recommendations-engine";

/**
 * Builds the deterministic-QA context from the student's own tRPC data, shared
 * by the /mentor Degree Assistant and the floating assistant so both answer
 * from one source of truth. Returns `ready` = whether the core data has loaded
 * (so the caller can hold the free answer until numbers are real, never guess).
 */
export function useDegreeQAContext(
  enabled = true,
): { ctx: QAContext; ready: boolean; recommendations: Recommendation[] } {
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
      { academicYear: getCurrentAcademicYear(), semester: getAcademicNow().semester },
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
      gender: profile?.gender === "male" || profile?.gender === "female" ? profile.gender : null,
      amiramScore: profile?.amiramScore ?? null,
      miluimGroupName: groupName,
      // Binary conversion is a miluim benefit only groups B/C actually grant.
      // binaryCapRemaining falls back to the universal BA cap of 5 for any
      // non-NONE group, so gate on the single hasMiluimBinaryBenefit source —
      // A/G/NONE get 0, and the King never offers them a phantom conversion.
      binaryRemaining: hasMiluimBinaryBenefit(group) ? binaryCapRemaining(profile?.miluimBinaryUsed ?? 0, group) : 0,
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

  // Proactive recommendations — the SAME engine the dashboard uses, computed
  // from the queries already in hand (zero extra network). The floating King
  // uses rec[0] (critical/warning only) to volunteer the single most pressing
  // gap when the student opens it — note #10 ("a mentor who says nothing…").
  const recommendations = useMemo<Recommendation[]>(() => {
    const b = creditsQuery.data?.breakdown ?? null;
    const profile = profileQuery.data;
    const miluimGroup = profile?.miluimGroup ?? "NONE";
    return buildRecommendations({
      courses: (planQuery.data?.courses ?? []).map((uc) => ({
        status: uc.status,
        grade: uc.grade,
        courseType: uc.course.courseType,
        isMandatory: uc.course.isMandatory,
        isBinary: uc.isBinary,
        credits: uc.course.credits,
        nameHe: uc.course.nameHe,
        nameEn: uc.course.nameEn,
        examDateB: uc.course.examDateB,
        discipline: (uc.disciplineOverride ?? uc.course.discipline) as string,
      })),
      courseAverage: gradeQuery.data?.courseAverage ?? null,
      englishCourseCount: b?.englishCourseCount ?? 0,
      amiramScore: profile?.amiramScore ?? null,
      hasFocusArea: !!profile?.focusArea,
      currentYear: profile?.currentYear ?? 1,
      miluimGroup,
      binaryRemaining: binaryCapRemaining(profile?.miluimBinaryUsed ?? 0, miluimGroup as MiluimGroupKey),
      regulationResults: regulationQuery.data?.results ?? [],
      now: new Date(),
    });
  }, [creditsQuery.data, gradeQuery.data, regulationQuery.data, profileQuery.data, planQuery.data]);

  const ready = !!creditsQuery.data && !!profileQuery.data;
  return { ctx, ready, recommendations };
}
