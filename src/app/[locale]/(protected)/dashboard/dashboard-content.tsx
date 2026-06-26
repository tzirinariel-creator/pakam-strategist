"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { GraduationCap, BookOpen, Scale, Pencil, Shield, CheckCircle2, AlertCircle, Languages, Target, ArrowRight, Calendar, X, RefreshCw, Calculator } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/trpc/react";
import { ScoreDisplay } from "@/components/graduation/score-display";
import { ScoreBreakdown } from "@/components/graduation/score-breakdown";
import { TipCard } from "@/components/shared/tip-card";
import { getContextualTips, getRandomTip } from "@/lib/tips-engine";
import { ThemedLoader } from "@/components/ui/themed-loader";
import { Progress } from "@/components/ui/progress";
import { CountUp } from "@/components/ui/count-up";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { CREDIT_REQUIREMENTS, DISCIPLINE_CONFIG, FILTERABLE_DISCIPLINE_IDS, getDisciplineCredits } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";
import { TodaysClasses } from "@/components/dashboard/todays-classes";
import { ExamCountdown } from "@/components/dashboard/exam-countdown";
import type { GradeBreakdown, CreditBreakdown } from "@/types/degree";

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
// Credit Overview Widget
// -----------------------------------------------------------------------

function CreditOverviewWidget({
  credits,
  t,
  isHe,
}: {
  credits: CreditBreakdown | null;
  t: (key: string, values?: Record<string, string | number>) => string;
  isHe: boolean;
}) {
  const total = credits?.total ?? 0;
  const earned = credits?.earned ?? 0;
  const planned = credits?.planned ?? 0;
  const miluimExemption = credits?.miluimExemption ?? 0;
  const effectiveTotal = credits?.effectiveTotal ?? total;
  const target = CREDIT_REQUIREMENTS.TOTAL;
  // Progress bar: earned credits are "solid", planned credits are lighter
  const earnedPct = Math.min((earned / target) * 100, 100);
  const plannedPct = Math.min(((earned + planned) / target) * 100, 100);

  const focusCredits = credits?.focusArea ?? 0;
  const focusTarget = credits?.focusAreaTarget ?? CREDIT_REQUIREMENTS.FOCUS_AREA_MIN;
  const focusPct = Math.min((focusCredits / focusTarget) * 100, 100);

  // Focus area color
  const focusColor =
    focusCredits >= 60
      ? "text-foreground/80"
      : focusCredits >= 55
        ? "text-emerald-400"
        : focusCredits >= 40
          ? "text-amber-400"
          : "text-red-400";

  return (
    <div className="data-card space-y-5 p-6">
      <div className="flex items-center gap-3">
        <BookOpen className="h-5 w-5 text-foreground/60" />
        <h3 className="font-display text-lg font-bold text-foreground/90">
          {t("creditTracking")}
        </h3>
      </div>

      {/* Total credits */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-foreground/60">{t("totalCredits")}</span>
          <div dir="ltr" className="flex items-baseline gap-1">
            <span className="font-mono tabular text-2xl font-bold text-foreground/80">
              <CountUp value={effectiveTotal} />
            </span>
            <span className="font-mono tabular text-sm text-foreground/40">
              / {target}
            </span>
          </div>
        </div>
        {/* Dual progress bar: earned (solid) + planned (striped/lighter) */}
        <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-foreground/10">
          {/* Planned layer (behind, lighter) */}
          <div
            className="absolute inset-y-0 start-0 rounded-full bg-foreground/25 transition-all duration-500"
            style={{ width: `${plannedPct}%` }}
          />
          {/* Earned layer (front, solid) */}
          <div
            className="absolute inset-y-0 start-0 rounded-full bg-foreground transition-all duration-500"
            style={{ width: `${earnedPct}%` }}
          />
        </div>
        {/* Legend for earned vs planned */}
        <div className="flex items-center gap-4 text-[10px] text-foreground/50">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-foreground" />
            <span>{isHe ? `${earned} הושלמו` : `${earned} completed`}</span>
          </div>
          {planned > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-foreground/25" />
              <span>{isHe ? `${planned} מתוכננים` : `${planned} planned`}</span>
            </div>
          )}
        </div>
        {/* Miluim exemption badge */}
        {miluimExemption > 0 && (
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5 text-[10px] text-emerald-500/70">
              <Shield className="h-3 w-3" />
              <span>
                {isHe
                  ? `כולל ${miluimExemption} ש״ס פטור מילואים`
                  : `Includes ${miluimExemption} cr. miluim exemption`}
              </span>
            </div>
            <p className="text-[10px] text-foreground/35 leading-tight ps-[18px]">
              * {t("miluimDisclaimer")}
            </p>
          </div>
        )}
      </div>

      {/* Focus area */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm text-foreground/60 min-w-0 truncate">
            {t("focusArea", { target: focusTarget })}
          </span>
          <div dir="ltr" className="flex items-baseline gap-1 shrink-0 whitespace-nowrap">
            <span className={cn("font-mono tabular text-xl font-bold", focusColor)}>
              {focusCredits}
            </span>
            <span className="font-mono tabular text-sm text-foreground/40">
              / {focusTarget}
            </span>
          </div>
        </div>
        <Progress value={focusPct} className="h-2" />
      </div>

      {/* Per-discipline mini bars */}
      <div className="space-y-2 pt-2">
        {FILTERABLE_DISCIPLINE_IDS.map(
          (d) => {
            const dCredits = credits?.byDiscipline[d] ?? 0;
            const required = getDisciplineCredits(d);
            const dpct = required > 0 ? Math.min((dCredits / required) * 100, 100) : 0;
            const cfg = DISCIPLINE_CONFIG[d];
            if (!cfg) return null;
            return (
              <div key={d} className="flex items-center gap-3 text-xs">
                <span className="w-20 truncate text-foreground/50">
                  {isHe ? cfg.nameHe : (cfg.nameEn ?? d)}
                </span>
                <div className="flex-1">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/5">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${dpct}%`,
                        backgroundColor: cfg.color,
                      }}
                    />
                  </div>
                </div>
                <span dir="ltr" className="w-12 text-end font-mono text-foreground/40">
                  {dCredits}/{required}
                </span>
              </div>
            );
          }
        )}

        {/* English courses requirement */}
        <div className="flex items-center gap-3 text-xs pt-1 border-t border-foreground/5">
          <span className="w-20 truncate text-foreground/50 flex items-center gap-1">
            <Languages className="h-3 w-3 shrink-0" />
            {t("englishCourses")}
          </span>
          <div className="flex-1" />
          <span className="font-mono text-foreground/40">
            {credits?.englishCourseCount ?? 0}/{CREDIT_REQUIREMENTS.ENGLISH_MIN_COURSES} {t("courses")}
          </span>
          {(credits?.englishCourseCount ?? 0) >= CREDIT_REQUIREMENTS.ENGLISH_MIN_COURSES ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          )}
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------
// Regulation Widget
// -----------------------------------------------------------------------

