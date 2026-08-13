"use client";

import { useState, useMemo } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations, useLocale } from "next-intl";
import { BookOpen, Users2 } from "lucide-react";
import { api } from "@/lib/trpc/react";
import { ThemedLoader } from "@/components/ui/themed-loader";
import { CourseFilters, type CourseFiltersState } from "@/components/catalog/course-filters";
import { CourseTable } from "@/components/catalog/course-table";
import { PageHeader } from "@/components/ui/page-header";
import type { Course } from "@/types/degree";
import type { Discipline, CourseType } from "@/types/enums";
import { CONTACT_EMAIL } from "@/lib/constants";
import { ARAZIM_ENABLED } from "@/lib/arazim/visibility";

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

  // The FULL (unfiltered) catalog — used only so the course-detail panel can
  // resolve prerequisites to clickable names even when the visible table is
  // filtered by discipline/search (a prereq may live outside the current filter).
  const { data: allCoursesRaw } = api.course.list.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });
  const allCourses = (allCoursesRaw ?? courses ?? []) as unknown as Course[];

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
      {/* Header — the ONE canonical page header (קו-עיצובי pattern #1). */}
      {/* Live catalog size — the hardcoded "117" drifted the moment the
          catalog changed (verify 14.7); "…" while loading, never a made-up
          number. */}
      <PageHeader icon={BookOpen} title={t("title")} subtitle={t("subtitle", { count: allCourses.length > 0 ? allCourses.length : "…" })} />

      {/* Discovery: the cohort file is WHERE elective-picking wisdom lives */}
      <Link
        href="/cohort"
        className="animate-stagger-2 inline-flex items-center gap-2 rounded-full border border-accent-brand/30 bg-accent-brand/5 px-3 py-1.5 text-xs font-medium text-accent-brand transition-colors hover:bg-accent-brand/10"
      >
        <Users2 className="size-3.5" />
        {locale === "he" ? "מתלבטים איזה קורס בחירה? ראו מה המחזור ממליץ ←" : "Picking an elective? See what the cohort recommends →"}
      </Link>

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
      {isLoading && <ThemedLoader variant="inline" />}

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
          <CourseTable courses={typedCourses} allCourses={allCourses} focusArea={profile?.focusArea ?? null} />
        </div>
      )}

      {/* Data provenance — two HONEST statements, not one that implies grades are
          official. Facts come from the Yedion; the average+difficulty are a
          computed estimate from historical data (Arazim), not a TAU figure. (#8/#15) */}
      {!isLoading && !error && typedCourses.length > 0 && (
        <div className="flex flex-col gap-1 text-xs text-foreground/65">
          <p>
            {isHe
              ? "עובדות הקורס (שם, ש״ס, שעות, דרישות קדם) — מידיעון אוניברסיטת תל אביב, תשפ״ז"
              : "Course facts (name, credits, hours, prerequisites) — from the Tel Aviv University Yedion, 2026/27"}
            {freshestSync && (
              <>
                {" · "}
                {isHe ? "עודכן לאחרונה " : "last updated "}
                {/* NOT dir="ltr" (#1, 13.8): a he-IL date is Hebrew TEXT
                    ("10 ביולי 2026"), not a number. Forcing the run LTR made it
                    render "10 2026 ביולי" — month and year swapped, which is
                    exactly what Ariel reported. Plain <bdi> isolates it and
                    lets each script lay itself out correctly. */}
                <bdi>
                  {freshestSync.toLocaleDateString(isHe ? "he-IL" : "en-US", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </bdi>
              </>
            )}
          </p>
          {/* Arazim provenance line — only while the external data is actually
              shown. With ARAZIM_ENABLED off ("בלי ארזים כרגע") the table shows no
              averages, so naming Arazim here would advertise a source that isn't
              present (the surface Ariel asked to strip). */}
          {ARAZIM_ENABLED && (
            <p>
              {isHe
                ? "ציון ממוצע וקושי — מנתוני פרויקט ארזים (סטטיסטיקות ציונים אמיתיות שנאספו משנים קודמות), לא נתון רשמי של האוניברסיטה"
                : "Average grade and difficulty — from the Arazim project (real grade statistics collected from past years), not an official university figure"}
            </p>
          )}
          <a
            href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(isHe ? "קורס חסר בקטלוג פכמון" : "Missing course in the Pakamon catalog")}`}
            className="w-fit text-foreground/70 underline underline-offset-2 transition-colors hover:text-foreground/90"
          >
            {isHe ? "לא מצאתם קורס? דווחו לנו" : "Missing a course? Let us know"}
          </a>
        </div>
      )}
    </div>
  );
}
