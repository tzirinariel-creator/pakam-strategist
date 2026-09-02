"use client";

import { useMemo } from "react";
import { useLocale } from "next-intl";
import { Users } from "lucide-react";
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
  isGroupChosen,
  resolveSelectedGroup,
  sessionTypeNameFor,
} from "@/lib/group-options";
import { GroupRow } from "./group-row";
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
        // 14.8 — open BESIDE the block, not over it. With a real anchor box
        // (live-timetable passes the block's rect now), "right" keeps the
        // course you are changing visible while you choose; Radix still flips
        // to the other side, or below, when the viewport demands it.
        side="right"
        sideOffset={8}
        collisionPadding={12}
        // A course with two multi-group session types can list ten options.
        // Radix reports the room it actually has after collision handling —
        // cap to it and scroll, so the picker is never cut off by the fold.
        className="w-[20rem] max-w-[92vw] space-y-3 overflow-y-auto p-3"
        style={{ maxHeight: "var(--radix-popover-content-available-height)" }}
        dir={isHe ? "rtl" : "ltr"}
      >
        <div className="flex items-center gap-1.5">
          <Users className="size-3.5 shrink-0 text-foreground/60" />
          <p className="truncate text-xs font-semibold text-foreground/80">
            {courseName}
          </p>
        </div>

        {choices.map((choice) => {
          const typeName = sessionTypeNameFor(choice.sessionType, isHe);
          const current = resolveSelectedGroup(choice, selectedGroups);
          // Is what's on the grid a DECISION, or our fallback? The row styling
          // depends on it, and so does whether this type still counts as
          // "unchosen" anywhere else in the product.
          const chosen = isGroupChosen(choice, selectedGroups);

          return (
            <div key={choice.sessionType} className="space-y-1.5">
              {/* "4 מתוך 6 בלי חפיפה" — in bidding week the first question is
                  what's still possible, not what exists. */}
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[11px] font-medium text-foreground/60">
                  {isHe ? `בחרו קבוצת ${typeName}` : `Choose a ${typeName} group`}
                </p>
                <p
                  className={cn(
                    "shrink-0 text-[10px] font-medium",
                    choice.freeCount === 0 ? "text-status-red" : "text-foreground/60",
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

              {!chosen && (
                <p className="text-[10px] leading-snug text-status-amber">
                  {isHe
                    ? "עוד לא בחרתם — המערכת מציגה בינתיים את הקבוצה המסומנת בקו מקווקו."
                    : "You haven't chosen yet — the dashed row is what we're showing meanwhile."}
                </p>
              )}

              <div className="flex flex-col gap-1.5">
                {choice.options.map((opt) => (
                  <GroupRow
                    key={opt.groupCode}
                    option={opt}
                    isSelected={opt.groupCode === current}
                    isDefaulted={!chosen}
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

        <p className="text-[10px] leading-tight text-foreground/60">
          {isHe
            ? "הקבוצות הפנויות מוצגות ראשונות. החפיפות נבדקות מול כל מה שכבר יש לכם בסמסטר הזה."
            : "Clash-free groups are listed first. Clashes are checked against everything already in this semester."}
        </p>
      </PopoverContent>
    </Popover>
  );
}
