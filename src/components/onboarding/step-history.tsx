"use client";

import { useMemo, useState, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Search, Plus, X, GraduationCap, Check, Sparkles, Languages } from "lucide-react";
import { cn } from "@/lib/utils";
import { DISCIPLINE_CONFIG, SEMESTER_CONFIG, YEAR_CONFIG } from "@/lib/constants";
import type { CourseWithSchedule } from "@/lib/plan-generator";
import type { OnboardingData } from "./onboarding-wizard";

// ─────────────────────────────────────────────────────────────────────────
// Past-academic-record step ("מה כבר עשית?" / "Your history").
//
// Captures courses a mid-degree student already completed, with optional
// grades, so credits + the grade calculator are true on first dashboard load.
//
// Pre-fill rule (see computePlacement): each MANDATORY course is placed at its
// NATURAL placement — the earliest year it is offered (min of yearOffered),
// and within that year FALL if it is offered in FALL, otherwise SPRING. A
// course is pre-filled (pre-checked) for a given past semester when its natural
// placement falls strictly before the student's current (year, semester).
// ─────────────────────────────────────────────────────────────────────────

/** Canonical semester order index. FALL before SPRING within a year. */
function semOrder(semester: "FALL" | "SPRING"): number {
  return semester === "FALL" ? 0 : 1;
}

/** Absolute order of a (year, semester) across the whole degree. */
function timelineIndex(year: number, semester: "FALL" | "SPRING"): number {
  return (year - 1) * 2 + semOrder(semester);
}

/** Natural placement of a course = its earliest offering. */
function computePlacement(course: CourseWithSchedule): {
  year: number;
  semester: "FALL" | "SPRING";
} | null {
  const years = (course.yearOffered ?? []).filter((y) => y >= 1 && y <= 3);
  if (years.length === 0) return null;
  const year = Math.min(...years);
  const sems = course.semesterOffered ?? [];
  // FALL before SPRING when offered in both; if neither listed, assume FALL.
  const semester: "FALL" | "SPRING" = sems.includes("SPRING") && !sems.includes("FALL")
    ? "SPRING"
    : "FALL";
  return { year, semester };
}

/** Is a course taught in English? courseType ENGLISH is the canonical flag the
 * credit-calculator / regulation engine use; we also fall back to a name match
 * ("אנגלית" / "English") for any catalog row not yet typed ENGLISH. */
function isEnglishCourse(course: CourseWithSchedule): boolean {
  if (course.courseType === "ENGLISH") return true;
  const hay = `${course.nameHe ?? ""} ${course.nameEn ?? ""}`.toLowerCase();
  return hay.includes("אנגלית") || /\benglish\b/.test(hay);
}

export interface CompletedCourse {
  courseCode: string;
  plannedYear: number;
  plannedSemester: "FALL" | "SPRING";
  grade: number | null;
}

interface PastSemester {
  year: number;
  semester: "FALL" | "SPRING";
}

interface StepHistoryProps {
  data: OnboardingData;
  allCourses: CourseWithSchedule[];
  isLoadingCourses: boolean;
  /** Currently-selected completed courses, keyed by courseCode. */
  value: Record<string, CompletedCourse>;
  onChange: (next: Record<string, CompletedCourse>) => void;
  onNext: () => void;
  onBack: () => void;
}

/**
 * Returns the list of past semesters (strictly before current), in order.
 * Empty when the student is a fresh year-1-FALL student.
 */
export function getPastSemesters(
  year: number,
  semester: "FALL" | "SPRING"
): PastSemester[] {
  const current = timelineIndex(year, semester);
  const all: PastSemester[] = [
    { year: 1, semester: "FALL" },
    { year: 1, semester: "SPRING" },
    { year: 2, semester: "FALL" },
    { year: 2, semester: "SPRING" },
    { year: 3, semester: "FALL" },
    { year: 3, semester: "SPRING" },
  ];
  return all.filter((s) => timelineIndex(s.year, s.semester) < current);
}

/**
 * Build the default completed map: PRE-CHECK every mandatory course whose
 * natural placement (computePlacement) falls in a semester the student has
 * already passed.
 *
 * Rationale (fixes #18): a student starting year 2/3 has, by definition,
 * completed the mandatory courses of the earlier years — you can't reach year 2
 * without passing year 1. The previous behavior returned an EMPTY map and made
 * the student manually re-check ~16 courses; in practice they skipped it, so
 * their history never persisted and the dashboard showed "only 21 ש״ס". Pre-
 * checking the past mandatory makes their real standing reflect immediately.
 *
 * GPA is NOT over-claimed: grades are left null (the grade calculator only
 * counts COMPLETED courses that actually carry a grade). An irregular student
 * who hasn't passed one of these can simply un-check it.
 */
