"use client";

import { useMemo } from "react";
import { useLocale } from "next-intl";
import { Clock, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ScheduleSessionLike } from "@/lib/plan-generator";

// ─── Types ───────────────────────────────────────────────────────────

interface SessionGroup {
  groupCode: string;
  sessionType: string;
  sessions: ScheduleSessionLike[];
  label: string; // e.g., "יום א׳ 10:00-12:00"
}

interface SessionGroupSelectorProps {
  courseCode: string;
  courseName: string;
  sessions: ScheduleSessionLike[];
  selectedGroups: Record<string, string>; // sessionType → groupCode
  onSelectGroup: (courseCode: string, sessionType: string, groupCode: string) => void;
  /** Hover/focus preview on the live timetable (#2). Null clears. */
  onPreviewGroup?: (p: { courseCode: string; sessionType: string; groupCode: string } | null) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────

const DAY_NAMES_HE: Record<string, string> = {
  SUNDAY: "ראשון",
  MONDAY: "שני",
  TUESDAY: "שלישי",
  WEDNESDAY: "רביעי",
  THURSDAY: "חמישי",
};

const DAY_NAMES_EN: Record<string, string> = {
  SUNDAY: "Sun",
  MONDAY: "Mon",
  TUESDAY: "Tue",
  WEDNESDAY: "Wed",
  THURSDAY: "Thu",
};

const SESSION_TYPE_LABELS: Record<string, { he: string; en: string }> = {
  lecture: { he: "הרצאה", en: "Lecture" },
  tutorial: { he: "תרגול", en: "Tutorial" },
  lab: { he: "מעבדה", en: "Lab" },
};

/**
 * Groups schedule sessions by sessionType, then by groupCode.
 * Sessions with groupCode "ALL" are shared across all groups and excluded
 * from group selection (they always apply).
 */
function buildSessionGroups(
  sessions: ScheduleSessionLike[],
  isHe: boolean
): { selectableGroups: Map<string, SessionGroup[]>; sharedSessions: ScheduleSessionLike[] } {
  const shared: ScheduleSessionLike[] = [];
  const byTypeAndGroup = new Map<string, Map<string, ScheduleSessionLike[]>>();

  for (const s of sessions) {
    const gc = s.groupCode ?? "A";
    // "ALL" sessions are always shown — they apply to all groups
    if (gc === "ALL") {
      shared.push(s);
      continue;
    }

    const type = s.sessionType;
    if (!byTypeAndGroup.has(type)) {
      byTypeAndGroup.set(type, new Map());
    }
    const typeMap = byTypeAndGroup.get(type)!;
    if (!typeMap.has(gc)) {
      typeMap.set(gc, []);
    }
    typeMap.get(gc)!.push(s);
  }

  // Build selectable groups: only for session types that have >1 group
  const selectableGroups = new Map<string, SessionGroup[]>();

  for (const [sessionType, groupMap] of byTypeAndGroup) {
    if (groupMap.size <= 1) continue; // Single group — no selection needed

    const groups: SessionGroup[] = [];
    for (const [groupCode, groupSessions] of groupMap) {
      // Build a human-readable label from the first session
      const first = groupSessions[0]!;
      const dayName = isHe ? DAY_NAMES_HE[first.dayOfWeek] : DAY_NAMES_EN[first.dayOfWeek];
      const room = first.room ? ` | ${first.building ?? ""}${first.room}` : "";
      const label = `${dayName} ${first.startTime}-${first.endTime}${room}`;

      groups.push({ groupCode, sessionType, sessions: groupSessions, label });
    }

    // Sort by groupCode alphabetically
    groups.sort((a, b) => a.groupCode.localeCompare(b.groupCode));
    selectableGroups.set(sessionType, groups);
  }

  return { selectableGroups, sharedSessions: shared };
}

/**
 * For a course, returns the filtered sessions based on selected groups.
 * - "ALL" sessions are always included
 * - For session types with multiple groups, only the selected group is included
 * - For session types with a single group, that group is included
 */
export function filterSessionsBySelectedGroups(
  sessions: ScheduleSessionLike[],
  selectedGroups: Record<string, string> // sessionType → groupCode
): ScheduleSessionLike[] {
  // Build quick lookup of which session types have multiple groups
  const groupsByType = new Map<string, Set<string>>();
  for (const s of sessions) {
    const gc = s.groupCode ?? "A";
    if (gc === "ALL") continue;
    if (!groupsByType.has(s.sessionType)) {
      groupsByType.set(s.sessionType, new Set());
    }
    groupsByType.get(s.sessionType)!.add(gc);
  }

  return sessions.filter((s) => {
    const gc = s.groupCode ?? "A";

    // "ALL" sessions always pass
    if (gc === "ALL") return true;

    const type = s.sessionType;
    const availableGroups = groupsByType.get(type);

    // Single group type — always include
    if (!availableGroups || availableGroups.size <= 1) return true;

    // Multiple groups — only include the selected one
    const selected = selectedGroups[type];
    if (!selected) {
      // No selection yet — include the first group alphabetically as default
      const sorted = Array.from(availableGroups).sort();
      return gc === sorted[0];
    }

    return gc === selected;
  });
}

// ─── Component ───────────────────────────────────────────────────────

export function SessionGroupSelector({
  courseCode,
  courseName,
  sessions,
  selectedGroups,
  onSelectGroup,
  onPreviewGroup,
}: SessionGroupSelectorProps) {
  const locale = useLocale();
  const isHe = locale === "he";

  const { selectableGroups } = useMemo(
    () => buildSessionGroups(sessions, isHe),
    [sessions, isHe]
  );

  // Nothing to select — course has no multi-group session types
  if (selectableGroups.size === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-foreground/50">
        {isHe
          ? "בחירת הקבוצה קובעת מתי הקורס יושב במערכת השעות"
          : "Your group choice sets where this course sits on the timetable"}
      </p>
      {Array.from(selectableGroups.entries()).map(([sessionType, groups]) => {
        const typeLabel = SESSION_TYPE_LABELS[sessionType];
        const typeName = isHe ? typeLabel?.he ?? sessionType : typeLabel?.en ?? sessionType;
        const currentSelection = selectedGroups[sessionType] ?? groups[0]?.groupCode;

        return (
          <div key={sessionType}>
            <div className="flex items-center gap-1.5 mb-1">
              <Users className="h-3 w-3 text-foreground/30" />
              <span className="text-[10px] font-medium text-foreground/40">
                {isHe ? `בחרו קבוצת ${typeName}` : `Choose ${typeName} group`}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {groups.map((group) => {
                const isSelected = group.groupCode === currentSelection;
                return (
                  <button
                    key={group.groupCode}
                    onClick={() => onSelectGroup(courseCode, sessionType, group.groupCode)}
                    onMouseEnter={() => onPreviewGroup?.({ courseCode, sessionType, groupCode: group.groupCode })}
                    onMouseLeave={() => onPreviewGroup?.(null)}
                    onFocus={() => onPreviewGroup?.({ courseCode, sessionType, groupCode: group.groupCode })}
                    onBlur={() => onPreviewGroup?.(null)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] transition-all",
                      isSelected
                        ? "border border-accent-brand/30 bg-accent-brand/[0.06] text-accent-brand shadow-sm"
                        : "bg-foreground/3 text-foreground/40 border border-transparent hover:bg-foreground/5 hover:text-foreground/50"
                    )}
                  >
                    <Clock className="h-2.5 w-2.5 shrink-0" />
                    <span>{group.label}</span>
                    {group.sessions[0]?.lecturerName && (
                      <span className="text-foreground/25">
                        ({group.sessions[0].lecturerName})
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Checks if a course has any session types with multiple groups.
 * Used to decide whether to show the group selector.
 */
export function courseHasMultipleGroups(sessions: ScheduleSessionLike[]): boolean {
  const groupsByType = new Map<string, Set<string>>();
  for (const s of sessions) {
    const gc = s.groupCode ?? "A";
    if (gc === "ALL") continue;
    if (!groupsByType.has(s.sessionType)) {
      groupsByType.set(s.sessionType, new Set());
    }
    groupsByType.get(s.sessionType)!.add(gc);
  }
  for (const groups of groupsByType.values()) {
    if (groups.size > 1) return true;
  }
  return false;
}
