"use client";

import { useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { Scale, TrendingUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { advisorError } from "@/lib/advisor-toast";
import { api } from "@/lib/trpc/react";
import { invalidatePlanData } from "@/lib/trpc/invalidate-plan";
import { getAcademicNow } from "@/lib/academic-calendar";
import { rankBinaryCandidates, type GradedCourseLite } from "@/lib/binary-advisor";
import { usePersonalAddress } from "@/components/personal/use-personal-address";
import {
  deriveCurrentGroup,
  binaryCapRemaining,
  binaryBenefitOf,
  getCurrentAcademicYear,
} from "@/lib/miluim";
import { AskKingButton } from "@/components/ui/ask-king-button";
import { cn } from "@/lib/utils";

/**
 * Binary-conversion advisor (miluim) — shows which of the student's OWN graded
 * courses would raise the average if converted to pass/fail, with the exact
 * new average. Pure arithmetic on real grades; renders only for students whose
 * miluim group grants binary conversions and who still have quota. Advisory
 * only: the actual conversion is approved by the university.
 */
export function BinaryAdvisor() {
  const isHe = useLocale() === "he";
  const { g: pg } = usePersonalAddress();
  const trpcUtils = api.useUtils();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const convertMutation = api.plan.updateCourse.useMutation();

  const planQuery = api.plan.getUserPlan.useQuery();
  const profileQuery = api.user.getProfile.useQuery();
  const semestersQuery = api.user.listMiluimSemesters.useQuery(undefined, {
    enabled: !!profileQuery.data,
  });

  const profile = profileQuery.data;

  const graded = useMemo<GradedCourseLite[]>(
    () =>
      (planQuery.data?.courses ?? [])
        .filter((uc) => uc.status === "COMPLETED" && uc.grade != null)
        .map((uc) => ({
          userCourseId: uc.id,
          nameHe: uc.course.nameHe,
          code: uc.course.code,
          grade: uc.grade!,
          credits: uc.course.credits,
          isBinary: uc.isBinary ?? false,
          courseType: uc.course.courseType,
        })),
    [planQuery.data],
  );

  if (!profile) return null;

  const group = deriveCurrentGroup(semestersQuery.data ?? [], profile.miluimGroup, {
    academicYear: getCurrentAcademicYear(),
    semester: getAcademicNow().semester,
  });
  // Retroactively converting a graded course to pass/fail (removing it from
  // the average) is a miluim benefit — gate on the ONE source every surface
  // uses. B/C get it in COURSES; G gets it in CREDITS (עד 6 ש״ס per the
  // מתווה — was wrongly 0 until 14.7); A/NONE never see this. (verify 4.7/14.7)
  const benefit = binaryBenefitOf(group);
  if (!benefit) return null;
  // 18:19 (#11) — the quota COUNTS actual plan conversions (isBinary), plus
  // the manual "converted outside the app" offset — the same model /miluim
  // uses. So converting a course here immediately moves the quota.
  const binaryCourses = (planQuery.data?.courses ?? []).filter(
    (uc) => (uc as { isBinary?: boolean }).isBinary,
  );
  const usedTotal = binaryCourses.length + (profile.miluimBinaryUsed ?? 0);
  // Credit-denominated (G): sum the ש״ס of in-app conversions against the
  // 6-credit cap. External conversions have unknown credits — assume the
  // 2-ש״ס minimum so we UNDER-promise, never over.
  const creditsUsed =
    binaryCourses.reduce((s, uc) => s + ((uc as { course?: { credits?: number } }).course?.credits ?? 0), 0) +
    (profile.miluimBinaryUsed ?? 0) * 2;
  const creditsLeft = benefit.unit === "credits" ? Math.max(0, benefit.degreeCap - creditsUsed) : null;
  const quotaLeft =
    benefit.unit === "credits"
      ? (creditsLeft! > 0 ? Number.MAX_SAFE_INTEGER : 0) // ranked list is credit-filtered below
      : binaryCapRemaining(usedTotal, group);
  if (quotaLeft <= 0) return null;

  const { current, candidates } = rankBinaryCandidates(graded, quotaLeft);
  if (current == null || candidates.length === 0) return null;

  // For a credit cap, only offer courses that still FIT the remaining credits.
  const fitting =
    creditsLeft != null ? candidates.filter((c) => c.course.credits <= creditsLeft) : candidates;
  if (fitting.length === 0) return null;

  const top = fitting.slice(0, 3);

  return (
    <div className="data-card p-4">
      <div className="mb-1 flex items-center gap-2">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-600">
          <Scale className="size-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground/85">
            {isHe ? "המרה לבינארי — שווה לך?" : "Binary conversion — worth it?"}
          </p>
          <p className="text-xs text-foreground/50">
            {isHe
              ? creditsLeft != null
                ? `כהטבת מילואים (קבוצה G) נשארו לך עד ${creditsLeft} ש״ס להמרה. הנה מה שהיה קורה לממוצע (${current.toFixed(1)}):`
                : `כהטבת מילואים נשארו לך ${quotaLeft} המרות. הנה מה שהיה קורה לממוצע (${current.toFixed(1)}):`
              : creditsLeft != null
                ? `Your miluim benefit (Group G) leaves up to ${creditsLeft} credits to convert. Here's what your average (${current.toFixed(1)}) would do:`
                : `Your miluim benefit leaves ${quotaLeft} conversions. Here's what your average (${current.toFixed(1)}) would do:`}
          </p>
        </div>
      </div>

      <ul className="mt-3 space-y-1.5">
        {top.map(({ course, newAverage, delta }) => (
          <li
            key={course.userCourseId}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-border/50 p-2.5 text-xs"
          >
            <span className="min-w-0 flex-1 truncate text-foreground/80">
              {course.nameHe}
              <span className="ms-1.5 text-foreground/40">
                <bdi dir="ltr">{course.grade} · {course.credits}</bdi> {isHe ? 'ש״ס' : "cr"}
              </span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-400/10 px-2 py-1 font-bold text-emerald-600" dir="ltr">
              <TrendingUp className="size-3" />
              {newAverage.toFixed(1)} (+{delta.toFixed(1)})
            </span>
            {/* 18:19 (#11) — the actual convert action, right where you decide.
                Two-step (irreversible), sets isBinary and recomputes the quota. */}
            <button
              type="button"
              disabled={convertMutation.isPending}
              onClick={() => {
                if (confirmId !== course.userCourseId) {
                  setConfirmId(course.userCourseId);
                  return;
                }
                convertMutation.mutate(
                  { userCourseId: course.userCourseId, isBinary: true },
                  {
                    onSuccess: () => {
                      invalidatePlanData(trpcUtils);
                      setConfirmId(null);
                      toast.success(
                        isHe
                          ? `${course.nameHe} הומר לבינארי — הממוצע עלה ל-${newAverage.toFixed(1)}`
                          : `${course.nameHe} converted — average is now ${newAverage.toFixed(1)}`,
                      );
                    },
                    onError: (e) => advisorError(e.message || (isHe ? "ההמרה לא הצליחה — הקורס נשאר עם הציון. נסו שוב." : "The conversion didn't go through — the course keeps its grade. Try again.")),
                  },
                );
              }}
              className={cn(
                "rounded-md px-2 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50",
                confirmId === course.userCourseId
                  ? "bg-amber-500 text-white hover:bg-amber-600"
                  : "bg-foreground/8 text-foreground/70 hover:bg-foreground/15",
              )}
            >
              {convertMutation.isPending && confirmId === course.userCourseId ? (
                <Loader2 className="size-3 animate-spin" />
              ) : confirmId === course.userCourseId ? (
                isHe ? "ההמרה בלתי-הפיכה — להמשיך?" : "Irreversible — continue?"
              ) : (
                isHe ? "המר לבינארי" : "Convert"
              )}
            </button>
          </li>
        ))}
      </ul>

      <p className="mt-2.5 text-[11px] leading-snug text-foreground/45">
        {isHe
          ? "חשוב: ההמרה מוסרת את הקורס מהממוצע לתמיד ומאושרת מול האוניברסיטה — לא כאן. סמינרים אינם ניתנים להמרה, ולהצטיינות הבינאריים חייבים להישאר עד 25% מהשעות השנתיות."
          : "Important: conversion permanently removes the course from your average and is approved with the university — not here. Seminars can't be converted, and honors requires binaries stay ≤ 25% of yearly credits."}
      </p>

      <div className="mt-2">
        <AskKingButton
          promptHe={`יש לי ${quotaLeft} המרות בינארי. הכי משתלם להמיר את "${top[0]!.course.nameHe}" (ציון ${top[0]!.course.grade}) — הממוצע יעלה ל-${top[0]!.newAverage.toFixed(1)}. מה כדאי לשקול לפני ש${pg("אני מחליט", "אני מחליטה", "מחליטים")}?`}
          promptEn={`I have ${quotaLeft} binary conversions. Converting "${top[0]!.course.nameHe}" (grade ${top[0]!.course.grade}) would raise my average to ${top[0]!.newAverage.toFixed(1)}. What should I weigh before deciding?`}
          labelHe="שאל את המלך על ההחלטה"
          labelEn="Ask the King about it"
        />
      </div>
    </div>
  );
}