export function buildDefaultCompleted(
  allCourses: CourseWithSchedule[],
  year: number,
  semester: "FALL" | "SPRING"
): Record<string, CompletedCourse> {
  const past = getPastSemesters(year, semester);
  if (past.length === 0) return {};
  const pastKeys = new Set(past.map((s) => `${s.year}-${s.semester}`));

  const out: Record<string, CompletedCourse> = {};
  for (const c of allCourses) {
    if (!(c.courseType === "MANDATORY" || c.isMandatory)) continue;
    const p = computePlacement(c);
    if (!p) continue;
    if (!pastKeys.has(`${p.year}-${p.semester}`)) continue;
    out[c.code] = {
      courseCode: c.code,
      plannedYear: p.year,
      plannedSemester: p.semester,
      grade: null, // student fills grades; null keeps the average honest
    };
  }
  return out;
}

export function StepHistory({
  data,
  allCourses,
  isLoadingCourses,
  value,
  onChange,
  onNext,
  onBack,
}: StepHistoryProps) {
  const t = useTranslations("onboarding");
  const locale = useLocale();
  const isHe = locale === "he";

  const courseByCode = useMemo(
    () => new Map(allCourses.map((c) => [c.code, c])),
    [allCourses]
  );

  const pastSemesters = useMemo(
    () => getPastSemesters(data.year, data.semester),
    [data.year, data.semester]
  );

  // Course-search state for adding electives.
  const [search, setSearch] = useState("");

  const toggleCourse = useCallback(
    (course: CourseWithSchedule, placement: PastSemester) => {
      const next = { ...value };
      if (next[course.code]) {
        delete next[course.code];
      } else {
        next[course.code] = {
          courseCode: course.code,
          plannedYear: placement.year,
          plannedSemester: placement.semester,
          grade: null,
        };
      }
      onChange(next);
    },
    [value, onChange]
  );

  const setGrade = useCallback(
    (code: string, raw: string) => {
      const entry = value[code];
      if (!entry) return;
      let grade: number | null;
      if (raw === "") {
        grade = null;
      } else {
        const num = parseInt(raw, 10);
        if (isNaN(num) || num < 0 || num > 100) return;
        grade = num;
      }
      onChange({ ...value, [code]: { ...entry, grade } });
    },
    [value, onChange]
  );

  const addElective = useCallback(
    (course: CourseWithSchedule, target: PastSemester) => {
      onChange({
        ...value,
        [course.code]: {
          courseCode: course.code,
          plannedYear: target.year,
          plannedSemester: target.semester,
          grade: null,
        },
      });
      setSearch("");
    },
    [value, onChange]
  );

  // Group the past semesters; each carries its mandatory courses (pre-filled
  // or not) plus any elective the user has already added & placed there.
  const grouped = useMemo(() => {
    return pastSemesters.map((sem) => {
      const idx = timelineIndex(sem.year, sem.semester);
      // Mandatory courses whose natural placement is this semester.
      const mandatory = allCourses
        .filter((c) => c.courseType === "MANDATORY" || c.isMandatory)
        .filter((c) => {
          const p = computePlacement(c);
          return (
            p && p.year === sem.year && p.semester === sem.semester
          );
        });
      // Electives the user explicitly added to this semester.
      const electives = Object.values(value)
        .filter(
          (e) =>
            e.plannedYear === sem.year &&
            e.plannedSemester === sem.semester &&
            !mandatory.some((m) => m.code === e.courseCode)
        )
        .map((e) => courseByCode.get(e.courseCode))
        .filter((c): c is CourseWithSchedule => Boolean(c));
      return { sem, idx, mandatory, electives };
    });
  }, [pastSemesters, allCourses, value, courseByCode]);

  // Search results: any catalog course not already selected, matching the
  // query by code or name. All catalog electives are PPE-approved by definition.
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    return allCourses
      .filter((c) => !value[c.code])
      .filter((c) => {
        const hay = `${c.code} ${c.nameHe ?? ""} ${c.nameEn ?? ""}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 8);
  }, [search, allCourses, value]);

  // Default target semester for an added elective: the latest past semester
  // (closest to "now") — most students add a recent elective. The user can't
  // see a placement picker per the brief, so we place it sensibly.
  const defaultElectiveTarget: PastSemester | null =
    pastSemesters.length > 0 ? pastSemesters[pastSemesters.length - 1]! : null;

  const selectedCount = Object.keys(value).length;
  const gradedCount = Object.values(value).filter((c) => c.grade !== null).length;

  const yearLabel = (year: number) =>
    isHe
      ? YEAR_CONFIG[year as 1 | 2 | 3]?.nameHe
      : YEAR_CONFIG[year as 1 | 2 | 3]?.nameEn;
  const semLabel = (semester: "FALL" | "SPRING") =>
    isHe ? SEMESTER_CONFIG[semester]?.nameHe : SEMESTER_CONFIG[semester]?.nameEn;

  return (
    <div className="flex flex-col items-center">
      {/* Header */}
      <div className="animate-stagger-1 text-center">
        <h2 className="font-display text-2xl font-bold text-foreground/90">
          {t("historyTitle")}
        </h2>
        <p className="mt-2 max-w-md text-foreground/50">{t("historyDesc")}</p>
        {/* Pre-check explainer: mandatory courses of past years are checked by
            default for a mid-degree student (fixes #18). Make it clear they're
            editable so an irregular student can correct them. */}
        <p className="mx-auto mt-2 max-w-md text-xs text-foreground/40">
          {isHe
            ? "סימנו לך מראש את קורסי-החובה של השנים שעברת. הסר סימון אם לא עשית קורס, והוסף ציונים אם בא לך — הם לא חובה."
            : "We pre-checked the mandatory courses from the years you've completed. Un-check any you didn't take, and add grades if you like — they're optional."}
        </p>
      </div>

      <div className="mt-6 w-full max-w-2xl space-y-5">
        {/* Summary chip */}
        <div className="animate-stagger-2 flex items-center justify-center gap-2 text-xs text-foreground/50">
          <GraduationCap className="h-4 w-4 text-emerald-500" />
          <span>{t("historySelectedCount", { count: selectedCount })}</span>
          {gradedCount > 0 && (
            <span className="text-foreground/30">
              · {t("historyGradedCount", { count: gradedCount })}
            </span>
          )}
        </div>

        {/* Loading */}
        {isLoadingCourses && (
          <div className="flex justify-center py-8 text-sm text-foreground/40">
            {t("historyLoading")}
          </div>
        )}

        {/* Grouped past semesters */}
        {!isLoadingCourses &&
          grouped.map(({ sem, mandatory, electives }) => {
            const courses = [...mandatory, ...electives];
            return (
              <div
                key={`${sem.year}-${sem.semester}`}
                className="animate-stagger-3 rounded-xl border border-border bg-card/40 p-4"
              >
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground/70">
                  {yearLabel(sem.year)} · {semLabel(sem.semester)}
                </h3>
                {courses.length === 0 ? (
                  <p className="text-xs text-foreground/35">
                    {t("historyNoMandatory")}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {courses.map((course) => {
                      const entry = value[course.code];
                      const checked = Boolean(entry);
                      const isElective = !(
                        course.courseType === "MANDATORY" || course.isMandatory
                      );
                      const config = DISCIPLINE_CONFIG[course.discipline];
                      const countsForFocus =
                        data.focusArea != null &&
                        (course.discipline === data.focusArea ||
                          (course.canCountAs ?? []).includes(data.focusArea));
                      const isEnglish = isEnglishCourse(course);
                      return (
                        <div
                          key={course.code}
                          className={cn(
                            "flex items-center gap-3 rounded-lg border p-2.5 transition-colors",
                            checked
                              ? "border-emerald-500/30 bg-emerald-500/5"
                              : "border-border bg-card/60"
                          )}
                        >
                          {/* Checkbox */}
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={checked}
                            aria-label={isHe ? course.nameHe : (course.nameEn ?? course.nameHe)}
                            onClick={() =>
                              toggleCourse(course, {
                                year: sem.year,
                                semester: sem.semester,
                              })
                            }
                            className={cn(
                              "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/40",
                              checked
                                ? "border-emerald-500 bg-emerald-500 text-white"
                                : "border-foreground/25 bg-transparent hover:border-foreground/40"
                            )}
                          >
                            {checked && <Check className="h-3.5 w-3.5" />}
                          </button>

                          {/* Course info */}
                          <div className="flex min-w-0 flex-1 flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span
                                className="truncate text-sm font-medium text-foreground/85"
                                title={`${course.code} — ${isHe ? course.nameHe : course.nameEn}`}
                              >
                                {isHe ? course.nameHe : (course.nameEn ?? course.nameHe)}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-mono text-[10px] text-foreground/40">
                                {course.code}
                              </span>
                              <span className="font-mono text-[10px] text-foreground/40">
                                · {course.credits} {t("nz")}
                              </span>
                              {isElective && (
                                <span className="rounded-full bg-foreground/8 px-1.5 py-0.5 text-[9px] font-medium text-foreground/50">
                                  {t("historyElectiveBadge")}
                                </span>
                              )}
                              {countsForFocus && config && (
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-medium",
                                    config.badgeClass
                                  )}
                                >
                                  <Sparkles className="h-2.5 w-2.5" />
                                  {t("historyFocusBadge")}
                                </span>
                              )}
                              {isEnglish && (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-medium text-blue-500">
                                  <Languages className="h-2.5 w-2.5" />
                                  {t("historyEnglishBadge")}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Optional grade input — only when checked */}
                          {checked && (
                            <div className="flex shrink-0 items-center gap-1.5">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                step={1}
                                dir="ltr"
                                value={entry?.grade ?? ""}
                                onChange={(e) => setGrade(course.code, e.target.value)}
                                placeholder={t("historyGradePlaceholder")}
                                aria-label={t("historyGradeAria")}
                                className={cn(
                                  "w-16 rounded-md border border-border/60 bg-background/50 px-2 py-1.5",
                                  "text-center font-mono text-sm text-foreground",
                                  "placeholder:text-foreground/25",
                                  "focus:border-foreground/35 focus:outline-none focus:ring-1 focus:ring-foreground/20"
                                )}
                              />
                            </div>
                          )}

                          {/* Remove (for added electives) */}
                          {isElective && (
                            <button
                              type="button"
                              onClick={() =>
                                toggleCourse(course, {
                                  year: sem.year,
                                  semester: sem.semester,
                                })
                              }
                              aria-label={t("historyRemove")}
                              className="shrink-0 rounded-md p-1 text-foreground/30 transition-colors hover:bg-red-500/10 hover:text-red-400"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

        {/* Add elective via catalog search */}
        {!isLoadingCourses && defaultElectiveTarget && (
          <div className="animate-stagger-4 rounded-xl border border-dashed border-border bg-card/30 p-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground/70">
              <Plus className="h-4 w-4" />
              {t("historyAddElectiveTitle")}
            </h3>
            <p className="mb-3 text-xs text-foreground/40">
              {t("historyAddElectiveDesc")}
            </p>
            <div className="relative">
              <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-foreground/30" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("historySearchPlaceholder")}
                className="w-full rounded-lg border border-border bg-card py-2.5 ps-9 pe-3 text-sm text-foreground placeholder:text-foreground/30 focus:border-foreground/30 focus:outline-none"
              />
            </div>
            {searchResults.length > 0 && (
              <div className="mt-2 max-h-60 space-y-1 overflow-y-auto rounded-lg border border-border bg-card p-1">
                {searchResults.map((course) => {
                  const config = DISCIPLINE_CONFIG[course.discipline];
                  const countsForFocus =
                    data.focusArea != null &&
                    (course.discipline === data.focusArea ||
                      (course.canCountAs ?? []).includes(data.focusArea));
                  const isEnglish = isEnglishCourse(course);
                  return (
                    <button
                      key={course.code}
                      type="button"
                      onClick={() => addElective(course, defaultElectiveTarget)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-start transition-colors hover:bg-foreground/5"
                    >
                      <Plus className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground/80">
                        {isHe ? course.nameHe : (course.nameEn ?? course.nameHe)}
                      </span>
                      {countsForFocus && config && (
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium",
                            config.badgeClass
                          )}
                        >
                          {t("historyFocusBadge")}
                        </span>
                      )}
                      {isEnglish && (
                        <span className="shrink-0 rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-medium text-blue-500">
                          {t("historyEnglishBadge")}
                        </span>
                      )}
                      <span className="shrink-0 font-mono text-[10px] text-foreground/40">
                        {course.credits} {t("nz")}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {search.trim().length >= 2 && searchResults.length === 0 && (
              <p className="mt-2 text-xs text-foreground/35">{t("historyNoResults")}</p>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="mt-8 flex w-full max-w-2xl items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg px-4 py-2.5 text-sm text-foreground/50 transition-all hover:bg-foreground/5 hover:text-foreground/70"
        >
          {t("back")}
        </button>
        <button
          type="button"
          onClick={onNext}
          className="rounded-lg bg-foreground px-6 py-2.5 text-sm font-medium text-background shadow-sm transition-all hover:scale-[1.02] press-scale"
        >
          {selectedCount > 0 ? t("historyContinue") : t("historySkip")}
        </button>
      </div>
    </div>
  );
}
