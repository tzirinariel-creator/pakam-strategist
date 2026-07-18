"use client";

import { useState, useCallback, useEffect } from "react";
import { Check, AlertTriangle } from "lucide-react";
import { passBarFor } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { CourseStatus } from "@/types/enums";

// -----------------------------------------------------------------------
// Inline grade input — debounced, clears to "no grade" on blur when empty.
// -----------------------------------------------------------------------

export function GradeInput({
  userCourseId,
  initialGrade,
  initialStatus,
  courseType,
  onSave,
  placeholder,
  ariaLabel,
  savedSignal,
  isHe,
}: {
  userCourseId: string;
  initialGrade: number | null;
  initialStatus: CourseStatus;
  /** The row's course type — sets the honest pass bar (ENGLISH 70 else 60) so a
   *  saved grade lands COMPLETED vs FAILED correctly, mirroring the planner. */
  courseType: string;
  onSave: (id: string, grade: number | null, status: CourseStatus) => void;
  placeholder: string;
  ariaLabel: string;
  /** Bumped by the parent when THIS course's save mutation succeeds. */
  savedSignal: number;
  isHe: boolean;
}) {
  const [value, setValue] = useState<string>(
    initialGrade !== null ? String(initialGrade) : ""
  );
  const [saved, setSaved] = useState(false);

  // A grade under the passing bar is a real event, not a typo to swallow: the
  // course won't count toward credit until it's retaken and passed, and (unlike
  // a low *pass*) it can't be converted to binary. We accept the entry but flag
  // it plainly so the record stays honest (#31).
  const passBar = passBarFor(courseType);
  const numVal = parseInt(value, 10);
  const isFailing = value !== "" && !isNaN(numVal) && numVal < passBar;

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === "") {
      setValue("");
      return;
    }
    const num = parseInt(raw, 10);
    if (isNaN(num) || num < 0 || num > 100) return;
    setValue(String(num));
  }, []);

  // Save immediately on blur — blur already means the user finished editing,
  // so there's no debounce timer that could be lost on unmount (e.g. navigating
  // away or collapsing a section). The save fires synchronously here.
  const handleBlur = useCallback(() => {
    const num = parseInt(value, 10);
    if (value === "" || isNaN(num)) {
      // Cleared — drop the grade but keep the course COMPLETED in the record.
      if (initialGrade !== null) {
        onSave(userCourseId, null, initialStatus);
      }
      return;
    }
    const grade = Math.max(0, Math.min(100, num));
    // Honesty (#31): a grade under the course's pass bar is a real FAILED event,
    // not a silent COMPLETED. Mirrors the planner card (passBarFor: ENGLISH 70
    // else 60) so the record never fakes a pass a student didn't earn.
    onSave(userCourseId, grade, grade >= passBar ? "COMPLETED" : "FAILED");
  }, [value, userCourseId, initialStatus, initialGrade, onSave, passBar]);

  // Show the "saved" checkmark only when the parent confirms the mutation
  // actually succeeded (savedSignal bump), never on the fire-and-forget call.
  useEffect(() => {
    if (savedSignal === 0) return;
    setSaved(true);
    const id = setTimeout(() => setSaved(false), 1500);
    return () => clearTimeout(id);
  }, [savedSignal]);

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative">
        <input
          type="number"
          min={0}
          max={100}
          step={1}
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          aria-label={ariaLabel}
          aria-invalid={isFailing}
          dir="ltr"
          className={cn(
            "w-20 rounded-md border bg-background/50 px-2 py-1.5",
            "font-mono text-sm text-foreground text-center",
            "placeholder:text-foreground/20",
            "focus:outline-none focus:ring-1",
            "transition-all",
            isFailing
              ? "border-amber-400/60 text-amber-600 focus:border-amber-400 focus:ring-amber-400/30 dark:text-amber-400"
              : "border-border/50 focus:border-foreground/35 focus:ring-foreground/20",
            saved && !isFailing && "border-emerald-400/50 ring-1 ring-emerald-400/30"
          )}
        />
        {saved && (
          <Check className="absolute -end-5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-emerald-400 animate-in fade-in" />
        )}
      </div>
      {isFailing && (
        <p className="flex items-center gap-1 text-xs leading-tight text-amber-600 dark:text-amber-500">
          <AlertTriangle className="size-3 shrink-0" />
          {isHe ? "ציון נכשל — הש״ס לא נספרות. אפשר לחזור על הקורס." : "Failing — the credits don't count. You can retake it."}
        </p>
      )}
    </div>
  );
}
