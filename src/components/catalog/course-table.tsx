"use client";

import { useState, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { ArrowUpDown, ArrowUp, ArrowDown, Star } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DISCIPLINE_CONFIG, SEMESTER_CONFIG, YEAR_CONFIG } from "@/lib/constants";
import { DisciplineBadge } from "./discipline-badge";
import { CourseDetailModal } from "./course-detail-modal";
import { AskKingButton } from "@/components/ui/ask-king-button";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";
import type { Course } from "@/types/degree";
import type { Discipline } from "@/types/enums";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SortField =
  | "code"
  | "nameHe"
  | "discipline"
  | "courseType"
  | "credits"
  | "yearOffered"
  | "semesterOffered"
  | "averageGrade";

type SortDirection = "asc" | "desc";

interface CourseTableProps {
  courses: Course[];
  /** The FULL (unfiltered) catalog for the detail panel's prerequisite
   *  resolution — a prereq may sit outside the currently-filtered `courses`.
   *  Falls back to `courses` when not provided. */
  allCourses?: Course[];
  /** The student's chosen focus-area discipline — its courses get starred. */
  focusArea?: string | null;
}

/** Difficulty level → localized label + color class. */
function difficultyMeta(
  level: string | null,
  isHe: boolean
): { label: string; cls: string } | null {
  if (!level) return null;
  const map: Record<string, { he: string; en: string; cls: string }> = {
    easy: { he: "קל", en: "Easy", cls: "bg-emerald-400/15 text-emerald-600 dark:text-emerald-400" },
    moderate: { he: "בינוני", en: "Moderate", cls: "bg-amber-400/15 text-amber-600 dark:text-amber-400" },
    hard: { he: "קשה", en: "Hard", cls: "bg-orange-400/15 text-orange-600 dark:text-orange-400" },
    very_hard: { he: "קשה מאוד", en: "Very hard", cls: "bg-red-400/15 text-red-600 dark:text-red-400" },
  };
  const m = map[level];
  if (!m) return null;
  return { label: isHe ? m.he : m.en, cls: m.cls };
}

/** Format the grade-data semester (e.g. "2024b") into a short "from …" hint so
 *  a student sees how current the estimate is. Returns null when unparseable. */
