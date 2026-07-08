"use client";

import { useMemo } from "react";
import { useLocale } from "next-intl";
import { Clock, Users, AlertTriangle, Check } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Bidi } from "@/lib/bidi";
import { detectTimeConflicts, type SessionInfo } from "@/lib/conflict-detector";
import type { ScheduleSessionLike, CourseWithSchedule } from "@/lib/plan-generator";
import type { DayOfWeek } from "@/types/enums";

// ─── Types ───────────────────────────────────────────────────────────

interface GroupPickerPopoverProps {
  /** The course whose tutorial/lab group is being chosen. */
  course: CourseWithSchedule;
  /** courseCode → { sessionType → groupCode } for THIS course. */
  selectedGroups: Record<string, string>;
  /**
   * Every session already fixed on the grid for OTHER courses (and this
   * course's other, non-picked session types). Used to pre-flag clashes.
   */
  otherSessions: SessionInfo[];
  /** Reuses the existing selectedGroups persistence signature. */
  onPickGroup: (courseCode: string, sessionType: string, groupCode: string) => void;
  /** Semester filter — a course offered in both carries sessions for each. */
  currentSemester?: "FALL" | "SPRING";
  /** The trigger (e.g. a small "החלף קבוצה" button on a course block). */
  children: React.ReactNode;
}

