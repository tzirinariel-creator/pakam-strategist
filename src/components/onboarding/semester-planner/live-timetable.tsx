"use client";

import { useMemo, useState, useRef, useCallback, useLayoutEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { CalendarX2 } from "lucide-react";
import { WeeklyTimetable, type ScheduleSessionData } from "@/components/calendar/weekly-timetable";
import { GroupPickerPopover } from "@/components/planner/group-picker-popover";
import { type SessionInfo } from "@/lib/conflict-detector";
import { defaultedSessionTypes } from "@/lib/session-groups";
import { Bidi } from "@/lib/bidi";
import { filterSessionsBySelectedGroups } from "./session-group-selector";
import type { CourseWithSchedule } from "@/lib/plan-generator";
import type { DayOfWeek } from "@/types/enums";

// Map of courseCode → { sessionType → groupCode }
export type SessionGroupSelections = Record<string, Record<string, string>>;

/** P1′ — one-time "you can swap groups on the grid" hint (pk-grid-pick-hint). */
function GridPickHint({ isHe }: { isHe: boolean }) {
  const [show, setShow] = useState(false);
  useLayoutEffect(() => {
    try {
      setShow(localStorage.getItem("pk-grid-pick-hint") !== "done");
    } catch {
      /* storage blocked — keep hidden */
    }
    // A real on-grid pick also dismisses the hint immediately (first interaction).
    const onPicked = () => setShow(false);
    window.addEventListener("pk-grid-picked", onPicked);
    return () => window.removeEventListener("pk-grid-picked", onPicked);
  }, []);
  if (!show) return null;
  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem("pk-grid-pick-hint", "done");
    } catch {
      /* ignore */
    }
  };
  return (
    <button
      type="button"
      onClick={dismiss}
      className="flex w-full items-center gap-2 rounded-lg border border-accent-brand/30 bg-accent-brand/[0.06] px-3 py-2 text-start text-xs text-foreground/70 transition-colors hover:bg-accent-brand/10"
    >
      <span aria-hidden className="shrink-0 rounded-md bg-accent-brand/15 px-1.5 py-0.5 font-semibold text-accent-brand">
        {isHe ? "יש כמה קבוצות" : "Several groups"}
      </span>
      <span className="min-w-0 flex-1">
        {isHe
          ? "לקורסים עם התג הזה יש כמה קבוצות — הקישו על הבלוק בגריד כדי להחליף שעה."
          : "Courses with this tag offer several groups — tap the block on the grid to swap the time."}
      </span>
      <span className="shrink-0 text-foreground/60">{isHe ? "הבנתי" : "Got it"}</span>
    </button>
  );
}

interface LiveTimetableProps {
  courses: CourseWithSchedule[];
  currentSemester: "FALL" | "SPRING";
  sessionGroupSelections?: SessionGroupSelections;
  /** Hovered (not yet selected) session group — rendered as dashed preview
   *  blocks so the choice is VISIBLE before it's made (#2). */
  groupPreview?: { courseCode: string; sessionType: string; groupCode: string } | null;
  /** Hovered (not yet selected) COURSE from the pool — its sessions ghost on
   *  the grid before the click, so choosing happens ON the schedule (#2
   *  follow-up: "למה שזה לא יהיה לוז"). One group per session type (the
   *  first), so a 4-group course previews as one clean placement. */
  coursePreview?: CourseWithSchedule | null;
  /** On-grid group picking (#2). When true, blocks for a course in
   *  `multiGroupCourseCodes` get a tap affordance that opens a group picker
   *  anchored to the grid. When absent, the timetable stays purely read-only
   *  (byte-identical to the calendar view). */
  interactive?: boolean;
  /** Course codes that offer a real group CHOICE — only these get the tap
   *  affordance and picker. */
  multiGroupCourseCodes?: Set<string>;
  /** Persists a group pick. Same signature as the sidebar selector, so both
   *  paths write to the exact same state. */
  onSelectSessionGroup?: (courseCode: string, sessionType: string, groupCode: string) => void;
  /**
   * לחיצה על בלוק בלוח מבקשת מההורה להראות את אפשרויות הקבוצה של הקורס
   * **בפאנל הקבוע בצד**, במקום להקפיץ חלון מעל הלוח.
   *
   * אריאל, 3.9, מול ביד-איט: *"שהבחירה בין קבוצות נורא נוחה ומובנת מאליה
   * וזה לא קופץ כזה."* חלון צף מעל לוח שעות מכסה בדיוק את הדבר שהסטודנט
   * מנסה לראות — איך השבוע ייראה עם הקבוצה הזאת. פאנל בצד לא מכסה כלום.
   * כשה-callback קיים, ה-popover אינו נטען בכלל.
   */
  onRequestGroupChoice?: (courseCode: string) => void;
}

