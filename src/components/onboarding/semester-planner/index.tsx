"use client";

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import { CalendarDays, Info, Download, Check, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SEMESTER_CONFIG, YEAR_CONFIG } from "@/lib/constants";
import { detectConflicts } from "@/lib/plan-generator";
import { filterSessionsBySelectedGroups, courseHasMultipleGroups } from "./session-group-selector";
import { findBestCombination } from "@/lib/combo-finder";
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
import { LiveTimetable, type SessionGroupSelections } from "./live-timetable";
import { InsightsBar } from "./insights-bar";
import { DegreeInfoCard } from "./degree-info-card";
import { SemesterSummary } from "./semester-summary";
import { CustomCourseModal } from "./custom-course-modal";
import { SemesterIntroCard } from "./semester-intro-card";
import { ExamGantt } from "./exam-gantt";
import { getAcademicNow } from "@/lib/academic-calendar";

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
  onFinish: (plannedSemesters: PlannedSemester[], sessionGroupSelections: SessionGroupSelections) => void;
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
  onFinish,
  externalCompletedCourseIds,
  initialPlannedSemesters,
  initialSessionGroupSelections,
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
  const [customCourses, setCustomCourses] = useState<CourseWithSchedule[]>([]);
  const [showCustomCourseModal, setShowCustomCourseModal] = useState(false);
  // Session group selections: courseCode → { sessionType → groupCode }
  const [sessionGroupSelections, setSessionGroupSelections] = useState<SessionGroupSelections>(
    initialSessionGroupSelections ?? {}
  );
  // Bottom panel tab: timetable or exam gantt
  const [bottomTab, setBottomTab] = useState<"timetable" | "exams">("timetable");
  // Hover-preview of a session group (#2): dashed blocks on the timetable
  // show WHERE the hovered group would sit — the choice becomes visible.
  const [groupPreview, setGroupPreview] = useState<{
    courseCode: string;
    sessionType: string;
    groupCode: string;
  } | null>(null);
  // Discipline overrides: courseId → discipline key
  const [disciplineOverrides, setDisciplineOverrides] = useState<Record<string, string>>({});
  // #2 follow-up — the pool bubble currently hovered/focused; its sessions
  // ghost on the live grid so the pick happens ON the schedule.
  const [hoverPreviewId, setHoverPreviewId] = useState<string | null>(null);

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
      if (courseHasMultipleGroups(sessions)) set.add(course.code);
    }
    return set;
  }, [allCurrentCourses, currentSemester]);

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

  const conflicts = useMemo(
    () => detectConflicts(groupFilteredCourses),
    [groupFilteredCourses],
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
  }, []);

  const handlePlanNext = useCallback(() => {
    markDirty();
    // Save current semester
    const currentKey = `${currentYear}-${currentSemester}`;
    const currentCourseIds = [
      ...mandatoryIds,
      ...Array.from(selectedCourseIds).filter((id) => !mandatoryIds.has(id)),
    ];
    setCompletedSemesters((prev) => {
      const withoutCurrent = prev.filter(
        (s) => `${s.year}-${s.semester}` !== currentKey
      );
      return [
        ...withoutCurrent,
        { year: currentYear, semester: currentSemester, courseIds: currentCourseIds },
      ];
    });

    // Advance to next semester
    if (currentSemester === "FALL") {
      setCurrentSemester("SPRING");
    } else {
      setCurrentSemester("FALL");
      setCurrentYear((y) => y + 1);
    }

    // Reset for new semester
    setSelectedCourseIds(new Set());
    setShowSummary(false);
    undoStack.current = [];
    redoStack.current = [];
  }, [currentYear, currentSemester, mandatoryIds, selectedCourseIds, markDirty]);

  const handleAddCustomCourse = useCallback(
    (course: CourseWithSchedule) => {
      markDirty();
      setCustomCourses((prev) => [...prev, course]);
      // Auto-select the custom course
      setSelectedCourseIds((prev) => new Set([...prev, course.id]));
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
  const handleFindCombination = useCallback(() => {
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
    const result = findBestCombination(comboCourses);
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
    toast.success(
      result.conflicts === 0
        ? (isHe ? `נמצא שילוב בלי התנגשויות (${result.daysOnCampus} ימים בקמפוס)` : `Found a clash-free combination (${result.daysOnCampus} campus days)`)
        : (isHe ? "אין שילוב בלי חפיפה — זה הקרוב ביותר" : "No clash-free combination exists — this is the closest"),
      { action: { label: isHe ? "בטל" : "Undo", onClick: undo }, duration: 8000 },
    );
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

  const handleFinish = useCallback(() => {
    // Include current semester in the result (avoiding duplicates)
    const currentKey = `${currentYear}-${currentSemester}`;
    const currentCourseIds = [
      ...mandatoryIds,
      ...Array.from(selectedCourseIds).filter((id) => !mandatoryIds.has(id)),
    ];
    const withoutCurrent = completedSemesters.filter(
      (s) => `${s.year}-${s.semester}` !== currentKey
    );
    const allSemesters: PlannedSemester[] = [
      ...withoutCurrent,
      { year: currentYear, semester: currentSemester, courseIds: currentCourseIds },
    ];
    onFinish(allSemesters, sessionGroupSelections);
  }, [completedSemesters, currentYear, currentSemester, mandatoryIds, selectedCourseIds, onFinish, sessionGroupSelections]);

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
    [currentYear, currentSemester, mandatoryIds, selectedCourseIds, completedSemesters]
  );

  // Can we plan more semesters?
  const hasMoreSemesters = currentYear < 3 || (currentYear === 3 && currentSemester === "FALL");

  // ─── Loading state ─────────────────────────────────────────────────

  if (isLoadingCourses) {
    return <ThemedLoader />;
  }

  // ─── Summary view ──────────────────────────────────────────────────

  if (showSummary) {
    return (
      <div className="flex w-full flex-col items-start justify-center gap-5 lg:flex-row">
        <div className="w-full lg:max-w-md">
        <SemesterSummary
          year={currentYear}
          semester={currentSemester}
          courses={groupFilteredCourses}
          multiGroupCount={multiGroupCourseCodes.size}
          totalCredits={totalCreditsPlanned}
          hasMoreSemesters={hasMoreSemesters}
          onPlanNext={handlePlanNext}
          onFinish={handleFinish}
          onBack={() => setShowSummary(false)}
          isSaving={isSaving}
          autoRecommended={summaryPref === null && mandatoryHeavy}
        />
        </div>
        {/* #17 (12.7) — "לא באמת ראיתי את התכנון": the real weekly grid, right
            next to the approve button. Read-only here; edits go through the
            "הצגה ועריכה" link. */}
        <div className="w-full min-w-0 lg:flex-1">
          <LiveTimetable
            courses={groupFilteredCourses}
            currentSemester={currentSemester}
            sessionGroupSelections={sessionGroupSelections}
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
          <b>{`רגע, ${data.semester === "SPRING" ? "סמסטר ב׳" : "סמסטר א׳"} כבר הסתיים 🙂`}</b>{" "}
          ההוראה נגמרה, אז הקורסים שנבחר כאן יישמרו כ״בלימוד״ — עד שיתפרסמו הציונים ותסמנו אותם.
          בסיום אפשר להמשיך ישר לתכנון הסמסטר הבא (הכפתור יופיע במסך-הסיכום).
        </div>
      )}

      {/* Title bar */}
      <div className="animate-stagger-1 text-center">
        <h2 className="text-2xl font-bold text-foreground/90">
          {t("semesterPlannerTitle")}
        </h2>
        <p className="mt-1 text-sm text-foreground/50">
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
                  onClick={() => handleSwitchSemester(year, semester)}
                  title={isFar ? (isHe ? "סמסטר רחוק — עוד יכול להשתנות" : "Far semester — may still change") : undefined}
                  className={cn(
                    "relative flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all",
                    isActive
                      ? "bg-foreground text-background shadow-sm"
                      : isCompleted
                        ? "bg-foreground/10 text-foreground/60 hover:bg-foreground/15"
                        : isFar
                          ? "border border-dashed border-foreground/20 bg-transparent text-foreground/35 hover:text-foreground/50"
                          : "bg-foreground/5 text-foreground/35 hover:bg-foreground/10 hover:text-foreground/50"
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
            className="inline-flex items-center gap-1 rounded-full bg-foreground/5 px-2.5 py-1 text-xs text-foreground/40 hover:text-foreground/60 transition-colors"
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

      {/* Insights bar */}
      <div className="animate-stagger-2 w-full max-w-7xl">
        <InsightsBar
          selectedCourses={groupFilteredCourses}
          allCourses={mergedCourses}
          totalCreditsPlanned={totalCreditsPlanned}
          conflicts={conflicts}
          focusArea={data.focusArea}
          onFindCombination={handleFindCombination}
        />
      </div>

      {/* Main content — the course pool sits BESIDE the selected semester + its
          LIVE timetable, so every course you pick shows on the schedule
          instantly instead of being buried at the bottom (gal-3 #19; the
          Coursicle-style list↔timetable pairing). */}
      <div className="animate-stagger-3 w-full max-w-7xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          {/* Course Pool — browse & add, on the start side */}
          <div className="w-full rounded-xl border border-border/40 bg-card/20 p-4 lg:w-[38%] lg:max-h-[600px] lg:overflow-hidden lg:flex lg:flex-col">
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
          </div>

          {/* Right column: the LIVE TIMETABLE first — the plan IS a schedule,
              not a list (#20) — with the course list under it. Both update the
              moment you pick a course from the pool. */}
          <div className="flex w-full flex-col gap-4 lg:w-[62%]">
            {/* Live schedule of the picked courses. Tab-toggles to exams. */}
            <div className="rounded-xl border border-border/40 bg-card/20 p-4">
          {/* Tab header */}
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1 rounded-lg bg-foreground/5 p-0.5">
              <button
                onClick={() => setBottomTab("timetable")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all",
                  bottomTab === "timetable"
                    ? "bg-background text-foreground/70 shadow-sm"
                    : "text-foreground/35 hover:text-foreground/50"
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
                    : "text-foreground/35 hover:text-foreground/50"
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
                groupPreview={groupPreview}
                coursePreview={hoverPreviewCourse}
                interactive
                multiGroupCourseCodes={multiGroupCourseCodes}
                onSelectSessionGroup={handleSelectSessionGroup}
              />
              {allCurrentCourses.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <CalendarDays className="h-8 w-8 text-foreground/20" />
                  <p className="mt-2 text-xs text-foreground/40">
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
            <div className="rounded-xl border border-border/40 bg-card/20 p-4 lg:max-h-[380px] lg:overflow-y-auto">
              <MySemester
                mandatoryCourses={mandatoryCourses}
                selectedCourses={selectedElectives}
                totalCredits={currentSemesterCredits}
                onRemoveCourse={handleRemoveCourse}
                onDeleteCustomCourse={handleDeleteCustomCourse}
                customCourseIds={customCourseIds}
                sessionGroupSelections={sessionGroupSelections}
                onSelectSessionGroup={handleSelectSessionGroup}
                onPreviewGroup={setGroupPreview}
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
              : "bg-foreground/10 text-foreground/30 cursor-not-allowed"
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
    </div>
  );
}
