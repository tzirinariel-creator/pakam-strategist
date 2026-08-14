"use client";

import { useState, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Search, Check, Loader2, AlertTriangle, Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DisciplineBadge } from "@/components/catalog/discipline-badge";
import {
  SEMESTER_CONFIG,
  YEAR_CONFIG,
  DISCIPLINE_CONFIG,
  CREDIT_REQUIREMENTS,
} from "@/lib/constants";
import { toast } from "sonner";
import { usePlannerStore } from "@/stores/planner-store";
import { api } from "@/lib/trpc/react";
import { invalidatePlanData } from "@/lib/trpc/invalidate-plan";
import { detectTimeConflicts, formatConflict, type SessionInfo } from "@/lib/conflict-detector";
import {
  annotateAll,
  buildBatchAddPlan,
  buildDegreeState,
  filterCounts,
  matchesFilter,
  pruneSelection,
  summarizeSelection,
  BATCH_FILTERS,
  type AnnotatedCourse,
  type BatchCourse,
  type BatchFilterId,
  type RequirementFit,
} from "@/lib/batch-course-select";
import { courseColor } from "@/lib/course-color";
import { cn } from "@/lib/utils";

/**
 * Add courses to one semester — in a BATCH.
 *
 * Adding one course at a time is the wrong shape for the week that decides the
 * semester: before the מכרז you sit down once and place the whole thing.
 * bid-it already does filter → multi-select → "add them all"
 * (docs/מחקר-מתחרים-מערכת-שעות.md §2); this is that flow, plus the part no
 * competitor can build — the picker knows the student's degree state, so it can
 * say which course closes a requirement that is still open, which mandatory
 * course is missing from the plan entirely, and which one feeds the focus area.
 *
 * Everything the single-add path guaranteed still holds: a course already in
 * the plan cannot be picked, clashes are named before you commit, prerequisites
 * stay ADVISORY (PPE is formally exempt), and every course lands in the
 * year+semester the board opened this modal for. The write itself is still
 * `plan.addCourse`, once per course — that procedure already does its duplicate
 * check inside a transaction, and a second bulk write path would be a second
 * thing to keep correct.
 *
 * It says NOTHING about bidding points. The quota is unpublished.
 */
