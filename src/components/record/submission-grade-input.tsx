"use client";

// -----------------------------------------------------------------------
// The seminar paper's mark — the 22% of the degree score nobody could enter
// -----------------------------------------------------------------------
// The team review found that `submissionGrade` and `submissionType` were read
// in four places, defined in the schema since February, and written by nothing
// at all. Checked against production: 220 userCourse rows, 0 of each.
//
// The consequences ran the whole way through:
//
//   · grade-calculator.ts:209 needs all three components before it returns a
//     weightedScore, so the degree score was null for EVERY user, always —
//     and "מחשבון ציון הגמר" is the name of the screen.
//   · the regulations screen told every third-year "0/3 הוגשו" as a failure,
//     with nowhere to enter anything.
//   · the graduation page told them "את הציונים עצמם מזינים בתיק האקדמי",
//     pointing at a screen that had no such field.
//
// This is that field. It sits only on SEMINAR rows, because those are the only
// ones the 18% + 4% is built from, and it says what the number is for — a
// second bare box next to the exam grade would just look like a duplicate.

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type SubmissionKind = "PAPER" | "REFERAT";

export function SubmissionGradeInput({
  userCourseId,
  initialGrade,
  initialType,
  onSave,
  savedSignal,
  isHe,
  courseName,
}: {
  userCourseId: string;
  initialGrade: number | null;
  initialType: SubmissionKind | null;
  onSave: (id: string, grade: number | null, type: SubmissionKind) => void;
  savedSignal: number;
  isHe: boolean;
  courseName: string;
}) {
  const [value, setValue] = useState(initialGrade == null ? "" : String(initialGrade));
  // A seminar defaults to a paper — the far commoner case — but the student can
  // say referat, and the two carry different weights (18% vs 4%), so guessing
  // silently would put the mark in the wrong bucket.
  const [kind, setKind] = useState<SubmissionKind>(initialType ?? "PAPER");
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (savedSignal > 0) {
      setJustSaved(true);
      const t = setTimeout(() => setJustSaved(false), 1600);
      return () => clearTimeout(t);
    }
  }, [savedSignal]);

  const commit = (nextKind: SubmissionKind = kind) => {
    const trimmed = value.trim();
    if (trimmed === "") {
      if (initialGrade != null) onSave(userCourseId, null, nextKind);
      return;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0 || n > 100) return;
    onSave(userCourseId, n, nextKind);
  };

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] text-foreground/60">
        {isHe ? "ציון העבודה" : "Paper grade"}
      </span>

      <input
        inputMode="numeric"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        aria-label={`${isHe ? "ציון העבודה" : "Paper grade"} — ${courseName}`}
        placeholder="—"
        className="w-12 rounded-md border border-border/60 bg-background px-1.5 py-0.5 text-center font-mono text-xs text-foreground/85 tabular-nums focus:border-accent-brand focus:outline-none"
      />

      <div className="flex overflow-hidden rounded-md border border-border/60">
        {(["PAPER", "REFERAT"] as const).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            onClick={() => {
              setKind(k);
              // Changing the kind moves an already-entered mark between the 18%
              // and the 4% bucket, so it has to persist on its own — waiting
              // for another blur would leave the two disagreeing.
              if (value.trim() !== "") commit(k);
            }}
            className={cn(
              "px-1.5 py-0.5 text-[10px] font-medium transition-colors",
              kind === k
                ? "bg-foreground text-background"
                : "text-foreground/60 hover:text-foreground/75",
            )}
          >
            {k === "PAPER" ? (isHe ? "עבודה" : "Paper") : isHe ? "רפרט" : "Referat"}
          </button>
        ))}
      </div>

      {justSaved && (
        <Check className="size-3 text-status-green" aria-hidden="true" />
      )}
    </div>
  );
}