/**
 * Thin adapter: transforms CourseWithSchedule[] into ScheduleSessionData[]
 * filtered by selected session groups, then passes them to the existing WeeklyTimetable.
 * Zero API calls — pure client-side mapping.
 */
export function LiveTimetable({
  courses,
  currentSemester,
  sessionGroupSelections,
  groupPreview,
  coursePreview,
  interactive,
  multiGroupCourseCodes,
  onSelectSessionGroup,
  onRequestGroupChoice,
}: LiveTimetableProps) {
  const t = useTranslations("onboarding");
  const locale = useLocale();
  const isHe = locale === "he";

  // On-grid picker: which course's picker to render, plus a monotonic nonce.
  // Tapping the "החלף קבוצה" affordance on a block bumps the nonce and sets the
  // courseCode; the GroupPickerPopover is keyed by both, so every tap remounts a
  // fresh instance whose hidden trigger auto-clicks open — even re-tapping the
  // same course after an outside-click close. Only meaningful when `interactive`.
  // `top`/`left` place the hidden trigger over the button that was actually
  // tapped: anchoring at the wrapper's centre put the picker hundreds of pixels
  // below the fold in the tall agenda variant.
  const [picker, setPicker] = useState<{
    courseCode: string;
    nonce: number;
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const pickerCourseCode = picker?.courseCode ?? null;
  // Hidden trigger for the currently-mounted picker; clicked on mount to open.
  const pickerTriggerRef = useRef<HTMLButtonElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (picker) pickerTriggerRef.current?.click();
  }, [picker]);

  // The tapped block's FULL BOX, in the (position: relative) wrapper's own
  // coordinates.
  //
  // 14.8 — Ariel: "החלונות של הקבוצות מופיעים מעל ומעצבן כזה". This used to
  // return the block's CENTRE POINT, and the hidden trigger was `size-0`. A
  // zero-area anchor gives Radix nothing to avoid: "below the anchor" means
  // "below the middle of the block", so the picker opened straight over the
  // lower half of the very block you tapped — and when it flipped for room, it
  // covered the upper half instead. There was no placement that didn't hide
  // the thing being changed.
  //
  // Handing over the real rect lets collision handling do its job: the picker
  // sits BESIDE or BELOW the block, and flips only when it genuinely must.
  const anchorPoint = useCallback((anchor: HTMLElement | undefined) => {
    const wrapper = wrapperRef.current;
    if (!wrapper || !anchor) return null;
    const w = wrapper.getBoundingClientRect();
    const a = anchor.getBoundingClientRect();
    return {
      top: a.top - w.top,
      left: a.left - w.left,
      width: a.width,
      height: a.height,
    };
  }, []);

  const { sessions, coursesWithoutSchedule } = useMemo(() => {
    const result: ScheduleSessionData[] = [];
    const missing: string[] = [];

    for (const course of courses) {
      if (!course.scheduleSessions || course.scheduleSessions.length === 0) {
        missing.push(isHe ? course.nameHe : (course.nameEn ?? course.nameHe));
        continue;
      }

      // A course offered in both semesters carries sessions for each. Keep only
      // the ones that run in the semester being viewed — otherwise SPRING blocks
      // land on the FALL grid and the app invents time conflicts that don't
      // exist. Sessions without a semester tag (rare, e.g. custom courses) are
      // kept rather than hidden.
      const semesterSessions = course.scheduleSessions.filter(
        (s) => !s.semester || s.semester === currentSemester
      );

      // Filter sessions based on user's group selection for this course
      const courseGroupSelections = sessionGroupSelections?.[course.code] ?? {};
      const filteredSessions = filterSessionsBySelectedGroups(
        semesterSessions,
        courseGroupSelections
      );

      for (const [i, session] of filteredSessions.entries()) {
        result.push({
          // sessionType + index: a lecture and a tutorial of the same course
          // can start at the same hour on the same day under the same group
          // code, and the old key collided ("two children with the same key",
          // console 13.8) — React then dropped one of the two blocks.
          id: `${course.id}-${session.dayOfWeek}-${session.startTime}-${session.sessionType}-${session.groupCode ?? ""}-${i}`,
          courseCode: course.code,
          dayOfWeek: session.dayOfWeek as DayOfWeek,
          startTime: session.startTime,
          endTime: session.endTime,
          room: session.room ?? null,
          building: session.building ?? null,
          sessionType: session.sessionType,
          // Carried so the grid's detail card can name the group and the
          // lecturer — the part of the real תשפ״ז ידיעון no competitor holds.
          groupCode: session.groupCode ?? null,
          lecturerName: session.lecturerName ?? null,
          course: {
            code: course.code,
            nameHe: course.nameHe,
            nameEn: course.nameEn,
            discipline: course.discipline,
            credits: course.credits,
          },
        });
      }
    }

    return { sessions: result, coursesWithoutSchedule: missing };
  }, [courses, isHe, currentSemester, sessionGroupSelections]);

  // Which blocks on this grid are OUR default rather than the student's pick.
  // `courseCode|sessionType` (lowercased), the key the grid marks dashed. This
  // is the only place in the planner that ever knew the difference, and it kept
  // it to itself: the block said "תרגול · קבוצה 03" as settled fact.
  const defaultedGroupKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const course of courses) {
      const semesterSessions = (course.scheduleSessions ?? []).filter(
        (s) => !s.semester || s.semester === currentSemester,
      );
      for (const type of defaultedSessionTypes(
        semesterSessions,
        sessionGroupSelections?.[course.code],
      )) {
        keys.add(`${course.code}|${type}`);
      }
    }
    return keys;
  }, [courses, currentSemester, sessionGroupSelections]);

  // Dashed preview blocks for the HOVERED group (#2) — only when it differs
  // from the currently-selected one (previewing the selected group adds noise).
  const previewSessions = useMemo(() => {
    if (!groupPreview) return [];
    const course = courses.find((c) => c.code === groupPreview.courseCode);
    if (!course?.scheduleSessions) return [];
    const selected =
      sessionGroupSelections?.[groupPreview.courseCode]?.[groupPreview.sessionType.toLowerCase()] ??
      sessionGroupSelections?.[groupPreview.courseCode]?.[groupPreview.sessionType];
    if (selected === groupPreview.groupCode) return [];
    const out: ScheduleSessionData[] = [];
    for (const session of course.scheduleSessions) {
      if (session.semester && session.semester !== currentSemester) continue;
      if ((session.sessionType ?? "") !== groupPreview.sessionType) continue;
      if ((session.groupCode ?? "") !== groupPreview.groupCode) continue;
      out.push({
        id: `${course.id}-${session.dayOfWeek}-${session.startTime}-${session.groupCode ?? ""}-preview`,
        courseCode: course.code,
        dayOfWeek: session.dayOfWeek as DayOfWeek,
        startTime: session.startTime,
        endTime: session.endTime,
        room: session.room ?? null,
        building: session.building ?? null,
        sessionType: session.sessionType,
        course: {
          code: course.code,
          nameHe: course.nameHe,
          nameEn: course.nameEn,
          discipline: course.discipline,
          credits: course.credits,
        },
      });
    }
    return out;
  }, [groupPreview, courses, currentSemester, sessionGroupSelections]);

  // Ghost blocks for the HOVERED pool course (#2 follow-up) — dashed preview
  // of where it would land, before the click. One group per session type so
  // multi-group courses don't smear across the grid.
  const coursePreviewSessions = useMemo(() => {
    if (!coursePreview?.scheduleSessions) return [];
    const semesterSessions = coursePreview.scheduleSessions.filter(
      (s) => !s.semester || s.semester === currentSemester,
    );
    const firstGroupByType = new Map<string, string>();
    for (const sess of semesterSessions) {
      const type = sess.sessionType ?? "";
      const g = sess.groupCode ?? "";
      const cur = firstGroupByType.get(type);
      if (cur === undefined || g < cur) firstGroupByType.set(type, g);
    }
    const out: ScheduleSessionData[] = [];
    for (const sess of semesterSessions) {
      if ((sess.groupCode ?? "") !== firstGroupByType.get(sess.sessionType ?? "")) continue;
      out.push({
        id: `${coursePreview.id}-${sess.dayOfWeek}-${sess.startTime}-${sess.sessionType}-${sess.groupCode ?? ""}-hoverpreview`,
        courseCode: coursePreview.code,
        dayOfWeek: sess.dayOfWeek as DayOfWeek,
        startTime: sess.startTime,
        endTime: sess.endTime,
        room: sess.room ?? null,
        building: sess.building ?? null,
        sessionType: sess.sessionType,
        course: {
          code: coursePreview.code,
          nameHe: coursePreview.nameHe,
          nameEn: coursePreview.nameEn,
          discipline: coursePreview.discipline,
          credits: coursePreview.credits,
        },
      });
    }
    return out;
  }, [coursePreview, currentSemester]);

  // ─── On-grid group picker (#2) ──────────────────────────────────────
  // The course whose picker is currently open.
  const pickerCourse = useMemo(
    () =>
      pickerCourseCode
        ? courses.find((c) => c.code === pickerCourseCode) ?? null
        : null,
    [pickerCourseCode, courses]
  );

  // Every session already fixed on the grid for OTHER courses — passed to the
  // picker so it can pre-flag which candidate group would clash. Built from the
  // same semester-filtered + group-selected `sessions` that the grid shows, so
  // what's flagged matches what's visible. Sessions of the open course itself
  // are excluded (its own lecture+tutorial aren't a clash with each other, and
  // the picker adds this course's OTHER-type sessions internally).
  const otherSessions = useMemo<SessionInfo[]>(() => {
    if (!pickerCourse) return [];
    return sessions
      .filter((s) => s.courseCode !== pickerCourse.code)
      .map((s) => ({
        id: s.id,
        courseCode: s.courseCode,
        courseName: isHe ? s.course.nameHe : (s.course.nameEn ?? s.course.nameHe),
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
        sessionType: s.sessionType,
      }));
  }, [pickerCourse, sessions, isHe]);

  // All courses exist but none have schedule sessions
  if (sessions.length === 0 && courses.length > 0) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border/30 py-6 text-center">
        <CalendarX2 className="h-4 w-4 text-foreground/20" />
        <p className="text-xs text-foreground/60">
          {t("coursesWithoutSchedule", { count: courses.length })}
        </p>
      </div>
    );
  }

  if (sessions.length === 0) {
    return null;
  }

  // Interactive picking is armed only when the caller both flips `interactive`
  // and hands us a persist handler. The read-only calendar/planner-sidebar path
  // supplies neither, so this stays false there and the render below is
  // byte-identical to before (no `relative`, no picker, plain WeeklyTimetable).
  const pickingEnabled = !!interactive && !!onSelectSessionGroup;

  return (
    <div ref={wrapperRef} className={pickingEnabled ? "relative space-y-2" : "space-y-2"}>
      {/* P1′ (note 2) — one-time discoverability hint: the on-grid group swap
          exists but nobody found it. Shown above the grid on the first editor
          visit when at least one course offers a choice; a click on the hint
          (or any group pick) dismisses it for good (pk-grid-pick-hint). */}
      {pickingEnabled && (multiGroupCourseCodes?.size ?? 0) > 0 && <GridPickHint isHe={isHe} />}

      {/* The one honest line about this week, counted from the student's own
          picks: how much of what they're looking at is still our guess. The app
          already spoke this way on /calendar ("יש קורסים שעוד לא בחרתם בהם
          קבוצה") — the planner, where the choosing actually happens, said
          nothing at all. */}
      {defaultedGroupKeys.size > 0 && (
        <p className="rounded-lg border border-dashed border-amber-500/45 bg-amber-500/[0.06] px-3 py-2 text-[11px] leading-relaxed text-status-amber">
          {isHe ? (
            <>
              {defaultedGroupKeys.size === 1 ? (
                "קבוצה אחת עדיין בברירת מחדל"
              ) : (
                <><Bidi text={defaultedGroupKeys.size} /> קבוצות עדיין בברירת מחדל</>
              )}
              {" — הבלוקים המקווקווים. בחרו כדי לנעול את השבוע."}
            </>
          ) : (
            `${defaultedGroupKeys.size} group${defaultedGroupKeys.size === 1 ? "" : "s"} still on our default — the dashed blocks. Choose to lock your week.`
          )}
        </p>
      )}

      <WeeklyTimetable
        preferGrid
        sessions={sessions}
        previewSessions={[...previewSessions, ...coursePreviewSessions]}
        interactive={pickingEnabled || undefined}
        multiGroupCourseCodes={pickingEnabled ? multiGroupCourseCodes : undefined}
        defaultedGroupKeys={defaultedGroupKeys}
        onPickGroup={
          pickingEnabled
            ? (courseCode, anchor) => {
                if (onRequestGroupChoice) {
                  // הפאנל בצד. הלוח נשאר גלוי, וזה כל העניין.
                  onRequestGroupChoice(courseCode);
                } else {
                  const point = anchorPoint(anchor);
                  setPicker((prev) => ({
                    courseCode,
                    nonce: (prev?.nonce ?? 0) + 1,
                    top: point?.top ?? 0,
                    left: point?.left ?? 0,
                    width: point?.width ?? 0,
                    height: point?.height ?? 0,
                  }));
                }
                // First real interaction retires the P1′ hint permanently.
                try {
                  localStorage.setItem("pk-grid-pick-hint", "done");
                } catch {
                  /* ignore */
                }
                window.dispatchEvent(new Event("pk-grid-picked"));
              }
            : undefined
        }
      />

      {/* On-grid group picker (#2) — reuses the shared GroupPickerPopover so the
          clash pre-flagging + option layout stay identical to the sidebar. It's
          keyed by course+nonce so each tap remounts and auto-opens via the
          hidden trigger. Anchored to a centred point over the grid. Only rendered
          in interactive mode with a persist handler, so the read-only calendar
          path never mounts any of this. */}
      {interactive && !onRequestGroupChoice && onSelectSessionGroup && pickerCourse && (
        <GroupPickerPopover
          key={`${picker!.courseCode}-${picker!.nonce}`}
          course={pickerCourse}
          selectedGroups={sessionGroupSelections?.[pickerCourse.code] ?? {}}
          otherSessions={otherSessions}
          onPickGroup={onSelectSessionGroup}
          currentSemester={currentSemester}
        >
          <button
            ref={pickerTriggerRef}
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            className="pointer-events-none absolute opacity-0"
            style={{
              top: `${picker!.top}px`,
              left: `${picker!.left}px`,
              width: `${picker!.width}px`,
              height: `${picker!.height}px`,
            }}
          />
        </GroupPickerPopover>
      )}
      {/* Warning for courses that couldn't be shown on the timetable */}
      {coursesWithoutSchedule.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-dashed border-amber-500/20 bg-amber-500/5 px-3 py-2">
          <CalendarX2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-amber/60" />
          <div className="text-xs leading-relaxed text-status-amber/70">
            <span className="font-medium">
              {t("coursesWithoutSchedule", { count: coursesWithoutSchedule.length })}
            </span>
            <span className="text-foreground/60">
              {" — "}{coursesWithoutSchedule.join(", ")}
            </span>
            <p className="mt-0.5 text-foreground/60">
              {t("coursesWithoutScheduleExplain")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
