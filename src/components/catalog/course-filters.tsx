"use client";

import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FILTERABLE_DISCIPLINE_IDS } from "@/lib/constants";
import type { Discipline, CourseType } from "@/types/enums";

// Filterable disciplines (derived from active program, excluding GENERAL)
const FILTER_DISCIPLINES: Discipline[] = FILTERABLE_DISCIPLINE_IDS;

// Filterable course types
const FILTER_COURSE_TYPES: CourseType[] = [
  "MANDATORY",
  "ELECTIVE",
  "SEMINAR",
  "LAW_FOUNDATION",
];

// Year options
const FILTER_YEARS = [1, 2, 3] as const;

export interface CourseFiltersState {
  search: string;
  discipline: Discipline | "ALL";
  courseType: CourseType | "ALL";
  year: number | "ALL";
}

interface CourseFiltersProps {
  filters: CourseFiltersState;
  onFiltersChange: (filters: CourseFiltersState) => void;
}

export function CourseFilters({ filters, onFiltersChange }: CourseFiltersProps) {
  const t = useTranslations("catalog");
  const tDisciplines = useTranslations("disciplines");
  const tCourseType = useTranslations("courseType");
  const tYear = useTranslations("year");

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center">
      {/* Search Input */}
      <div className="relative flex-1 min-w-[240px]">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          value={filters.search}
          onChange={(e) =>
            onFiltersChange({ ...filters, search: e.target.value })
          }
          className="ps-9 bg-card border-border/50 focus-visible:border-foreground/50 focus-visible:ring-foreground/30"
        />
      </div>

      {/* Discipline Filter */}
      <Select
        value={filters.discipline}
        onValueChange={(value) =>
          onFiltersChange({
            ...filters,
            discipline: value as Discipline | "ALL",
          })
        }
      >
        <SelectTrigger aria-label={t("allDisciplines")} className="w-full sm:w-[180px] bg-card border-border/50">
          <SelectValue placeholder={t("allDisciplines")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">{t("allDisciplines")}</SelectItem>
          {FILTER_DISCIPLINES.map((disc) => (
            <SelectItem key={disc} value={disc}>
              {tDisciplines(disc)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Course Type Filter */}
      <Select
        value={filters.courseType}
        onValueChange={(value) =>
          onFiltersChange({
            ...filters,
            courseType: value as CourseType | "ALL",
          })
        }
      >
        <SelectTrigger aria-label={t("allTypes")} className="w-full sm:w-[180px] bg-card border-border/50">
          <SelectValue placeholder={t("allTypes")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">{t("allTypes")}</SelectItem>
          {FILTER_COURSE_TYPES.map((type) => (
            <SelectItem key={type} value={type}>
              {tCourseType(type)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Year Filter */}
      <Select
        value={String(filters.year)}
        onValueChange={(value) =>
          onFiltersChange({
            ...filters,
            year: value === "ALL" ? "ALL" : Number(value),
          })
        }
      >
        <SelectTrigger aria-label={t("allYears")} className="w-full sm:w-[140px] bg-card border-border/50">
          <SelectValue placeholder={t("allYears")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">{t("allYears")}</SelectItem>
          {FILTER_YEARS.map((yr) => (
            <SelectItem key={yr} value={String(yr)}>
              {tYear(String(yr))}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
