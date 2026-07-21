"use client";

import { useState, useEffect, useRef } from "react";
import { GraduationCap } from "lucide-react";
import { useTranslations } from "next-intl";
import { Progress } from "@/components/ui/progress";

// -----------------------------------------------------------------------
// Post-Onboarding Transition — auto-retries plan fetch after saving
// -----------------------------------------------------------------------

export function PostOnboardingTransition({
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
