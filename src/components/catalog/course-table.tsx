"use client";

import { useState, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
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
  | "semesterOffered";

type SortDirection = "asc" | "desc";

interface CourseTableProps {
  courses: Course[];
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CourseTable({ courses }: CourseTableProps) {
  const t = useTranslations("catalog");
  const tCourseType = useTranslations("courseType");
  const tCommon = useTranslations("common");
  const locale = useLocale();

  const [sortField, setSortField] = useState<SortField>("code");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // ---- Sorting logic ----
  const sortedCourses = useMemo(() => {
    const sorted = [...courses].sort((a, b) => {
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
  }, [courses, sortField, sortDirection, locale]);

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
          {sortedCourses.map((course) => (
            <TableRow
              key={course.id}
              className={cn(
                "border-s-3 transition-colors hover:bg-foreground/5",
                getDisciplineBorderClass(course.discipline)
              )}
            >
              {/* Code */}
              <TableCell className="hidden font-data text-xs text-muted-foreground sm:table-cell">
                {course.code}
              </TableCell>

              {/* Name */}
              <TableCell className="font-medium">
                <div>
                  <span className="text-foreground">{locale === "he" ? course.nameHe : (course.nameEn ?? course.nameHe)}</span>
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

              {/* Year */}
              <TableCell className="hidden text-sm text-foreground/70 lg:table-cell">
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
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
