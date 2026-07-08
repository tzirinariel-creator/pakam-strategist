"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { GraduationCap, Scale, Pencil, Target, ArrowRight, ArrowLeft, Calendar, X, RefreshCw, Calculator, CheckCircle2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import { consumeSharedPlanReturn } from "@/lib/plan-share";
import { getAcademicNow, deriveYearOfStudy } from "@/lib/academic-calendar";
import { isCurrentlyStudying } from "@/lib/semester-clock";
import { api } from "@/lib/trpc/react";
import { firstNameOf } from "@/lib/personal-address";
import { usePersonalAddress } from "@/components/personal/use-personal-address";
import { TipCard } from "@/components/shared/tip-card";
import { getContextualTips, getRandomTip } from "@/lib/tips-engine";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { Progress } from "@/components/ui/progress";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { AnchoredTour, TourReopenButton, TOUR_DONE_KEY } from "@/components/onboarding/anchored-tour";
import { cn } from "@/lib/utils";
import { TodaysClasses } from "@/components/dashboard/todays-classes";
import { SemesterWrapCard } from "@/components/dashboard/semester-wrap-card";
import { PhilosopherKingIcon } from "@/components/ui/philosopher-king-icon";
import { ExamCountdown } from "@/components/dashboard/exam-countdown";
import { RecommendationsWidget } from "@/components/dashboard/recommendations-widget";
import { StudyPlannerWidget } from "@/components/dashboard/study-planner-widget";
import { MyStatusHero, type DisciplineProgress } from "@/components/dashboard/my-status-hero";
import { getActiveProgram } from "@/lib/programs/registry";
import { buildRecommendations } from "@/lib/recommendations-engine";
import { binaryCapRemaining, type MiluimGroupKey } from "@/lib/miluim";
import type { GradeBreakdown, CreditBreakdown } from "@/types/degree";
import { diffBreakdown } from "@/lib/degree-delta";
import { Bidi } from "@/lib/bidi";

// -----------------------------------------------------------------------
// Post-Onboarding Transition — auto-retries plan fetch after saving
// -----------------------------------------------------------------------

