"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { GraduationCap, AlertTriangle, CalendarDays, Scale, Share2, CheckCircle2, X } from "lucide-react";
import { toast } from "sonner";
import { encodePlan, type SharedCourse } from "@/lib/plan-share";
import { YearBoard } from "./year-board";
import { AddCourseModal } from "./add-course-modal";
import { BiddingExplainer } from "./bidding-explainer";
import { BiddingOverlapAlert } from "./bidding-overlap-alert";
import { PlannerLiveTimetable } from "./planner-live-timetable";
import { CREDIT_REQUIREMENTS } from "@/lib/constants";
import { api } from "@/lib/trpc/react";
import { ThemedLoader } from "@/components/ui/themed-loader";
import { cn } from "@/lib/utils";
import { Link } from "@/i18n/navigation";
import { Bidi } from "@/lib/bidi";

export function PlannerContent() {
  const t = useTranslations("planner");
  const tCredits = useTranslations("credits");
  const tCommon = useTranslations("common");
  const tOnboarding = useTranslations("onboarding");
  const isHe = useLocale() === "he";

  const {
    data: planData,
    isLoading,
    error,
  } = api.plan.getUserPlan.useQuery(undefined, { retry: 1 });

  const regulationQuery = api.regulation.checkCompliance.useQuery(undefined, {
    retry: 1,
  });

  // Save confirmation (#18): the planner page redirects here with ?saved=1 after
  // persisting. Show an unmissable banner (the transient toast was easy to miss
  // mid-navigation) and strip the param so a refresh won't re-show it. It's
  // dismiss-only — NOT auto-hidden: this page mounts behind a loader while the
  // slow prod DB responds, so a timer started here could expire before the
  // content even renders (and the slow-DB user is exactly who #18 is about).
  // It clears on its own when the student navigates away.
  const searchParams = useSearchParams();
  const [showSavedBanner, setShowSavedBanner] = useState(false);
  useEffect(() => {
    if (searchParams.get("saved") === "1") {
      setShowSavedBanner(true);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [searchParams]);

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

  // Share the plan as a link (no backend): pack course codes + placement into a
  // base64url token. A friend opens /shared-plan?d=… and can copy it.
  const handleShare = async () => {
    const shared: SharedCourse[] = courses.map((uc) => ({
      c: uc.course.code,
      y: uc.plannedYear,
      s: uc.plannedSemester as SharedCourse["s"],
    }));
    if (shared.length === 0) {
      toast.error(isHe ? "אין קורסים לשיתוף" : "No courses to share");
      return;
    }
    const url = `${window.location.origin}/${isHe ? "he" : "en"}/shared-plan?d=${encodePlan(shared)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(isHe ? "הקישור הועתק — שלח לחבר" : "Link copied — send it to a friend");
    } catch {
      toast.error(isHe ? "ההעתקה נכשלה" : "Copy failed");
    }
  };

  // ------ Zero-course empty state ------
  // Defensive guard: new users who land here before completing onboarding
  // (which lives on /dashboard) would otherwise see an empty board. Point
  // them back to the dashboard where the onboarding wizard runs.
  if (courses.length === 0) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 p-4 text-center md:p-6">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-foreground/10">
          <GraduationCap className="size-8 text-foreground/80" />
        </div>
        <div className="max-w-md space-y-2">
          <h1 className="text-2xl font-bold text-foreground/80">
            {tOnboarding("welcomeTitle")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {tOnboarding("welcomeSubtitle")}
          </p>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-lg bg-foreground px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-foreground/90"
        >
          {tOnboarding("goToDashboard")}
        </Link>
      </div>
    );
  }

  const totalCredits = courses.reduce((sum, uc) => sum + uc.course.credits, 0);
  const completedCredits = courses
    .filter((uc) => uc.status === "COMPLETED")
    .reduce((sum, uc) => sum + uc.course.credits, 0);
  const target = CREDIT_REQUIREMENTS.TOTAL;
  const progressPercent = Math.min((totalCredits / target) * 100, 100);

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      {/* Saved confirmation (#18) — unmissable, dismissible, auto-hides */}
      {showSavedBanner && (
        <div
          role="status"
          className="animate-fade-in flex items-center gap-3 rounded-xl border border-emerald-400/30 bg-emerald-400/[0.07] p-4"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-500">
            <CheckCircle2 className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground/85">
              {t("planSavedBannerTitle")}
            </p>
            <p className="mt-0.5 text-xs text-foreground/55">
              {t("planSavedBannerDesc")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowSavedBanner(false)}
            aria-label={isHe ? "סגור" : "Close"}
            className="shrink-0 rounded-md p-1 text-foreground/30 transition-colors hover:text-foreground/60"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

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
              <Bidi text={`${regulationQuery.data.passed}/${regulationQuery.data.totalRules}`} />
            </Link>
          )}
          <button
            type="button"
            onClick={handleShare}
            className="flex items-center gap-2 rounded-lg border border-border/40 bg-card/40 px-3 py-2 text-sm text-foreground/60 transition-colors hover:border-foreground/20 hover:bg-card/60 hover:text-foreground/80"
            title={isHe ? "שתף את התכנון עם חבר" : "Share your plan with a friend"}
          >
            <Share2 className="h-4 w-4" />
            {isHe ? "שתף" : "Share"}
          </button>
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

      {/* Main content — plan board beside a live timetable (#21). On wide
          screens they sit side by side so the schedule updates as you drag a
          course; on narrow screens the timetable stacks below the board. */}
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <div className="animate-stagger-3">
            <YearBoard courses={courses} />
          </div>
          {/* Bidding help — the overlap trap on YOUR real courses, then the
              mechanics + pre-bid safety checklist. */}
          <div className="animate-stagger-4 flex flex-col gap-4">
            <BiddingOverlapAlert courses={courses} />
            <BiddingExplainer isHe={isHe} />
          </div>
        </div>

        {/* Live timetable — sticky alongside the board on xl+ */}
        <div className="animate-stagger-3 xl:sticky xl:top-4 xl:w-[380px] xl:shrink-0">
          <PlannerLiveTimetable courses={courses} />
        </div>
      </div>

      {/* Add course modal */}
      <AddCourseModal />
    </div>
  );
}
