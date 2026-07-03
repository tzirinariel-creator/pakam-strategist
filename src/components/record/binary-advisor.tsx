"use client";

import { useMemo } from "react";
import { useLocale } from "next-intl";
import { Scale, TrendingUp } from "lucide-react";
import { api } from "@/lib/trpc/react";
import { rankBinaryCandidates, type GradedCourseLite } from "@/lib/binary-advisor";
import {
  deriveCurrentGroup,
  binaryCapRemaining,
  getCurrentAcademicYear,
} from "@/lib/miluim";
import { AskKingButton } from "@/components/ui/ask-king-button";

/**
 * Binary-conversion advisor (miluim) — shows which of the student's OWN graded
 * courses would raise the average if converted to pass/fail, with the exact
 * new average. Pure arithmetic on real grades; renders only for students whose
 * miluim group grants binary conversions and who still have quota. Advisory
 * only: the actual conversion is approved by the university.
 */
export function BinaryAdvisor() {
  const isHe = useLocale() === "he";

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
    semester: profile.currentSemester,
  });
  // Retroactively converting an already-graded course to pass/fail (removing it
  // from the average) is a miluim accommodation — not the general BA pass/fail
  // option chosen at registration. So the "כהטבת מילואים" copy below, and this
  // whole advisor, only make sense for an actual reservist. Without this gate a
  // non-miluim student sees "you have 5 miluim conversions left" (the universal
  // BA_DEGREE_CAP fallback), which is simply wrong. (persona review #26)
  if (!group || group === "NONE") return null;
  const quotaLeft = binaryCapRemaining(profile.miluimBinaryUsed ?? 0, group);
  if (quotaLeft <= 0) return null;

  const { current, candidates } = rankBinaryCandidates(graded, quotaLeft);
  if (current == null || candidates.length === 0) return null;

  const top = candidates.slice(0, 3);

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
              ? `כהטבת מילואים נשארו לך ${quotaLeft} המרות. הנה מה שהיה קורה לממוצע (${current.toFixed(1)}):`
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
              <span className="ms-1.5 text-foreground/40" dir="ltr">
                {course.grade} · {course.credits} {isHe ? 'ש"ס' : "cr"}
              </span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-400/10 px-2 py-1 font-bold text-emerald-600" dir="ltr">
              <TrendingUp className="size-3" />
              {newAverage.toFixed(1)} (+{delta.toFixed(1)})
            </span>
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
          promptHe={`יש לי ${quotaLeft} המרות בינארי. הכי משתלם להמיר את "${top[0]!.course.nameHe}" (ציון ${top[0]!.course.grade}) — הממוצע יעלה ל-${top[0]!.newAverage.toFixed(1)}. מה כדאי לשקול לפני שאני מחליט/ה?`}
          promptEn={`I have ${quotaLeft} binary conversions. Converting "${top[0]!.course.nameHe}" (grade ${top[0]!.course.grade}) would raise my average to ${top[0]!.newAverage.toFixed(1)}. What should I weigh before deciding?`}
          labelHe="שאל את המלך על ההחלטה"
          labelEn="Ask the King about it"
        />
      </div>
    </div>
  );
}
