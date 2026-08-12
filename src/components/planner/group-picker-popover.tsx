"use client";

import { useMemo } from "react";
import { useLocale } from "next-intl";
import { AlertTriangle, Check, MapPin, Sunrise, Users } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Bidi } from "@/lib/bidi";
import { type SessionInfo } from "@/lib/conflict-detector";
import {
  buildGroupChoices,
  dayNameFor,
  describeGroupImpact,
  formatLocation,
  resolveSelectedGroup,
  sessionTypeNameFor,
  type GroupOption,
} from "@/lib/group-options";
import type { CourseWithSchedule } from "@/lib/plan-generator";

// ─── Types ───────────────────────────────────────────────────────────

interface GroupPickerPopoverProps {
  /** The course whose lecture/tutorial group is being chosen. */
  course: CourseWithSchedule;
  /** courseCode → { sessionType → groupCode } for THIS course. */
  selectedGroups: Record<string, string>;
  /** Every session already fixed on the grid for OTHER courses. */
  otherSessions: SessionInfo[];
  /** Reuses the existing selectedGroups persistence signature. */
  onPickGroup: (courseCode: string, sessionType: string, groupCode: string) => void;
  /** Semester filter — a course offered in both carries sessions for each. */
  currentSemester?: "FALL" | "SPRING";
  /** The trigger (e.g. a small "החלף קבוצה" button on a course block). */
  children: React.ReactNode;
}

// ─── One group row ───────────────────────────────────────────────────

function GroupRow({
  option,
  isSelected,
  isHe,
  onPick,
}: {
  option: GroupOption;
  isSelected: boolean;
  isHe: boolean;
  onPick: () => void;
}) {
  const hasClash = option.clashes.length > 0;
  const impact = describeGroupImpact(option, isHe);

  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={isSelected}
      className={cn(
        "flex w-full flex-col gap-1 rounded-lg border px-2.5 py-2 text-start transition-colors",
        isSelected
          ? "border-accent-brand/45 bg-accent-brand/[0.08]"
          : hasClash
            ? "border-red-400/35 bg-red-400/[0.05] hover:bg-red-400/[0.08]"
            : "border-border/50 bg-foreground/[0.02] hover:bg-foreground/[0.06]",
      )}
    >
      {/* Line 1 — identity + verdict */}
      <span className="flex items-center gap-1.5">
        {isSelected ? (
          <Check className="size-3 shrink-0 text-accent-brand" />
        ) : hasClash ? (
          <AlertTriangle className="size-3 shrink-0 text-red-400" />
        ) : (
          <span className="size-3 shrink-0" aria-hidden />
        )}
        <span
          className={cn(
            "text-[11px] font-semibold",
            isSelected ? "text-accent-brand" : "text-foreground/80",
          )}
        >
          {isHe ? "קבוצה " : "Group "}
          <Bidi text={option.groupCode} />
        </span>
        <span className="flex-1" />
        {hasClash ? (
          <span className="shrink-0 rounded bg-red-400/12 px-1.5 py-0.5 text-[10px] font-semibold text-red-400">
            {isHe ? "חופפת" : "clashes"}
          </span>
        ) : (
          <span className="shrink-0 rounded bg-emerald-400/12 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-500">
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
              <span className="flex items-center gap-0.5 text-foreground/40">
                <MapPin className="size-2.5 shrink-0" />
                <Bidi text={formatLocation(m)} />
              </span>
            )}
          </span>
        ))}
      </span>

      {/* Line n+1 — lecturers */}
      {option.lecturers.length > 0 && (
        <span className="truncate ps-[18px] text-[10px] text-foreground/40">
          {option.lecturers.join(" · ")}
        </span>
      )}

      {/* Line n+2 — what this pick does to the week. The sentence comes from
          describeGroupImpact (tested), never composed here. Facts only. */}
      <span
        className={cn(
          "flex items-center gap-1 ps-[18px] text-[10px] leading-snug",
          impact.tone === "clash"
            ? "text-red-400/90"
            : impact.tone === "newDay"
              ? "text-amber-500/90"
              : "text-foreground/35",
        )}
      >
        {impact.tone === "newDay" && <Sunrise className="size-2.5 shrink-0" />}
        <Bidi text={impact.text} />
      </span>
    </button>
  );
}

// ─── Component ───────────────────────────────────────────────────────

export function GroupPickerPopover({
  course,
  selectedGroups,
  otherSessions,
  onPickGroup,
  currentSemester,
  children,
}: GroupPickerPopoverProps) {
  const locale = useLocale();
  const isHe = locale === "he";
  const courseName = isHe ? course.nameHe : (course.nameEn ?? course.nameHe);

  const choices = useMemo(
    () =>
      buildGroupChoices({
        sessions: course.scheduleSessions ?? [],
        courseName,
        otherSessions,
        semester: currentSemester,
        selectedGroups,
      }),
    [course.scheduleSessions, courseName, otherSessions, currentSemester, selectedGroups],
  );

  // No multi-group session types — render the trigger inert (no popover).
  if (choices.length === 0) return <>{children}</>;

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="center"
        collisionPadding={12}
        // A course with two multi-group session types can list ten options.
        // Radix reports the room it actually has after collision handling —
        // cap to it and scroll, so the picker is never cut off by the fold.
        className="w-[20rem] max-w-[92vw] space-y-3 overflow-y-auto p-3"
        style={{ maxHeight: "var(--radix-popover-content-available-height)" }}
        dir={isHe ? "rtl" : "ltr"}
      >
        <div className="flex items-center gap-1.5">
          <Users className="size-3.5 shrink-0 text-foreground/40" />
          <p className="truncate text-xs font-semibold text-foreground/80">
            {courseName}
          </p>
        </div>

        {choices.map((choice) => {
          const typeName = sessionTypeNameFor(choice.sessionType, isHe);
          const current = resolveSelectedGroup(choice, selectedGroups);

          return (
            <div key={choice.sessionType} className="space-y-1.5">
              {/* "4 מתוך 6 בלי חפיפה" — in bidding week the first question is
                  what's still possible, not what exists. */}
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[11px] font-medium text-foreground/55">
                  {isHe ? `בחרו קבוצת ${typeName}` : `Choose a ${typeName} group`}
                </p>
                <p
                  className={cn(
                    "shrink-0 text-[10px] font-medium",
                    choice.freeCount === 0 ? "text-red-400" : "text-foreground/45",
                  )}
                >
                  {isHe ? (
                    <>
                      <Bidi text={`${choice.freeCount}/${choice.options.length}`} /> בלי חפיפה
                    </>
                  ) : (
                    <>
                      <Bidi text={`${choice.freeCount}/${choice.options.length}`} /> clash-free
                    </>
                  )}
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                {choice.options.map((opt) => (
                  <GroupRow
                    key={opt.groupCode}
                    option={opt}
                    isSelected={opt.groupCode === current}
                    isHe={isHe}
                    onPick={() =>
                      onPickGroup(course.code, choice.sessionType, opt.groupCode)
                    }
                  />
                ))}
              </div>
            </div>
          );
        })}

        <p className="text-[10px] leading-tight text-foreground/35">
          {isHe
            ? "הקבוצות הפנויות מוצגות ראשונות. החפיפות נבדקות מול כל מה שכבר יש לכם בסמסטר הזה."
            : "Clash-free groups are listed first. Clashes are checked against everything already in this semester."}
        </p>
      </PopoverContent>
    </Popover>
  );
}
