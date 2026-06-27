"use client";

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import { CalendarDays, Info, Download, Check, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SEMESTER_CONFIG, YEAR_CONFIG } from "@/lib/constants";
import { detectConflicts } from "@/lib/plan-generator";
import { filterSessionsBySelectedGroups } from "./session-group-selector";
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
}

// ─── Component ───────────────────────────────────────────────────────

export function SemesterPlanner({
  data,
  allCourses,
  isLoadingCourses,
  onFinish,
}: SemesterPlannerProps) {
  const t = useTranslations("onboarding");
  const tCal = useTranslations("calendar");
  const locale = useLocale();
  const isHe = locale === "he";

  // ─── State ─────────────────────────────────────────────────────────
  const [currentYear, setCurrentYear] = useState(data.year);
  const [currentSemester, setCurrentSemester] = useState<"FALL" | "SPRING">(data.semester);
  const [selectedCourseIds, setSelectedCourseIds] = useState<Set<string>>(new Set());
  const [completedSemesters, setCompletedSemesters] = useState<PlannedSemester[]>([]);
  const [showSummary, setShowSummary] = useState(false);
  const [showDegreeModal, setShowDegreeModal] = useState(true);
  const [customCourses, setCustomCourses] = useState<CourseWithSchedule[]>([]);
  const [showCustomCourseModal, setShowCustomCourseModal] = useState(false);
  // Session group selections: courseCode → { sessionType → groupCode }
  const [sessionGroupSelections, setSessionGroupSelections] = useState<SessionGroupSelections>({});
  // Bottom panel tab: timetable or exam gantt
  const [bottomTab, setBottomTab] = useState<"timetable" | "exams">("timetable");
  // Discipline overrides: courseId → discipline key
  const [disciplineOverrides, setDisciplineOverrides] = useState<Record<string, string>>({});

  // Undo/redo history for course selections
  const undoStack = useRef<Set<string>[]>([]);
  const redoStack = useRef<Set<string>[]>([]);

  const pushUndo = useCallback((prev: Set<string>) => {
    undoStack.current.push(new Set(prev));
    redoStack.current = []; // clear redo on new action
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

  // ─── Derived data ──────────────────────────────────────────────────

  // IDs of all courses from previously completed semesters
  const completedCourseIds = useMemo(() => {
    const ids = new Set<string>();
    for (const sem of completedSemesters) {
      for (const id of sem.courseIds) {
        ids.add(id);
      }
    }
    return ids;
  }, [completedSemesters]);

  // Credits from completed semesters
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

  // Total planned credits
  const totalCreditsPlanned = completedCredits + currentSemesterCredits;

  // Conflicts via plan-generator's detectConflicts — filtered by selected session groups
  const conflicts = useMemo(() => {
    // Create course copies with only the selected session groups
    const filteredCourses = allCurrentCourses.map((course) => {
      if (!course.scheduleSessions) return course;
      const courseGroupSel = sessionGroupSelections[course.code] ?? {};
      return {
        ...course,
        scheduleSessions: filterSessionsBySelectedGroups(course.scheduleSessions, courseGroupSel),
      };
    });
    return detectConflicts(filteredCourses);
  }, [allCurrentCourses, sessionGroupSelections]);

  // ─── Handlers ──────────────────────────────────────────────────────

  const handleToggleCourse = useCallback(
    (courseId: string) => {
      if (mandatoryIds.has(courseId)) return; // can't toggle mandatory
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
    [mandatoryIds, pushUndo]
  );

  const handleRemoveCourse = useCallback(
    (courseId: string) => {
      if (mandatoryIds.has(courseId)) return;
      setSelectedCourseIds((prev) => {
        pushUndo(prev);
        const next = new Set(prev);
        next.delete(courseId);
        return next;
      });
    },
    [mandatoryIds, pushUndo]
  );

  const handleDoneSemester = useCallback(() => {
    setShowSummary(true);
  }, []);

  const handlePlanNext = useCallback(() => {
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
  }, [currentYear, currentSemester, mandatoryIds, selectedCourseIds]);

  const handleAddCustomCourse = useCallback(
    (course: CourseWithSchedule) => {
      setCustomCourses((prev) => [...prev, course]);
      // Auto-select the custom course
      setSelectedCourseIds((prev) => new Set([...prev, course.id]));
    },
    []
  );

  const handleDeleteCustomCourse = useCallback(
    (courseId: string) => {
      setCustomCourses((prev) => prev.filter((c) => c.id !== courseId));
      setSelectedCourseIds((prev) => {
        const next = new Set(prev);
        next.delete(courseId);
        return next;
      });
    },
    []
  );

  const handleSelectSessionGroup = useCallback(
    (courseCode: string, sessionType: string, groupCode: string) => {
      setSessionGroupSelections((prev) => ({
        ...prev,
        [courseCode]: { ...(prev[courseCode] ?? {}), [sessionType]: groupCode },
      }));
    },
    []
  );

  const handleDisciplineOverride = useCallback(
    (courseId: string, discipline: string) => {
      setDisciplineOverrides((prev) => ({ ...prev, [courseId]: discipline }));
    },
    []
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

  // ─── Display labels ────────────────────────────────────────────────

  const yearLabel = isHe
    ? YEAR_CONFIG[currentYear as 1 | 2 | 3]?.nameHe ?? `שנה ${currentYear}`
    : YEAR_CONFIG[currentYear as 1 | 2 | 3]?.nameEn ?? `Year ${currentYear}`;
  const semLabel = isHe
    ? SEMESTER_CONFIG[currentSemester]?.nameHe
    : SEMESTER_CONFIG[currentSemester]?.nameEn;

  // ─── Loading state ─────────────────────────────────────────────────

  if (isLoadingCourses) {
    return <ThemedLoader />;
  }

  // ─── Summary view ──────────────────────────────────────────────────

  if (showSummary) {
    return (
      <div className="flex flex-col items-center gap-5">
        <SemesterSummary
          year={currentYear}
          semester={currentSemester}
          courses={allCurrentCourses}
          totalCredits={totalCreditsPlanned}
          hasMoreSemesters={hasMoreSemesters}
          onPlanNext={handlePlanNext}
          onFinish={handleFinish}
        />
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
              const yCfg = YEAR_CONFIG[year];
              const sCfg = SEMESTER_CONFIG[semester];
              const label = isHe
                ? `${yCfg.nameHe} ${sCfg.short}`
                : `${yCfg.nameEn} ${sCfg.shortEn}`;
              return (
                <button
                  key={key}
                  onClick={() => handleSwitchSemester(year, semester)}
                  className={cn(
                    "relative flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all",
                    isActive
                      ? "bg-foreground text-background shadow-sm"
                      : isCompleted
                        ? "bg-foreground/10 text-foreground/60 hover:bg-foreground/15"
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
          selectedCourses={allCurrentCourses}
          allCourses={mergedCourses}
          totalCreditsPlanned={totalCreditsPlanned}
          conflicts={conflicts}
          focusArea={data.focusArea}
        />
      </div>

      {/* Main content — 2-column courses + timetable below */}
      <div className="animate-stagger-3 w-full max-w-7xl space-y-4">
        {/* Row 1: Course Pool + My Semester side by side */}
        <div className="flex flex-col gap-4 lg:flex-row">
          {/* Course Pool */}
          <div className="w-full rounded-xl border border-border/40 bg-card/20 p-4 lg:w-[42%] lg:max-h-[480px] lg:overflow-hidden lg:flex lg:flex-col">
            <CoursePool
              allCourses={mergedCourses}
              currentYear={currentYear}
              currentSemester={currentSemester}
              selectedIds={selectedCourseIds}
              mandatoryIds={mandatoryIds}
              completedCourseIds={completedCourseIds}
              focusArea={data.focusArea}
              onToggleCourse={handleToggleCourse}
              onAddCustomCourse={() => setShowCustomCourseModal(true)}
              onDisciplineOverride={handleDisciplineOverride}
            />
          </div>

          {/* My Semester */}
          <div className="w-full rounded-xl border border-border/40 bg-card/20 p-4 lg:w-[58%] lg:max-h-[480px] lg:overflow-y-auto">
            <MySemester
              mandatoryCourses={mandatoryCourses}
              selectedCourses={selectedElectives}
              totalCredits={currentSemesterCredits}
              onRemoveCourse={handleRemoveCourse}
              onDeleteCustomCourse={handleDeleteCustomCourse}
              customCourseIds={customCourseIds}
              sessionGroupSelections={sessionGroupSelections}
              onSelectSessionGroup={handleSelectSessionGroup}
            />
          </div>
        </div>

        {/* Row 2: Timetable / Exam Gantt — tab toggle */}
        <div className="w-full rounded-xl border border-border/40 bg-card/20 p-4">
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
