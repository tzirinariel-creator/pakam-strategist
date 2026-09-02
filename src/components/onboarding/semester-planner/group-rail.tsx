"use client";

// =========================================================================
// The group rail — choosing a group, beside the week it changes
// =========================================================================
// Ariel, after using the planner as a student: "היה לי קצת קשה לבחור קבוצה וזה
// קצת בילבל אותי ולא היה לי אינטואיטיבי להבין איך אני בדיוק בוחר."
//
// The measurement behind this component: the old group chips lived inside
// "הסמסטר שלי", whose top edge sits about 1350px below the top of the planner,
// inside a 380px-tall scroll box, under a ~700px grid. A 1280×800 laptop shows
// ~736px at a time — so the student could not see the timetable change when
// they picked. Cause and effect were two screen-heights apart. The distance was
// vertical, not horizontal: the chips were already in the same column as the
// grid.
//
// So the choice moves opposite the grid, sticky, with its own scroll: pick on
// the left, watch the week redraw on the right, without moving the page.
//
// Each row is the shared `GroupRow` — every meeting with day/hours/room, all
// lecturers, the free/clash pill and the one-line impact sentence — so this
// rail and the on-grid popover describe a group identically. And a group we
// defaulted to is drawn dashed and labelled "ברירת מחדל": never a ✓.
//
// No hover anywhere in here. The chips it replaces fired their preview on
// mouseenter/focus, and on a trackpad tap focus and click land in the same
// instant — so the "preview before you commit" affordance previewed and
// committed at once.

import { useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { CheckCircle2, ChevronDown, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Bidi } from "@/lib/bidi";
import { GroupRow } from "@/components/planner/group-row";
import { type SessionInfo } from "@/lib/conflict-detector";
import {
  buildGroupChoices,
  dayNameFor,
  isGroupChosen,
  resolveSelectedGroup,
  sessionTypeNameFor,
  type GroupChoice,
} from "@/lib/group-options";
import type { CourseWithSchedule } from "@/lib/plan-generator";
import type { DayOfWeek } from "@/types/enums";
import type { SessionGroupSelections } from "./live-timetable";

interface GroupRailProps {
  /** Every course in the semester, with their FULL session lists (all groups) —
   *  the alternatives are the whole point here. */
  courses: CourseWithSchedule[];
  /** The same courses narrowed to what is actually ON the grid, used to flag
   *  which candidate groups would clash with the rest of the week. */
  gridCourses: CourseWithSchedule[];
  currentSemester: "FALL" | "SPRING";
  sessionGroupSelections: SessionGroupSelections;
  onSelectSessionGroup: (courseCode: string, sessionType: string, groupCode: string) => void;
}

interface CourseChoices {
  course: CourseWithSchedule;
  choices: GroupChoice[];
  /** How many of this course's session types are still on our default. */
  unchosen: number;
}

/** "שני 12:00–14:00" for the collapsed summary of a settled choice. */
function describeCurrent(choice: GroupChoice, groupCode: string, isHe: boolean): string {
  const option = choice.options.find((o) => o.groupCode === groupCode);
  if (!option || option.meetings.length === 0) return "";
  return option.meetings
    .map((m) => `${dayNameFor(m.dayOfWeek, isHe)} ${m.startTime}–${m.endTime}`)
    .join(" · ");
}

export function GroupRail({
  courses,
  gridCourses,
  currentSemester,
  sessionGroupSelections,
  onSelectSessionGroup,
}: GroupRailProps) {
  const isHe = useLocale() === "he";

  // Sessions already fixed on the grid, per course — the clash baseline. Built
  // from the grid courses so what's flagged matches what's drawn.
  const gridSessionsByCode = useMemo(() => {
    const map = new Map<string, SessionInfo[]>();
    for (const c of gridCourses) {
      const name = isHe ? c.nameHe : (c.nameEn ?? c.nameHe);
      map.set(
        c.code,
        (c.scheduleSessions ?? [])
          .filter((s) => !s.semester || s.semester === currentSemester)
          .map((s, i) => ({
            id: `${c.code}-${i}`,
            courseCode: c.code,
            courseName: name,
            dayOfWeek: s.dayOfWeek as DayOfWeek,
            startTime: s.startTime,
            endTime: s.endTime,
            sessionType: s.sessionType,
          })),
      );
    }
    return map;
  }, [gridCourses, currentSemester, isHe]);

  const perCourse = useMemo<CourseChoices[]>(() => {
    const out: CourseChoices[] = [];
    for (const course of courses) {
      const selected = sessionGroupSelections[course.code] ?? {};
      const otherSessions: SessionInfo[] = [];
      for (const [code, sessions] of gridSessionsByCode) {
        if (code === course.code) continue;
        otherSessions.push(...sessions);
      }
      const choices = buildGroupChoices({
        sessions: course.scheduleSessions ?? [],
        courseName: isHe ? course.nameHe : (course.nameEn ?? course.nameHe),
        otherSessions,
        semester: currentSemester,
        selectedGroups: selected,
      });
      if (choices.length === 0) continue;
      out.push({
        course,
        choices,
        unchosen: choices.filter((c) => !isGroupChosen(c, selected)).length,
      });
    }
    // Whatever still needs a decision comes first.
    return out.sort((a, b) => b.unchosen - a.unchosen);
  }, [courses, gridSessionsByCode, sessionGroupSelections, currentSemester, isHe]);

  // A course card is open while anything in it is undecided; once settled it
  // collapses to its summary and can be reopened. Explicit toggles win.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const toggle = (code: string, isOpen: boolean) =>
    setOverrides((prev) => ({ ...prev, [code]: !isOpen }));

  if (perCourse.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
        <Users className="size-6 text-foreground/15" />
        <p className="text-xs leading-relaxed text-foreground/60">
          {isHe
            ? "לאף קורס בסמסטר הזה אין כמה קבוצות — אין כאן מה לבחור, והמערכת שלכם סופית."
            : "No course this semester offers a second group — nothing to choose, your week is settled."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {perCourse.map(({ course, choices, unchosen }) => {
        const courseName = isHe ? course.nameHe : (course.nameEn ?? course.nameHe);
        const selected = sessionGroupSelections[course.code] ?? {};
        const isOpen = overrides[course.code] ?? unchosen > 0;

        return (
          <div
            key={course.code}
            className={cn(
              "rounded-xl border bg-card/30",
              unchosen > 0 ? "border-amber-500/40" : "border-border/50",
            )}
          >
            <button
              type="button"
              onClick={() => toggle(course.code, isOpen)}
              aria-expanded={isOpen}
              className="flex min-h-[44px] w-full items-center gap-2 px-3 py-2.5 text-start"
            >
              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground/85">
                {courseName}
              </span>
              {unchosen > 0 ? (
                <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-status-amber">
                  {isHe ? "ברירת מחדל" : "our default"}
                </span>
              ) : (
                <CheckCircle2 className="size-3.5 shrink-0 text-accent-brand" />
              )}
              <ChevronDown
                aria-hidden
                className={cn(
                  "size-3.5 shrink-0 text-foreground/60 transition-transform",
                  isOpen && "rotate-180",
                )}
              />
            </button>

            {!isOpen && (
              <div className="space-y-0.5 px-3 pb-2.5">
                {choices.map((choice) => {
                  const current = resolveSelectedGroup(choice, selected);
                  return (
                    <p key={choice.sessionType} className="truncate text-[11px] text-foreground/60">
                      {sessionTypeNameFor(choice.sessionType, isHe)}
                      {" · "}
                      {isHe ? "קבוצה " : "group "}
                      <Bidi text={current} />
                      {" · "}
                      <Bidi text={describeCurrent(choice, current, isHe)} />
                    </p>
                  );
                })}
              </div>
            )}

            {isOpen && (
              <div className="space-y-3 px-3 pb-3">
                {choices.map((choice) => {
                  const current = resolveSelectedGroup(choice, selected);
                  const chosen = isGroupChosen(choice, selected);
                  return (
                    <div key={choice.sessionType} className="space-y-1.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-[11px] font-medium text-foreground/60">
                          {isHe
                            ? `בחרו קבוצת ${sessionTypeNameFor(choice.sessionType, isHe)}`
                            : `Choose a ${sessionTypeNameFor(choice.sessionType, isHe)} group`}
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
                            ? "עוד לא בחרתם — המקווקוות היא מה שמוצג בינתיים על המערכת."
                            : "You haven't chosen yet — the dashed one is what's on the grid meanwhile."}
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
                              onSelectSessionGroup(course.code, choice.sessionType, opt.groupCode)
                            }
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
