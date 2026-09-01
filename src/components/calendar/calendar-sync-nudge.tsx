"use client";

// =========================================================================
// #40 — "the app never once offered to sync my calendar".
//
// The integration existed the whole time (schedule.getGoogleStatus /
// syncToGoogle + the Settings card), but the ONLY place that pointed at it was
// a chip inside the dashboard's ?saved=1 banner — a URL reached solely by
// re-saving from the semester planner. A student who finished ONBOARDING lands
// on /dashboard?from=onboarding (step-ready.tsx) and therefore never saw it,
// and the exam planner never mentioned it at all.
//
// This is the one nudge, shown at the moment a plan actually exists, and it is
// dismissed forever with one tap — a single shared key, so dismissing it on the
// dashboard also silences it in the exam planner. It hides itself when Google
// isn't configured on the server (the Settings section renders nothing then, so
// the link would be a dead end) and the moment the account is connected.
// =========================================================================

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { CalendarPlus } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "pk-calendar-sync-nudge-dismissed";
// The dashboard's own Google banner writes this one. A student who already said
// "no" there must not be asked again here — one refusal covers the whole app.
const DASHBOARD_DISMISS_KEY = "pakamon-google-banner-dismissed";

export function CalendarSyncNudge({
  /** The caller's "there is something worth syncing" gate (a saved plan). */
  show,
  className,
}: {
  show: boolean;
  className?: string;
}) {
  const isHe = useLocale() === "he";
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const googleStatus = api.schedule.getGoogleStatus.useQuery(undefined, { enabled: show });

  // Per-device flag read after mount only, so the server and first client paint
  // agree (this renders inside hydration-sensitive screens).
  useEffect(() => {
    setMounted(true);
    try {
      setDismissed(
        localStorage.getItem(DISMISS_KEY) === "1" ||
          localStorage.getItem(DASHBOARD_DISMISS_KEY) === "true",
      );
    } catch {
      /* storage blocked — treat as first-time, best-effort */
    }
  }, []);

  if (!mounted || !show || dismissed) return null;
  // Unconfigured server or an already-connected account → nothing to offer.
  if (!googleStatus.data || googleStatus.data.configured === false || googleStatus.data.connected) {
    return null;
  }

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* best-effort */
    }
  };

  return (
    <div className={cn("data-card flex items-start gap-3 p-4", className)}>
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-brand/10 text-accent-brand">
        <CalendarPlus className="size-4.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-foreground/85">
          {isHe ? "שנעביר את זה ליומן שלכם?" : "Want this in your calendar?"}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-foreground/60">
          {isHe
            ? "התוכנית שבניתם יכולה לעבור ליומן Google — שיעורים, מבחנים ובלוקי הלימוד — כך שהתזכורות מגיעות אליכם בלי להיכנס לאפליקציה. פעם אחת, ואפשר לבטל בכל רגע."
            : "The plan you just built can go into your Google Calendar — classes, exams and study blocks — so the reminders reach you without opening the app. One setup, reversible anytime."}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2.5">
          <Link
            href="/settings"
            onClick={dismiss}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent-brand px-3 py-1.5 text-xs font-semibold text-accent-brand-fg transition-colors hover:bg-accent-brand-hover"
          >
            <CalendarPlus className="size-3.5" />
            {isHe ? "לחיבור היומן" : "Connect my calendar"}
          </Link>
          <button
            type="button"
            onClick={dismiss}
            className="ms-auto text-xs text-foreground/60 transition-colors hover:text-foreground/65"
          >
            {isHe ? "לא, תודה" : "No thanks"}
          </button>
        </div>
      </div>
    </div>
  );
}
