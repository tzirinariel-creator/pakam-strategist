"use client";

// 18:19 (#13) — the cohort layer at the DECISION moment. A tiny chip that
// shows the cohort's workload/recommendation for a course when enough
// students have shared (k-anonymous), and — when they haven't — a quiet "be
// the first" invite that opens the contribution sheet. Embedded on the
// catalog, the planner card and the elective pool, so cohort wisdom rides
// alongside the choice instead of living on a separate page.

import { Users2, MessageSquarePlus } from "lucide-react";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";

export function CohortCourseChip({
  courseCode,
  isHe,
  /** Show the "be the first" invite when there's no revealed data yet. */
  inviteWhenEmpty = false,
  onContribute,
  className,
}: {
  courseCode: string;
  isHe: boolean;
  inviteWhenEmpty?: boolean;
  onContribute?: () => void;
  className?: string;
}) {
  const { data } = api.courseKnowledge.getForCourse.useQuery(
    { courseCode },
    { retry: false, staleTime: 5 * 60_000, refetchOnMount: false },
  );
  const r = data?.ratings;

  if (r?.revealed && r.workloadAvg != null) {
    const rounded = Math.round(r.workloadAvg);
    const verdict = r.recommendShare != null ? Math.round(r.recommendShare * 100) : null;
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full bg-accent-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-accent-brand",
          className,
        )}
        title={isHe ? "לפי הסטודנטים באפליקציה" : "From students in the app"}
      >
        <Users2 className="size-2.5" />
        {verdict != null
          ? isHe ? `${verdict}% ממליצים` : `${verdict}% recommend`
          : isHe ? "עומס" : "Load"}
        <span dir="ltr" className="inline-flex items-center gap-0.5" aria-hidden>
          {[1, 2, 3, 4, 5].map((n) => (
            <span
              key={n}
              className={cn("size-1 rounded-full", n <= rounded ? "bg-accent-brand" : "bg-accent-brand/25")}
            />
          ))}
        </span>
      </span>
    );
  }

  if (inviteWhenEmpty && onContribute) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onContribute();
        }}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-dashed border-foreground/20 px-1.5 py-0.5 text-[10px] font-medium text-foreground/45 transition-colors hover:border-accent-brand/40 hover:text-accent-brand",
          className,
        )}
        title={isHe ? "עוד אין חוות-דעת — היו הראשונים" : "No reviews yet — be the first"}
      >
        <MessageSquarePlus className="size-2.5" />
        {isHe ? "היו הראשונים לחוות דעה" : "Be the first to review"}
      </button>
    );
  }

  return null;
}