interface GroupOption {
  groupCode: string;
  sessions: ScheduleSessionLike[];
  label: string;
  lecturer?: string | null;
  clashes: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────

const DAY_NAMES_HE: Record<string, string> = {
  SUNDAY: "ראשון",
  MONDAY: "שני",
  TUESDAY: "שלישי",
  WEDNESDAY: "רביעי",
  THURSDAY: "חמישי",
  FRIDAY: "שישי",
};

const DAY_NAMES_EN: Record<string, string> = {
  SUNDAY: "Sun",
  MONDAY: "Mon",
  TUESDAY: "Tue",
  WEDNESDAY: "Wed",
  THURSDAY: "Thu",
  FRIDAY: "Fri",
};

const SESSION_TYPE_LABELS: Record<string, { he: string; en: string }> = {
  lecture: { he: "הרצאה", en: "Lecture" },
  tutorial: { he: "תרגול", en: "Tutorial" },
  lab: { he: "מעבדה", en: "Lab" },
};

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Group a course's sessions by sessionType→groupCode, keeping only the
 * sessionTypes that actually offer a CHOICE (>1 group). "ALL" (shared)
 * sessions are ignored — they run regardless of the pick. This mirrors the
 * sidebar SessionGroupSelector so the two stay in sync.
 */
function buildSelectableTypes(
  sessions: ScheduleSessionLike[],
): Map<string, Map<string, ScheduleSessionLike[]>> {
  const byType = new Map<string, Map<string, ScheduleSessionLike[]>>();
  for (const s of sessions) {
    const gc = s.groupCode ?? "A";
    if (gc === "ALL") continue;
    if (!byType.has(s.sessionType)) byType.set(s.sessionType, new Map());
    const typeMap = byType.get(s.sessionType)!;
    if (!typeMap.has(gc)) typeMap.set(gc, []);
    typeMap.get(gc)!.push(s);
  }
  // Drop types with a single group — nothing to pick.
  for (const [type, groupMap] of byType) {
    if (groupMap.size <= 1) byType.delete(type);
  }
  return byType;
}

function toSessionInfo(
  courseCode: string,
  courseName: string,
  sessions: ScheduleSessionLike[],
): SessionInfo[] {
  return sessions.map((s, i) => ({
    id: `${courseCode}-${s.sessionType}-${s.groupCode ?? "A"}-${i}`,
    courseCode,
    courseName,
    dayOfWeek: s.dayOfWeek as DayOfWeek,
    startTime: s.startTime,
    endTime: s.endTime,
    sessionType: s.sessionType,
  }));
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

  const selectableTypes = useMemo(() => {
    const sessions = (course.scheduleSessions ?? []).filter(
      (s) => !currentSemester || !s.semester || s.semester === currentSemester,
    );
    return buildSelectableTypes(sessions);
  }, [course.scheduleSessions, currentSemester]);

  // For each selectable type, build the options with a pre-computed clash flag.
  const optionsByType = useMemo(() => {
    const out = new Map<string, GroupOption[]>();
    for (const [sessionType, groupMap] of selectableTypes) {
      const options: GroupOption[] = [];
      for (const [groupCode, groupSessions] of groupMap) {
        const first = groupSessions[0]!;
        const dayName = isHe
          ? DAY_NAMES_HE[first.dayOfWeek] ?? first.dayOfWeek
          : DAY_NAMES_EN[first.dayOfWeek] ?? first.dayOfWeek;
        // Wrap the time range in a bidi isolate so it never reverses in RTL.
        const label = `${dayName} ⁦${first.startTime}–${first.endTime}⁩`;

        // A group CLASHES if any of its sessions overlaps a session already
        // fixed on the grid (other courses + this course's other types).
        const groupInfo = toSessionInfo(course.code, courseName, groupSessions);
        const clashes = detectTimeConflicts(otherSessions, groupInfo).length > 0;

        options.push({
          groupCode,
          sessions: groupSessions,
          label,
          lecturer: first.lecturerName,
          clashes,
        });
      }
      options.sort((a, b) => a.groupCode.localeCompare(b.groupCode));
      out.set(sessionType, options);
    }
    return out;
  }, [selectableTypes, otherSessions, course.code, courseName, isHe]);

  // No multi-group session types — render the trigger inert (no popover).
  if (optionsByType.size === 0) return <>{children}</>;

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="center"
        className="w-64 space-y-3 p-3"
        dir={isHe ? "rtl" : "ltr"}
      >
        <div className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 shrink-0 text-foreground/40" />
          <p className="truncate text-xs font-semibold text-foreground/80">
            {courseName}
          </p>
        </div>

        {Array.from(optionsByType.entries()).map(([sessionType, options]) => {
          const typeLabel = SESSION_TYPE_LABELS[sessionType];
          const typeName = isHe
            ? typeLabel?.he ?? sessionType
            : typeLabel?.en ?? sessionType;
          const current = selectedGroups[sessionType] ?? options[0]?.groupCode;

          return (
            <div key={sessionType} className="space-y-1.5">
              <p className="text-[11px] font-medium text-foreground/50">
                {isHe ? `בחרו קבוצת ${typeName}` : `Choose ${typeName} group`}
              </p>
              <div className="flex flex-col gap-1">
                {options.map((opt) => {
                  const isSelected = opt.groupCode === current;
                  return (
                    <button
                      key={opt.groupCode}
                      type="button"
                      onClick={() =>
                        onPickGroup(course.code, sessionType, opt.groupCode)
                      }
                      aria-pressed={isSelected}
                      className={cn(
                        "flex min-h-[44px] items-center gap-2 rounded-lg border px-2.5 py-1.5 text-start text-[11px] transition-all",
                        isSelected
                          ? "border-accent-brand/40 bg-accent-brand/[0.08] text-accent-brand"
                          : opt.clashes
                            ? "border-red-400/40 bg-red-400/[0.06] text-foreground/60"
                            : "border-transparent bg-foreground/[0.04] text-foreground/55 hover:bg-foreground/[0.07]",
                      )}
                    >
                      {isSelected ? (
                        <Check className="h-3 w-3 shrink-0" />
                      ) : opt.clashes ? (
                        <AlertTriangle className="h-3 w-3 shrink-0 text-red-400" />
                      ) : (
                        <Clock className="h-3 w-3 shrink-0 text-foreground/30" />
                      )}
                      <span className="flex-1 truncate">
                        <span className="font-medium">
                          {isHe ? "קבוצה " : "Grp "}
                          <Bidi text={opt.groupCode} />
                        </span>
                        {" · "}
                        <Bidi text={opt.label} />
                        {opt.lecturer && (
                          <span className="text-foreground/30">
                            {" · "}
                            {opt.lecturer}
                          </span>
                        )}
                      </span>
                      {opt.clashes && !isSelected && (
                        <span className="shrink-0 text-[10px] font-medium text-red-400">
                          {isHe ? "חפיפה" : "clash"}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        <p className="text-[10px] leading-tight text-foreground/35">
          {isHe
            ? "קבוצה מסומנת באדום חופפת לשיעור אחר שכבר בחרתם"
            : "A red group clashes with another session you already picked"}
        </p>
      </PopoverContent>
    </Popover>
  );
}