export function AddCourseModal() {
  const t = useTranslations("planner");
  const tCommon = useTranslations("common");
  const tCredits = useTranslations("credits");
  const tCatalog = useTranslations("catalog");
  const locale = useLocale();
  const isHe = locale === "he";

  const showAddCourseModal = usePlannerStore((s) => s.showAddCourseModal);
  const targetSemester = usePlannerStore((s) => s.targetSemester);
  const targetYear = usePlannerStore((s) => s.targetYear);
  const closeAddModal = usePlannerStore((s) => s.closeAddModal);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<BatchFilterId>("all");
  // The batch, held as SNAPSHOTS of the annotated courses rather than as ids
  // into the visible list. The visible list is refetched whenever the search
  // box changes and is briefly empty while that request is in flight — holding
  // ids meant the running count blinked to zero and the batch was silently
  // dropped (caught live, 13.8: tick three, type in the search box, gone).
  const [selected, setSelected] = useState<AnnotatedCourse[]>([]);
  const [addProgress, setAddProgress] = useState<{ done: number; total: number } | null>(null);

  // Fetch course catalog (now includes scheduleSessions)
  // PERF — staleTime matches the other course.list callers. Without it this
  // inherited the 30s global default, so re-opening the picker after half a
  // minute re-downloaded the whole 302-course catalog (450 KB raw, measured).
  const { data: allCourses, isLoading: catalogLoading } = api.course.list.useQuery(
    search.length >= 2 ? { search } : undefined,
    { enabled: showAddCourseModal, staleTime: 5 * 60 * 1000 },
  );

  // Fetch user plan to know which courses are already added
  const { data: planData } = api.plan.getUserPlan.useQuery(undefined, {
    enabled: showAddCourseModal,
  });

  // The degree state — the whole reason this picker can rank instead of just
  // list. Same source the dashboard and the King read, so "חסרות 6 ש״ס" here
  // and on the home screen are the same number (audit #11).
  const { data: creditsData } = api.plan.getCredits.useQuery(undefined, {
    enabled: showAddCourseModal,
  });
  const { data: profile } = api.user.getProfile.useQuery(undefined, {
    enabled: showAddCourseModal,
  });

  // Fetch existing schedule for the target semester (for conflict detection)
  const { data: scheduleData } = api.schedule.getScheduleForSemester.useQuery(
    { year: targetYear ?? 1, semester: (targetSemester ?? "FALL") as "FALL" | "SPRING" | "SUMMER" },
    { enabled: showAddCourseModal && !!targetYear && !!targetSemester },
  );

  // Build existing sessions map for conflict detection
  const existingSessions = useMemo<SessionInfo[]>(() => {
    if (!scheduleData?.sessions) return [];
    return scheduleData.sessions.map((s) => ({
      id: s.id,
      courseCode: s.courseCode,
      courseName: isHe ? s.course.nameHe : (s.course.nameEn ?? s.course.nameHe),
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      sessionType: s.sessionType,
    }));
  }, [scheduleData?.sessions, isHe]);

  const utils = api.useUtils();
  const addCourseMutation = api.plan.addCourse.useMutation();

  // Build conflict map: courseId → conflict descriptions
  const conflictMap = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!allCourses || existingSessions.length === 0 || !targetSemester) return map;

    for (const course of allCourses) {
      // Get sessions for this course that match the target semester
      const courseSessions: SessionInfo[] = (course.scheduleSessions ?? [])
        .filter((s) => s.semester === targetSemester)
        .map((s) => ({
          id: s.id,
          courseCode: s.courseCode,
          courseName: isHe ? course.nameHe : (course.nameEn ?? course.nameHe),
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
          sessionType: s.sessionType,
        }));

      if (courseSessions.length === 0) continue;

      const conflicts = detectTimeConflicts(existingSessions, courseSessions);
      if (conflicts.length > 0) {
        map.set(
          course.id,
          conflicts.map((c) => formatConflict(c, locale === "he" ? "he" : "en")),
        );
      }
    }
    return map;
  }, [allCourses, existingSessions, targetSemester, locale, isHe]);

  // What the degree still needs, after everything already planned.
  const degreeState = useMemo(
    () =>
      buildDegreeState({
        disciplineStatus: creditsData?.disciplineStatus ?? [],
        seminarEarned: creditsData?.breakdown.seminar ?? 0,
        seminarRequired: CREDIT_REQUIREMENTS.SEMINAR_TOTAL,
        englishCoursesEarned: creditsData?.breakdown.englishCourseCount ?? 0,
        englishCoursesRequired: CREDIT_REQUIREMENTS.ENGLISH_MIN_COURSES,
        focusArea: profile?.focusArea ?? null,
        plannedCourseIds: planData?.courses.map((uc) => uc.courseId) ?? [],
      }),
    [creditsData, profile?.focusArea, planData?.courses],
  );

  const plannedCourseCodes = useMemo(
    () => new Set(planData?.courses.map((uc) => uc.course.code) ?? []),
    [planData?.courses],
  );

  const annotated = useMemo(() => {
    if (!allCourses || !targetSemester) return [];
    const candidates: BatchCourse[] = allCourses.map((c) => ({
      id: c.id,
      code: c.code,
      discipline: c.discipline,
      canCountAs: c.canCountAs ?? [],
      courseType: c.courseType,
      credits: c.credits,
      isMandatory: c.isMandatory,
      semesterOffered: (c.semesterOffered ?? []).map(String),
      prerequisites: c.prerequisites ?? [],
    }));
    return annotateAll(candidates, degreeState, {
      targetSemester,
      conflictCourseIds: new Set(conflictMap.keys()),
      plannedCourseCodes,
    });
  }, [allCourses, targetSemester, degreeState, conflictMap, plannedCourseCodes]);

  const counts = useMemo(() => filterCounts(annotated), [annotated]);
  const visible = useMemo(
    () => annotated.filter((a) => matchesFilter(a.fit, filter)),
    [annotated, filter],
  );

  // Refresh each selected entry against the latest annotation (so a clash that
  // only appears once the semester's schedule loads reaches the running total)
  // and drop anything that is no longer addable. Derived at render rather than
  // corrected in an effect: an effect that writes state back costs a second
  // render pass and lets one frame paint the stale count.
  const effectiveSelected = useMemo(
    () => (selected.length === 0 ? selected : pruneSelection(selected, annotated)),
    [annotated, selected],
  );
  const selectedIds = useMemo(
    () => new Set(effectiveSelected.map((a) => a.course.id)),
    [effectiveSelected],
  );

  const summary = useMemo(() => summarizeSelection(effectiveSelected), [effectiveSelected]);

  const nameOf = (entry: AnnotatedCourse) => {
    const c = allCourses?.find((x) => x.id === entry.course.id);
    if (!c) return entry.course.code;
    return isHe ? c.nameHe : (c.nameEn ?? c.nameHe);
  };

  const toggle = (entry: AnnotatedCourse) => {
    setSelected((prev) =>
      prev.some((a) => a.course.id === entry.course.id)
        ? prev.filter((a) => a.course.id !== entry.course.id)
        : [...prev, entry],
    );
  };

  /**
   * Fire the batch. Sequential on purpose: the same `plan.addCourse` the single
   * path uses, one at a time, so the server's per-course duplicate transaction
   * and attempt-number logic run exactly as they always have. Each course is
   * caught on its own — one failure must not swallow the four that succeeded,
   * and the student is told the real split.
   */
  const handleAddSelected = async () => {
    if (!targetYear || !targetSemester || summary.count === 0) return;

    const items = buildBatchAddPlan(effectiveSelected, {
      plannedYear: targetYear,
      plannedSemester: targetSemester,
    });
    if (items.length === 0) return;

    setAddProgress({ done: 0, total: items.length });
    const added: string[] = [];
    const failed: AnnotatedCourse[] = [];
    let lastError = "";

    for (const [index, item] of items.entries()) {
      try {
        await addCourseMutation.mutateAsync({
          courseId: item.courseId,
          plannedYear: item.plannedYear,
          plannedSemester: item.plannedSemester as "FALL" | "SPRING" | "SUMMER",
        });
        added.push(item.courseId);
      } catch (e) {
        const entry = effectiveSelected.find((a) => a.course.id === item.courseId);
        if (entry) failed.push(entry);
        lastError = e instanceof Error ? e.message : "";
      }
      setAddProgress({ done: index + 1, total: items.length });
    }

    setAddProgress(null);

    // Adding courses changes credits, forecast and compliance (#23) — same
    // invalidation set the single-add path used.
    invalidatePlanData(utils);
    void utils.schedule.getScheduleForSemester.invalidate();

    if (added.length > 0) {
      const addedSet = new Set(added);
      setSelected((prev) => prev.filter((a) => !addedSet.has(a.course.id)));
    }

    if (failed.length === 0) {
      toast.success(
        added.length === 1
          ? t("courseAdded")
          : isHe
            ? `${added.length} קורסים נוספו לתוכנית`
            : `${added.length} courses added to your plan`,
      );
      closeAddModal();
      setSearch("");
      setFilter("all");
      return;
    }

    if (added.length === 0) {
      // Surface the server's own message when it has one — the demo account's
      // read-only guard, for instance, explains itself far better than a
      // generic failure toast would.
      toast.error(lastError || tCommon("error"));
      return;
    }

    toast.warning(
      isHe
        ? `נוספו ${added.length} מתוך ${items.length}. לא הצלחנו להוסיף: ${failed.map(nameOf).filter(Boolean).join(", ")}`
        : `Added ${added.length} of ${items.length}. Could not add: ${failed.map(nameOf).filter(Boolean).join(", ")}`,
    );
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      closeAddModal();
      setSearch("");
      setFilter("all");
      setSelected([]);
    }
  };

  const yearConfig = targetYear
    ? (YEAR_CONFIG[targetYear as keyof typeof YEAR_CONFIG] ?? null)
    : null;
  const semConfig = targetSemester
    ? (SEMESTER_CONFIG[targetSemester as keyof typeof SEMESTER_CONFIG] ?? null)
    : null;
  const semesterName = semConfig ? (isHe ? semConfig.nameHe : semConfig.nameEn) : "";

  const filterLabel = (id: BatchFilterId): string => {
    if (isHe) {
      return {
        all: "הכול",
        needed: "סוגרים דרישה",
        mandatory: "חובה שחסרים",
        focus: "תחום המיקוד",
        clear: "בלי חפיפות",
      }[id];
    }
    return {
      all: "All",
      needed: "Closes a gap",
      mandatory: "Missing mandatory",
      focus: "Focus area",
      clear: "No clashes",
    }[id];
  };

  /** "סוגר דרישה בפילוסופיה — חסרות 6 ש״ס". Numbers isolated with <bdi>. */
  const requirementLine = (fit: RequirementFit) => {
    if (fit.kind === "discipline") {
      const cfg = fit.discipline ? DISCIPLINE_CONFIG[fit.discipline] : null;
      const name = cfg ? (isHe ? cfg.nameHe : cfg.nameEn) : (fit.discipline ?? "");
      return isHe ? (
        <>
          סוגר דרישה ב{name} — חסרות <bdi dir="ltr" className="tabular-nums">{fit.remaining}</bdi> ש״ס
        </>
      ) : (
        <>
          Closes {name} — <bdi dir="ltr" className="tabular-nums">{fit.remaining}</bdi> credits short
        </>
      );
    }
    if (fit.kind === "seminar") {
      return isHe ? (
        <>
          נספר לסמינריונים — חסרות <bdi dir="ltr" className="tabular-nums">{fit.remaining}</bdi> ש״ס
        </>
      ) : (
        <>
          Counts toward seminars — <bdi dir="ltr" className="tabular-nums">{fit.remaining}</bdi> credits short
        </>
      );
    }
    return isHe ? (
      <>
        נספר לאנגלית — חסרים <bdi dir="ltr" className="tabular-nums">{fit.remaining}</bdi> קורסים
      </>
    ) : (
      <>
        Counts toward English — <bdi dir="ltr" className="tabular-nums">{fit.remaining}</bdi> to go
      </>
    );
  };

  const isAdding = addProgress !== null;

  return (
    <Dialog open={showAddCourseModal} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[85dvh] max-w-lg flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display font-bold text-foreground/80">
            {isHe ? "הוסיפו קורסים" : "Add courses"}
          </DialogTitle>
          {yearConfig && semConfig && (
            <DialogDescription>
              {t("addingTo", {
                year: isHe ? yearConfig.nameHe : yearConfig.nameEn,
                semester: isHe ? semConfig.nameHe : semConfig.nameEn,
              })}
              {" · "}
              {isHe
                ? "סמנו כמה קורסים והוסיפו אותם בבת אחת"
                : "tick several and add them in one go"}
            </DialogDescription>
          )}
        </DialogHeader>

        {/* Search input */}
        <div className="relative shrink-0">
          <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tCatalog("searchPlaceholder")}
            aria-label={tCatalog("searchPlaceholder")}
            className="ps-9"
            autoFocus
          />
        </div>

        {/* Fit filters. These are the advantage: a competitor can filter by
            faculty, we can filter by what your degree is still missing. */}
        <div className="flex shrink-0 flex-wrap gap-1.5" role="group" aria-label={isHe ? "סינון" : "Filter"}>
          {BATCH_FILTERS.map((id) => {
            const count = counts[id] ?? 0;
            const active = filter === id;
            const empty = count === 0 && id !== "all";
            return (
              <button
                key={id}
                type="button"
                disabled={empty}
                aria-pressed={active}
                onClick={() => setFilter(id)}
                className={cn(
                  "flex min-h-[32px] items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  active
                    ? "border-foreground/40 bg-foreground/10 text-foreground/90"
                    : "border-border/60 text-foreground/70 hover:border-foreground/25 hover:text-foreground/90",
                  empty && "cursor-not-allowed opacity-35 hover:border-border/60",
                )}
              >
                {filterLabel(id)}
                {/* /60, not /45: measured live at 11px it came in at 3.86:1
                    against the dialog in dark. The count is real information —
                    "how many courses am I about to see" — not decoration. */}
                <bdi dir="ltr" className="tabular-nums text-[11px] text-foreground/60">
                  {count}
                </bdi>
              </button>
            );
          })}
        </div>

        {/* Course list */}
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-1 pe-1">
            {catalogLoading && (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="size-5 animate-spin text-foreground/80" />
                <span className="ms-2 text-sm text-muted-foreground">
                  {tCommon("loading")}
                </span>
              </div>
            )}

            {!catalogLoading && visible.length === 0 && (
              <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                {tCommon("noResults")}
              </div>
            )}

            {!catalogLoading &&
              visible.map((entry) => {
                const { course, fit } = entry;
                const raw = allCourses?.find((c) => c.id === course.id);
                if (!raw) return null;
                const conflicts = conflictMap.get(course.id);
                const isPicked = selectedIds.has(course.id);

                return (
                  <button
                    key={course.id}
                    type="button"
                    role="checkbox"
                    aria-checked={isPicked}
                    disabled={!fit.selectable || isAdding}
                    onClick={() => toggle(entry)}
                    className={cn(
                      "flex items-start gap-3 rounded-lg border p-2.5 text-start transition-colors",
                      isPicked
                        ? "border-foreground/40 bg-foreground/[0.06]"
                        : "border-transparent hover:border-foreground/20 hover:bg-foreground/[0.03]",
                      !fit.selectable && "cursor-not-allowed opacity-40 hover:border-transparent hover:bg-transparent",
                      fit.selectable && !isAdding && "cursor-pointer",
                    )}
                  >
                    {/* Tick box + the course's own colour, so a course looks the
                        same here as it will on the grid the moment it lands. */}
                    <span
                      aria-hidden
                      className={cn(
                        "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                        isPicked ? "border-transparent" : "border-foreground/25",
                      )}
                      style={
                        isPicked
                          ? { backgroundColor: courseColor(course.code) }
                          : undefined
                      }
                    >
                      {isPicked && <Check className="size-3 text-white" strokeWidth={3} />}
                    </span>

                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {isHe ? raw.nameHe : (raw.nameEn ?? raw.nameHe)}
                        </span>
                        <bdi dir="ltr" className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                          {course.code}
                        </bdi>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <DisciplineBadge
                          discipline={raw.discipline}
                          className="text-[10px] px-1.5 py-0"
                        />
                        <span className="text-[10px] text-muted-foreground">
                          <span className="tabular">{course.credits}</span> {tCredits("title")}
                        </span>
                        {fit.isMandatoryUnplanned && (
                          <span className="rounded-full border border-foreground/25 px-1.5 py-0 text-[10px] font-medium text-foreground/70">
                            {isHe ? "חובה — עוד לא בתוכנית" : "Mandatory — not in plan"}
                          </span>
                        )}
                        {fit.isFocusArea && (
                          <span className="rounded-full border border-foreground/20 px-1.5 py-0 text-[10px] text-foreground/70">
                            {isHe ? "תחום המיקוד שלכם" : "Your focus area"}
                          </span>
                        )}
                      </div>

                      {/* What this course does for the degree — the thing the
                          competitors structurally cannot say. */}
                      {fit.closes && !fit.alreadyPlanned && (
                        <span className="flex items-start gap-1 text-[10px] leading-tight text-emerald-700 dark:text-emerald-400">
                          <Check className="mt-px size-3 shrink-0" />
                          {requirementLine(fit.closes)}
                        </span>
                      )}

                      {/* Clash — named, per the M2 rule: never just "חפיפה". */}
                      {conflicts && conflicts.length > 0 && !fit.alreadyPlanned && (
                        <span className="flex items-start gap-1 text-[10px] leading-tight text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="mt-px size-3 shrink-0" />
                          {conflicts[0]}
                        </span>
                      )}

                      {!fit.offeredInTarget && (
                        <span className="flex items-start gap-1 text-[10px] leading-tight text-muted-foreground">
                          <Info className="mt-px size-3 shrink-0" />
                          {isHe
                            ? `לפי הידיעון הקורס לא מוצע ב${semesterName}`
                            : `The catalog does not list this course in ${semesterName}`}
                        </span>
                      )}

                      {/* Advisory only — PPE is formally exempt from
                          prerequisites, so this never blocks the tick. */}
                      {fit.missingPrereqs.length > 0 && !fit.alreadyPlanned && (
                        <span className="text-[10px] leading-tight text-muted-foreground">
                          {isHe ? "מומלץ לפני כן: " : "Recommended first: "}
                          <bdi dir="ltr" className="tabular-nums">
                            {fit.missingPrereqs.join(", ")}
                          </bdi>
                        </span>
                      )}
                    </div>

                    {fit.alreadyPlanned && (
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {t("alreadyAdded")}
                      </span>
                    )}
                  </button>
                );
              })}
          </div>
        </ScrollArea>

        {/* Running total + the one action. Always visible, so the count of what
            you are about to do is never a scroll away. */}
        <div className="flex shrink-0 flex-col gap-2 border-t border-border/60 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span
              className="text-sm font-semibold text-foreground/85"
              role="status"
              aria-live="polite"
            >
              {summary.count === 0
                ? isHe
                  ? "לא נבחרו קורסים"
                  : "Nothing selected"
                : isHe
                  ? <>
                      נבחרו <bdi dir="ltr" className="tabular-nums">{summary.count}</bdi> קורסים
                      {" · "}
                      <bdi dir="ltr" className="tabular-nums">{summary.credits}</bdi> ש״ס
                    </>
                  : <>
                      <bdi dir="ltr" className="tabular-nums">{summary.count}</bdi> selected
                      {" · "}
                      <bdi dir="ltr" className="tabular-nums">{summary.credits}</bdi> credits
                    </>}
            </span>
            {summary.conflicts > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400">
                <AlertTriangle className="size-3 shrink-0" />
                {isHe ? (
                  <>
                    <bdi dir="ltr" className="tabular-nums">{summary.conflicts}</bdi> מהם חופפים בלו״ז
                  </>
                ) : (
                  <>
                    <bdi dir="ltr" className="tabular-nums">{summary.conflicts}</bdi> of them clash
                  </>
                )}
              </span>
            )}
            {summary.conflicts === 0 && summary.closesRequirements > 0 && (
              <span className="text-[11px] text-emerald-700 dark:text-emerald-400">
                {isHe ? (
                  <>
                    <bdi dir="ltr" className="tabular-nums">{summary.closesRequirements}</bdi> מהם סוגרים דרישה חסרה
                  </>
                ) : (
                  <>
                    <bdi dir="ltr" className="tabular-nums">{summary.closesRequirements}</bdi> close an open requirement
                  </>
                )}
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {summary.count > 0 && !isAdding && (
              <button
                type="button"
                onClick={() => setSelected([])}
                className="rounded-lg px-3 py-2 text-sm text-foreground/70 transition-colors hover:text-foreground/90"
              >
                {isHe ? "נקו בחירה" : "Clear"}
              </button>
            )}
            <button
              type="button"
              disabled={summary.count === 0 || isAdding}
              onClick={() => void handleAddSelected()}
              className={cn(
                "flex min-h-[40px] items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                summary.count === 0 || isAdding
                  ? "cursor-not-allowed bg-foreground/10 text-foreground/40"
                  : "bg-foreground text-primary-foreground hover:bg-foreground/90",
              )}
            >
              {isAdding ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {isHe ? (
                    <>
                      מוסיפים <bdi dir="ltr" className="tabular-nums">{addProgress.done}</bdi> מתוך{" "}
                      <bdi dir="ltr" className="tabular-nums">{addProgress.total}</bdi>
                    </>
                  ) : (
                    <>
                      Adding <bdi dir="ltr" className="tabular-nums">{addProgress.done}</bdi> of{" "}
                      <bdi dir="ltr" className="tabular-nums">{addProgress.total}</bdi>
                    </>
                  )}
                </>
              ) : summary.count <= 1 ? (
                isHe ? "הוסיפו לתוכנית" : "Add to plan"
              ) : isHe ? (
                <>
                  הוסיפו <bdi dir="ltr" className="tabular-nums">{summary.count}</bdi> קורסים
                </>
              ) : (
                <>
                  Add <bdi dir="ltr" className="tabular-nums">{summary.count}</bdi> courses
                </>
              )}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
