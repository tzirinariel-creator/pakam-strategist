"use client";

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import { CalendarDays, Info, Download, Check, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SEMESTER_CONFIG, YEAR_CONFIG } from "@/lib/constants";
import { detectPlannerConflicts, coursesWithoutTimes } from "@/lib/planner-conflicts";
import { defaultedSessionTypes, hasGroupChoice } from "@/lib/session-groups";
import { filterSessionsBySelectedGroups } from "./session-group-selector";
import { findBestCombination, type ComboPreferences } from "@/lib/combo-finder";
import { isMandatoryHeavy } from "@/lib/semester-type";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
// Sheet imports removed — timetable now always visible below
import { ThemedLoader } from "@/components/ui/themed-loader";
import { downloadICS } from "@/lib/ics-export";
import type { CourseWithSchedule } from "@/lib/plan-generator";
import type { Discipline } from "@/types/enums";
import type { OnboardingData } from "../onboarding-wizard";
import { CoursePool } from "./course-pool";
import { MySemester } from "./my-semester";
import { GroupRail } from "./group-rail";
import { LiveTimetable, type SessionGroupSelections } from "./live-timetable";
import { InsightsBar } from "./insights-bar";
import { BiddingProximityNudge } from "./bidding-proximity-nudge";
import { EnglishStandingChip } from "./english-standing-chip";
import { PlannerAssistantCard } from "./planner-assistant-card";
import { englishPlannerSignal } from "@/lib/english-planner-signal";
import { DegreeInfoCard } from "./degree-info-card";
import { SemesterSummary } from "./semester-summary";
import { CustomCourseModal, type CustomCourseDraft } from "./custom-course-modal";
import { applyResolvedCustomIds } from "./custom-course-ids";
import { api } from "@/lib/trpc/react";
import { SemesterIntroCard } from "./semester-intro-card";
import { AnchoredTour, PLANNER_STEPS } from "../anchored-tour";
import { QuietBoundary } from "@/components/shared/query-error";
import { ExamGantt } from "./exam-gantt";
import { getAcademicNow } from "@/lib/academic-calendar";
import { heNoun } from "@/lib/he-count";

/** Seen-once flag for the in-place planner tour (#17). Cleared alongside the
 *  other first-run flags when onboarding completes, so a reset account gets it
 *  fresh (step-ready.tsx). */
const PLANNER_TOUR_KEY = "pakamon-planner-tour-done";

// ─── Types ───────────────────────────────────────────────────────────

export interface PlannedSemester {
  year: number;
  semester: "FALL" | "SPRING";
  courseIds: string[];
}

interface SemesterPlannerProps {
  data: OnboardingData;
  allCourses: CourseWithSchedule[];
  isLoadingCourses: boolean;
  /** Completed rows, so the planner can state the student's English standing. */
  completedRows?: { nameHe: string; courseCode?: string | null; grade: number | null; status?: string; credits?: number | null }[];
  /**
   * Receives the finished plan.
   *
   * `plannedSemesters` carries REAL catalog course ids only: a course the
   * student added by hand is registered with the server first (#8), so its
   * client-side `custom-…` id has already been swapped for the persistent one
   * by the time this fires — no caller ever has to drop it again.
   *
   * `disciplineOverrides` (courseId → discipline) is the student's own
   * attribution: a re-filed catalog course, or an off-catalog course they
   * declared approved for their degree. Callers that persist the plan must
   * pass it through to savePlan, or the declaration is lost on every re-save.
   */
  onFinish: (
    plannedSemesters: PlannedSemester[],
    sessionGroupSelections: SessionGroupSelections,
    disciplineOverrides: Record<string, string>,
    /** Off-catalog courses just registered, with their PERSISTENT ids. The
     *  public catalog cannot return them (isActive:false), so any caller that
     *  prices the plan needs them or it undercounts. */
    registeredCustomCourses?: { id: string; code: string; nameHe: string; credits: number }[],
  ) => void;
  /**
   * Course ids the student already COMPLETED elsewhere (the onboarding history
   * step, or a saved academic record). These are excluded from the editable
   * pool and counted toward the running degree-credit total, but are NOT part
   * of the planner's output — they're persisted separately as COMPLETED. Fixes
   * the mid-degree "only 21 ש״ס appeared / my history didn't reflect" bug (#18):
   * without this the planner ignores ~52 credits of completed year-1 history.
   */
  externalCompletedCourseIds?: string[];
  /**
   * An existing PLANNED plan to restore when editing post-onboarding. When
   * given, the planner re-hydrates its semesters so saving preserves the
   * semesters the student didn't touch this session (the standalone
   * /planner/semester page would otherwise wipe them). Omitted in onboarding,
   * where the planner starts fresh.
   */
  initialPlannedSemesters?: PlannedSemester[];
  /** Existing per-course session-group choices to restore, so re-saving an
   *  edited plan doesn't drop them. Keyed by course code. */
  initialSessionGroupSelections?: SessionGroupSelections;
  /** Discipline attributions already saved for this plan (courseId →
   *  discipline), so re-saving doesn't wipe a student's declaration (#8). */
  initialDisciplineOverrides?: Record<string, string>;
  /** True while the parent is persisting the plan — drives the finish button's
   *  "saving…" state (#18). Omitted in onboarding (finish just advances a step). */
  isSaving?: boolean;
  /** Called the first time the student changes anything this session. Lets the
   *  standalone /planner/semester page warn before a silent exit-without-saving
   *  (#18). Onboarding omits it — its own nav handles unsaved state. */
  onDirty?: () => void;
}

// ─── Component ───────────────────────────────────────────────────────