function PostOnboardingTransition({
  onRetry,
  onContinue,
}: {
  onRetry: () => void;
  onContinue: () => void;
}) {
  const t = useTranslations("dashboard");
  const retryCount = useRef(0);
  const maxRetries = 8;
  const [currentAttempt, setCurrentAttempt] = useState(0);
  const [exhausted, setExhausted] = useState(false);
  const [showContinue, setShowContinue] = useState(false);

  useEffect(() => {
    // Show "Continue anyway" after 2 seconds — don't block the user
    const continueTimer = setTimeout(() => setShowContinue(true), 2000);

    const interval = setInterval(() => {
      retryCount.current += 1;
      setCurrentAttempt(retryCount.current);
      onRetry();

      if (retryCount.current >= maxRetries) {
        clearInterval(interval);
        setExhausted(true);
        // Auto-continue after exhausted — don't leave user stuck
        setTimeout(() => onContinue(), 1500);
      }
    }, 1200);

    return () => {
      clearInterval(interval);
      clearTimeout(continueTimer);
    };
  }, [onRetry, onContinue]);

  if (exhausted) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-foreground/5">
          <GraduationCap className="h-8 w-8 text-foreground/40" />
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <p className="text-sm font-medium text-foreground/70">
            {t("settingUpPlan")}
          </p>
          <p className="text-xs text-foreground/40">
            {t("settingUpPlanDesc")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              retryCount.current = 0;
              setCurrentAttempt(0);
              setExhausted(false);
              setShowContinue(false);
              onRetry();
            }}
            className="rounded-lg bg-foreground/10 px-5 py-2 text-sm font-medium text-foreground/70 transition-colors hover:bg-foreground/15"
          >
            {t("retry")}
          </button>
          <button
            type="button"
            onClick={onContinue}
            className="rounded-lg border border-foreground/20 px-5 py-2 text-sm font-medium text-foreground/50 transition-colors hover:bg-foreground/5"
          >
            {t("continueAnyway")}
          </button>
        </div>
      </div>
    );
  }

  const progressPct = Math.min((currentAttempt / maxRetries) * 100, 100);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5">
      <div className="relative">
        <div className="h-20 w-20 animate-spin rounded-full border-4 border-foreground/10 border-t-foreground/60" />
        <div className="absolute inset-0 flex items-center justify-center">
          <GraduationCap className="h-9 w-9 text-foreground/60" />
        </div>
      </div>
      <div className="flex flex-col items-center gap-1.5">
        <p className="text-sm font-medium text-foreground/70 animate-pulse">
          {t("settingUpPlan")}
        </p>
        <p className="text-xs text-foreground/40">
          {t("syncProgress", { current: currentAttempt, max: maxRetries })}
        </p>
      </div>
      {/* Progress bar */}
      <div className="w-48">
        <Progress value={progressPct} className="h-1.5" />
      </div>
      {/* Continue button after 8 seconds */}
      {showContinue && (
        <button
          type="button"
          onClick={onContinue}
          className="animate-fade-in rounded-lg border border-foreground/20 px-5 py-2 text-sm font-medium text-foreground/50 transition-colors hover:bg-foreground/5"
        >
          {t("continueAnyway")}
        </button>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------
// Quick Action Card — locale-aware
// -----------------------------------------------------------------------

function QuickActionCard({
  icon: Icon,
  label,
  href,
  color,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href: string;
  color: string;
  description?: string;
}) {
  return (
    <Link
      href={href}
      className="data-card data-card-interactive group flex items-center gap-3 p-4 transition-all press-scale"
    >
      <div className={cn("rounded-lg p-2.5 transition-transform group-hover:scale-110", color)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1">
        <span className="text-sm font-medium text-foreground/80 block">{label}</span>
        {description && (
          <span className="text-xs text-foreground/40">{description}</span>
        )}
      </div>
    </Link>
  );
}

// -----------------------------------------------------------------------
// Google Calendar Banner
// -----------------------------------------------------------------------

function GoogleCalendarBanner({
  isConnected,
  isHe,
  t,
  onDismiss,
}: {
  isConnected: boolean;
  isHe: boolean;
  t: (key: string) => string;
  onDismiss: () => void;
}) {
  return (
    <div className="data-card relative flex items-center gap-3 p-4 border-border/50">
      <div className="rounded-lg bg-emerald-500/10 p-2">
        <Calendar className="size-5 text-emerald-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground/80">
          {isConnected ? t("googleBannerConnected") : t("googleBanner")}
        </p>
        <p className="text-xs text-foreground/40 mt-0.5">
          {isConnected
            ? (isHe ? "הלו״ז שלכם מסונכרן ליומן Google" : "Your schedule is synced to Google Calendar")
            : (isHe ? "סנכרנו את המערכת ישירות ליומן שלכם" : "Sync your schedule directly to your calendar")}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {!isConnected && (
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20"
          >
            {t("googleBannerConnect")}
          </Link>
        )}
        {isConnected && (
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 rounded-lg bg-foreground/5 px-3 py-1.5 text-sm font-medium text-foreground/60 transition-colors hover:bg-foreground/10"
          >
            <RefreshCw className="size-3.5" />
            {t("googleBannerSyncNow")}
          </Link>
        )}
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-md p-1 text-foreground/20 hover:text-foreground/50 transition-colors"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------
// Welcome Home Card — friendly first-time guidance, dismissible
// -----------------------------------------------------------------------

function WelcomeHomeCard({
  t,
  isHe,
  onDismiss,
}: {
  t: (key: string, values?: Record<string, string | number>) => string;
  isHe: boolean;
  onDismiss: () => void;
}) {
  const Arrow = isHe ? ArrowLeft : ArrowRight;
  const { greetName, g: pg } = usePersonalAddress();
  const steps: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { href: "/calendar", label: isHe ? pg("בדוק את מערכת השעות שלך", "בדקי את מערכת השעות שלך", "בדוק/י את מערכת השעות שלך") : t("welcomeStepSchedule"), icon: Calendar },
    { href: "/record", label: isHe ? pg("הוסף ציונים וקורסים מהעבר", "הוסיפי ציונים וקורסים מהעבר", "הוסף/י ציונים וקורסים מהעבר") : t("welcomeStepRecord"), icon: Pencil },
    { href: "/regulations", label: isHe ? pg("בדוק שאתה עומד בתקנון", "בדקי שאת עומדת בתקנון", "בדוק/י שאת/ה עומד/ת בתקנון") : t("welcomeStepRegulations"), icon: Scale },
  ];

  return (
    <div className="data-card relative overflow-hidden p-6">
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t("welcomeDismiss")}
        className="absolute end-3 top-3 rounded-md p-1 text-foreground/25 transition-colors hover:text-foreground/60"
      >
        <X className="size-4" />
      </button>
      <h2 className="font-display text-xl font-bold text-foreground/90">
        {greetName ? `${greetName}, ` : ""}{t("welcomeHomeTitle")}
      </h2>
      <p className="mt-1 text-sm text-foreground/55">
        {t("welcomeHomeSubtitle")}
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {steps.map(({ href, label, icon: Icon }, i) => (
          <Link
            key={href}
            href={href}
            className="group flex items-center gap-3 rounded-xl border border-foreground/10 bg-foreground/[0.02] p-3.5 transition-all hover:border-foreground/25 hover:bg-foreground/[0.04]"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.06] text-foreground/60">
              <Icon className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block text-[11px] font-medium text-foreground/35">
                {t("welcomeStepLabel", { num: i + 1 })}
              </span>
              <span className="block text-sm font-medium text-foreground/80">
                {label}
              </span>
            </div>
            <Arrow className="size-3.5 shrink-0 text-foreground/30 transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
          </Link>
        ))}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------
// Main dashboard content
// -----------------------------------------------------------------------

export function DashboardContent() {
  const locale = useLocale();
  const isHe = locale === "he";
  const Arrow = isHe ? ArrowLeft : ArrowRight;
  const t = useTranslations("dashboard");
  const tPlanner = useTranslations("planner");
  const searchParams = useSearchParams();
  const fromOnboarding = searchParams.get("from") === "onboarding";
  const resetDemo = searchParams.get("reset") === "demo";
  const router = useRouter();

  // Close the viral loop: a friend who opened a shared plan, clicked join and
  // authenticated (password / OAuth / email-confirm — ALL paths end here)
  // returns to the plan they came for instead of a cold dashboard.
  useEffect(() => {
    const back = consumeSharedPlanReturn();
    if (back) router.replace(back);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once on mount
  }, []);

  // Save confirmation (מסלול E + #18): the semester planner now returns home
  // with ?saved=1 after persisting, so the student sees their status update AND
  // an unmissable green banner — the SAME wording as the planner's banner, so
  // there's one save-confirmation across the app. Dismiss-only (no timer): the
  // dashboard mounts behind a loader on the slow prod DB, so a timed banner
  // could vanish before it's ever seen.
  const [showSavedBanner, setShowSavedBanner] = useState(false);
  // The pre-edit breakdown the planner stashed on save (consume-once), so the
  // banner can name what MOVED ("עלית מ-68% ל-74%") instead of a generic "נשמר".
  const [savedBefore, setSavedBefore] = useState<CreditBreakdown | null>(null);
  useEffect(() => {
    if (searchParams.get("saved") === "1") {
      setShowSavedBanner(true);
      try {
        const raw = sessionStorage.getItem("pk:saveDelta");
        if (raw) setSavedBefore(JSON.parse(raw) as CreditBreakdown);
        sessionStorage.removeItem("pk:saveDelta"); // consume once
      } catch {
        /* storage unavailable — banner falls back to the generic wording */
      }
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [searchParams]);

  // Two-pass approach: always start false (matches SSR), then read localStorage
  // after hydration. This prevents React error #310 (hydration mismatch).
  const [onboardingFlag, setOnboardingFlag] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("pakamon-onboarding-complete") !== null) {
      setOnboardingFlag(true);
    }
  }, []);

  // Reset demo user data when arriving from demo login (?reset=demo)
  const utils = api.useUtils();
  const [demoResetDone, setDemoResetDone] = useState(!resetDemo); // true immediately if not a demo reset
  const resetDemoMutation = api.user.resetDemoUser.useMutation({
    onSuccess: () => {
      void utils.invalidate();
      setDemoResetDone(true);
    },
    onError: () => {
      // Even if reset fails, let the dashboard load
      setDemoResetDone(true);
    },
  });
  const hasResetDemo = useRef(false);

  useEffect(() => {
    if (resetDemo && !hasResetDemo.current) {
      hasResetDemo.current = true;
      resetDemoMutation.mutate();
      window.history.replaceState({}, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetDemo]);

  const isTransitioning = fromOnboarding || onboardingFlag;

  // Check if user has any courses in their plan (for onboarding detection)
  // retry more aggressively when arriving from onboarding
  // staleTime: 0 when transitioning to force fresh fetch
  // IMPORTANT: Don't fetch until demo reset mutation is complete (prevents race condition)
  // All six dashboard queries fire in ONE batch (#9): they used to be gated on
  // `hasPlanData` (= planQuery's result), forcing a second serial round-trip.
  // Each degrades gracefully on its own for a course-less user, so gating them
  // only on demoResetDone (avoids the demo pre-reset race) lets the batch link
  // send all six together. 60s staleTime makes back-navigation instant.
  const planQuery = api.plan.getUserPlan.useQuery(undefined, {
    retry: isTransitioning ? 3 : 1,
    staleTime: isTransitioning ? 0 : 60 * 1000,
    enabled: demoResetDone,
  });

  const hasPlanData = (planQuery.data?.courses?.length ?? 0) > 0;
  const creditsQuery = api.plan.getCredits.useQuery(undefined, {
    retry: 1,
    enabled: demoResetDone,
    staleTime: 60 * 1000,
  });
  const gradeQuery = api.plan.getGraduationScore.useQuery(undefined, {
    retry: 1,
    enabled: demoResetDone,
    staleTime: 60 * 1000,
  });
  const regulationQuery = api.regulation.checkCompliance.useQuery(undefined, {
    retry: 1,
    enabled: demoResetDone,
    staleTime: 60 * 1000,
  });
  const profileQuery = api.user.getProfile.useQuery(undefined, {
    retry: 1,
    enabled: demoResetDone,
    staleTime: 60 * 1000,
  });
  // Gendered next-action labels (unknown gender → inclusive "/" form).
  const { g: pgd } = usePersonalAddress();

  // Google Calendar status — check if connected
  const googleStatus = api.schedule.getGoogleStatus.useQuery(undefined, {
    retry: 1,
    enabled: demoResetDone,
    staleTime: 60 * 1000,
  });
  const [googleBannerDismissed, setGoogleBannerDismissed] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setGoogleBannerDismissed(
        localStorage.getItem("pakamon-google-banner-dismissed") === "true"
      );
    }
  }, []);

  // Welcome card — shown to brand-new users (just onboarded / few courses),
  // dismissible and persisted so it never nags established students.
  const [welcomeDismissed, setWelcomeDismissed] = useState(true);
  useEffect(() => {
    if (typeof window !== "undefined") {
      setWelcomeDismissed(
        localStorage.getItem("pakamon-welcome-dismissed") === "true"
      );
    }
  }, []);

  // Product tour — a short, fully-skippable guided walkthrough shown ONCE the
  // first time a brand-new student lands on the dashboard. Sequencing decision:
  // the tour runs FIRST (it explains the whole app at a glance); the welcome
  // card is suppressed while the tour is open so the two never stack, then
  // remains afterwards as the ongoing "next steps" nudge. Persisted via the
  // `pakamon-tour-done` localStorage key so it never repeats.
  const [tourOpen, setTourOpen] = useState(false);
  const [wrapVisible, setWrapVisible] = useState(false);
  const [tourChecked, setTourChecked] = useState(false);
  const closeTour = useCallback(() => {
    setTourOpen(false);
    if (typeof window !== "undefined") {
      localStorage.setItem(TOUR_DONE_KEY, "true");
    }
  }, []);

  // Auto-open the tour exactly once for genuine first-run users: they've just
  // finished onboarding (or are a near-empty new user) and haven't seen it yet.
  // Gate on plan data so it never fires over a loading/onboarding screen.
  useEffect(() => {
    if (tourChecked || typeof window === "undefined") return;
    if (!hasPlanData) return;
    setTourChecked(true);
    const alreadyDone = localStorage.getItem(TOUR_DONE_KEY) === "true";
    const planCourseCount = planQuery.data?.courses?.length ?? 0;
    // Just finished onboarding? Always show the tour — it's the one moment we
    // KNOW the user is brand-new. Crucially this ignores a stale "done" flag in
    // localStorage (which survives test-user resets and would otherwise silently
    // suppress the tour after the first run ever — the "didn't auto-open when I
    // registered" bug). Otherwise, show once for near-empty users who haven't
    // seen it yet.
    const justOnboarded = fromOnboarding || onboardingFlag;
    const isNearEmptyNew = planCourseCount < 4;
    if (justOnboarded || (!alreadyDone && isNearEmptyNew)) {
      setTourOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPlanData, tourChecked]);

  // #29 — a one-time, dismissible nudge to the WRITTEN beginner guide for
  // year-1 students (the tour is a 1-minute spotlight; the guide is the deep
  // manual). Assumed dismissed until localStorage is read — no flash.
  const [guideNudgeDismissed, setGuideNudgeDismissed] = useState(true);
  useEffect(() => {
    setGuideNudgeDismissed(localStorage.getItem("pakamon-guide-nudge-done") === "true");
  }, []);
  const dismissGuideNudge = useCallback(() => {
    setGuideNudgeDismissed(true);
    localStorage.setItem("pakamon-guide-nudge-done", "true");
  }, []);

  // Clear onboarding flag once data is successfully loaded
  const handleOnboardingSuccess = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("pakamon-onboarding-complete");
    }
    setOnboardingFlag(false);
  }, []);

  // Auto-clear flag when plan data arrives
  useEffect(() => {
    if (hasPlanData && onboardingFlag) {
      handleOnboardingSuccess();
    }
  }, [hasPlanData, onboardingFlag, handleOnboardingSuccess]);

  // Derive data
  const credits: CreditBreakdown | null = creditsQuery.data?.breakdown ?? null;

  // Save-return narrative: diff the pre-edit breakdown (stashed by the planner)
  // against the freshly-loaded post-save one. Both are SERVER values, so the
  // "68% → 74%" can never disagree with the canonical status above.
  const saveDelta =
    showSavedBanner && savedBefore && credits ? diffBreakdown(savedBefore, credits) : null;
  const gradeBreakdown: GradeBreakdown = gradeQuery.data ?? {
    courseAverage: null,
    seminarPaperAverage: null,
    referatGrade: null,
    weightedScore: null,
    completedCredits: 0,
    totalGradedCourses: 0,
  };

  // regulationSummary feeds the recommendations engine and the hero's "top gap".
  // The standalone compliance card was removed in the home-screen redesign — the
  // full rules view lives on /regulations.
  const regulationSummary = regulationQuery.data;

  // Has the student actually built anything yet? Used to distinguish a
  // brand-new "nothing done" state from a genuine "all requirements met" state.
  const courseCount = planQuery.data?.courses?.length ?? 0;
  const earnedCredits = credits?.earned ?? 0;
  const plannedCredits = credits?.planned ?? 0;
  const hasAnyCourses = courseCount > 0 || earnedCredits + plannedCredits > 0;

  // "Established" users have a meaningful plan; new/near-empty users get the
  // welcome card and a lighter, contextual quick-actions row.
  const isNewUser = courseCount < 4;
  const hasFocusArea = !!profileQuery.data?.focusArea;
  const hasGrades = gradeBreakdown.totalGradedCourses > 0;
  // Year + semester are DERIVED from the calendar (single source of truth,
  // #39/#43) — the stored profile pair is only a legacy fallback.
  const acadNow = getAcademicNow();
  const currentYear = deriveYearOfStudy(
    profileQuery.data?.startYear,
    profileQuery.data?.currentYear ?? 1,
  );

  // How many planned courses the student is literally sitting in RIGHT NOW —
  // derived from the calendar (#4/#22), never stored. Powers the "בלימוד עכשיו"
  // line on the hero: the Home screen mirrors the present.
  const inProgressCount = (planQuery.data?.courses ?? []).filter((uc) =>
    isCurrentlyStudying(
      { plannedYear: uc.plannedYear, plannedSemester: uc.plannedSemester, status: uc.status },
      currentYear,
    ),
  ).length;

  // Smart recommendations — deterministic, data-backed. Computed from data the
  // dashboard already holds (plan, grades, credits, regulations, profile), so
  // it adds no extra server round-trips. See lib/recommendations-engine.ts.
  const recommendations = buildRecommendations({
    courses: (planQuery.data?.courses ?? []).map((uc) => ({
      status: uc.status,
      grade: uc.grade,
      courseType: uc.course.courseType,
      isMandatory: uc.course.isMandatory,
      isBinary: uc.isBinary,
      credits: uc.course.credits,
      nameHe: uc.course.nameHe,
      nameEn: uc.course.nameEn,
      examDateB: uc.course.examDateB,
      discipline: (uc.disciplineOverride ?? uc.course.discipline) as string,
    })),
    courseAverage: gradeBreakdown.courseAverage,
    englishCourseCount: credits?.englishCourseCount ?? 0,
    amiramScore: profileQuery.data?.amiramScore ?? null,
    hasFocusArea,
    currentYear,
    miluimGroup: profileQuery.data?.miluimGroup ?? "NONE",
    binaryRemaining: binaryCapRemaining(
      profileQuery.data?.miluimBinaryUsed ?? 0,
      (profileQuery.data?.miluimGroup ?? "NONE") as MiluimGroupKey
    ),
    regulationResults: regulationSummary?.results ?? [],
    now: new Date(),
  });

  // The single most pressing unmet requirement (biggest ERROR-severity deficit),
  // surfaced in the "My status" hero.
  const topGap =
    (regulationSummary?.results ?? [])
      .filter((r) => !r.passed && r.severity === "ERROR")
      .map((r) => ({
        nameHe: r.ruleNameHe,
        nameEn: r.ruleNameEn,
        deficit: Number((r.details as Record<string, unknown> | undefined)?.deficit ?? 0),
      }))
      .sort((a, b) => b.deficit - a.deficit)[0] ?? null;

  // Per-discipline progress (the three PPE legs) — resolve the audit engine's
  // disciplineStatus against the active program for names + colors. Same source
  // as the credit bar, so the home and planner never disagree (Project 1 #4).
  const disciplineBreakdown: DisciplineProgress[] = (
    creditsQuery.data?.disciplineStatus ?? []
  ).map((s) => {
    const def = getActiveProgram().disciplines.find((d) => d.id === s.discipline);
    return {
      nameHe: def?.nameHe ?? s.discipline,
      nameEn: def?.nameEn ?? s.discipline,
      color: def?.color ?? "#8B949E",
      earned: s.earned,
      required: s.required,
      met: s.met,
    };
  });

  // Allows user to bypass the transition screen and go to dashboard
  const [skipTransition, setSkipTransition] = useState(false);

  // If user clicked "continue anyway" but no data — show empty dashboard not wizard
  const [forceDashboard, setForceDashboard] = useState(false);

  // Loading timeout — never leave the user stuck on a spinner
  const [loadingTooLong, setLoadingTooLong] = useState(false);
  useEffect(() => {
    if (!planQuery.isLoading) {
      setLoadingTooLong(false);
      return;
    }
    const timer = setTimeout(() => setLoadingTooLong(true), 8000);
    return () => clearTimeout(timer);
  }, [planQuery.isLoading]);

  // Only block on planQuery — it determines onboarding vs dashboard.
  // Other queries can load in the background.
  if (planQuery.isLoading && !loadingTooLong) {
    return <DashboardSkeleton />;
  }

  // Loading took too long — show actionable UI instead of endless spinner
  if (planQuery.isLoading && loadingTooLong) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-brand-muted">
          <PhilosopherKingIcon className="h-8 w-8 text-accent-brand" />
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <p className="text-sm font-medium text-foreground/70">
            {t("loadingSlowTitle")}
          </p>
          <p className="text-xs text-foreground/40">
            {t("loadingSlowDesc")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setLoadingTooLong(false);
              planQuery.refetch();
            }}
            className="rounded-lg bg-foreground/10 px-5 py-2 text-sm font-medium text-foreground/70 transition-colors hover:bg-foreground/15"
          >
            {t("retry")}
          </button>
          <button
            type="button"
            onClick={() => setForceDashboard(true)}
            className="rounded-lg border border-foreground/20 px-5 py-2 text-sm font-medium text-foreground/50 transition-colors hover:bg-foreground/5"
          >
            {t("continueAnyway")}
          </button>
        </div>
      </div>
    );
  }

  // ── Phase 1A fix: PLAN QUERY ERROR → show error, NOT onboarding wizard ──
  if (planQuery.isError) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
          <Scale className="h-8 w-8 text-red-400" />
        </div>
        <h2 className="text-xl font-bold text-foreground/80">
          {t("planLoadError")}
        </h2>
        <p className="max-w-sm text-center text-sm text-foreground/50">
          {t("planLoadErrorDesc")}
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => planQuery.refetch()}
            className="rounded-lg bg-foreground/10 px-6 py-2.5 text-sm font-medium text-foreground/70 transition-colors hover:bg-foreground/15"
          >
            {t("retry")}
          </button>
          <Link
            href="/planner"
            className="rounded-lg border border-foreground/20 px-6 py-2.5 text-sm font-medium text-foreground/50 transition-colors hover:bg-foreground/5"
          >
            {t("goToPlanner")}
          </Link>
        </div>
      </div>
    );
  }

  // Show onboarding wizard ONLY for genuine new users:
  // Plan query succeeded, no courses, no transition signal, and didn't force-skip
  if (planQuery.isSuccess && !hasPlanData && !isTransitioning && !forceDashboard) {
    return <OnboardingWizard />;
  }

  // Transitioning from onboarding — data may not have arrived yet.
  // Show a patient transition screen that auto-retries (no reload loops!)
  if (!hasPlanData && isTransitioning && !skipTransition && !forceDashboard) {
    return (
      <PostOnboardingTransition
        onRetry={() => planQuery.refetch()}
        onContinue={() => {
          handleOnboardingSuccess();
          setSkipTransition(true);
          setForceDashboard(true); // Prevent falling back to wizard
        }}
      />
    );
  }

  // Note: we no longer block the dashboard if sub-queries (credits, grades, regulations) fail.
  // Instead, we gracefully degrade — show whatever data we have. Each widget handles its own loading/error.

  return (
    <div className="bg-mesh space-y-8 p-4 md:p-6">
      {/* Anchored product tour — spotlights the real UI it describes */}
      <AnchoredTour open={tourOpen} onClose={closeTour} />

      {/* #29 — year-1 nudge to the written beginner guide (once, dismissible,
          never while the tour is open so the two don't stack). */}
      {currentYear === 1 && !guideNudgeDismissed && !tourOpen && (
        <div className="animate-fade-in flex items-center gap-3 rounded-xl border border-accent-brand/25 bg-accent-brand/[0.05] p-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-brand/10 text-accent-brand">
            <GraduationCap className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground/85">
              {isHe ? "חדש/ה בפכ״מ? יש לנו מדריך שכתוב בשבילך" : "New to PPE? There's a guide written for you"}
            </p>
            <p className="text-xs text-foreground/55">
              {isHe
                ? "כל מה שמבלבל בשנה א׳ — ש״ס, תחום מיקוד, בידינג, אנגלית — מוסבר במקום אחד."
                : "Everything confusing in year 1 — credits, focus area, bidding, English — explained in one place."}
            </p>
          </div>
          <Link
            href="/guide"
            onClick={dismissGuideNudge}
            className="shrink-0 rounded-lg bg-accent-brand px-3 py-2 text-sm font-semibold text-accent-brand-fg transition-colors hover:bg-accent-brand-hover"
          >
            {isHe ? "למדריך" : "Open guide"}
          </Link>
          <button
            type="button"
            onClick={dismissGuideNudge}
            aria-label={isHe ? "סגור" : "Dismiss"}
            className="shrink-0 rounded-md p-1 text-foreground/30 transition-colors hover:text-foreground/60"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Saved confirmation — shown after returning from the semester planner
          (?saved=1). Same green banner + wording as the planner, so the whole
          app confirms a save the same way. Dismiss-only. */}
      {showSavedBanner && (
        <div
          role="status"
          className="animate-fade-in flex items-center gap-3 rounded-xl border border-emerald-400/30 bg-emerald-400/[0.07] p-4"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-500">
            <CheckCircle2 className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            {saveDelta && saveDelta.closedLaneHe ? (
              // A requirement bucket crossed from unmet → met with this save.
              <>
                <p className="text-sm font-semibold text-foreground/85">
                  {isHe
                    ? `סגרת ${saveDelta.closedLaneHe} — ${saveDelta.toPct}% מהתואר`
                    : `You closed ${saveDelta.closedLaneEn} — ${saveDelta.toPct}% of the degree`}
                </p>
                <p className="mt-0.5 text-xs text-foreground/55">
                  {tPlanner("planSavedBannerDesc")}
                </p>
              </>
            ) : saveDelta && saveDelta.toPct > saveDelta.fromPct ? (
              // Degree % moved forward. Numbers are LTR inside Hebrew — wrap them.
              <>
                <p className="text-sm font-semibold text-foreground/85">
                  <Bidi
                    text={
                      isHe
                        ? `עלית מ-${saveDelta.fromPct}% ל-${saveDelta.toPct}% בתואר`
                        : `You moved from ${saveDelta.fromPct}% to ${saveDelta.toPct}% of the degree`
                    }
                  />
                </p>
                <p className="mt-0.5 text-xs text-foreground/55">
                  {isHe ? "ממשיכים לפי התוכנית." : "Keep going per your plan."}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-foreground/85">
                  {tPlanner("planSavedBannerTitle")}
                </p>
                <p className="mt-0.5 text-xs text-foreground/55">
                  {tPlanner("planSavedBannerDesc")}
                </p>
              </>
            )}
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
      <div className="animate-stagger-1">
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-display text-2xl font-bold text-foreground md:text-3xl">
            {(() => {
              // Prefer the first name — a warmer, shorter greeting ("היי דני").
              const name = firstNameOf(profileQuery.data);
              // In Hebrew, only greet by name if it's actually a Hebrew name —
              // never jam a Latin name into a Hebrew greeting ("היי Ariel").
              const isHebrewName = !!name && /[֐-׿]/.test(name);
              if (isHe) return isHebrewName ? `היי ${name}` : t("subtitle");
              return name ? `Hi ${name}` : t("subtitle");
            })()}
          </h1>
          {/* Unobtrusive re-open entry point for the guided tour */}
          <div className="shrink-0 pt-1">
            <TourReopenButton onClick={() => setTourOpen(true)} />
          </div>
        </div>
        {profileQuery.data && (
          <p className="mt-1 text-sm text-foreground/50">
            {isHe ? "פכ\"מ" : "PPE"} · {t("semesterContext", {
              semester: acadNow.semester === "FALL" ? (isHe ? "א׳" : "A") : (isHe ? "ב׳" : "B"),
              year: currentYear,
            })}
          </p>
        )}
        {/* The degree-progress bar lives in the "My status" hero below — no
            need to duplicate it in the header. */}
      </div>

      {/* Welcome card — first-time guidance for fresh / just-onboarded users.
          Shows once (until dismissed), only for new users, never for established
          students with a full plan. Suppressed while the product tour is open so
          the two never stack — the tour runs first, the card remains after.
          Gated on tourChecked so the card can't flash for one frame before the
          tour-decision effect has run and (potentially) opened the tour. */}
      {tourChecked && !welcomeDismissed && !tourOpen && hasPlanData && (fromOnboarding || onboardingFlag || isNewUser) && (
        <div className="animate-stagger-1">
          <WelcomeHomeCard
            t={t}
            isHe={isHe}
            onDismiss={() => {
              setWelcomeDismissed(true);
              localStorage.setItem("pakamon-welcome-dismissed", "true");
            }}
          />
        </div>
      )}

      {/* End-of-semester rite (#22) — the app asks for grades once the semester
          ends. Gated off during the tour and the post-onboarding transition
          (grades were just entered), and off for demo. Sits at the very top of
          the body but is indigo-quiet, never the red urgent slot. */}
      {!tourOpen && !isTransitioning && (
        <SemesterWrapCard
          profile={profileQuery.data ?? undefined}
          currentYear={currentYear}
          courses={planQuery.data?.courses ?? []}
          onVisibleChange={setWrapVisible}
        />
      )}

      {/* Returning-student prompt — year ≥ 2 with nothing marked completed yet.
          Hidden while the rite is up: both ask "enter your past grades" (#22
          critique fix 8 — one ask, not two side by side). */}
      {!wrapVisible &&
        (credits?.earned ?? 0) === 0 &&
        currentYear >= 2 && (
          <Link
            href="/planner"
            className="animate-stagger-2 group flex items-center gap-4 rounded-xl border border-foreground/15 bg-foreground/[0.03] p-5 transition-all hover:border-foreground/25 hover:bg-foreground/[0.05]"
          >
            <div className="shrink-0 rounded-lg bg-emerald-500/10 p-2.5">
              <GraduationCap className="size-5 text-emerald-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground/90">
                {t("pastCoursesTitle")}
              </p>
              <p className="mt-0.5 text-xs text-foreground/50">
                {isHe
                  ? pgd(
                      "סמן אותם והזן ציונים כדי לראות את ההתקדמות האמיתית שלך",
                      "סמני אותם והזני ציונים כדי לראות את ההתקדמות האמיתית שלך",
                      "סמן/י אותם והזן/י ציונים כדי לראות את ההתקדמות האמיתית שלך"
                    )
                  : t("pastCoursesDesc")}
              </p>
            </div>
            <span className="shrink-0 flex items-center gap-1 text-xs font-medium text-foreground/60">
              {t("pastCoursesCta")}
              <Arrow className="size-3" />
            </span>
          </Link>
        )}

      {/* My status — the unified "where am I in the degree" command center */}
      {hasAnyCourses && (
        <div className="animate-stagger-1" data-tour="status">
          <MyStatusHero credits={credits} grade={gradeBreakdown} isHe={isHe} topGap={topGap} hasFocusArea={hasFocusArea} amiramScore={profileQuery.data?.amiramScore ?? null} currentYear={currentYear} disciplines={disciplineBreakdown} inProgressCount={inProgressCount} />
        </div>
      )}

      {/* My week — today's classes + next exams, framed as one zone (home
          redesign). Sits right under the status hero, matching the 3-zone layout. */}
      {profileQuery.data && (
        <section className="animate-stagger-2 space-y-3" data-tour="week">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold text-foreground/80">
              {isHe ? "השבוע שלי" : "My week"}
            </h2>
            <Link
              href="/exam"
              className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-foreground/55 transition-colors hover:text-foreground/80"
            >
              {isHe ? "כל הבחינות" : "All exams"}
              <Arrow className="size-3" />
            </Link>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <TodaysClasses currentYear={currentYear} currentSemester={acadNow.semester} />
            <ExamCountdown />
          </div>
        </section>
      )}

      {/* Study plan — surfaces a generated exam-study plan on the home screen so
          it doesn't live only on /exam-planner. Renders nothing until there's a
          plan (#10). */}
      {hasPlanData && (
        <div className="animate-stagger-3">
          <StudyPlannerWidget isHe={isHe} hideWhenEmpty />
        </div>
      )}

      {/* Next step — smart, data-backed recommendations (the single action list) */}
      {recommendations.length > 0 && (
        <div className="animate-stagger-3" data-tour="recommendations">
          <RecommendationsWidget recommendations={recommendations} isHe={isHe} />
        </div>
      )}

      {/* Home-screen redesign (balanced): the duplicate credit card, the GPA
          score card, the compliance card, the "what's missing" list, and the
          full score breakdown were removed from the dashboard. Credits + GPA now
          live ONCE in the "My status" hero above; the full grade breakdown +
          What-If lives on /graduation; the full rules + gaps on /regulations. */}

      {/* Tip — degree progress now lives in the "My status" hero above. */}
      <div className="animate-stagger-4">
        {(() => {
          const tips = getContextualTips({
            courseCount: planQuery.data?.courses?.length ?? 0,
            totalCredits: credits?.total ?? 0,
            hasFocusArea: !!profileQuery.data?.focusArea,
            currentYear: profileQuery.data?.currentYear ?? 1,
            seminarCount: planQuery.data?.courses?.filter((c) => c.course.courseType === "SEMINAR").length ?? 0,
          });
          const tip = tips[0] ?? getRandomTip();
          return <TipCard tip={tip} />;
        })()}
      </div>

      {/* Home redesign: the exams/calendar/tasks tab block was dissolved — the
          exam board lives at /exam ("all exams" link in "My week"), the calendar
          at /calendar, and study tasks at /exam-planner (all in the sidebar). */}

      {/* Google Calendar banner */}
      {!googleBannerDismissed && hasPlanData && (
        <div className="animate-stagger-6">
          <GoogleCalendarBanner
            isConnected={googleStatus.data?.connected ?? false}
            isHe={isHe}
            t={t}
            onDismiss={() => {
              setGoogleBannerDismissed(true);
              localStorage.setItem("pakamon-google-banner-dismissed", "true");
            }}
          />
        </div>
      )}

      {/* Quick actions — contextual: surface the student's actual next step
          rather than duplicating the sidebar nav. */}
      {(() => {
        const actions: {
          icon: React.ComponentType<{ className?: string }>;
          label: string;
          description: string;
          href: string;
          color: string;
        }[] = [];

        // 1. No grades yet → enter grades
        if (!hasGrades) {
          actions.push({
            icon: Calculator,
            label: isHe ? pgd("הזן ציונים", "הזני ציונים", "הזן/י ציונים") : t("actionEnterGrades"),
            description: t("actionEnterGradesDesc"),
            href: "/graduation",
            color: "bg-emerald-500/10 text-emerald-400",
          });
        }

        // 2. No focus area chosen → pick one (in settings, where the selector lives)
        if (!hasFocusArea) {
          actions.push({
            icon: Target,
            label: isHe ? pgd("בחר תחום מיקוד", "בחרי תחום מיקוד", "בחר/י תחום מיקוד") : t("actionPickFocus"),
            description: t("actionPickFocusDesc"),
            href: "/settings",
            color: "bg-violet-500/10 text-violet-400",
          });
        }

        // 3. Likely missing past courses (year ≥ 2 but few earned credits)
        if (currentYear >= 2 && earnedCredits < 20) {
          actions.push({
            icon: GraduationCap,
            label: isHe ? pgd("הוסף קורסי עבר", "הוסיפי קורסי עבר", "הוסף/י קורסי עבר") : t("actionAddPast"),
            description: t("actionAddPastDesc"),
            href: "/record",
            color: "bg-amber-500/10 text-amber-400",
          });
        }

        // Fallback / established users → a single edit-plan action
        if (actions.length === 0) {
          actions.push({
            icon: Pencil,
            label: isHe ? pgd("ערוך את התוכנית", "ערכי את התוכנית", "ערוך/י את התוכנית") : t("actionEditPlan"),
            description: t("actionEditPlanDesc"),
            href: "/planner",
            color: "bg-orange-500/10 text-orange-400",
          });
        }

        // Cap at 3 to keep the row tight
        const shown = actions.slice(0, 3);

        return (
          <div className="animate-stagger-6">
            <h2 className="font-display mb-4 text-lg font-semibold text-foreground/80">
              {t("nextStep")}
            </h2>
            <div
              className={cn(
                "grid gap-3 sm:grid-cols-2",
                shown.length >= 3 && "lg:grid-cols-3"
              )}
            >
              {shown.map((a) => (
                <QuickActionCard
                  key={a.href + a.label}
                  icon={a.icon}
                  label={a.label}
                  description={a.description}
                  href={a.href}
                  color={a.color}
                />
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