function RegulationWidget({
  complianceRate,
  passedCount,
  totalCount,
  t,
}: {
  complianceRate: number;
  passedCount: number;
  totalCount: number;
  t: (key: string) => string;
}) {
  const color =
    complianceRate >= 100
      ? "text-emerald-400"
      : complianceRate >= 70
        ? "text-amber-400"
        : "text-red-400";

  return (
    <Link
      href="/regulations"
      className="data-card flex flex-col items-center gap-3 p-6 text-center transition-all hover:border-foreground/30 hover:shadow-md cursor-pointer"
    >
      <Scale className="h-6 w-6 text-foreground/60" />
      <h3 className="font-display text-base font-bold text-foreground/90">
        {t("academicRegulations")}
      </h3>
      <div className="flex items-baseline gap-1">
        <span className={cn("font-display tabular text-3xl font-bold", color)}>
          <CountUp value={passedCount} />
        </span>
        <span className="font-mono tabular text-lg text-foreground/40">/ {totalCount}</span>
      </div>
      <span className="text-sm text-foreground/50">{t("rulesMet")}</span>
      <Progress value={complianceRate} className="h-2 w-full" />
      <span className="text-xs text-foreground/40 flex items-center gap-1">
        {t("viewAllRules")} <ArrowRight className="h-3 w-3" />
      </span>
    </Link>
  );
}

// -----------------------------------------------------------------------
// Discipline Suggestions — shows available courses for a gap
// -----------------------------------------------------------------------

function DisciplineSuggestions({ discipline, isHe }: { discipline: string; isHe: boolean }) {
  const suggestionsQuery = api.course.suggestForDiscipline.useQuery(
    { discipline, limit: 3 },
    { staleTime: 60_000 }
  );

  if (!suggestionsQuery.data?.length) return null;

  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5 ps-5">
      {suggestionsQuery.data.map((c) => (
        <Link
          key={c.id}
          href="/catalog"
          className="inline-flex items-center gap-1 rounded-md bg-foreground/[0.03] px-2 py-1 text-[10px] text-foreground/45 transition-colors hover:bg-foreground/[0.06] hover:text-foreground/60"
        >
          <span className="truncate max-w-[140px]">{isHe ? c.nameHe : (c.nameEn ?? c.nameHe)}</span>
          <span className="shrink-0 font-mono">{c.credits}</span>
        </Link>
      ))}
    </div>
  );
}

