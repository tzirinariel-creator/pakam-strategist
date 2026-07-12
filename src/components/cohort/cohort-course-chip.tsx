"use client";

// #13 — the cohort layer at the DECISION moment. A tiny chip on the planner
// card and the catalog row that shows what the cohort thinks about a course,
// right where you choose it — instead of living on a separate page. Three
// states, ALL decided server-side (ratings.contributorBucket), never from a raw
// count on the client:
//   REVEALED (N >= k)   → the aggregate verdict + workload dots.
//   SEEDING  (2..k-1)   → a recruitment line ("2 שיתפו — עוד אחד פותח לכולם");
//                         no number-as-rating, and the server folds N=1 into
//                         EMPTY so a single contributor is never exposed.
//   EMPTY    (0 or 1)   → nothing. Honest silence — a course nobody has taken
//                         yet has no cohort wisdom to show. Seeding a review
//                         happens where you CAN review (the grade-lock nudge on
//                         a COMPLETED course), never a "be the first" button on
//                         a course you haven't taken (that would only 403).

import { Users2 } from "lucide-react";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";

export function CohortCourseChip({
  courseCode,
  isHe,
  className,
}: {
  courseCode: string;
  isHe: boolean;
  className?: string;
}) {
  const { data } = api.courseKnowledge.getForCourse.useQuery(
    { courseCode },
    { retry: false, staleTime: 5 * 60_000, refetchOnMount: false },
  );
  const r = data?.ratings;
  const bucket = r?.contributorBucket; // EMPTY | SEEDING | REVEALED (undefined while loading/errored)

  // REVEALED — the aggregate cohort verdict (k-anonymous). Render as soon as
  // EITHER a recommend-share OR a workload average is available: verdict and
  // workload are independent optional fields, so a course rated by 3+ students
  // with only verdicts (no workload numbers) must still show its "% ממליצים".
  if (bucket === "REVEALED" && (r?.workloadAvg != null || r?.recommendShare != null)) {
    const rounded = r.workloadAvg != null ? Math.round(r.workloadAvg) : null;
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
        {rounded != null && (
          <span dir="ltr" className="inline-flex items-center gap-0.5" aria-hidden>
            {[1, 2, 3, 4, 5].map((n) => (
              <span
                key={n}
                className={cn("size-1 rounded-full", n <= rounded ? "bg-accent-brand" : "bg-accent-brand/25")}
              />
            ))}
          </span>
        )}
      </span>
    );
  }

  // SEEDING — enough interest to recruit, not enough to reveal. Non-clickable;
  // the count is server-guaranteed >= 2 (N=1 folded to EMPTY upstream), so it
  // never exposes a lone contributor.
  if (bucket === "SEEDING" && r?.seedingContributors != null) {
    const shared = r.seedingContributors;
    const left = r.seedingRemaining ?? 1;
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full bg-accent-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-accent-brand",
          className,
        )}
        title={isHe ? "עוד קצת ונפתח לכולם" : "Almost enough to unlock"}
      >
        <Users2 className="size-2.5" />
        {isHe
          ? `${shared} שיתפו — עוד ${left === 1 ? "אחד" : left} פותח${left === 1 ? "" : "ים"} את זה לכולם`
          : `${shared} shared — ${left} more to open it`}
      </span>
    );
  }

  // EMPTY (0 or 1 contributor) — honest silence.
  return null;
}
