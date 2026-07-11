"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ContributeReviewSheet } from "@/components/catalog/contribute-review-sheet";

// =========================================================================
// S1 (notes 3/16) — the cohort-contribution nudge, in ONE place.
// =========================================================================
// Called from the onSuccess of a grade-locking update (grade non-null AND
// final status COMPLETED) at BOTH grade doors (planner course card + academic
// record). Design rules:
//  - Never twice for the same course (pk-review-nudge-<code>, marked the
//    moment the nudge is SHOWN — skipping is a respected answer).
//  - Never in demo: the nudge fires only on a SUCCESSFUL write, and demo
//    writes are blocked server-side, so it simply never triggers there.
//  - The sheet itself is the existing ContributeReviewSheet (k-anonymous
//    aggregates, withdrawable) — nothing new is collected here.

let openSheetRef: ((t: { courseCode: string; courseName: string }) => void) | null = null;

/** Fire-and-forget: offer the 10-second contribution once per course. */
export function maybeNudgeCourseReview(courseCode: string, courseName: string, isHe: boolean) {
  const key = `pk-review-nudge-${courseCode}`;
  try {
    if (localStorage.getItem(key) === "done") return;
    localStorage.setItem(key, "done");
  } catch {
    return; // storage blocked — skip quietly rather than risk re-nagging
  }
  toast(isHe ? "רוצים לעזור למחזור? 10 שניות" : "Help your cohort? 10 seconds", {
    description: isHe
      ? `דרגו את ${courseName} — אנונימי לגמרי, ותמיד אפשר למשוך.`
      : `Rate ${courseName} — fully anonymous, withdrawable anytime.`,
    action: {
      label: isHe ? "לדירוג" : "Rate it",
      onClick: () => openSheetRef?.({ courseCode, courseName }),
    },
    duration: 10_000,
  });
}

/** Mount ONCE per page that locks grades — hosts the sheet the nudge opens. */
export function ReviewNudgeHost() {
  const [target, setTarget] = useState<{ courseCode: string; courseName: string } | null>(null);
  useEffect(() => {
    openSheetRef = setTarget;
    return () => {
      openSheetRef = null;
    };
  }, []);
  if (!target) return null;
  return (
    <ContributeReviewSheet
      courseCode={target.courseCode}
      courseName={target.courseName}
      open
      onClose={() => setTarget(null)}
    />
  );
}