// -----------------------------------------------------------------------
// Degree Gap Widget — shows unfulfilled requirements at a glance
// -----------------------------------------------------------------------

function DegreeGapWidget({
  regulationResults,
  t,
  isHe,
}: {
  regulationResults: Array<{
    ruleId: string;
    ruleNameHe: string;
    ruleNameEn: string;
    passed: boolean;
    severity: string;
    details?: Record<string, unknown>;
  }> | undefined;
  t: (key: string, values?: Record<string, string | number>) => string;
  isHe: boolean;
}) {
  if (!regulationResults) return null;

  const failedRules = regulationResults.filter((r) => !r.passed);

  if (failedRules.length === 0) {
    return (
      <div className="data-card flex flex-col items-center gap-3 p-5 text-center border-emerald-400/20 bg-emerald-400/5">
        <CheckCircle2 className="h-8 w-8 text-emerald-400" />
        <p className="text-sm font-medium text-emerald-400">
          {t("allRequirementsMet")}
        </p>
      </div>
    );
  }

  return (
    <div className="data-card p-5">
      <div className="flex items-center gap-2 mb-3">
        <Target className="h-5 w-5 text-foreground/60" />
        <h3 className="font-display text-base font-bold text-foreground/90">
          {t("whatsMissing")}
        </h3>
        <span className="ms-auto rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400">
          {failedRules.length}
        </span>
      </div>
      <div className="space-y-2">
        {failedRules.slice(0, 5).map((rule) => {
          const name = isHe ? rule.ruleNameHe : rule.ruleNameEn;
          const details = rule.details as Record<string, number | string> | undefined;
          const current = details?.current ?? details?.currentCredits;
          const required = details?.required ?? details?.minCredits;
          const deficit = details?.deficit;
          // Extract discipline from DISC-* rules for suggestions
          const isDisciplineRule = rule.ruleId.startsWith("DISC-");
          const disciplineId = isDisciplineRule ? rule.ruleId.replace("DISC-", "") : null;

          return (
            <div key={rule.ruleId}>
              <div
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs",
                  rule.severity === "ERROR"
                    ? "border-red-400/20 bg-red-400/5"
                    : "border-amber-400/20 bg-amber-400/5"
                )}
              >
                <span
                  className={cn(
                    "shrink-0",
                    rule.severity === "ERROR" ? "text-red-400" : "text-amber-400"
                  )}
                >
                  {rule.severity === "ERROR" ? "●" : "◐"}
                </span>
                <span className="flex-1 truncate text-foreground/70">{name}</span>
                {current !== undefined && required !== undefined && (
                  <span className="shrink-0 font-mono text-foreground/50">
                    {String(current)}/{String(required)}
                  </span>
                )}
                {deficit !== undefined && Number(deficit) > 0 && (
                  <span className="shrink-0 rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-400">
                    -{String(deficit)}
                  </span>
                )}
              </div>
              {disciplineId && Number(deficit) > 0 && (
                <DisciplineSuggestions discipline={disciplineId} isHe={isHe} />
              )}
            </div>
          );
        })}
        {failedRules.length > 5 && (
          <p className="text-[10px] text-foreground/40 text-center">
            +{failedRules.length - 5} {isHe ? "עוד" : "more"}
          </p>
        )}
      </div>
      <Link
        href="/regulations"
        className="mt-3 flex items-center justify-center gap-1 rounded-lg border border-border/30 bg-card/40 px-3 py-2 text-xs text-foreground/50 transition-colors hover:border-foreground/20 hover:text-foreground/70"
      >
        {t("viewAllRules")} <ArrowRight className="h-3 w-3" />
      </Link>
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
      className="data-card group flex items-center gap-3 p-4 transition-all hover:border-foreground/20 hover:shadow-md press-scale"
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
// Semester Progress Widget
// -----------------------------------------------------------------------

