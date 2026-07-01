"use client";

import { useState, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { BookOpen } from "lucide-react";
import { api } from "@/lib/trpc/react";
import { ThemedLoader } from "@/components/ui/themed-loader";
import { CourseFilters, type CourseFiltersState } from "@/components/catalog/course-filters";
import { CourseTable } from "@/components/catalog/course-table";
import type { Course } from "@/types/degree";
import type { Discipline, CourseType } from "@/types/enums";

const DEFAULT_FILTERS: CourseFiltersState = {
  search: "",
  discipline: "ALL",
  courseType: "ALL",
  year: "ALL",
};

export function CatalogContent() {
  const t = useTranslations("catalog");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const isHe = locale === "he";

  const [filters, setFilters] = useState<CourseFiltersState>(DEFAULT_FILTERS);

  // Build tRPC query input from filter state
  const queryInput = useMemo(() => {
    const input: {
      discipline?: Discipline;
      courseType?: CourseType;
      year?: number;
      search?: string;
    } = {};

    if (filters.discipline !== "ALL") {
      input.discipline = filters.discipline;
    }
    if (filters.courseType !== "ALL") {
      input.courseType = filters.courseType;
    }
    if (filters.year !== "ALL") {
      input.year = filters.year;
    }
    if (filters.search.trim().length > 0) {
      input.search = filters.search.trim();
    }

    return Object.keys(input).length > 0 ? input : undefined;
  }, [filters]);

  const {
    data: courses,
    isLoading,
    error,
    refetch,
  } = api.course.list.useQuery(queryInput);

  // The student's focus area — its courses get starred + tinted in the table.
  const { data: profile } = api.user.getProfile.useQuery();

  // Cast the returned data to our Course type
  const typedCourses = (courses ?? []) as unknown as Course[];

  // Real data-freshness signal: the most recent per-course sync timestamp.
  // Answers "how up-to-date is this?" with a concrete date, not a static year.
  const freshestSync = useMemo(() => {
    const times = ((courses ?? []) as Array<{ lastSyncedAt?: string | Date | null }>)
      .map((c) => c.lastSyncedAt)
      .filter(Boolean)
      .map((d) => new Date(d as string | Date).getTime())
      .filter((ms) => !isNaN(ms));
    return times.length ? new Date(Math.max(...times)) : null;
  }, [courses]);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      {/* Header */}
      <div className="animate-stagger-1 flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <BookOpen className="h-8 w-8 text-foreground/80" />
          <h1 className="font-display text-2xl font-bold text-foreground/80 md:text-3xl">
            {t("title")}
          </h1>
        </div>
        <p className="text-sm text-foreground/60 md:text-base">
          {t("subtitle")}
        </p>
      </div>

      {/* Filters */}
      <div className="animate-stagger-2">
        <CourseFilters filters={filters} onFiltersChange={setFilters} />
      </div>

      {/* Course count */}
      {!isLoading && !error && (
        <div className="animate-stagger-3 flex items-center gap-2 text-sm text-muted-foreground">
          <span className="font-data text-foreground/80 font-semibold">
            {typedCourses.length}
          </span>
          <span>{t("totalCourses")}</span>
        </div>
      )}

      {/* Loading state */}
      {isLoading && <ThemedLoader />}

      {/* Error state */}
      {error && (
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-8">
          <p className="text-destructive">{tCommon("error")}</p>
          <button
            onClick={() => refetch()}
            className="rounded-md border border-foreground/20 bg-foreground/10 px-4 py-2 text-sm text-foreground/80 transition-colors hover:bg-foreground/15"
          >
            {tCommon("retry")}
          </button>
        </div>
      )}

      {/* Course Table */}
      {!isLoading && !error && (
        <div className="animate-stagger-3">
          <CourseTable courses={typedCourses} focusArea={profile?.focusArea ?? null} />
        </div>
      )}

      {/* Data freshness + missing course */}
      {!isLoading && !error && typedCourses.length > 0 && (
        <div className="flex items-center gap-3 text-xs text-foreground/30">
          <p>
            {isHe
              ? "נתונים מידיעון אוניברסיטת תל אביב · תשפ״ו"
              : "Data from Tel Aviv University Yedion · 2025/26"}
            {freshestSync && (
              <>
                {" · "}
                {isHe ? "עודכן לאחרונה " : "last updated "}
                <bdi dir="ltr">
                  {freshestSync.toLocaleDateString(isHe ? "he-IL" : "en-US", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </bdi>
              </>
            )}
          </p>
          <span className="text-foreground/15">·</span>
          <a
            href={`mailto:tzirin.ariel@gmail.com?subject=${encodeURIComponent(isHe ? "קורס חסר בקטלוג פכמון" : "Missing course in the Pakamon catalog")}`}
            className="underline underline-offset-2 transition-colors hover:text-foreground/50"
          >
            {isHe ? "לא מצאתם קורס? דווחו לנו" : "Missing a course? Let us know"}
          </a>
        </div>
      )}
    </div>
  );
}
