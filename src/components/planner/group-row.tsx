"use client";

// One group option, rendered identically wherever a student chooses a group:
// the on-grid picker popover and the planner's group rail. Extracted so the two
// surfaces can never drift into describing the same group differently — which
// is exactly what happened while a chip row in the sidebar showed one meeting
// and the popover showed all of them.
//
// It carries the three states that matter, and they must LOOK different:
//   • chosen   — the student decided this. Solid brand border, ✓.
//   • default  — the app is showing this because nothing was decided. DASHED
//                border, the words "ברירת מחדל". Never a ✓: presenting our
//                fallback as a decision is the confusion this row exists to end.
//   • other    — an alternative, flagged red when it would clash.

import { AlertTriangle, Check, MapPin, Sunrise } from "lucide-react";
import { cn } from "@/lib/utils";
import { Bidi } from "@/lib/bidi";
import {
  dayNameFor,
  describeGroupImpact,
  formatLocation,
  type GroupOption,
} from "@/lib/group-options";

export function GroupRow({
  option,
  isSelected,
  isDefaulted = false,
  isHe,
  onPick,
}: {
  option: GroupOption;
  /** This is the group currently on the grid. */
  isSelected: boolean;
  /** …but only because nothing was chosen yet. */
  isDefaulted?: boolean;
  isHe: boolean;
  onPick: () => void;
}) {
  const hasClash = option.clashes.length > 0;
  const impact = describeGroupImpact(option, isHe);
  const isChosen = isSelected && !isDefaulted;

  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={isChosen}
      // ≥44px tall on touch: this is a decision target, not a chip.
      className={cn(
        "flex min-h-[44px] w-full flex-col gap-1 rounded-lg border px-2.5 py-2 text-start transition-colors",
        isChosen
          ? "border-accent-brand/45 bg-accent-brand/[0.08]"
          : isSelected
            ? "border-dashed border-amber-500/55 bg-amber-500/[0.06]"
            : hasClash
              ? "border-red-400/35 bg-red-400/[0.05] hover:bg-red-400/[0.08]"
              : "border-border/50 bg-foreground/[0.02] hover:bg-foreground/[0.06]",
      )}
    >
      {/* Line 1 — identity + verdict */}
      <span className="flex items-center gap-1.5">
        {isChosen ? (
          <Check className="size-3 shrink-0 text-accent-brand" />
        ) : hasClash ? (
          <AlertTriangle className="size-3 shrink-0 text-status-red" />
        ) : (
          <span className="size-3 shrink-0" aria-hidden />
        )}
        <span
          className={cn(
            "text-[11px] font-semibold",
            isChosen ? "text-accent-brand" : "text-foreground/80",
          )}
        >
          {isHe ? "קבוצה " : "Group "}
          <Bidi text={option.groupCode} />
        </span>
        {isSelected && isDefaulted && (
          <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-status-amber">
            {isHe ? "ברירת מחדל" : "our default"}
          </span>
        )}
        <span className="flex-1" />
        {hasClash ? (
          <span className="shrink-0 rounded bg-red-400/12 px-1.5 py-0.5 text-[10px] font-semibold text-status-red">
            {isHe ? "חופפת" : "clashes"}
          </span>
        ) : (
          <span className="shrink-0 rounded bg-emerald-400/12 px-1.5 py-0.5 text-[10px] font-semibold text-status-green">
            {isHe ? "פנויה" : "free"}
          </span>
        )}
      </span>

      {/* Line 2..n — EVERY meeting: day, hours, room. Half the groups in the
          תשפ״ז catalog meet more than once; showing only the first was wrong. */}
      <span className="flex flex-col gap-0.5 ps-[18px]">
        {option.meetings.map((m, i) => (
          <span
            key={`${m.dayOfWeek}-${m.startTime}-${i}`}
            className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-foreground/65"
          >
            <span className="font-medium">{dayNameFor(m.dayOfWeek, isHe)}</span>
            <Bidi text={`${m.startTime}–${m.endTime}`} />
            {formatLocation(m) && (
              <span className="flex items-center gap-0.5 text-foreground/60">
                <MapPin className="size-2.5 shrink-0" />
                <Bidi text={formatLocation(m)} />
              </span>
            )}
          </span>
        ))}
      </span>

      {/* Line n+1 — lecturers */}
      {option.lecturers.length > 0 && (
        <span className="truncate ps-[18px] text-[10px] text-foreground/60">
          {option.lecturers.join(" · ")}
        </span>
      )}

      {/* Line n+2 — what this pick does to the week. The sentence comes from
          describeGroupImpact (tested), never composed here. Facts only. */}
      <span
        className={cn(
          "flex items-center gap-1 ps-[18px] text-[10px] leading-snug",
          impact.tone === "clash"
            ? "text-status-red/90"
            : impact.tone === "newDay"
              ? "text-status-amber/90"
              : "text-foreground/60",
        )}
      >
        {impact.tone === "newDay" && <Sunrise className="size-2.5 shrink-0" />}
        <Bidi text={impact.text} />
      </span>
    </button>
  );
}