function SemesterProgressWidget({
  credits,
  t,
  isHe,
}: {
  credits: CreditBreakdown | null;
  t: (key: string) => string;
  isHe: boolean;
}) {
  const earned = credits?.earned ?? 0;
  const planned = credits?.planned ?? 0;
  const total = credits?.total ?? 0;
  const target = CREDIT_REQUIREMENTS.TOTAL;

  // Use EARNED credits for semester estimation (not planned)
  const creditsPerSemester = 25; // typical
  const estimatedSemester = Math.min(6, Math.ceil(earned / creditsPerSemester) || 1);
  const totalSemesters = 6;

  const yearLabels = [t("yearA"), t("yearA"), t("yearB"), t("yearB"), t("yearC"), t("yearC")];

  return (
    <div className="data-card p-5">
      <h3 className="font-display mb-3 text-sm font-semibold text-foreground/70">
        {t("degreeProgress")}
      </h3>
      <div className="flex items-center gap-2">
        {Array.from({ length: totalSemesters }).map((_, i) => {
          const isComplete = i < estimatedSemester - 1;
          const isCurrent = i === estimatedSemester - 1;
          return (
            <div key={i} className="flex-1">
              <div
                className={cn(
                  "h-2 rounded-full transition-all duration-500",
                  isComplete
                    ? "bg-foreground"
                    : isCurrent
                      ? "bg-foreground/50"
                      : "bg-foreground/10"
                )}
              />
              <span className="mt-1 block text-center text-[10px] text-foreground/30">
                {yearLabels[i] ?? ""}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-baseline justify-between text-xs text-foreground/50">
        <span>
          {earned > 0
            ? (isHe ? `${earned} הושלמו` : `${earned} completed`)
            : (isHe ? `${total} מתוכננים` : `${total} planned`)
          }
          {" / "}{target} {t("creditsShort")}
        </span>
        <span className="font-mono tabular text-foreground/70">
          {Math.round((earned / target) * 100)}%
        </span>
      </div>
    </div>
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
            ? (isHe ? "הלו״ז שלך מסונכרן ליומן Google" : "Your schedule is synced to Google Calendar")
            : (isHe ? "סנכרן את המערכת ישירות ליומן שלך" : "Sync your schedule directly to your calendar")}
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
// Main dashboard content
// -----------------------------------------------------------------------

export function DashboardContent() {
  const locale = useLocale();
  const isHe = locale === "he";
  const t = useTranslations("dashboard");
  const searchParams = useSearchParams();
  const fromOnboarding = searchParams.get("from") === "onboarding";
  const resetDemo = searchParams.get("reset") === "demo";

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
  const planQuery = api.plan.getUserPlan.useQuery(undefined, {
    retry: isTransitioning ? 3 : 1,
    staleTime: isTransitioning ? 0 : undefined,
    enabled: demoResetDone,
  });

  // Fetch plan data — only after we know user has courses (avoids errors for new users)
  const hasPlanData = (planQuery.data?.courses?.length ?? 0) > 0;
  const creditsQuery = api.plan.getCredits.useQuery(undefined, {
    retry: 1,
    enabled: hasPlanData,
  });
  const gradeQuery = api.plan.getGraduationScore.useQuery(undefined, {
    retry: 1,
    enabled: hasPlanData,
  });
  const regulationQuery = api.regulation.checkCompliance.useQuery(undefined, {
    retry: 1,
    enabled: hasPlanData,
  });
  const profileQuery = api.user.getProfile.useQuery(undefined, {
    retry: 1,
    enabled: hasPlanData,
  });

  // Google Calendar status — check if connected
  const googleStatus = api.schedule.getGoogleStatus.useQuery(undefined, {
    retry: 1,
    enabled: hasPlanData,
  });
  const [googleBannerDismissed, setGoogleBannerDismissed] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setGoogleBannerDismissed(
        localStorage.getItem("pakamon-google-banner-dismissed") === "true"
      );
    }
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
  const gradeBreakdown: GradeBreakdown = gradeQuery.data ?? {
    courseAverage: null,
    seminarPaperAverage: null,
    referatGrade: null,
    weightedScore: null,
    completedCredits: 0,
    totalGradedCourses: 0,
  };

  const regulationSummary = regulationQuery.data;
  const passedRules = regulationSummary?.passed ?? 0;
  const totalRules = regulationSummary?.totalRules ?? 0;
  const complianceRate = regulationSummary?.complianceScore ?? 0;

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
    return <ThemedLoader />;
  }

  // Loading took too long — show actionable UI instead of endless spinner
  if (planQuery.isLoading && loadingTooLong) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-foreground/5">
          <GraduationCap className="h-8 w-8 text-foreground/40" />
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
      {/* Page header */}
      <div className="animate-stagger-1">
        <h1 className="font-display text-2xl font-bold text-foreground md:text-3xl">
          {profileQuery.data?.displayName
            ? (isHe ? `היי ${profileQuery.data.displayName}` : `Hi ${profileQuery.data.displayName}`)
            : t("subtitle")}
        </h1>
        {profileQuery.data?.currentYear && profileQuery.data?.currentSemester && (
          <p className="mt-1 text-sm text-foreground/50">
            {isHe ? "פכ\"מ" : "PPE"} · {t("semesterContext", {
              semester: profileQuery.data.currentSemester === "FALL" ? (isHe ? "א׳" : "A") : (isHe ? "ב׳" : "B"),
              year: profileQuery.data.currentYear,
            })}
          </p>
        )}
        <div className="mt-3 flex items-center gap-3">
          <div className="h-2 flex-1 rounded-full bg-foreground/10">
            <div
              className="h-2 rounded-full bg-foreground/70 transition-all duration-700"
              style={{ width: `${Math.min(((credits?.effectiveTotal ?? credits?.total ?? 0) / CREDIT_REQUIREMENTS.TOTAL) * 100, 100)}%` }}
            />
          </div>
          <span className="text-xs font-mono tabular text-foreground/50">
            {credits?.effectiveTotal ?? credits?.total ?? 0}/{CREDIT_REQUIREMENTS.TOTAL} {isHe ? "ש״ס" : "credits"}
          </span>
        </div>
      </div>

      {/* Today's classes + Exam countdown */}
      {profileQuery.data?.currentYear && profileQuery.data?.currentSemester && (
        <div className="animate-stagger-2 grid gap-6 lg:grid-cols-2">
          <TodaysClasses
            currentYear={profileQuery.data.currentYear}
            currentSemester={profileQuery.data.currentSemester as "FALL" | "SPRING"}
          />
          <ExamCountdown />
        </div>
      )}

      {/* Top row: Score + Credits + Regulations */}
      <div className="animate-stagger-2 grid gap-6 lg:grid-cols-3">
        {/* Graduation Score — hero widget */}
        <ScoreDisplay breakdown={gradeBreakdown} className="lg:col-span-1" />

        {/* Credit overview */}
        <CreditOverviewWidget credits={credits} t={t} isHe={isHe} />

        {/* Regulation compliance */}
        <RegulationWidget
          complianceRate={complianceRate}
          passedCount={passedRules}
          totalCount={totalRules}
          t={t}
        />
      </div>

      {/* Degree Gap Widget — what's still missing */}
      {regulationSummary?.results && (
        <div className="animate-stagger-3">
          <DegreeGapWidget
            regulationResults={regulationSummary.results}
            t={t}
            isHe={isHe}
          />
        </div>
      )}

      {/* Score breakdown with integrated What-If simulator + grade entry CTA */}
      <div className="animate-stagger-3 space-y-3">
        <ScoreBreakdown breakdown={gradeBreakdown} enableWhatIf />
        {gradeBreakdown.totalGradedCourses === 0 && (
          <Link
            href="/graduation"
            className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-foreground/20 bg-foreground/5 px-4 py-3 text-sm font-medium text-foreground/60 transition-colors hover:border-foreground/30 hover:bg-foreground/10 hover:text-foreground/80"
          >
            <Calculator className="h-4 w-4" />
            {t("enterGradesCta")}
            <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>

      {/* Semester progress + Tip */}
      <div className="animate-stagger-4 grid gap-6 lg:grid-cols-2">
        <SemesterProgressWidget credits={credits} t={t} isHe={isHe} />
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

      {/* Dashboard tabs — exams, calendar, assignments, syllabi */}
      <div className="animate-stagger-5">
        <DashboardTabs isHe={isHe} />
      </div>

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

      {/* Quick actions */}
      <div className="animate-stagger-6">
        <h2 className="font-display mb-4 text-lg font-semibold text-foreground/80">
          {t("quickActions")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <QuickActionCard
            icon={GraduationCap}
            label={t("degreePlanner")}
            description={t("degreePlannerDesc")}
            href="/planner"
            color="bg-violet-500/10 text-violet-400"
          />
          <QuickActionCard
            icon={Scale}
            label={t("checkRegulations")}
            description={t("checkRegulationsDesc")}
            href="/regulations"
            color="bg-amber-500/10 text-amber-400"
          />
          <QuickActionCard
            icon={BookOpen}
            label={t("courseCatalog")}
            description={t("courseCatalogDesc")}
            href="/catalog"
            color="bg-cyan-500/10 text-cyan-400"
          />
          <QuickActionCard
            icon={Calculator}
            label={t("gradeCalculator")}
            description={t("gradeCalculatorDesc")}
            href="/graduation"
            color="bg-emerald-500/10 text-emerald-400"
          />
          <QuickActionCard
            icon={Pencil}
            label={t("editSemesterPlan")}
            description={t("editSemesterPlanDesc")}
            href="/planner/semester"
            color="bg-orange-500/10 text-orange-400"
          />
        </div>
      </div>
    </div>
  );
}
