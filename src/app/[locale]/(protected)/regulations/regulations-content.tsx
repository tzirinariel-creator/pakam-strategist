"use client";

import { useTranslations } from "next-intl";
import { Scale, RefreshCw, BookOpen } from "lucide-react";
import { api } from "@/lib/trpc/react";
import { ThemedLoader } from "@/components/ui/themed-loader";
import { Link } from "@/i18n/navigation";
import { ComplianceOverview } from "@/components/regulations/compliance-overview";
import { RuleList } from "@/components/regulations/rule-list";
import { PageHeader } from "@/components/ui/page-header";

export function RegulationsContent() {
  const t = useTranslations("regulations");
  const tCommon = useTranslations("common");

  const {
    data: summary,
    isLoading,
    error,
    refetch,
    isFetching,
  } = api.regulation.checkCompliance.useQuery();

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 animate-fade-in">
      {/* Header — the ONE canonical page header (קו-עיצובי pattern #1). */}
      <PageHeader
        icon={Scale}
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          summary && (
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="flex items-center gap-2 rounded-md border border-foreground/20 bg-foreground/10 px-3 py-2 text-sm text-foreground/80 transition-colors hover:bg-foreground/15 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              {t("refresh")}
            </button>
          )
        }
      />

      {/* Loading state */}
      {isLoading && <ThemedLoader />}

      {/* Error state */}
      {error && (
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-8">
          <p className="text-destructive">{tCommon("error")}</p>
          <p className="text-sm text-destructive/70">{error.message}</p>
          <button
            onClick={() => refetch()}
            className="rounded-md border border-foreground/20 bg-foreground/10 px-4 py-2 text-sm text-foreground/80 transition-colors hover:bg-foreground/15"
          >
            {tCommon("retry")}
          </button>
        </div>
      )}

      {/* No courses info state */}
      {summary && summary.courseCount === 0 && (
        <div className="data-card flex flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-foreground/10">
            <BookOpen className="h-8 w-8 text-foreground/80" />
          </div>
          <h3 className="font-display text-lg font-bold text-foreground">
            {t("noCourses")}
          </h3>
          <p className="max-w-md text-sm text-muted-foreground">
            {t("noCoursesDescription")}
          </p>
          <Link
            href="/planner"
            className="rounded-lg bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
          >
            {t("goToPlanner")}
          </Link>
        </div>
      )}

      {/* Compliance data — the overview verdict, then the red-flags-first,
          thematically-grouped detail (no more wall of 25 severity-bucketed cards). */}
      {summary && (
        <>
          <ComplianceOverview summary={summary} />
          <RuleList results={summary.results} />
        </>
      )}
    </div>
  );
}
