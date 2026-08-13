"use client";

import { api } from "@/lib/trpc/react";

/** #24 (12.7) — what earlier cohorts would tell themselves before exams,
 *  right where exam planning starts. Up to two lines, attributed. */
export function ExamSeasonWisdom({ isHe }: { isHe: boolean }) {
  const insights = api.cohort.listInsights.useQuery(undefined, { staleTime: 300_000 });
  const examTips = (insights.data ?? []).filter((i) => i.stage === "EXAMS").slice(0, 2);
  if (examTips.length === 0) return null;
  return (
    <div className="data-card space-y-2 p-4">
      <p className="text-xs font-bold text-foreground/60">
        {isHe ? "לפני מבחנים — מהמחזורים שכבר עברו את זה:" : "Before exams — from cohorts who've been there:"}
      </p>
      {examTips.map((t) => (
        <p key={t.id} className="text-sm leading-relaxed text-foreground/75">
          “{t.text}”
          {t.cohortYear && (
            <span className="text-[11px] text-foreground/40">
              {isHe ? ` — מחזור ${t.cohortYear}` : ` — class of ${t.cohortYear}`}
            </span>
          )}
        </p>
      ))}
    </div>
  );
}
