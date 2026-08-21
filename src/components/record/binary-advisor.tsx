"use client";

import { binaryTimingAdvice } from "@/lib/end-of-degree-advice";
import { CREDIT_REQUIREMENTS } from "@/lib/constants";
import { useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { Scale, TrendingUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { advisorError } from "@/lib/advisor-toast";
import { api } from "@/lib/trpc/react";
import { invalidatePlanData } from "@/lib/trpc/invalidate-plan";
import { getAcademicNow } from "@/lib/academic-calendar";
import { rankBinaryCandidates } from "@/lib/binary-advisor";
import { usePersonalAddress } from "@/components/personal/use-personal-address";
import {
  deriveCurrentGroup,
  binaryCapRemaining,
  binaryBenefitOf,
  getCurrentAcademicYear,
  prefersHigherGrade,
  type MiluimGroupKey,
} from "@/lib/miluim";
import { AskAdvisorButton } from "@/components/ui/ask-advisor-button";
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

  // Hand the advisor the RAW plan rows. Eligibility (countsTowardAverage) and
  // the retake collapse (canonicalAttempts) now happen INSIDE lib/binary-advisor,
  // through the same engine /record and /graduation use — this advisor renders
  // only for B/C/G reservists, the exact students with extra sittings, and a
  // filter applied here instead of there is how the two drifted apart before
  // (launch audit 24.7, audit deferred-1).
  const allCourses = useMemo(
    () => planQuery.data?.courses ?? [],
    [planQuery.data],
  );
  const advisorOpts = useMemo(
    () => ({
      preferHigherGrade: prefersHigherGrade(
        (profileQuery.data?.miluimGroup ?? "NONE") as MiluimGroupKey,
      ),
    }),
    [profileQuery.data?.miluimGroup],
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

  // #23 — where the student is in the degree decides whether now is the moment
  // to spend a conversion. Credits earned come from the plan we already loaded;
  // the year from the profile. Both are already on this screen.
  const creditsEarned = (planQuery.data?.courses ?? []).reduce(
    (sum, uc) => sum + (uc.status === "COMPLETED" ? (uc.course?.credits ?? 0) : 0),
    0,
  );
  const binaryTiming = binaryTimingAdvice(
    {
      currentYear: profile.currentYear ?? 1,
      creditsEarned,
      creditsRequired: CREDIT_REQUIREMENTS.TOTAL,
    },
    { remaining: 1 }, // "is now the moment", not "how many are left"
  );
  const quotaLeft =
    benefit.unit === "credits"
      ? (creditsLeft! > 0 ? Number.MAX_SAFE_INTEGER : 0) // ranked list is credit-filtered below
      : binaryCapRemaining(usedTotal, group);
  if (quotaLeft <= 0) return null;

  const { current, candidates } = rankBinaryCandidates(allCourses, quotaLeft, advisorOpts);
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
            {/* #33 — the name and the grade used to render glued
                ("…המוסר89 · 2 ש״ס"): only a CSS margin stood between them, so
                textContent (and a tight RTL line) ran them together. A real
                "·" separator now sits in the markup itself. */}
            <span className="min-w-0 flex-1 truncate text-foreground/80">
              {course.nameHe}
              <span className="text-foreground/40">
                {" · "}
                <bdi dir="ltr">{course.grade} · {course.credits}</bdi> {isHe ? "ש״ס" : "cr"}
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

      {/* טל, מזכירת פכ״מ: "עדיף לשים בינאריים רק בסוף התואר כי יש איזושהי
          מכסה". The quota is finite and the end of the degree is when you
          actually know which course needs it. Advice with its source named —
          the button below still works, because this is her judgement, not a
          rule we can cite a clause for. */}
      {binaryTiming === "hold" && (
        <p className="mt-2.5 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-2.5 text-[11px] leading-relaxed text-foreground/70">
          {isHe
            ? "טל, מזכירת פכ״מ, ממליצה לשמור את ההמרות לסוף התואר: המכסה מוגבלת, ורק בשנה ג׳ באמת יודעים איזה קורס הכי צריך אותה. אפשר להמיר גם עכשיו — רק שווה לדעת מה מוותרים עליו."
            : "טל, the PPE secretary, suggests saving conversions for the end of the degree: the quota is limited, and only in year 3 do you really know which course needs it. You can still convert now — just worth knowing what you're spending."}
        </p>
      )}

      <p className="mt-2.5 text-[11px] leading-snug text-foreground/45">
        {isHe
          ? "חשוב: ההמרה מוסרת את הקורס מהממוצע לתמיד ומאושרת מול האוניברסיטה — לא כאן. סמינרים אינם ניתנים להמרה, ולהצטיינות הבינאריים חייבים להישאר עד 25% מהשעות השנתיות."
          : "Important: conversion permanently removes the course from your average and is approved with the university — not here. Seminars can't be converted, and honors requires binaries stay ≤ 25% of yearly credits."}
      </p>

      <div className="mt-2">
        <AskAdvisorButton
          promptHe={`יש לי ${quotaLeft} המרות בינארי. הכי משתלם להמיר את "${top[0]!.course.nameHe}" (ציון ${top[0]!.course.grade}) — הממוצע יעלה ל-${top[0]!.newAverage.toFixed(1)}. מה כדאי לשקול לפני ש${pg("אני מחליט", "אני מחליטה", "מחליטים")}?`}
          promptEn={`I have ${quotaLeft} binary conversions. Converting "${top[0]!.course.nameHe}" (grade ${top[0]!.course.grade}) would raise my average to ${top[0]!.newAverage.toFixed(1)}. What should I weigh before deciding?`}
          labelHe="שאל את {advisor} על ההחלטה"
          labelEn="Ask {advisor} about it"
        />
      </div>
    </div>
  );
}
