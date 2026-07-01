"use client";

import { useTranslations, useLocale } from "next-intl";
import { Scale, RefreshCw, BookOpen, Info } from "lucide-react";
import { api } from "@/lib/trpc/react";
import { ThemedLoader } from "@/components/ui/themed-loader";
import { Link } from "@/i18n/navigation";
import { ComplianceOverview } from "@/components/regulations/compliance-overview";
import { RuleList } from "@/components/regulations/rule-list";

export function RegulationsContent() {
  const t = useTranslations("regulations");
  const tCommon = useTranslations("common");
  const isHe = useLocale() === "he";

  const {
    data: summary,
    isLoading,
    error,
    refetch,
    isFetching,
  } = api.regulation.checkCompliance.useQuery();

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Scale className="h-8 w-8 text-foreground/80" />
          <div className="flex flex-col gap-0.5">
            <h1 className="font-display text-2xl font-bold text-foreground/80 md:text-3xl">
              {t("title")}
            </h1>
            <p className="text-sm text-foreground/60">
              {t("subtitle")}
            </p>
          </div>
        </div>

        {/* Refresh button */}
        {summary && (
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-2 rounded-md border border-foreground/20 bg-foreground/10 px-3 py-2 text-sm text-foreground/80 transition-colors hover:bg-foreground/15 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            {t("refresh")}
          </button>
        )}
      </div>

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

      {/* Compliance data */}
      {summary && (
        <>
          {/* What this tab is FOR — a plain-language purpose line (#25). */}
          <div className="flex items-start gap-2.5 rounded-xl border border-border/50 bg-foreground/[0.02] px-4 py-3 text-sm leading-relaxed text-foreground/60">
            <Info className="mt-0.5 size-4 shrink-0 text-foreground/40" />
            <span>
              {isHe
                ? "כאן רואים אם התוכנית שלך עומדת בכל כללי-התקנון של התואר — ש\"ס, תחום-מיקוד, אנגלית, סמינרים ומילואים. אם משהו לא בסדר או עדיין חסר, זה יסומן כאן כדי שתוכל לתקן בזמן."
                : "This is where you see whether your plan meets every degree regulation — credits, focus area, English, seminars and reserve duty. Anything wrong or still missing is flagged here so you can fix it in time."}
            </span>
          </div>

          {/* Overview card */}
          <ComplianceOverview summary={summary} />

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border/30" />
            <span className="text-xs font-medium text-muted-foreground">
              {t("detailedResults")}
            </span>
            <div className="h-px flex-1 bg-border/30" />
          </div>

          {/* Rule list */}
          <RuleList results={summary.results} />
        </>
      )}
    </div>
  );
}
