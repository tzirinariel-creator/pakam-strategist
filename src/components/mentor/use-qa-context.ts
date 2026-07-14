"use client";

import { useMemo } from "react";
import { useLocale } from "next-intl";
import { api } from "@/lib/trpc/react";
import { getAcademicNow, getPlanningAnchor, deriveYearOfStudy } from "@/lib/academic-calendar";
import { DISCIPLINE_CONFIG, CREDIT_REQUIREMENTS } from "@/lib/constants";
import {
  deriveCurrentGroup,
  binaryCapRemaining,
  binaryBenefitOf,
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
      // Derived from the calendar anchor, never the fossilized stored year —
      // in October the stored year is one behind until the profile is touched
      // (spirit-audit 14.7).
      currentYear: deriveYearOfStudy(profile?.startYear, profile?.currentYear ?? 1),
      // Year AT the planning anchor — WRITE paths (King quick-add) must file
      // courses into the semester being PLANNED, not the one that just ended
      // (launch-gate 14.7: a continuing student's add landed in a dead bucket).
      anchorYear: deriveYearOfStudy(profile?.startYear, profile?.currentYear ?? 1, getPlanningAnchor().startYear),
      gender: profile?.gender === "male" || profile?.gender === "female" ? profile.gender : null,
      amiramScore: profile?.amiramScore ?? null,
      // #23 — the DECLARED level (grade sheet) overrides the score everywhere;
      // the King must see it too, or he asks for a score the app doesn't need.
      englishLevel: profile?.englishLevel ?? null,
      miluimGroupName: groupName,
      // binaryRemaining is COURSE-denominated. B/C count courses; G's benefit
      // is credit-denominated (עד 6 ש״ס — see binaryBenefitOf), so a course
      // count would over-promise: G answers stay countless here and the
      // correct ש״ס framing lives on /miluim + the benefits window + the
      // record advisor. A/NONE get 0 (no phantom conversions).
      binaryRemaining:
        binaryBenefitOf(group)?.unit === "courses"
          ? binaryCapRemaining(profile?.miluimBinaryUsed ?? 0, group)
          : 0,
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
      englishLevel: profile?.englishLevel ?? null,
      hasFocusArea: !!profile?.focusArea,
      currentYear: deriveYearOfStudy(profile?.startYear, profile?.currentYear ?? 1),
      miluimGroup,
      // Same unit-guard as the QA context above: only course-denominated
      // groups (B/C) get a course count; G is credit-denominated, NONE/A = 0.
      binaryRemaining:
        binaryBenefitOf(miluimGroup as MiluimGroupKey)?.unit === "courses"
          ? binaryCapRemaining(profile?.miluimBinaryUsed ?? 0, miluimGroup as MiluimGroupKey)
          : 0,
      regulationResults: regulationQuery.data?.results ?? [],
      now: new Date(),
    });
  }, [creditsQuery.data, gradeQuery.data, regulationQuery.data, profileQuery.data, planQuery.data]);

  const ready = !!creditsQuery.data && !!profileQuery.data;
  return { ctx, ready, recommendations };
}
