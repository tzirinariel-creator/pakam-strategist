"use client";

import { useTranslations } from "next-intl";
import { GraduationCap, AlertTriangle, CalendarDays, Scale } from "lucide-react";
import { YearBoard } from "./year-board";
import { AddCourseModal } from "./add-course-modal";
import { CREDIT_REQUIREMENTS } from "@/lib/constants";
import { api } from "@/lib/trpc/react";
import { ThemedLoader } from "@/components/ui/themed-loader";
import { cn } from "@/lib/utils";
import { Link } from "@/i18n/navigation";

export function PlannerContent() {
  const t = useTranslations("planner");
  const tCredits = useTranslations("credits");
  const tCommon = useTranslations("common");

  const {
    data: planData,
    isLoading,
    error,
  } = api.plan.getUserPlan.useQuery(undefined, { retry: 1 });

  const regulationQuery = api.regulation.checkCompliance.useQuery(undefined, {
    retry: 1,
  });

  // ------ Loading state ------
  if (isLoading) {
    return <ThemedLoader />;
  }

  // ------ Error state ------
  if (error) {
    const isUnauthorized = error.message.includes("UNAUTHORIZED") || error.message.includes("log in");

    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
        <AlertTriangle className="size-8 text-red-400" />
        <p className="text-sm text-muted-foreground">{error.message}</p>
        {isUnauthorized ? (
          <Link
            href="/login"
            className="text-sm text-foreground/80 underline underline-offset-4 hover:text-foreground/80"
          >
            {t("loginAgain")}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-sm text-foreground/80 underline underline-offset-4 hover:text-foreground/80"
          >
            {tCommon("retry")}
          </button>
        )}
      </div>
    );
  }

  const courses = planData?.courses ?? [];
  const totalCredits = courses.reduce((sum, uc) => sum + uc.course.credits, 0);
  const completedCredits = courses
    .filter((uc) => uc.status === "COMPLETED")
    .reduce((sum, uc) => sum + uc.course.credits, 0);
  const target = CREDIT_REQUIREMENTS.TOTAL;
  const progressPercent = Math.min((totalCredits / target) * 100, 100);

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      {/* Page header */}
      <div className="animate-stagger-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <GraduationCap className="size-7 text-foreground/80" />
          <div>
            <h1 className="text-2xl font-bold text-foreground/80">
              {t("title")}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t("dragHint")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Regulation compliance badge */}
          {regulationQuery.data && (
            <Link
              href="/regulations"
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors hover:shadow-sm",
                regulationQuery.data.passed === regulationQuery.data.totalRules
                  ? "border-emerald-400/30 bg-emerald-400/5 text-emerald-400 hover:border-emerald-400/50"
                  : "border-amber-400/30 bg-amber-400/5 text-amber-400 hover:border-amber-400/50"
              )}
            >
              <Scale className="h-3.5 w-3.5" />
              {regulationQuery.data.passed}/{regulationQuery.data.totalRules}
            </Link>
          )}
          <Link
            href="/planner/semester"
            className="flex items-center gap-2 rounded-lg border border-border/40 bg-card/40 px-4 py-2 text-sm text-foreground/60 transition-colors hover:border-foreground/20 hover:bg-card/60 hover:text-foreground/80"
          >
            <CalendarDays className="h-4 w-4" />
            {t("modifySemesterPlan")}
          </Link>
        </div>
      </div>

      {/* Credit summary bar */}
      <div className="animate-stagger-2 data-card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Left side: progress ring + numbers */}
        <div className="flex items-center gap-4">
          {/* Progress text */}
          <div className="flex flex-col gap-0.5">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-foreground/80">
                {totalCredits}
              </span>
              <span className="text-sm text-muted-foreground">
                / {target} {tCredits("title")}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              {tCredits("completed")}: {completedCredits} | {tCredits("remaining")}: {target - totalCredits > 0 ? target - totalCredits : 0}
            </span>
          </div>
        </div>

        {/* Right side: progress bar */}
        <div className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-xs">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted/40">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                progressPercent >= 100
                  ? "bg-emerald-500"
                  : "bg-foreground",
              )}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="text-end text-[10px] text-muted-foreground">
            {Math.round(progressPercent)}%
          </span>
        </div>
      </div>

      {/* Main content — year board with drag & drop */}
      <div className="animate-stagger-3">
        <YearBoard courses={courses} />
      </div>

      {/* Add course modal */}
      <AddCourseModal />
    </div>
  );
}
