"use client";

import { useState, useEffect, useRef } from "react";
import { GraduationCap } from "lucide-react";
import { useTranslations } from "next-intl";
import { ThemedLoader } from "@/components/ui/themed-loader";

// -----------------------------------------------------------------------
// Post-Onboarding Transition — re-fetches the plan right after onboarding
// -----------------------------------------------------------------------
// #16 — this screen used to tell the student "מסנכרנים קורסים… ניסיון 4 מתוך 8".
// That number was never a failure count. The tick below is a blind 1.2s timer:
// it fires again whether or not the previous fetch has returned, so on a cold
// serverless/database start the counter reaches 4 with ZERO failed requests. It
// was reporting latency as if it were breakage, to a student who had just
// finished onboarding — the worst possible moment to look broken.
//
// It is also not "syncing": the plan was already written, synchronously and
// awaited, in step-ready before this screen ever mounts (and an empty save is a
// server-side NO-OP since the QA-13.7 guard). All that is left to do here is
// READ it back, so the copy now says that.
//
// What is NOT hidden: when the wait really does run out, the screen says so
// plainly instead of continuing to claim it is working. It used to keep showing
// "מכינים את התוכנית שלכם…" and then silently drop the student onto a possibly
// empty dashboard 1.5s later. That auto-continue is gone — the student is told
// what happened and chooses.
const TICK_MS = 1200;
const MAX_TICKS = 8;

export function PostOnboardingTransition({
  onRetry,
  onContinue,
}: {
  /** May return a promise — the retry loop awaits it so attempts never overlap. */
  onRetry: () => void | Promise<unknown>;
  onContinue: () => void;
}) {
  const t = useTranslations("dashboard");
  const tickCount = useRef(0);
  const [exhausted, setExhausted] = useState(false);
  const [showContinue, setShowContinue] = useState(false);

  useEffect(() => {
    // Show "Continue anyway" after 2 seconds — don't block the user
    const continueTimer = setTimeout(() => setShowContinue(true), 2000);

    // PERF (#31/#2) — this was a blind `setInterval`: it fired another
    // `planQuery.refetch()` every 1.2s whether or not the previous one had come
    // back. getUserPlan is a ~54 KB response behind a ~0.4s per-request auth
    // round-trip, so on the exact slow start this screen exists for, up to
    // eight full refetches piled up in flight — the retry loop was making the
    // thing it was waiting for slower. Now each attempt WAITS for the previous
    // one to settle before scheduling the next, so there is never more than one
    // in flight and the eight attempts stay eight attempts.
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const attempt = async () => {
      if (cancelled) return;
      tickCount.current += 1;
      try {
        await onRetry();
      } catch {
        /* a failed refetch is just a slow start — keep waiting, same as before */
      }
      if (cancelled) return;
      if (tickCount.current >= MAX_TICKS) {
        setExhausted(true);
        return;
      }
      timer = setTimeout(attempt, TICK_MS);
    };

    timer = setTimeout(attempt, TICK_MS);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      clearTimeout(continueTimer);
    };
  }, [onRetry, onContinue]);

  if (exhausted) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-foreground/5">
          <GraduationCap className="h-8 w-8 text-foreground/60" />
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <p className="text-sm font-medium text-foreground/70">
            {t("planLoadSlow")}
          </p>
          <p className="text-xs text-foreground/60">
            {t("planLoadSlowDesc")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              tickCount.current = 0;
              setExhausted(false);
              setShowContinue(false);
              void onRetry();
            }}
            className="rounded-lg bg-foreground/10 px-5 py-2 text-sm font-medium text-foreground/70 transition-colors hover:bg-foreground/15"
          >
            {t("retry")}
          </button>
          <button
            type="button"
            onClick={onContinue}
            className="rounded-lg border border-foreground/20 px-5 py-2 text-sm font-medium text-foreground/60 transition-colors hover:bg-foreground/5"
          >
            {t("continueAnyway")}
          </button>
        </div>
      </div>
    );
  }

  // #2 — this is the FIRST loading screen a new student ever sees ("why is the
  // post-signup loader the app's face?"). It used to be the only loader in the
  // app that was NOT the brand: a grey lucide graduation cap inside a grey
  // spinner, over an `animate-pulse` label — a third visual language, and the
  // one placed at the most memorable moment. It now wears the SAME object as
  // every other loader (ThemedLoader: the King in an indigo ring), with the
  // sentence saying exactly what is being waited on.
  //
  // The progress bar is GONE on purpose. It was `ticks / MAX_TICKS` — a bar
  // that filled on a 1.2s timer whether or not anything had loaded, and reached
  // 100% precisely when the load had FAILED. A progress bar that cannot fall
  // behind is not reporting progress; it is decoration that lies. The honest
  // signal is the copy plus the escape hatch below.
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5">
      <ThemedLoader
        variant="inline"
        className="py-0"
        label={t("settingUpPlan")}
        sublabel={t("settingUpPlanDesc")}
      />
      {/* Continue button after 2 seconds */}
      {showContinue && (
        <button
          type="button"
          onClick={onContinue}
          className="animate-fade-in rounded-lg border border-foreground/20 px-5 py-2 text-sm font-medium text-foreground/60 transition-colors hover:bg-foreground/5"
        >
          {t("continueAnyway")}
        </button>
      )}
    </div>
  );
}
