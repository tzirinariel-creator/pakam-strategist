"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Search, Plus, FolderOpen, GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";
import { DISCIPLINE_CONFIG, SEMESTER_CONFIG, YEAR_CONFIG } from "@/lib/constants";
import type { Semester } from "@/types/enums";
import type { CourseWithSchedule } from "@/lib/plan-generator";
import { isEnglishCourse } from "@/lib/english-standing";

// -----------------------------------------------------------------------
// Add-a-past-course search (reuses step-history's catalog search idea).
// -----------------------------------------------------------------------

export function AddCourse({
  catalog,
  existingCourseIds,
  focusArea,
  pastSemesters,
  isHe,
  onAdd,
  isSaving,
  t,
}: {
  catalog: CourseWithSchedule[];
  existingCourseIds: Set<string>;
  focusArea: string | null;
  /** Valid past placements, oldest→newest. Last entry = most recent past. */
  pastSemesters: { year: number; semester: "FALL" | "SPRING" }[];
  isHe: boolean;
  onAdd: (
    course: CourseWithSchedule,
    placement: { year: number; semester: Semester }
  ) => void;
  isSaving: boolean;
  t: ReturnType<typeof useTranslations<"record">>;
}) {
  const [search, setSearch] = useState("");

  // Distinct past years + semesters offered, for the two selectors.
  const years = useMemo(
    () => Array.from(new Set(pastSemesters.map((s) => s.year))).sort((a, b) => a - b),
    [pastSemesters]
  );

  // Default placement = the MOST RECENT past semester (one step before current),
  // never the current one — this screen records the past.
  const mostRecentPast =
    pastSemesters.length > 0 ? pastSemesters[pastSemesters.length - 1]! : null;
  const [chosenYear, setChosenYear] = useState<number>(
    mostRecentPast?.year ?? years[0] ?? 1
  );
  const [chosenSemester, setChosenSemester] = useState<"FALL" | "SPRING">(
    mostRecentPast?.semester ?? "FALL"
  );

  // Semesters available for the chosen year (FALL/SPRING that are actually past).
  const semestersForYear = useMemo(
    () =>
      pastSemesters
        .filter((s) => s.year === chosenYear)
        .map((s) => s.semester),
    [pastSemesters, chosenYear]
  );

  // Keep the semester selection valid when the year changes.
  const effectiveSemester: "FALL" | "SPRING" = semestersForYear.includes(
    chosenSemester
  )
    ? chosenSemester
    : (semestersForYear[0] ?? "FALL");

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    return catalog
      .filter((c) => !existingCourseIds.has(c.id))
      .filter((c) => {
        const hay = `${c.code} ${c.nameHe ?? ""} ${c.nameEn ?? ""}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 8);
  }, [search, catalog, existingCourseIds]);

  const yearLabel = isHe
    ? YEAR_CONFIG[chosenYear as 1 | 2 | 3]?.nameHe
    : YEAR_CONFIG[chosenYear as 1 | 2 | 3]?.nameEn;
  const semLabel = isHe
    ? SEMESTER_CONFIG[effectiveSemester]?.nameHe
    : SEMESTER_CONFIG[effectiveSemester]?.nameEn;
  const targetLabel = `${yearLabel} · ${semLabel}`;

  const selectClass =
    "rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-foreground/30 focus:outline-none";

  // No genuinely-past semester exists (e.g. a brand-new year-1·FALL student):
  // there is no valid PAST placement, so adding a course here would silently
  // mark it COMPLETED in the current, unfinished semester with no placement
  // choice — polluting completed credits, the weighted average, and the
  // year-1 transition gate. Refuse: show an honest empty state pointing at
  // onboarding/the planner instead of the catalog add-search.
  if (pastSemesters.length === 0) {
    return (
      <div className="data-card p-8 text-center">
        <div className="mb-5 flex justify-center">
          <FolderOpen className="h-12 w-12 text-foreground/60" />
        </div>
        <h2 className="mb-2 font-display text-lg font-bold text-foreground/90">
          {t("addTitle")}
        </h2>
        <p className="mb-6 text-sm text-foreground/60">{t("emptyDescNoCourses")}</p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-full border border-accent-brand/30 bg-accent-brand/15 px-6 py-2.5 text-sm font-bold text-foreground/90 transition-colors hover:bg-accent-brand/25"
        >
          <GraduationCap className="h-4 w-4" />
          {t("backToOnboarding")}
        </Link>
      </div>
    );
  }

  return (
    <div className="data-card p-6">
      <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-bold text-foreground/90">
        <Plus className="h-5 w-5 text-accent-brand" />
        {t("addTitle")}
      </h2>
      <p className="mb-4 text-sm text-foreground/60">{t("addDesc")}</p>

      {/* Placement picker — when did you take it? Defaults to the most recent
          PAST semester so an added course lands in the correct year·semester
          bucket (and the year-1 transition-gate average stays correct). */}
      {pastSemesters.length > 0 && (
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <span className="w-full text-xs font-medium text-foreground/60">
            {t("placementLabel")}
          </span>
          <div className="flex flex-col gap-1">
            <label htmlFor="record-add-year" className="text-[11px] text-foreground/60">
              {t("placementYear")}
            </label>
            <select
              id="record-add-year"
              value={chosenYear}
              onChange={(e) => setChosenYear(parseInt(e.target.value, 10))}
              className={selectClass}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {isHe
                    ? YEAR_CONFIG[y as 1 | 2 | 3]?.nameHe
                    : YEAR_CONFIG[y as 1 | 2 | 3]?.nameEn}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="record-add-semester" className="text-[11px] text-foreground/60">
              {t("placementSemester")}
            </label>
            <select
              id="record-add-semester"
              value={effectiveSemester}
              onChange={(e) =>
                setChosenSemester(e.target.value as "FALL" | "SPRING")
              }
              className={selectClass}
            >
              {semestersForYear.map((s) => (
                <option key={s} value={s}>
                  {isHe ? SEMESTER_CONFIG[s]?.nameHe : SEMESTER_CONFIG[s]?.nameEn}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-foreground/60" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          className="w-full rounded-lg border border-border bg-card py-2.5 ps-9 pe-3 text-sm text-foreground placeholder:text-foreground/60 focus:border-foreground/30 focus:outline-none"
        />
      </div>

      {results.length > 0 && (
        <div className="mt-2 max-h-72 space-y-1 overflow-y-auto rounded-lg border border-border bg-card p-1">
          {results.map((course) => {
            const config = DISCIPLINE_CONFIG[course.discipline];
            const countsForFocus =
              focusArea != null &&
              (course.discipline === focusArea ||
                (course.canCountAs ?? []).includes(focusArea));
            const english = isEnglishCourse(course);
            return (
              <button
                key={course.id}
                type="button"
                disabled={isSaving}
                onClick={() => {
                  onAdd(course, { year: chosenYear, semester: effectiveSemester });
                  setSearch("");
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-start transition-colors hover:bg-foreground/5 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5 shrink-0 text-status-green" />
                <span className="min-w-0 flex-1 truncate text-sm text-foreground/80">
                  {isHe ? course.nameHe : (course.nameEn ?? course.nameHe)}
                </span>
                {countsForFocus && config && (
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-medium",
                      config.badgeClass
                    )}
                  >
                    {t("focusBadge")}
                  </span>
                )}
                {english && (
                  <span className="shrink-0 rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[11px] font-medium text-status-blue">
                    {t("englishBadge")}
                  </span>
                )}
                <span className="shrink-0 font-mono text-[10px] text-foreground/60">
                  {course.credits} {t("credits")}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {search.trim().length >= 2 && results.length === 0 && (
        <p className="mt-2 text-sm text-foreground/60">{t("noResults")}</p>
      )}
      {search.trim().length >= 2 && results.length > 0 && (
        <p className="mt-2 text-[11px] text-foreground/60">{t("addToSemester", { label: targetLabel })}</p>
      )}
    </div>
  );
}
