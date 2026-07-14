"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Lock, Check, AlertTriangle, Star, Info, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import { DISCIPLINE_CONFIG } from "@/lib/constants";
import { CourseDetailPopover } from "../step-plan/course-detail-popover";
import type { CourseWithSchedule } from "@/lib/plan-generator";

export type BubbleState = "default" | "selected" | "disabled" | "mandatory";

const DAY_SHORT_HE: Record<string, string> = {
  SUNDAY: "א׳",
  MONDAY: "ב׳",
  TUESDAY: "ג׳",
  WEDNESDAY: "ד׳",
  THURSDAY: "ה׳",
};

const DAY_SHORT_EN: Record<string, string> = {
  SUNDAY: "Su",
  MONDAY: "Mo",
  TUESDAY: "Tu",
  WEDNESDAY: "We",
  THURSDAY: "Th",
};

interface CourseBubbleProps {
  course: CourseWithSchedule;
  state: BubbleState;
  disabledReason?: string;
  recommended?: boolean;
  /** S3 — "מומלץ ע"י המחזור": ≥60% recommend among enough raters (k-anonymous). */
  cohortRecommended?: boolean;
  onToggle?: () => void;
  /** Pointer/keyboard hover — the pool ghosts this course on the grid (#2). */
  onHoverPreview?: (on: boolean) => void;
  onDisciplineOverride?: (courseId: string, discipline: string) => void;
}

export function CourseBubble({
  course,
  state,
  disabledReason,
  recommended,
  cohortRecommended,
  onToggle,
  onHoverPreview,
  onDisciplineOverride,
}: CourseBubbleProps) {
  const locale = useLocale();
  const isHe = locale === "he";
  const cfg = DISCIPLINE_CONFIG[course.discipline as keyof typeof DISCIPLINE_CONFIG];

  const isClickable = state === "default" || state === "selected";

  // Extract unique session days as compact label
  const daysLabel = useMemo(() => {
    const sessions = course.scheduleSessions ?? [];
    if (sessions.length === 0) return null;
    const uniqueDays = [...new Set(sessions.map((s) => s.dayOfWeek))];
    const labels = isHe ? DAY_SHORT_HE : DAY_SHORT_EN;
    return uniqueDays.map((d) => labels[d] ?? d).join(" ");
  }, [course.scheduleSessions, isHe]);

  return (
    <CourseDetailPopover course={course} onDisciplineOverride={onDisciplineOverride}>
      <button
        onClick={(e) => {
          if (isClickable && onToggle) {
            e.stopPropagation();
            // The pick replaces the ghost — clear it so the grid shows the
            // real block, not preview-on-top-of-block.
            onHoverPreview?.(false);
            onToggle();
          }
        }}
        onMouseEnter={() => onHoverPreview?.(true)}
        onMouseLeave={() => onHoverPreview?.(false)}
        onFocus={() => onHoverPreview?.(true)}
        onBlur={() => onHoverPreview?.(false)}
        disabled={state === "disabled"}
        title={state === "disabled" ? disabledReason : undefined}
        className={cn(
          "group relative flex items-center gap-2 rounded-xl border px-3 py-2 text-start transition-all",
          // Default
          state === "default" &&
            "border-border/40 bg-card/40 hover:border-border/60 hover:bg-card/60 cursor-pointer",
          // Selected
          state === "selected" &&
            "border-foreground/50 bg-foreground/5 shadow-sm shadow-foreground/10 cursor-pointer",
          // Disabled (prereqs unmet)
          state === "disabled" &&
            "border-border/20 bg-card/20 opacity-45 cursor-not-allowed",
          // Mandatory (auto-selected, locked)
          state === "mandatory" &&
            "border-foreground/30 bg-foreground/5 cursor-default"
        )}
      >
        {/* Discipline color dot */}
        <div
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: cfg?.color ?? "gray" }}
        />

        {/* Course name */}
        <span
          className={cn(
            "flex-1 truncate text-xs leading-tight",
            state === "selected" ? "text-foreground/90 font-medium" : "text-foreground/70"
          )}
        >
          {isHe ? course.nameHe : (course.nameEn ?? course.nameHe)}
        </span>

        {/* English-taught badge */}
        {course.courseType === "ENGLISH" && (
          <span className="shrink-0 rounded bg-foreground/8 px-1 text-[10px] font-medium text-foreground/50" title={isHe ? "נלמד באנגלית" : "Taught in English"}>
            EN
          </span>
        )}

        {/* Prerequisites badge */}
        {course.prerequisites && course.prerequisites.length > 0 && (
          <span
            className="shrink-0 flex items-center gap-0.5 rounded-full bg-amber-400/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-400/80"
            title={
              isHe
                ? `דרישות קדם: ${course.prerequisites.join(", ")}`
                : `Prerequisites: ${course.prerequisites.join(", ")}`
            }
          >
            <GitBranch className="h-2.5 w-2.5" />
            {isHe ? "דק" : "Pre"}
          </span>
        )}

        {/* Focus area badge */}
        {recommended && (
          <span className="shrink-0 rounded-full bg-foreground/8 px-1 py-0 text-[11px] font-medium text-foreground/40">
            {isHe ? "מיקוד" : "Focus"}
          </span>
        )}

        {/* S3 — cohort recommendation (shown only past the k-anonymity bar) */}
        {cohortRecommended && (
          <span
            className="shrink-0 rounded-full bg-emerald-500/10 px-1.5 py-0 text-[11px] font-semibold text-emerald-600"
            title={isHe ? "לפחות 60% מהמדרגים במחזור ממליצים (3 מדרגים ומעלה)" : "≥60% of cohort raters recommend (3+ raters)"}
          >
            {isHe ? "מומלץ ע״י המחזור" : "Cohort pick"}
          </span>
        )}

        {/* Session days — compact */}
        {daysLabel && (
          <span className="shrink-0 text-[10px] text-foreground/25 font-mono">
            {daysLabel}
          </span>
        )}

        {/* Status icon */}
        {state === "mandatory" && (
          <Lock className="h-3 w-3 shrink-0 text-foreground/50" />
        )}
        {state === "selected" && (
          <Check className="h-3 w-3 shrink-0 text-foreground/80" />
        )}
        {state === "disabled" && (
          <AlertTriangle className="h-3 w-3 shrink-0 text-foreground/30" />
        )}

        {/* Recommended star */}
        {recommended && state === "default" && (
          <Star className="h-3 w-3 shrink-0 text-foreground/50 fill-foreground/30" />
        )}

        {/* Credits badge */}
        <span
          className={cn(
            "shrink-0 font-mono text-[10px]",
            state === "selected" ? "text-foreground/70" : "text-foreground/30"
          )}
        >
          {course.credits}
        </span>

        {/* Info hint (on hover) */}
        <Info className="h-2.5 w-2.5 shrink-0 text-foreground/15 opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>
    </CourseDetailPopover>
  );
}
