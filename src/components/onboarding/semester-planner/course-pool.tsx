"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { BookOpen, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { canTakeCourse, type CourseWithSchedule, type GeneratedPlanCourse } from "@/lib/plan-generator";
import { CourseBubble, type BubbleState } from "./course-bubble";

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
      // Check if offered this semester
      const offered = c.semesterOffered.map(String);
      if (offered.length > 0 && !offered.includes(currentSemester)) return false;
      // Check if offered this year
      if (c.yearOffered.length > 0 && !c.yearOffered.includes(currentYear)) return false;
      return true;
    });
  }, [allCourses, currentYear, currentSemester, mandatoryIds, completedCourseIds]);

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

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "elective", label: t("tabElective"), count: grouped.elective.length },
    { key: "law", label: t("tabLaw"), count: grouped.law.length },
    { key: "seminar", label: t("tabSeminar"), count: grouped.seminar.length },
  ];

  // Only show mandatory tab if there are non-auto-selected mandatory courses
  if (grouped.mandatory.length > 0) {
    tabs.unshift({ key: "mandatory", label: t("tabMandatory"), count: grouped.mandatory.length });
  }

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
  }, [currentCourses, focusArea, isHe, searchQuery]);

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

      {/* Tabs */}
      <div className="mb-3 flex gap-1.5 overflow-x-auto">
        {tabs.map((tab) => (
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

      {/* Search input */}
      <div className="relative mb-2">
        <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/30" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={isHe ? "חיפוש קורס..." : "Search course..."}
          className="w-full rounded-md border border-foreground/10 bg-foreground/[0.02] py-1.5 pe-3 ps-8 text-xs text-foreground placeholder:text-foreground/25 focus:border-foreground/25 focus:outline-none"
        />
      </div>

      {/* Course list */}
      <div className="flex-1 space-y-1.5 overflow-y-auto pe-1">
        {sortedCourses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <BookOpen className="h-8 w-8 text-foreground/20" />
            <p className="mt-2 text-xs text-foreground/40">
              {t("noElectivesAvailable")}
            </p>
          </div>
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

            let bubbleState: BubbleState = "default";
            if (isSelected) bubbleState = "selected";
            else if (!prereqCheck.ok) bubbleState = "disabled";

            return (
              <CourseBubble
                key={course.id}
                course={course}
                state={bubbleState}
                disabledReason={
                  isHe ? prereqCheck.reasonHe : prereqCheck.reason
                }
                recommended={isRecommended}
                onToggle={() => onToggleCourse(course.id)}
                onDisciplineOverride={onDisciplineOverride}
              />
            );
          })
        )}
      </div>

      {/* Star legend */}
      {focusArea && (
        <div className="mt-2 flex items-center gap-1 text-[10px] text-foreground/30">
          <span>★</span>
          <span>{t("starLegend")}</span>
        </div>
      )}
    </div>
  );
}
