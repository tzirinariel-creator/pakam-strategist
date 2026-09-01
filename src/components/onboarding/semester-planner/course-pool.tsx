"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { BookOpen, Lock, Plus, Search, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { canTakeCourse, type CourseWithSchedule, type GeneratedPlanCourse } from "@/lib/plan-generator";
import { CourseBubble, type BubbleState } from "./course-bubble";
import { api } from "@/lib/trpc/react";

type TabKey = "mandatory" | "elective" | "law" | "seminar";

interface CoursePoolProps {
  allCourses: CourseWithSchedule[];
  currentYear: number;
  currentSemester: "FALL" | "SPRING";
  selectedIds: Set<string>;
  mandatoryIds: Set<string>;
  completedCourseIds: Set<string>;
  focusArea: string | null;
  onToggleCourse: (courseId: string) => void;
  /** Hover/focus on an unselected bubble → ghost it on the live grid (#2). */
  onPreviewCourse?: (courseId: string | null) => void;
  onAddCustomCourse?: () => void;
  onDisciplineOverride?: (courseId: string, discipline: string) => void;
}

export function CoursePool({
  allCourses,
  currentYear,
  currentSemester,
  selectedIds,
  mandatoryIds,
  completedCourseIds,
  focusArea,
  onToggleCourse,
  onPreviewCourse,
  onAddCustomCourse,
  onDisciplineOverride,
}: CoursePoolProps) {
  const t = useTranslations("onboarding");
  const locale = useLocale();
  const isHe = locale === "he";
  const [activeTab, setActiveTab] = useState<TabKey>("elective");
  const [searchQuery, setSearchQuery] = useState("");

  // Filter courses available for this semester
  const availableCourses = useMemo(() => {
    return allCourses.filter((c) => {
      // Skip already completed courses
      if (completedCourseIds.has(c.id)) return false;
      // Skip mandatory courses (they're already in "My Semester")
      if (mandatoryIds.has(c.id)) return false;
      // The SEMESTER filter stays: a course that is not taught this term
      // genuinely cannot be taken this term. That is a fact about the
      // timetable, not a preference of ours.
      const offered = c.semesterOffered.map(String);
      if (offered.length > 0 && !offered.includes(currentSemester)) return false;

      // גיל, 24.8: "זה לא נותן קורסים שזמינים להוסיף למשל".
      //
      // The YEAR filter used to hide as hard as the semester one, and it is
      // not the same kind of claim. `yearOffered` is our catalog's RECOMMENDED
      // year, not a gate: only 10 of 344 courses in the whole catalog carry a
      // prerequisite, and the King's own course list is documented as
      // unfiltered for exactly this reason. Counted against production: a
      // first-year in semester A was shown 19 of 278 electives. 259 courses
      // they may perfectly well take were invisible, and the screen said
      // "אין קורסי בחירה זמינים לסמסטר הזה" — which is not true.
      //
      // So a course outside its recommended year is SHOWN and MARKED, and
      // sorted after the ones that fit. Proposing and labelling is what this
      // app does everywhere else; hiding was the odd one out.
      return true;
    });
  }, [allCourses, currentSemester, mandatoryIds, completedCourseIds]);

  /** Outside the year our catalog recommends — shown, but said out loud. */
  const isOutOfRecommendedYear = useCallback(
    (c: { yearOffered: number[] }) =>
      c.yearOffered.length > 0 && !c.yearOffered.includes(currentYear),
    [currentYear],
  );

  // S3 — cohort recommendations for the visible pool, in ONE batched query
  // (getForCourses; aggregate-only, k-anonymous). Tag shows only when ≥60%
  // of enough raters recommend. Silent on error — the pool works without it.
  const knowledgeQuery = api.courseKnowledge.getForCourses.useQuery(
    { courseCodes: availableCourses.map((c) => c.code) },
    { enabled: availableCourses.length > 0, staleTime: 5 * 60 * 1000, retry: 1 },
  );
  const isCohortRecommended = (code: string): boolean => {
    const k = knowledgeQuery.data?.[code];
    return !!k && k.revealed && (k.recommendShare ?? 0) >= 0.6;
  };

  // Group by tab
  const grouped = useMemo(() => {
    const mandatory: CourseWithSchedule[] = [];
    const elective: CourseWithSchedule[] = [];
    const law: CourseWithSchedule[] = [];
    const seminar: CourseWithSchedule[] = [];

    for (const c of availableCourses) {
      if (c.courseType === "SEMINAR") seminar.push(c);
      else if (c.courseType === "LAW_FOUNDATION") law.push(c);
      else if (c.courseType === "MANDATORY" || c.isMandatory) mandatory.push(c);
      else elective.push(c);
    }

    return { mandatory, elective, law, seminar };
  }, [availableCourses]);

  // Build planned courses list for canTakeCourse prereq check
  const plannedForPrereqCheck = useMemo(() => {
    const planned: GeneratedPlanCourse[] = [];
    // All completed courses count as taken
    for (const id of completedCourseIds) {
      planned.push({ courseId: id, plannedYear: 1, plannedSemester: "FALL", locked: false });
    }
    // All mandatory + selected in current semester count as concurrent
    for (const id of mandatoryIds) {
      planned.push({ courseId: id, plannedYear: currentYear, plannedSemester: currentSemester, locked: true });
    }
    for (const id of selectedIds) {
      if (!mandatoryIds.has(id)) {
        planned.push({ courseId: id, plannedYear: currentYear, plannedSemester: currentSemester, locked: false });
      }
    }
    return planned;
  }, [completedCourseIds, mandatoryIds, selectedIds, currentYear, currentSemester]);

  // PERF — all three of these MUST stay reference-stable, because `tabs` is a
  // dep of the reset effect below and that effect calls setActiveTab. As bare
  // array literals they were fresh references on every render, so the effect
  // re-ran after every render it had itself caused. It converged only because
  // the `length === 0` guard happened to go false in one hop — an accident of
  // the current data, not a property of the code. The moment a semester switch
  // leaves the target tab empty too, that is an unbounded setState loop
  // ("Maximum update depth exceeded"), the same class of bug fixed in the
  // onboarding wizard in 10.7. `grouped` is already memoized above, so pinning
  // these to it is enough.

  // Elective-family tabs (the student CHOOSES to add these).
  const electiveTabs: { key: TabKey; label: string; count: number }[] = useMemo(
    () => [
      { key: "elective", label: t("tabElective"), count: grouped.elective.length },
      { key: "law", label: t("tabLaw"), count: grouped.law.length },
      { key: "seminar", label: t("tabSeminar"), count: grouped.seminar.length },
    ],
    [grouped, t],
  );

  // Mandatory tab only appears for non-auto-placed mandatory courses (rare):
  // most mandatory courses are already locked into "My Semester".
  const mandatoryTabs: { key: TabKey; label: string; count: number }[] = useMemo(
    () =>
      grouped.mandatory.length > 0
        ? [{ key: "mandatory", label: t("tabMandatory"), count: grouped.mandatory.length }]
        : [],
    [grouped, t],
  );

  // Flat list preserved for activeTab reset logic below.
  const tabs = useMemo(
    () => [...mandatoryTabs, ...electiveTabs],
    [mandatoryTabs, electiveTabs],
  );

  // Reset activeTab when current tab has no courses (e.g., after semester switch)
  useEffect(() => {
    if (grouped[activeTab]?.length === 0) {
      const firstAvailable = tabs.find((t) => t.count > 0);
      if (firstAvailable) setActiveTab(firstAvailable.key);
    }
  }, [grouped, activeTab, tabs]);

  const currentCourses = grouped[activeTab] ?? [];

  // Filter by search query, then sort: recommended first, then alphabetical
  const sortedCourses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? currentCourses.filter((c) => {
          const nameHe = c.nameHe.toLowerCase();
          const nameEn = (c.nameEn ?? "").toLowerCase();
          const code = c.code.toLowerCase();
          return nameHe.includes(q) || nameEn.includes(q) || code.includes(q);
        })
      : currentCourses;

    return [...filtered].sort((a, b) => {
      // Courses that fit THIS year come first. They are no longer hidden, so
      // ordering is what keeps the pool's default view sensible.
      const aFits = isOutOfRecommendedYear(a) ? 1 : 0;
      const bFits = isOutOfRecommendedYear(b) ? 1 : 0;
      if (aFits !== bFits) return aFits - bFits;
      // Recommended (focus area match) first
      if (focusArea) {
        const aMatch = a.discipline === focusArea ? 0 : 1;
        const bMatch = b.discipline === focusArea ? 0 : 1;
        if (aMatch !== bMatch) return aMatch - bMatch;
      }
      // Then alphabetical
      const aName = isHe ? a.nameHe : (a.nameEn ?? a.nameHe);
      const bName = isHe ? b.nameHe : (b.nameEn ?? b.nameHe);
      return aName.localeCompare(bName, isHe ? "he" : "en");
    });
  }, [currentCourses, focusArea, isHe, searchQuery, isOutOfRecommendedYear]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground/70">
          {t("coursePool")}
        </h3>
        {onAddCustomCourse && (
          <button
            onClick={onAddCustomCourse}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-foreground/40 hover:text-foreground/60 hover:bg-foreground/5 transition-all"
          >
            <Plus className="h-3 w-3" />
            {isHe ? "ידני" : "Custom"}
          </button>
        )}
      </div>

      {/* Frame — explains mandatory was placed; add electives to reach 150 */}
      <p className="mb-3 rounded-lg bg-foreground/[0.03] px-3 py-2 text-[11px] leading-snug text-foreground/45">
        {t("poolFrame")}
      </p>

      {/* P-ג: "למה לא בונה תוכנית לימוד."
          Pakamon arranges the GROUPS of the courses you chose and flags what
          your requirements are still missing — it never chooses the courses.
          That is a position, not a missing feature, and it was nowhere on the
          screen: someone expecting a generated plan met silence and read it as
          the tool falling short.

          It lives HERE, at the pool, rather than on the assistant card where I
          first put it — that card returns null unless the student has a course
          with swappable groups, so on the very screens where nothing needed
          arranging the answer would not have appeared at all. This is the
          place the choosing actually happens.

          Whether it should EVER pick courses is Ariel's call and is not being
          taken here. */}
      <p className="mb-3 text-[11px] leading-snug text-foreground/35">
        {isHe
          ? "את הקורסים אתם בוחרים — פכמון לא בוחר בשבילכם. הוא מסמן מה עוד חסר לדרישות, מה מתנגש, ומה כתוב בידיעון."
          : "You choose the courses — Pakamon does not choose for you. It flags what your requirements still need, what clashes, and what the ידיעון says."}
      </p>

      {/* Colour legend (#13). The dot on a bubble used to be its DISCIPLINE;
          it is now the COURSE's own colour, so it matches that course's block
          on the timetable beside this pool and its card on the plan board
          (src/lib/course-color.ts). The discipline is still named in words on
          every bubble's badge, so nothing was lost — but a legend claiming the
          dots are a field key would now be wrong, so it says what is true. */}
      <p className="mb-3 text-[10px] leading-snug text-foreground/45">
        {isHe
          ? "לכל קורס צבע קבוע — אותו צבע כאן, במערכת השעות ובלוח התכנון."
          : "Each course keeps one colour — the same here, on the timetable and on the board."}
      </p>

      {/* Tabs — split into the two groups a first-year actually needs to tell apart:
          mandatory (pick a time/group) vs elective (choose to add). */}
      <div className="mb-3 space-y-2">
        {mandatoryTabs.length > 0 && (
          <div>
            <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-foreground/40">
              <Lock className="h-2.5 w-2.5" />
              {t("poolGroupMandatory")}
            </p>
            <div className="flex gap-1.5 overflow-x-auto">
              {mandatoryTabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                    activeTab === tab.key
                      ? "bg-foreground/10 text-foreground/80"
                      : "bg-foreground/5 text-foreground/40 hover:text-foreground/60"
                  )}
                >
                  {tab.label}
                  <span className="ms-1 font-mono text-[10px] opacity-60">{tab.count}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-foreground/40">
            <Plus className="h-2.5 w-2.5" />
            {t("poolGroupElective")}
          </p>
          <div className="flex gap-1.5 overflow-x-auto">
            {electiveTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                  activeTab === tab.key
                    ? "bg-foreground/10 text-foreground/80"
                    : "bg-foreground/5 text-foreground/40 hover:text-foreground/60"
                )}
              >
                {tab.label}
                <span className="ms-1 font-mono text-[10px] opacity-60">{tab.count}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Search input */}
      <div className="relative mb-2">
        <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/30" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={isHe ? "חיפוש קורס..." : "Search course..."}
          aria-label={isHe ? "חיפוש קורס לפי שם או מספר" : "Search a course by name or code"}
          className="w-full rounded-md border border-foreground/10 bg-foreground/[0.02] py-1.5 pe-3 ps-8 text-xs text-foreground placeholder:text-foreground/25 focus:border-foreground/25 focus:outline-none"
        />
      </div>

      {/* Course list */}
      <div className="flex-1 space-y-1.5 overflow-y-auto pe-1">
        {sortedCourses.length === 0 ? (
          // Mandatory-only semester (#2 mode split): when the ELECTIVE tab has
          // nothing to pick and there ARE mandatory courses this semester, frame
          // it as "approve", not "empty" — the schedule is already built.
          activeTab === "elective" && mandatoryIds.size > 0 && searchQuery.trim() === "" ? (
            <div className="rounded-xl border border-dashed border-border/50 bg-foreground/[0.02] p-4 text-center">
              <p className="text-sm text-foreground/55">
                {isHe
                  ? "הסמסטר הזה כמעט כולו חובה — רוב המערכת כבר סגורה מראש. נשאר רק לבחור קבוצות תרגול ולאשר."
                  : "This semester is almost all mandatory — your schedule is already built. Just pick tutorial groups and confirm."}
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <BookOpen className="h-8 w-8 text-foreground/20" />
              <p className="mt-2 text-xs text-foreground/40">
                {t("noElectivesAvailable")}
              </p>
            </div>
          )
        ) : (
          sortedCourses.map((course) => {
            const isSelected = selectedIds.has(course.id);
            const prereqCheck = canTakeCourse(
              course.id,
              currentYear,
              currentSemester,
              plannedForPrereqCheck,
              allCourses
            );
            const isRecommended = focusArea ? course.discipline === focusArea : false;

            // PPE students are formally exempt from course prerequisites
            // (Yedion note 19), so an unmet prereq must NEVER block adding a
            // course — it stays "default" and addable. The amber prereq badge
            // + tooltip on CourseBubble already carries the advisory cue, so the
            // student is still informed. Only a non-prereq failure (e.g. the
            // genuine semester-offering gate) may disable the bubble.
            const prereqOnlyIssue = !prereqCheck.ok ? false : !!prereqCheck.prereqAdvisory;
            let bubbleState: BubbleState = "default";
            if (isSelected) bubbleState = "selected";
            else if (!prereqCheck.ok) bubbleState = "disabled";

            return (
              <CourseBubble
                key={course.id}
                course={course}
                state={bubbleState}
                disabledReason={
                  // Only surface a reason when the bubble is actually disabled
                  // (semester-offering gate). Prereq hints are advisory and shown
                  // via the amber badge instead, so they never read as a blocker.
                  bubbleState === "disabled" || prereqOnlyIssue
                    ? (isHe ? prereqCheck.reasonHe : prereqCheck.reason)
                    : undefined
                }
                recommended={isRecommended}
                cohortRecommended={isCohortRecommended(course.code)}
                outOfRecommendedYear={
                  isOutOfRecommendedYear(course) ? { years: course.yearOffered } : undefined
                }
                onToggle={() => onToggleCourse(course.id)}
                // Ghost only bubbles that would ADD something: selected courses
                // are already solid on the grid, disabled ones can't be picked.
                onHoverPreview={
                  bubbleState === "default"
                    ? (on) => onPreviewCourse?.(on ? course.id : null)
                    : undefined
                }
                onDisciplineOverride={onDisciplineOverride}
              />
            );
          })
        )}
      </div>

      {/* Star legend */}
      {focusArea && (
        <div className="mt-2 flex items-center gap-1 text-[10px] text-foreground/30">
          <Star className="h-2.5 w-2.5 fill-current" />
          <span>{t("starLegend")}</span>
        </div>
      )}
    </div>
  );
}