function formatGradeDataYear(raw: string | null, isHe: boolean): string | null {
  if (!raw) return null;
  const match = raw.trim().match(/^(\d{4})\s*([abc])?$/i);
  if (!match) return null;
  const year = match[1];
  const semLetter = (match[2] ?? "").toLowerCase();
  const semHe = semLetter === "a" ? "א׳" : semLetter === "b" ? "ב׳" : semLetter === "c" ? "קיץ" : "";
  const semEn = semLetter === "a" ? "Fall" : semLetter === "b" ? "Spring" : semLetter === "c" ? "Summer" : "";
  return isHe ? `מ־${semHe ? semHe + " " : ""}${year}` : `from ${semEn ? semEn + " " : ""}${year}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map discipline to its CSS border color class for the row accent stripe. */
function getDisciplineBorderClass(discipline: Discipline): string {
  const cfg = DISCIPLINE_CONFIG[discipline];
  if (!cfg) return "border-s-muted-foreground";
  // Use the slug to build the border-start class
  // GENERAL (slug "general") gets muted-foreground
  if (cfg.slug === "general") return "border-s-muted-foreground";
  return `border-s-discipline-${cfg.slug}`;
}

function formatYears(years: number[], locale: string): string {
  return years
    .map((y) => {
      const cfg = YEAR_CONFIG[y as keyof typeof YEAR_CONFIG];
      return locale === "he" ? (cfg?.nameHe ?? String(y)) : (cfg?.nameEn ?? String(y));
    })
    .join(", ");
}

function formatSemesters(semesters: string[], locale: string): string {
  return semesters
    .map((s) => {
      const cfg = SEMESTER_CONFIG[s as keyof typeof SEMESTER_CONFIG];
      return locale === "he" ? (cfg?.short ?? s) : (cfg?.shortEn ?? s);
    })
    .join(", ");
}

/**
 * Tiny "community workload" chip (#3/#16). Renders ONLY when the app-community
 * ratings for this course have cleared the reveal threshold — otherwise nothing
 * (no empty cells, no noise). The query batches through httpBatchLink and is
 * long-cached; on a missing-table error (migration pending) it fails fast
 * (retry:false) and the chip simply never appears. MVP note: this is a per-row
 * read; the spec's §7 optimization folds the aggregate into `course.list` — a
 * router change outside these files. See the summary.
 */
function CommunityWorkloadChip({ courseCode, isHe }: { courseCode: string; isHe: boolean }) {
  const { data } = api.courseKnowledge.getForCourse.useQuery(
    { courseCode },
    { retry: false, staleTime: 5 * 60_000, refetchOnMount: false }
  );
  const r = data?.ratings;
  if (!r?.revealed || r.workloadAvg == null) return null;
  const rounded = Math.round(r.workloadAvg);
  return (
    <span
      className="mt-1 inline-flex items-center gap-1 rounded-full bg-accent-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-accent-brand"
      title={isHe ? "עומס לפי הסטודנטים באפליקציה" : "Workload per students in the app"}
    >
      {isHe ? "עומס קהילתי" : "Community load"}
      <span dir="ltr" className="inline-flex items-center gap-0.5" aria-hidden>
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            className={cn("size-1 rounded-full", n <= rounded ? "bg-accent-brand" : "bg-accent-brand/25")}
          />
        ))}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CourseTable({ courses, allCourses, focusArea }: CourseTableProps) {
  const t = useTranslations("catalog");
  const tCourseType = useTranslations("courseType");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const isHe = locale === "he";

  const [sortField, setSortField] = useState<SortField>("code");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  // The course whose detail panel is open (row-name click). null = closed.
  const [detailCourse, setDetailCourse] = useState<Course | null>(null);
  // When the student has a focus area, float its courses to the top by default
  // (#17/#24 — "electives organized by focus area"). Toggleable.
  const [focusFirst, setFocusFirst] = useState(true);

  // ---- Sorting logic ----
  const sortedCourses = useMemo(() => {
    const sorted = [...courses].sort((a, b) => {
      // Focus-area courses first (when enabled) — the primary ordering, so the
      // student's discipline surfaces above the chosen column sort.
      if (focusFirst && focusArea) {
        const am = a.discipline === focusArea ? 0 : 1;
        const bm = b.discipline === focusArea ? 0 : 1;
        if (am !== bm) return am - bm;
      }
      // Grade sort: keep courses WITHOUT grade data at the bottom, both
      // directions (so "best grades" / "hardest" never surface empty rows).
      if (sortField === "averageGrade") {
        const av = a.averageGrade;
        const bv = b.averageGrade;
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return sortDirection === "asc" ? av - bv : bv - av;
      }
      let cmp = 0;
      switch (sortField) {
        case "code":
          cmp = a.code.localeCompare(b.code);
          break;
        case "nameHe":
          cmp = locale === "he"
            ? a.nameHe.localeCompare(b.nameHe, "he")
            : (a.nameEn ?? a.nameHe).localeCompare(b.nameEn ?? b.nameHe, "en");
          break;
        case "discipline":
          cmp = a.discipline.localeCompare(b.discipline);
          break;
        case "courseType":
          cmp = a.courseType.localeCompare(b.courseType);
          break;
        case "credits":
          cmp = a.credits - b.credits;
          break;
        case "yearOffered":
          cmp = (a.yearOffered[0] ?? 0) - (b.yearOffered[0] ?? 0);
          break;
        case "semesterOffered":
          cmp = (a.semesterOffered[0] ?? "").localeCompare(
            b.semesterOffered[0] ?? ""
          );
          break;
        default:
          cmp = 0;
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [courses, sortField, sortDirection, locale, focusFirst, focusArea]);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  }

  const sortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="ms-1 inline h-3 w-3 opacity-40" />;
    }
    return sortDirection === "asc" ? (
      <ArrowUp className="ms-1 inline h-3 w-3 text-foreground/80" />
    ) : (
      <ArrowDown className="ms-1 inline h-3 w-3 text-foreground/80" />
    );
  };

  // ---- Empty state ----
  if (courses.length === 0) {
    return (
      <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-border/50 bg-card/50 p-8 text-center">
        <p className="text-muted-foreground">{tCommon("noResults")}</p>
      </div>
    );
  }

  // ---- Render ----
  return (
    <div className="flex flex-col gap-2">
      {focusArea && (
        <label className="inline-flex cursor-pointer select-none items-center gap-2 self-start text-xs text-foreground/60">
          <input
            type="checkbox"
            checked={focusFirst}
            onChange={(e) => setFocusFirst(e.target.checked)}
            className="size-3.5"
          />
          <Star className="size-3 fill-accent-brand text-accent-brand" />
          {isHe ? "הציגו את קורסי המיקוד שלי קודם" : "Show my focus-area courses first"}
        </label>
      )}
      <div className="overflow-hidden rounded-lg border border-border/50 bg-card/80">
      <Table>
        <TableHeader>
          <TableRow className="border-b-foreground/20 bg-card hover:bg-card">
            {/* Code - hidden on mobile */}
            <TableHead
              className="hidden select-none sm:table-cell"
              aria-sort={sortField === "code" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
            >
              <button
                type="button"
                onClick={() => handleSort("code")}
                className="inline-flex items-center gap-1 text-foreground/80 font-bold bg-transparent appearance-none cursor-pointer select-none"
              >
                {t("code")}
                {sortIcon("code")}
              </button>
            </TableHead>

            {/* Course Name */}
            <TableHead
              className="select-none"
              aria-sort={sortField === "nameHe" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
            >
              <button
                type="button"
                onClick={() => handleSort("nameHe")}
                className="inline-flex items-center gap-1 text-foreground/80 font-bold bg-transparent appearance-none cursor-pointer select-none"
              >
                {t("courseName")}
                {sortIcon("nameHe")}
              </button>
            </TableHead>

            {/* Discipline */}
            <TableHead
              className="select-none"
              aria-sort={sortField === "discipline" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
            >
              <button
                type="button"
                onClick={() => handleSort("discipline")}
                className="inline-flex items-center gap-1 text-foreground/80 font-bold bg-transparent appearance-none cursor-pointer select-none"
              >
                {t("discipline")}
                {sortIcon("discipline")}
              </button>
            </TableHead>

            {/* Type - hidden on mobile */}
            <TableHead
              className="hidden select-none md:table-cell"
              aria-sort={sortField === "courseType" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
            >
              <button
                type="button"
                onClick={() => handleSort("courseType")}
                className="inline-flex items-center gap-1 text-foreground/80 font-bold bg-transparent appearance-none cursor-pointer select-none"
              >
                {t("type")}
                {sortIcon("courseType")}
              </button>
            </TableHead>

            {/* Credits */}
            <TableHead
              className="select-none text-center"
              aria-sort={sortField === "credits" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
            >
              <button
                type="button"
                onClick={() => handleSort("credits")}
                className="inline-flex items-center gap-1 text-foreground/80 font-bold bg-transparent appearance-none cursor-pointer select-none"
              >
                {t("creditsCol")}
                {sortIcon("credits")}
              </button>
            </TableHead>

            {/* Average grade + difficulty (#19). The header carries an honest
                "where from" tooltip — this is an estimate, not an official grade. */}
            <TableHead
              className="select-none text-center"
              aria-sort={sortField === "averageGrade" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
            >
              <button
                type="button"
                onClick={() => handleSort("averageGrade")}
                title={
                  isHe
                    ? "הערכה מנתוני עבר (ערזים), לא ציון רשמי של האוניברסיטה"
                    : "An estimate from historical data (Arazim), not an official university grade"
                }
                className="inline-flex items-center gap-1 text-foreground/80 font-bold bg-transparent appearance-none cursor-pointer select-none"
              >
                {isHe ? "ציון ממוצע" : "Avg grade"}
                {sortIcon("averageGrade")}
              </button>
            </TableHead>

            {/* Year - hidden on mobile */}
            <TableHead
              className="hidden select-none lg:table-cell"
              aria-sort={sortField === "yearOffered" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
            >
              <button
                type="button"
                onClick={() => handleSort("yearOffered")}
                className="inline-flex items-center gap-1 text-foreground/80 font-bold bg-transparent appearance-none cursor-pointer select-none"
              >
                {t("yearCol")}
                {sortIcon("yearOffered")}
              </button>
            </TableHead>

            {/* Semester - hidden on mobile */}
            <TableHead
              className="hidden select-none lg:table-cell"
              aria-sort={sortField === "semesterOffered" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
            >
              <button
                type="button"
                onClick={() => handleSort("semesterOffered")}
                className="inline-flex items-center gap-1 text-foreground/80 font-bold bg-transparent appearance-none cursor-pointer select-none"
              >
                {t("semesterCol")}
                {sortIcon("semesterOffered")}
              </button>
            </TableHead>

            {/* Prerequisites - hidden on mobile/tablet */}
            <TableHead className="hidden xl:table-cell">
              <span className="text-foreground/80 font-bold">
                {t("prerequisites")}
              </span>
            </TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {sortedCourses.map((course) => {
            const isFocus = !!focusArea && course.discipline === focusArea;
            return (
            <TableRow
              key={course.id}
              className={cn(
                "group border-s-3 transition-colors hover:bg-foreground/5",
                getDisciplineBorderClass(course.discipline),
                isFocus && "bg-accent-brand/[0.04]"
              )}
            >
              {/* Code */}
              <TableCell className="hidden font-data text-xs text-muted-foreground sm:table-cell">
                {course.code}
              </TableCell>

              {/* Name */}
              <TableCell className="font-medium">
                <div>
                  <button
                    type="button"
                    onClick={() => setDetailCourse(course)}
                    className="block text-start text-foreground line-clamp-2 transition-colors hover:text-accent-brand"
                    title={isHe ? "לחצו לפרטי הקורס" : "Click for course details"}
                  >
                    {isFocus && (
                      <Star
                        className="me-1 -mt-0.5 inline size-3 fill-accent-brand text-accent-brand"
                        aria-label={isHe ? "תחום המיקוד שלכם" : "Your focus area"}
                      />
                    )}
                    {locale === "he" ? course.nameHe : (course.nameEn ?? course.nameHe)}
                  </button>
                  {locale === "he" ? (
                    course.nameEn && (
                      <span className="ms-2 text-xs text-muted-foreground hidden sm:inline">
                        ({course.nameEn})
                      </span>
                    )
                  ) : (
                    <span className="ms-2 text-xs text-muted-foreground hidden sm:inline">
                      ({course.nameHe})
                    </span>
                  )}
                </div>
                {/* Show code on mobile under the name */}
                <span className="text-xs text-muted-foreground sm:hidden">
                  {course.code}
                </span>
                {/* Ask the Philosopher King about this specific course (P2 #7).
                    Reveals on row hover; always visible on touch. */}
                <AskKingButton
                  promptHe={`ספר לי על "${course.nameHe}" (${course.code}) — כמה הוא קשה, ואיך הוא משתלב לי בתואר?`}
                  promptEn={`Tell me about "${course.nameEn ?? course.nameHe}" (${course.code}) — how hard is it, and how does it fit my degree?`}
                  labelHe="שאל את המלך על זה"
                  labelEn="Ask the King"
                  className="mt-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-accent-brand/85 transition-all hover:bg-accent-brand/10 hover:text-accent-brand sm:opacity-0 sm:group-hover:opacity-100"
                />
              </TableCell>

              {/* Discipline */}
              <TableCell>
                <DisciplineBadge discipline={course.discipline} />
              </TableCell>

              {/* Type */}
              <TableCell className="hidden md:table-cell">
                <span className="text-sm text-foreground/80">
                  {tCourseType(course.courseType)}
                </span>
              </TableCell>

              {/* Credits */}
              <TableCell className="text-center font-data text-foreground/80 font-semibold">
                {course.credits}
              </TableCell>

              {/* Average grade + difficulty + fail rate (#19) */}
              <TableCell className="text-center">
                {course.averageGrade != null ? (
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="font-data text-sm font-bold tabular-nums text-foreground/85">
                      {course.averageGrade.toFixed(1)}
                    </span>
                    {(() => {
                      const d = difficultyMeta(course.difficultyLevel, isHe);
                      return d ? (
                        <span className={cn("rounded-full px-1.5 py-0.5 text-[11px] font-medium", d.cls)}>
                          {d.label}
                        </span>
                      ) : null;
                    })()}
                    {course.failRate != null && course.failRate >= 1 && (
                      <span className="text-[11px] text-muted-foreground">
                        <bdi dir="ltr">{Math.round(course.failRate)}%</bdi> {isHe ? "נכשלים" : "fail"}
                      </span>
                    )}
                    {(() => {
                      const from = formatGradeDataYear(course.gradeDataYear, isHe);
                      return from ? (
                        <span className="text-[11px] text-muted-foreground/50">{from}</span>
                      ) : null;
                    })()}
                    <CommunityWorkloadChip courseCode={course.code} isHe={isHe} />
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-xs text-muted-foreground/40" title={isHe ? "אין נתון" : "No data"}>
                      —
                    </span>
                    <CommunityWorkloadChip courseCode={course.code} isHe={isHe} />
                  </div>
                )}
              </TableCell>

              {/* Year */}
              <TableCell className="hidden text-sm text-foreground/70 lg:table-cell tabular">
                {formatYears(course.yearOffered, locale)}
              </TableCell>

              {/* Semester */}
              <TableCell className="hidden text-sm text-foreground/70 lg:table-cell">
                {formatSemesters(course.semesterOffered, locale)}
              </TableCell>

              {/* Prerequisites */}
              <TableCell className="hidden xl:table-cell">
                {course.prerequisites.length > 0 ? (
                  <span className="font-data text-xs text-muted-foreground">
                    {course.prerequisites.join(", ")}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground/50">
                    {t("none")}
                  </span>
                )}
              </TableCell>
            </TableRow>
            );
          })}
        </TableBody>
      </Table>
      </div>

      {/* Course detail — opens on a course-name click (portal dialog). */}
      <CourseDetailModal
        course={detailCourse}
        courses={allCourses ?? courses}
        onOpenCourse={(c) => setDetailCourse(c)}
        onClose={() => setDetailCourse(null)}
      />
    </div>
  );
}