export function SemesterPlanner({
  data,
  allCourses,
  isLoadingCourses,
  completedRows,
  onFinish,
  externalCompletedCourseIds,
  initialPlannedSemesters,
  initialSessionGroupSelections,
  initialDisciplineOverrides,
  isSaving = false,
  onDirty,
}: SemesterPlannerProps) {
  const t = useTranslations("onboarding");
  const tCal = useTranslations("calendar");
  const locale = useLocale();
  const isHe = locale === "he";

  // The (year, semester) the student starts editing on — used to split a
  // restored plan into "current" vs "already-planned other" semesters.
  const initialCurrentKey = `${data.year}-${data.semester}`;

  // ─── State ─────────────────────────────────────────────────────────
  const [currentYear, setCurrentYear] = useState(data.year);
  const [currentSemester, setCurrentSemester] = useState<"FALL" | "SPRING">(data.semester);
  // #7 (12.7) — the app must KNOW the date: if the semester the student says
  // they're "in" has already finished teaching (e.g. registering on 12.7 and
  // picking סמסטר ב׳), say so honestly instead of silently planning a semester
  // that's over — and point at planning the next one right after.
  const acadNowInfo = getAcademicNow();
  const declaredSemesterOver =
    currentSemester === data.semester &&
    acadNowInfo.semester === data.semester &&
    acadNowInfo.phase !== "teaching" &&
    !acadNowInfo.isStale;
  // Restore the current semester's electives from an existing plan (standalone
  // edit); empty in onboarding. Mandatory ids are re-derived, so seeding with
  // the full course list is harmless (selectedElectives filters them out).
  const [selectedCourseIds, setSelectedCourseIds] = useState<Set<string>>(() => {
    const cur = (initialPlannedSemesters ?? []).find(
      (s) => `${s.year}-${s.semester}` === initialCurrentKey
    );
    return new Set(cur?.courseIds ?? []);
  });
  // Seed the "other planned semesters" from an existing plan so a save doesn't
  // drop the semesters the student isn't editing this session.
  const [completedSemesters, setCompletedSemesters] = useState<PlannedSemester[]>(
    () =>
      (initialPlannedSemesters ?? []).filter(
        (s) => `${s.year}-${s.semester}` !== initialCurrentKey
      )
  );
  // P4 (note 35) — summary preference. null = the student hasn't chosen yet;
  // then a mandatory-heavy semester (typical year 1) DEFAULTS to the ready
  // "recommended timetable + one confirm" screen, while an elective-heavy one
  // opens in building mode. Pure derivation (see showSummary below) — no
  // effect ever flips this, so the R3 sync-regression class can't reappear.
  const [summaryPref, setSummaryPref] = useState<boolean | null>(null);
  const setShowSummary = setSummaryPref;
  const [showDegreeModal, setShowDegreeModal] = useState(true);
  const [customCourses, setCustomCourses] = useState<CustomCourseDraft[]>([]);
  const [showCustomCourseModal, setShowCustomCourseModal] = useState(false);
  // Session group selections: courseCode → { sessionType → groupCode }
  const [sessionGroupSelections, setSessionGroupSelections] = useState<SessionGroupSelections>(
    initialSessionGroupSelections ?? {}
  );
  // Bottom panel tab: timetable or exam gantt
  const [bottomTab, setBottomTab] = useState<"timetable" | "exams">("timetable");
  // Rail tab: browse courses, or choose groups. null = the student hasn't
  // picked a tab, so we open on whichever is the real work right now (pure
  // derivation below — no effect ever writes this, so it can't desync).
  const [railTabPref, setRailTabPref] = useState<"courses" | "groups" | null>(null);
  // Discipline overrides: courseId → discipline key. Seeded from the SAVED plan
  // so an edit-and-resave can't wipe an attribution the student already made
  // (#8) — these are now persisted, not a local colouring trick.
  const [disciplineOverrides, setDisciplineOverrides] = useState<Record<string, string>>(
    () => ({ ...(initialDisciplineOverrides ?? {}) })
  );
  // #2 follow-up — the pool bubble currently hovered/focused; its sessions
  // ghost on the live grid so the pick happens ON the schedule.
  const [hoverPreviewId, setHoverPreviewId] = useState<string | null>(null);

  // #17 (13.8) — the planner tour, fired IN PLACE the first time a student
  // reaches this screen. Ariel: "יש סיור רק אחרי התכנון - אבל בשלב התכנון
  // אנשים לא מבינים מה הם עושים וזה שלב מורכב." The dashboard tour was gated
  // on already having a plan, so the hardest screen in the app was the one
  // screen with no guidance at all. Waits for the course data, because every
  // step points at an element that only exists once the pool has rendered.
  const [plannerTourOpen, setPlannerTourOpen] = useState(false);
  const plannerTourChecked = useRef(false);
  useEffect(() => {
    if (plannerTourChecked.current || isLoadingCourses) return;
    if (typeof window === "undefined") return;
    plannerTourChecked.current = true;
    try {
      if (localStorage.getItem(PLANNER_TOUR_KEY) === "true") return;
    } catch {
      return; // storage blocked — never risk a tour that cannot be dismissed
    }
    // One frame, so the pool/timetable are laid out before we measure targets.
    const id = requestAnimationFrame(() => setPlannerTourOpen(true));
    return () => cancelAnimationFrame(id);
  }, [isLoadingCourses]);
  const closePlannerTour = useCallback(() => {
    setPlannerTourOpen(false);
    try {
      localStorage.setItem(PLANNER_TOUR_KEY, "true");
    } catch { /* storage blocked — it simply shows again next time */ }
  }, []);

  // Undo/redo history for course selections
  const undoStack = useRef<Set<string>[]>([]);
  const redoStack = useRef<Set<string>[]>([]);

  const pushUndo = useCallback((prev: Set<string>) => {
    undoStack.current.push(new Set(prev));
    redoStack.current = []; // clear redo on new action
  }, []);

  // Flag the plan as "dirty" the moment the student changes anything, so the
  // standalone page can warn before a silent exit-without-saving (#18). Kept
  // ref-stable so adding it to handler deps never churns them. The ref is
  // synced in an effect (not during render) per the react-hooks/refs rule.
  const onDirtyRef = useRef(onDirty);
  useEffect(() => {
    onDirtyRef.current = onDirty;
  }, [onDirty]);
  const markDirty = useCallback(() => {
    onDirtyRef.current?.();
  }, []);

  const handleUndo = useCallback(() => {
    const last = undoStack.current.pop();
    if (last != null) {
      redoStack.current.push(new Set(selectedCourseIds));
      setSelectedCourseIds(last);
    }
  }, [selectedCourseIds]);

  const handleRedo = useCallback(() => {
    const next = redoStack.current.pop();
    if (next != null) {
      undoStack.current.push(new Set(selectedCourseIds));
      setSelectedCourseIds(next);
    }
  }, [selectedCourseIds]);

  // Keyboard shortcuts: Ctrl+Z / Cmd+Z for undo, Ctrl+Shift+Z / Cmd+Shift+Z for redo, Escape for modals
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      // Undo
      if (mod && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }

      // Redo
      if (mod && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        handleRedo();
        return;
      }

      // Escape — close modals
      if (e.key === "Escape") {
        setShowDegreeModal(false);
        setShowCustomCourseModal(false);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleUndo, handleRedo]);

  // Merge DB courses + custom courses into unified pool, apply discipline overrides
  const mergedCourses = useMemo(
    () => [...allCourses, ...customCourses].map((c) => {
      const override = disciplineOverrides[c.id];
      if (override && override !== c.discipline) {
        return { ...c, discipline: override as Discipline };
      }
      return c;
    }),
    [allCourses, customCourses, disciplineOverrides]
  );

  // The hovered pool course, resolved for the ghost preview — only while it's
  // still unselected (a selected course is already solid on the grid).
  const hoverPreviewCourse = useMemo(() => {
    if (!hoverPreviewId || selectedCourseIds.has(hoverPreviewId)) return null;
    return mergedCourses.find((c) => c.id === hoverPreviewId) ?? null;
  }, [hoverPreviewId, selectedCourseIds, mergedCourses]);

  // ─── Derived data ──────────────────────────────────────────────────

  // Courses the student already COMPLETED outside the planner (history step /
  // saved record). Excluded from the editable pool and counted toward the
  // running total, but never part of the planner's saved output.
  const externalCompletedSet = useMemo(
    () => new Set(externalCompletedCourseIds ?? []),
    [externalCompletedCourseIds]
  );

  // IDs of all courses already done — previously-planned semesters in this
  // session PLUS the external completed history. The mandatory pool, CoursePool
  // and credit totals all subtract this set, so a mid-degree student never gets
  // re-offered a course they already passed and their history credits show up.
  const completedCourseIds = useMemo(() => {
    const ids = new Set<string>(externalCompletedSet);
    for (const sem of completedSemesters) {
      for (const id of sem.courseIds) {
        ids.add(id);
      }
    }
    return ids;
  }, [completedSemesters, externalCompletedSet]);

  // Credits from everything already done (completed semesters + external
  // history). completedCourseIds is already de-duplicated, so this can't
  // double-count a course that appears in both sets.
  const completedCredits = useMemo(() => {
    const courseMap = new Map(mergedCourses.map((c) => [c.id, c]));
    let total = 0;
    for (const id of completedCourseIds) {
      total += courseMap.get(id)?.credits ?? 0;
    }
    return total;
  }, [completedCourseIds, mergedCourses]);

  // Mandatory courses for the current semester
  const mandatoryCourses = useMemo(() => {
    return mergedCourses.filter((c) => {
      if (completedCourseIds.has(c.id)) return false;
      if (!(c.courseType === "MANDATORY" || c.isMandatory)) return false;
      // Must be offered this year/semester
      if (c.yearOffered.length > 0 && !c.yearOffered.includes(currentYear)) return false;
      const offered = c.semesterOffered.map(String);
      if (offered.length > 0 && !offered.includes(currentSemester)) return false;
      return true;
    });
  }, [mergedCourses, currentYear, currentSemester, completedCourseIds]);

  const mandatoryIds = useMemo(
    () => new Set(mandatoryCourses.map((c) => c.id)),
    [mandatoryCourses]
  );

  // Full course objects for selected electives
  const selectedElectives = useMemo(() => {
    const courseMap = new Map(mergedCourses.map((c) => [c.id, c]));
    return Array.from(selectedCourseIds)
      .filter((id) => !mandatoryIds.has(id))
      .map((id) => courseMap.get(id))
      .filter((c): c is CourseWithSchedule => c != null);
  }, [selectedCourseIds, mandatoryIds, mergedCourses]);

  // All courses in current semester (mandatory + selected electives)
  const allCurrentCourses = useMemo(
    () => [...mandatoryCourses, ...selectedElectives],
    [mandatoryCourses, selectedElectives]
  );

  // Credits for current semester
  const currentSemesterCredits = useMemo(
    () => allCurrentCourses.reduce((s, c) => s + c.credits, 0),
    [allCurrentCourses]
  );

  // P4 (note 35): mandatory-heavy semester → the recommended timetable is
  // already assembled, so default to the confirm-first screen. The student's
  // own choice (summaryPref) always wins once made; loading shows the editor.
  const mandatoryHeavy = useMemo(
    () => isMandatoryHeavy(allCurrentCourses),
    [allCurrentCourses]
  );
  const showSummary = summaryPref ?? (!isLoadingCourses && mandatoryHeavy);

  // Course codes that offer a real group CHOICE (a session type with >1 group)
  // this semester — reuses the same detector the sidebar SessionGroupSelector
  // uses, so the on-grid picker and the sidebar stay in sync. Only these get the
  // tap affordance on the live timetable (#2).
  const multiGroupCourseCodes = useMemo(() => {
    const set = new Set<string>();
    for (const course of allCurrentCourses) {
      const sessions = (course.scheduleSessions ?? []).filter(
        (s) => !s.semester || s.semester === currentSemester
      );
      if (hasGroupChoice(sessions)) set.add(course.code);
    }
    return set;
  }, [allCurrentCourses, currentSemester]);

  // How many session types are still on the app's DEFAULT group — i.e. how much
  // of this week the student hasn't actually decided yet. Derived from
  // `sessionGroupSelections`, never from the catalog, so it falls to zero the
  // moment the last pick is made (the old count came from the catalog alone and
  // could never be satisfied: you could pick every group and still be told to
  // "בחרו את שלכם"). Also drives the CTA on the summary screen.
  const defaultedGroups = useMemo(() => {
    const out: { courseCode: string; sessionType: string }[] = [];
    for (const course of allCurrentCourses) {
      const sessions = (course.scheduleSessions ?? []).filter(
        (s) => !s.semester || s.semester === currentSemester
      );
      for (const type of defaultedSessionTypes(sessions, sessionGroupSelections[course.code])) {
        out.push({ courseCode: course.code, sessionType: type });
      }
    }
    return out;
  }, [allCurrentCourses, currentSemester, sessionGroupSelections]);
  const unchosenGroupCount = defaultedGroups.length;

  // Which side of the rail is showing. Pure derivation from the student's own
  // tab choice, else from the work that's actually left: a mandatory-heavy
  // semester with nothing to add (the year-1 path) opens on GROUPS, because
  // that is the only decision that student still has. No effect writes this.
  const railTab =
    railTabPref ??
    (mandatoryHeavy && selectedElectives.length === 0 && unchosenGroupCount > 0
      ? "groups"
      : "courses");

  // Total planned credits
  const totalCreditsPlanned = completedCredits + currentSemesterCredits;

  // The semester's courses with sessions narrowed to what's ACTUALLY on the
  // grid: this semester only + the selected group per session type. This is
  // the single source for conflicts, the insights bar and the summary (P3′) —
  // computing any of them over raw sessions overcounts hours and can invent
  // cross-semester conflicts for dual-offered courses (the live grid already
  // filters exactly like this for display).
  const groupFilteredCourses = useMemo(() => {
    return allCurrentCourses.map((course) => {
      if (!course.scheduleSessions) return course;
      const courseGroupSel = sessionGroupSelections[course.code] ?? {};
      const semesterSessions = course.scheduleSessions.filter(
        (s) => !s.semester || s.semester === currentSemester,
      );
      return {
        ...course,
        scheduleSessions: filterSessionsBySelectedGroups(semesterSessions, courseGroupSel),
      };
    });
  }, [allCurrentCourses, sessionGroupSelections, currentSemester]);

  // ONE conflict engine for the whole screen: the same deduped pairing the grid
  // paints red. The old `detectConflicts` skipped same-course pairs and never
  // deduped the catalog's duplicate rows, so the grid could name a clash while
  // the card above it said "0 התנגשויות" in green.
  const conflicts = useMemo(
    () => detectPlannerConflicts(groupFilteredCourses, isHe),
    [groupFilteredCourses, isHe],
  );

  /** Distinct weekdays the student has any session on — the "fewer days on
   *  campus" pitch has to be able to say what the current number IS. */
  const campusDayCount = useMemo(() => {
    const days = new Set<string>();
    for (const c of groupFilteredCourses) {
      for (const s of c.scheduleSessions ?? []) {
        if (s.dayOfWeek) days.add(s.dayOfWeek);
      }
    }
    return days.size;
  }, [groupFilteredCourses]);

  // Courses in this semester whose catalog rows carry no meeting times at all —
  // every statement about the week ("0 conflicts", weekly hours) is true only of
  // the courses we DO have times for, and says so.
  const unscheduledCount = useMemo(
    () => coursesWithoutTimes(allCurrentCourses),
    [allCurrentCourses],
  );


  // ─── Handlers ──────────────────────────────────────────────────────

  const handleToggleCourse = useCallback(
    (courseId: string) => {
      if (mandatoryIds.has(courseId)) return; // can't toggle mandatory
      markDirty();
      setSelectedCourseIds((prev) => {
        pushUndo(prev);
        const next = new Set(prev);
        if (next.has(courseId)) {
          next.delete(courseId);
        } else {
          next.add(courseId);
        }
        return next;
      });
    },
    [mandatoryIds, pushUndo, markDirty]
  );

  const handleRemoveCourse = useCallback(
    (courseId: string) => {
      if (mandatoryIds.has(courseId)) return;
      markDirty();
      setSelectedCourseIds((prev) => {
        pushUndo(prev);
        const next = new Set(prev);
        next.delete(courseId);
        return next;
      });
    },
    [mandatoryIds, pushUndo, markDirty]
  );

  const handleDoneSemester = useCallback(() => {
    setShowSummary(true);
  }, [setShowSummary]);

  const handleSwitchSemester = useCallback(
    (targetYear: number, targetSemester: "FALL" | "SPRING") => {
      // Don't switch to the same semester
      if (targetYear === currentYear && targetSemester === currentSemester) return;

      // Save current semester to completedSemesters if not already there and has courses
      const currentKey = `${currentYear}-${currentSemester}`;
      const currentCourseIds = [
        ...mandatoryIds,
        ...Array.from(selectedCourseIds).filter((id) => !mandatoryIds.has(id)),
      ];

      setCompletedSemesters((prev) => {
        // Remove target semester if it was previously completed (we're re-opening it)
        const targetKey = `${targetYear}-${targetSemester}`;
        const withoutTarget = prev.filter(
          (s) => `${s.year}-${s.semester}` !== targetKey
        );
        // Save current semester (replace if exists)
        const withoutCurrent = withoutTarget.filter(
          (s) => `${s.year}-${s.semester}` !== currentKey
        );
        return [
          ...withoutCurrent,
          { year: currentYear, semester: currentSemester, courseIds: currentCourseIds },
        ];
      });

      // Load previously planned courses for target semester (if any)
      const targetPlanned = completedSemesters.find(
        (s) => s.year === targetYear && s.semester === targetSemester
      );
      const restoredIds = targetPlanned
        ? new Set(targetPlanned.courseIds)
        : new Set<string>();

      setCurrentYear(targetYear);
      setCurrentSemester(targetSemester);
      setSelectedCourseIds(restoredIds);
      setShowSummary(false);
      undoStack.current = [];
      redoStack.current = [];
    },
    [currentYear, currentSemester, mandatoryIds, selectedCourseIds, completedSemesters, setShowSummary]
  );

  // Ariel, #23/#24: "לדעתי תכננתי את הקורסים וזה נמחק משום מה."
  //
  // This is where courses were actually destroyed, and it was a second copy of
  // handleSwitchSemester that had drifted. Both answer the same question —
  // "change which semester I am editing" — but this one advanced the year and
  // then called setSelectedCourseIds(new Set()) WITHOUT removing the target's
  // entry from completedSemesters and WITHOUT restoring its saved courseIds.
  //
  // So the board then claimed the target semester held nothing. handleFinish
  // rebuilds that semester's entry from the (empty) board and filters out the
  // saved one, and savePlan's reconcile deletes exactly what the payload omits.
  // Every course the student had already saved in that semester was deleted
  // from the database — and because completedCourseIds still counted them, the
  // rebuilt entry could be literally empty, taking the mandatory rows too.
  //
  // Not an exotic path: on a mandatory-heavy semester the board opens straight
  // on the summary, where "תכננו את הסמסטר הבא" is the FILLED primary button
  // and "סיימתי" is the outline one beside it.
  //
  // Delegating instead of duplicating: handleSwitchSemester already stores the
  // current semester, strips and restores the target, and clears the undo
  // stacks. One path, so neither can forget the restore again. markDirty stays
  // HERE because switching does not set it and this advance does mutate saved
  // state by folding mandatoryIds into the stored entry.
  const handlePlanNext = useCallback(() => {
    markDirty();
    const nextYear = currentSemester === "FALL" ? currentYear : currentYear + 1;
    const nextSemester: "FALL" | "SPRING" = currentSemester === "FALL" ? "SPRING" : "FALL";
    handleSwitchSemester(nextYear, nextSemester);
  }, [currentYear, currentSemester, markDirty, handleSwitchSemester]);

  const handleAddCustomCourse = useCallback(
    (course: CustomCourseDraft) => {
      markDirty();
      setCustomCourses((prev) => [...prev, course]);
      // Auto-select the custom course
      setSelectedCourseIds((prev) => new Set([...prev, course.id]));
      // A declaration made in the add-modal is an attribution like any other —
      // route it through the same map the popover writes to, so it persists.
      if (course.declaredDiscipline) {
        setDisciplineOverrides((prev) => ({
          ...prev,
          [course.id]: course.declaredDiscipline!,
        }));
      }
    },
    [markDirty]
  );

  const handleDeleteCustomCourse = useCallback(
    (courseId: string) => {
      markDirty();
      setCustomCourses((prev) => prev.filter((c) => c.id !== courseId));
      setSelectedCourseIds((prev) => {
        const next = new Set(prev);
        next.delete(courseId);
        return next;
      });
    },
    [markDirty]
  );

  const handleSelectSessionGroup = useCallback(
    (courseCode: string, sessionType: string, groupCode: string) => {
      markDirty();
      setSessionGroupSelections((prev) => ({
        ...prev,
        [courseCode]: { ...(prev[courseCode] ?? {}), [sessionType]: groupCode },
      }));
    },
    [markDirty]
  );

  // P2 — "מצאו לי שילוב בלי התנגשויות": search over ALL group alternatives
  // (raw semester sessions, not the group-filtered ones — we're choosing the
  // groups), apply the winner through the regular handler (undo/dirty flow),
  // and offer an exact one-click revert.
  const handleFindCombination = useCallback((preferences?: ComboPreferences) => {
    const comboCourses = allCurrentCourses.map((c) => ({
      code: c.code,
      sessions: (c.scheduleSessions ?? [])
        .filter((s) => !s.semester || s.semester === currentSemester)
        .map((s) => ({
          sessionType: s.sessionType,
          groupCode: s.groupCode ?? "A",
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
        })),
    }));
    const result = findBestCombination(comboCourses, undefined, preferences);
    if (!result) {
      toast.info(isHe ? "אין כאן קבוצות להחליף — לכל הקורסים קבוצה אחת" : "Nothing to optimize — every course has a single group");
      return;
    }
    // Effective current group per slot (explicit selection, else the grid's
    // alphabetical default) — so "בטל" restores the exact visible state.
    const changes: [string, string, string][] = [];
    for (const [code, types] of Object.entries(result.selections)) {
      const course = allCurrentCourses.find((c) => c.code === code);
      for (const [type, group] of Object.entries(types)) {
        const current =
          sessionGroupSelections[code]?.[type] ??
          ((course?.scheduleSessions ?? [])
            .filter((s) => s.sessionType === type && (!s.semester || s.semester === currentSemester))
            .map((s) => s.groupCode ?? "A")
            .filter((g) => g !== "ALL")
            .sort()[0] ?? group);
        if (current !== group) changes.push([code, type, current]);
      }
    }
    if (changes.length === 0) {
      toast.success(
        conflicts.length === 0
          ? (isHe ? "המערכת כבר בשילוב הטוב ביותר שמצאנו" : "You're already on the best combination we found")
          : (isHe ? "אין שילוב קבוצות שפותר את החפיפה — היא בין מפגשים קבועים" : "No group swap resolves this clash — it's between fixed sessions"),
      );
      return;
    }
    for (const [code, types] of Object.entries(result.selections)) {
      for (const [type, group] of Object.entries(types)) {
        handleSelectSessionGroup(code, type, group);
      }
    }
    const undo = () => {
      for (const [code, type, group] of changes) handleSelectSessionGroup(code, type, group);
    };
    // #8 — when the student stated constraints, the toast has to say which of
    // them survived. A wish is a soft cost in the search, so "we looked" and
    // "we kept it" are different claims and only the second may be made here.
    const h = result.honored;
    const dayName = (d: string) =>
      isHe
        ? { SUNDAY: "ראשון", MONDAY: "שני", TUESDAY: "שלישי", WEDNESDAY: "רביעי", THURSDAY: "חמישי", FRIDAY: "שישי" }[d] ?? d
        : d.charAt(0) + d.slice(1).toLowerCase();
    const prefNote =
      !h || (h.freeDaysKept.length === 0 && h.freeDaysBroken.length === 0 && h.outOfHoursSessions === 0)
        ? null
        : [
            h.freeDaysKept.length > 0
              ? isHe
                ? `${h.freeDaysKept.map(dayName).join(", ")} נשאר פנוי`
                : `kept ${h.freeDaysKept.map(dayName).join(", ")} clear`
              : null,
            h.freeDaysBroken.length > 0
              ? isHe
                ? `לא הצלחנו לפנות את ${h.freeDaysBroken.map(dayName).join(", ")}`
                : `couldn't clear ${h.freeDaysBroken.map(dayName).join(", ")}`
              : null,
            h.outOfHoursSessions > 0
              ? isHe
                ? `${h.outOfHoursSessions} מפגשים נשארו מחוץ לשעות שביקשתם`
                : `${h.outOfHoursSessions} sessions fall outside your hours`
              : null,
          ]
            .filter(Boolean)
            .join(" · ");
    const headline =
      result.conflicts === 0
        ? (isHe ? `נמצא שילוב בלי התנגשויות (${heNoun(result.daysOnCampus, "יום", "ימים")} בקמפוס)` : `Found a clash-free combination (${result.daysOnCampus} campus days)`)
        : (isHe ? "אין שילוב בלי חפיפה — זה הקרוב ביותר" : "No clash-free combination exists — this is the closest");
    toast.success(prefNote ? `${headline} · ${prefNote}` : headline, {
      action: { label: isHe ? "בטל" : "Undo", onClick: undo },
      duration: 8000,
    });
  }, [allCurrentCourses, currentSemester, sessionGroupSelections, conflicts.length, handleSelectSessionGroup, isHe]);

  const handleDisciplineOverride = useCallback(
    (courseId: string, discipline: string) => {
      markDirty();
      setDisciplineOverrides((prev) => ({ ...prev, [courseId]: discipline }));
    },
    [markDirty]
  );

  const customCourseIds = useMemo(
    () => new Set(customCourses.map((c) => c.id)),
    [customCourses]
  );

  // #8 — turn the client-only custom courses into real Course rows before the
  // plan is handed over. Until this existed, every caller had to drop them
  // (their `custom-…` id isn't a UUID) and tell the student their course
  // "wasn't saved" — the warning shipped, the feature didn't.
  const registerCustom = api.plan.addCustomCourses.useMutation();
  const [isRegistering, setIsRegistering] = useState(false);

  const handleFinish = useCallback(async () => {
    // Include current semester in the result (avoiding duplicates)
    const currentKey = `${currentYear}-${currentSemester}`;
    const currentCourseIds = [
      ...mandatoryIds,
      ...Array.from(selectedCourseIds).filter((id) => !mandatoryIds.has(id)),
    ];
    const withoutCurrent = completedSemesters.filter(
      (s) => `${s.year}-${s.semester}` !== currentKey
    );
    let allSemesters: PlannedSemester[] = [
      ...withoutCurrent,
      { year: currentYear, semester: currentSemester, courseIds: currentCourseIds },
    ];
    let overrides = { ...disciplineOverrides };
    let registered: { id: string; code: string; nameHe: string; credits: number }[] = [];

    // Only the custom courses actually PLACED in a semester need a row.
    const placedIds = new Set(allSemesters.flatMap((s) => s.courseIds));
    const toRegister = customCourses.filter(
      (c) => c.id.startsWith("custom-") && placedIds.has(c.id)
    );
    if (toRegister.length > 0) {
      try {
        setIsRegistering(true);
        const res = await registerCustom.mutateAsync({
          courses: toRegister.map((c) => ({
            clientId: c.id,
            name: c.nameHe,
            credits: c.credits,
          })),
        });
        // Swap every client id for the persistent one — in the semesters AND in
        // the attribution map, so the declaration lands on the saved row.
        const swapped = applyResolvedCustomIds(allSemesters, overrides, res.courses);
        allSemesters = swapped.semesters;
        overrides = swapped.disciplineOverrides;
        // Hand the newly-registered rows back with their PERSISTENT ids. The
        // caller prices the plan from the public catalog, which by design can
        // never return these (they are isActive:false), so without this the
        // onboarding finale silently undercounted the semester by exactly the
        // credits of the course the student had just added.
        registered = toRegister.flatMap((c) => {
          const hit = res.courses.find((r) => r.clientId === c.id);
          return hit ? [{ id: hit.courseId, code: hit.code, nameHe: c.nameHe, credits: c.credits }] : [];
        });
      } catch {
        // Registering failed → those courses would be silently dropped by the
        // save. Say so plainly instead (the rest of the plan still saves).
        toast.error(
          isHe
            ? "לא הצלחנו לשמור את הקורסים שהוספתם ידנית — שאר התוכנית נשמרת. נסו שוב בעוד רגע."
            : "We couldn't save the courses you added manually — the rest of the plan is being saved. Try again shortly.",
        );
      } finally {
        setIsRegistering(false);
      }
    }

    onFinish(allSemesters, sessionGroupSelections, overrides, registered);
  }, [completedSemesters, currentYear, currentSemester, mandatoryIds, selectedCourseIds, onFinish, sessionGroupSelections, customCourses, disciplineOverrides, registerCustom, isHe]);

  // ─── Semester picker ──────────────────────────────────────────────

  const ALL_SEMESTERS: Array<{ year: 1 | 2 | 3; semester: "FALL" | "SPRING" }> = [
    { year: 1, semester: "FALL" },
    { year: 1, semester: "SPRING" },
    { year: 2, semester: "FALL" },
    { year: 2, semester: "SPRING" },
    { year: 3, semester: "FALL" },
    { year: 3, semester: "SPRING" },
  ];

  /** Which semesters have already been planned and saved */
  const completedSemesterKeys = useMemo(() => {
    return new Set(completedSemesters.map((s) => `${s.year}-${s.semester}`));
  }, [completedSemesters]);

  // Soft planning horizon (מסלול E, step 4): the student's REAL position
  // (data.year/semester) is the anchor. The current + next semester are
  // "recommended" to plan; anything further out is "far" and likely to change —
  // a gentle nudge, never a block (a reservist / mid-degree student must still
  // be able to plan far ahead). #16: stop fresh users over-planning year 3.
  const semIndex = (y: number, s: "FALL" | "SPRING") => (y - 1) * 2 + (s === "FALL" ? 0 : 1);
  const anchorIndex = semIndex(data.year, data.semester);
  const horizonOf = (y: number, s: "FALL" | "SPRING"): "past" | "near" | "far" => {
    const i = semIndex(y, s);
    if (i < anchorIndex) return "past";
    if (i <= anchorIndex + 1) return "near";
    return "far";
  };
  const activeIsFar = horizonOf(currentYear, currentSemester) === "far";

  // Can we plan more semesters?
  const hasMoreSemesters = currentYear < 3 || (currentYear === 3 && currentSemester === "FALL");

  // ─── Loading state ─────────────────────────────────────────────────

  if (isLoadingCourses) {
    return <ThemedLoader />;
  }

  // ─── Summary view ──────────────────────────────────────────────────

  if (showSummary) {
    return (
      /* Same container-query trap as the edit view, and worse here: the summary
         card took a fixed 448px, leaving the timetable ~364px — so the screen
         that asks "approve this semester?" showed a list instead of the week
         being approved. Split at xl, and proportionally rather than fixed. */
      <div className="flex w-full flex-col items-start justify-center gap-5 xl:flex-row">
        <div className="w-full xl:w-[38%]">
        <SemesterSummary
          year={currentYear}
          semester={currentSemester}
          courses={groupFilteredCourses}
          unchosenGroupCount={unchosenGroupCount}
          semesterOver={declaredSemesterOver}
          totalCredits={totalCreditsPlanned}
          hasMoreSemesters={hasMoreSemesters}
          onPlanNext={handlePlanNext}
          onFinish={handleFinish}
          onBack={() => {
            // They pressed "add or edit courses" — so open on the pool. The
            // default below sends a mandatory-heavy year-1 student to the
            // GROUPS tab, which is right when they arrive on their own and
            // wrong when they arrived asking for courses.
            setRailTabPref("courses");
            setShowSummary(false);
          }}
          isSaving={isSaving || isRegistering}
          autoRecommended={summaryPref === null && mandatoryHeavy}
        />
        </div>
        {/* #17 (12.7) — "לא באמת ראיתי את התכנון": the real weekly grid, right
            next to the approve button. INTERACTIVE: the card beside it says
            "בחרו את שלכם על המערכת", and until now this grid was mounted
            read-only — the first instruction a student ever got about groups
            pointed at a surface where picking did nothing. Same handler as the
            editor, so a pick here lands in the same state. */}
        <div className="w-full min-w-0 xl:flex-1">
          <LiveTimetable
            courses={allCurrentCourses}
            currentSemester={currentSemester}
            sessionGroupSelections={sessionGroupSelections}
            interactive
            multiGroupCourseCodes={multiGroupCourseCodes}
            onSelectSessionGroup={handleSelectSessionGroup}
          />
        </div>
      </div>
    );
  }

  // ─── Main planner view ─────────────────────────────────────────────

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Degree info modal — shows once before planning */}
      <Dialog open={showDegreeModal} onOpenChange={setShowDegreeModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">
              {t("aboutPPE")}
            </DialogTitle>
          </DialogHeader>
          <DegreeInfoCard />
          <button
            onClick={() => setShowDegreeModal(false)}
            className="mt-2 w-full rounded-xl bg-foreground px-6 py-3 text-sm font-bold text-background transition-all hover:opacity-90 press-scale"
          >
            {t("gotItLetsGo")}
          </button>
        </DialogContent>
      </Dialog>


      {declaredSemesterOver && (
        <div className="w-full max-w-2xl rounded-xl border border-sky-500/30 bg-sky-500/[0.06] p-3.5 text-xs leading-relaxed text-foreground/70">
          {isHe ? (
            <>
              {/* #5 — product copy carries no decorative emoji (the smiley went
                  the way of the onboarding pin); the sentence carries itself. */}
              <b>{`רגע, ${data.semester === "SPRING" ? "סמסטר ב׳" : "סמסטר א׳"} כבר הסתיים`}</b>{" "}
              ההוראה נגמרה, אז הקורסים שנבחר כאן יישמרו בתוכנית שלכם — וכשיתפרסמו הציונים תסמנו אותם כ״הושלם״ ותזינו ציון בתיק האקדמי.
              בסיום אפשר להמשיך ישר לתכנון הסמסטר הבא (הכפתור יופיע במסך-הסיכום).
            </>
          ) : (
            <>
              <b>{`Heads up — semester ${data.semester === "SPRING" ? "B" : "A"} already ended`}</b>{" "}
              Teaching is over, so the courses picked here are saved to your plan — once grades are published, mark them complete and enter the grade in your record.
              When you finish, you can continue straight to planning the next semester (the button appears on the summary screen).
            </>
          )}
        </div>
      )}

      {/* Title bar */}
      <div className="animate-stagger-1 text-center">
        <h2 className="text-2xl font-bold text-foreground/90">
          {t("semesterPlannerTitle")}
        </h2>
        <p className="mt-1 text-sm text-foreground/60">
          {t("semesterPlannerDesc")}
        </p>
        {/* Semester picker — jump to any semester */}
        <div className="mt-3 flex flex-col items-center gap-2">
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {ALL_SEMESTERS.map(({ year, semester }) => {
              const isActive = year === currentYear && semester === currentSemester;
              const key = `${year}-${semester}`;
              const isCompleted = completedSemesterKeys.has(key);
              const isFar = !isCompleted && horizonOf(year, semester) === "far";
              const yCfg = YEAR_CONFIG[year];
              const sCfg = SEMESTER_CONFIG[semester];
              const label = isHe
                ? `${yCfg.nameHe} ${sCfg.short}`
                : `${yCfg.nameEn} ${sCfg.shortEn}`;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleSwitchSemester(year, semester)}
                  // Which pill is open was communicated by fill colour only, so
                  // a screen reader announced six identical buttons.
                  aria-current={isActive ? "true" : undefined}
                  title={isFar ? (isHe ? "סמסטר רחוק — עוד יכול להשתנות" : "Far semester — may still change") : undefined}
                  className={cn(
                    "relative flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all",
                    isActive
                      ? "bg-foreground text-background shadow-sm"
                      : isCompleted
                        ? "bg-foreground/10 text-foreground/60 hover:bg-foreground/15"
                        : isFar
                          ? "border border-dashed border-foreground/20 bg-transparent text-foreground/60 hover:text-foreground/90"
                          : "bg-foreground/5 text-foreground/60 hover:bg-foreground/10 hover:text-foreground/90"
                  )}
                >
                  {isCompleted && !isActive && (
                    <Check className="h-2.5 w-2.5" />
                  )}
                  {label}
                </button>
              );
            })}
          </div>
          {/* Soft horizon nudge — only when editing a far semester (E-4). */}
          {activeIsFar && (
            <p className="max-w-md text-[11px] leading-snug text-amber-600/80 dark:text-amber-400/70">
              {isHe
                ? "זה סמסטר רחוק יחסית — סביר שדברים עוד ישתנו. אפשר לתכנן, רק כדאי להתמקד קודם בסמסטר הקרוב."
                : "This is a far-off semester — things will likely still change. Plan if you like, but focus on the upcoming one first."}
            </p>
          )}
          <button
            onClick={() => setShowDegreeModal(true)}
            className="inline-flex items-center gap-1 rounded-full bg-foreground/5 px-2.5 py-1 text-xs text-foreground/60 hover:text-foreground/90 transition-colors"
          >
            <Info className="h-3 w-3" />
            {t("aboutPPE")}
          </button>
        </div>
      </div>

      {/* Semester intro card — context for this year/semester */}
      <div className="animate-stagger-2 w-full max-w-7xl">
        <SemesterIntroCard
          key={`${currentYear}-${currentSemester}`}
          year={currentYear}
          semester={currentSemester}
        />
      </div>

      {/* Ariel, 21.8 — bidding was surfaced on the DASHBOARD, a screen a
          student reaches AFTER planning. Said here, while they are choosing,
          and it names the full planner so that screen is discoverable at all. */}
      <div className="animate-stagger-1 flex w-full max-w-7xl flex-col gap-3">
        <BiddingProximityNudge />
        <EnglishStandingChip
          signal={englishPlannerSignal(data.englishLevel, data.amirantScore, completedRows ?? [])}
        />
        {/* Ariel, twice: "כל פיצר סיוע תכנון המערכת שעות לא מספיק מוטמע ומורגש"
            / "אמרנו להנגיש יותר את עוזר המתכנן". The combination finder was an
            11px link inside the conflicts card, shown only once a clash
            existed — so the students who most needed it were the least likely
            to find it. This is its entry point. */}
        <PlannerAssistantCard
          conflicts={conflicts.length}
          canSwapGroups={multiGroupCourseCodes.size > 0}
          campusDays={campusDayCount}
          onFindCombination={handleFindCombination}
        />
      </div>

      {/* Insights bar */}
      <div data-tour="planner-insights" className="animate-stagger-2 w-full max-w-7xl">
        <InsightsBar
          selectedCourses={groupFilteredCourses}
          totalCreditsPlanned={totalCreditsPlanned}
          conflicts={conflicts}
          unscheduledCount={unscheduledCount}
          canSwapGroups={multiGroupCourseCodes.size > 0}
          focusArea={data.focusArea}
          // Degree progress has to include what is already earned, or the
          // label "התקדמות בתואר" is false for anyone mid-degree.
          completedCredits={(completedRows ?? []).reduce((sum, r) => sum + (r.credits ?? 0), 0)}
          onFindCombination={handleFindCombination}
        />
      </div>

      {/* Main content — the course pool sits BESIDE the selected semester + its
          LIVE timetable, so every course you pick shows on the schedule
          instantly instead of being buried at the bottom (gal-3 #19; the
          Coursicle-style list↔timetable pairing). */}
      <div className="animate-stagger-3 w-full max-w-7xl">
        {/* Split at xl, not lg. WeeklyTimetable is a container-query component:
            below 512px of its OWN box it degrades to a day-by-day agenda list.
            At the lg breakpoint (1024px viewport) minus the 256px sidebar, a 62%
            column resolves to ~392px — under the threshold — so the side-by-side
            layout was silently trading the grid away for a list. Below xl the
            timetable now takes the full row, which always clears 512px. */}
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
          {/* The rail: the two things a student DOES on this screen, opposite
              the week they change — courses, and groups. The group picker used
              to live at the bottom of "הסמסטר שלי", ~1350px below the top of
              the planner and under a ~700px grid, so on a 1280×800 laptop you
              could never see the timetable move when you picked. Sticky, with
              its own scroll, so cause and effect share a screen.
              The 38/62 split is deliberate and load-bearing: WeeklyTimetable
              degrades from grid to day-list below 512px of its OWN box, and at
              a 1280px viewport the timetable container measures 531.45px — 19px
              of slack. Nothing here may take width from it, which is why the
              rail's height comes from the tab strip and its own scroll, never
              from the timetable column. (Measured 13.8 in Chrome over this exact
              container stack: 531.45 / 630.64 / 749.68px at 1280 / 1440 / 1920.) */}
          <div data-tour="planner-pool" className="order-2 w-full xl:order-none xl:w-[38%] xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:flex xl:flex-col">
            <div className="mb-2 flex items-center gap-1 rounded-lg bg-foreground/5 p-0.5">
              <button
                type="button"
                onClick={() => setRailTabPref("courses")}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium transition-all",
                  railTab === "courses"
                    ? "bg-background text-foreground/75 shadow-sm"
                    : "text-foreground/60 hover:text-foreground/90",
                )}
              >
                {isHe ? "קורסים" : "Courses"}
              </button>
              <button
                type="button"
                data-tour="planner-groups"
                onClick={() => setRailTabPref("groups")}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium transition-all",
                  railTab === "groups"
                    ? "bg-background text-foreground/75 shadow-sm"
                    : "text-foreground/60 hover:text-foreground/90",
                )}
              >
                {isHe ? "קבוצות" : "Groups"}
                {/* Live count of what is still OUR default — the one number that
                    tells a student how much of this week they haven't decided. */}
                {unchosenGroupCount > 0 && (
                  <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">
                    {unchosenGroupCount}
                  </span>
                )}
              </button>
            </div>

            <div className="w-full rounded-xl border border-border/40 bg-card/20 p-4 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
              {railTab === "courses" ? (
                <CoursePool
                  allCourses={mergedCourses}
                  currentYear={currentYear}
                  currentSemester={currentSemester}
                  selectedIds={selectedCourseIds}
                  mandatoryIds={mandatoryIds}
                  completedCourseIds={completedCourseIds}
                  focusArea={data.focusArea}
                  onToggleCourse={handleToggleCourse}
                  onPreviewCourse={setHoverPreviewId}
                  onAddCustomCourse={() => setShowCustomCourseModal(true)}
                  onDisciplineOverride={handleDisciplineOverride}
                />
              ) : (
                <GroupRail
                  courses={allCurrentCourses}
                  gridCourses={groupFilteredCourses}
                  currentSemester={currentSemester}
                  sessionGroupSelections={sessionGroupSelections}
                  onSelectSessionGroup={handleSelectSessionGroup}
                />
              )}
            </div>
          </div>

          {/* Right column: the LIVE TIMETABLE first — the plan IS a schedule,
              not a list (#20) — with the course list under it. Both update the
              moment you pick a course from the pool. */}
          <div className="order-1 flex w-full min-w-0 flex-col gap-4 xl:order-none xl:w-[62%]">
            {/* Live schedule of the picked courses. Tab-toggles to exams. */}
            <div data-tour="planner-timetable" className="rounded-xl border border-border/40 bg-card/20 p-4">
          {/* Tab header */}
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1 rounded-lg bg-foreground/5 p-0.5">
              <button
                onClick={() => setBottomTab("timetable")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all",
                  bottomTab === "timetable"
                    ? "bg-background text-foreground/70 shadow-sm"
                    : "text-foreground/60 hover:text-foreground/90"
                )}
              >
                <CalendarDays className="h-3 w-3" />
                {t("tabSchedule")}
              </button>
              <button
                onClick={() => setBottomTab("exams")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all",
                  bottomTab === "exams"
                    ? "bg-background text-foreground/70 shadow-sm"
                    : "text-foreground/60 hover:text-foreground/90"
                )}
              >
                <BarChart3 className="h-3 w-3" />
                {isHe ? "לוח מבחנים" : "Exam Timeline"}
              </button>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  // Guard the empty case: warn instead of silently doing nothing.
                  if (allCurrentCourses.length === 0) {
                    toast.error(tCal("exportEmpty"));
                    return;
                  }
                  downloadICS(allCurrentCourses, currentSemester);
                  toast.success(tCal("exportSuccess"));
                }}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-foreground/70 hover:text-foreground hover:bg-foreground/5 transition-all"
                title={tCal("exportICSFile")}
              >
                <Download className="h-3 w-3" />
                {tCal("exportICSFile")}
              </button>
            </div>
          </div>

          {/* Tab content */}
          {bottomTab === "timetable" && (
            <>
              <LiveTimetable
                courses={allCurrentCourses}
                currentSemester={currentSemester}
                sessionGroupSelections={sessionGroupSelections}
                coursePreview={hoverPreviewCourse}
                interactive
                multiGroupCourseCodes={multiGroupCourseCodes}
                onSelectSessionGroup={handleSelectSessionGroup}
              />
              {allCurrentCourses.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <CalendarDays className="h-8 w-8 text-foreground/20" />
                  <p className="mt-2 text-xs text-foreground/60">
                    {t("noCoursesSemester")}
                  </p>
                </div>
              )}
            </>
          )}
          {bottomTab === "exams" && (
            <ExamGantt courses={allCurrentCourses} />
          )}
            </div>

            {/* My Semester — the course list, under the timetable it feeds. */}
            {/* The tour's "planner-groups" anchor moved to the rail's tab — the
                group picker is no longer down here. */}
            <div className="rounded-xl border border-border/40 bg-card/20 p-4 lg:max-h-[380px] lg:overflow-y-auto">
              <MySemester
                mandatoryCourses={mandatoryCourses}
                selectedCourses={selectedElectives}
                totalCredits={currentSemesterCredits}
                onRemoveCourse={handleRemoveCourse}
                onDeleteCustomCourse={handleDeleteCustomCourse}
                customCourseIds={customCourseIds}
                sessionGroupSelections={sessionGroupSelections}
                currentSemester={currentSemester}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Done with semester button */}
      <div className="animate-stagger-4 w-full max-w-4xl">
        <button
          onClick={handleDoneSemester}
          disabled={allCurrentCourses.length === 0}
          className={cn(
            "w-full rounded-xl px-6 py-3 text-sm font-medium transition-all",
            allCurrentCourses.length > 0
              ? "bg-foreground text-background hover:scale-[1.01] press-scale font-bold"
              : "bg-foreground/10 text-foreground/60 cursor-not-allowed"
          )}
        >
          {t("semesterDone")} — {allCurrentCourses.length} {t("courses")}, {currentSemesterCredits} {t("nz")}
        </button>
      </div>

      {/* Custom course modal */}
      <CustomCourseModal
        open={showCustomCourseModal}
        onOpenChange={setShowCustomCourseModal}
        onAdd={handleAddCustomCourse}
      />

      {/* #17 — the four-step planner tour, on the screen it explains. Suppressed
          while the custom-course modal is open so two overlays never stack. */}
      {/* The tour is DECORATION on top of a board that may hold unsaved edits.
          A React #310 inside it used to throw all the way to planner/error.tsx,
          replacing the whole screen and discarding the in-progress plan. It now
          fails alone and silently: the student loses the tour, not the work. */}
      <QuietBoundary label="planner-tour">
        <AnchoredTour
          open={plannerTourOpen && !showCustomCourseModal && !showDegreeModal}
          onClose={closePlannerTour}
          steps={PLANNER_STEPS}
        />
      </QuietBoundary>
    </div>
  );
}
