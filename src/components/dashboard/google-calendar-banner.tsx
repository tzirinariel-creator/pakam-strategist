"use client";

import { Calendar, RefreshCw, X } from "lucide-react";
import { Link } from "@/i18n/navigation";

// -----------------------------------------------------------------------
// Google Calendar Banner
// -----------------------------------------------------------------------

export function GoogleCalendarBanner({
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
            : (isHe
                // Q4 (note 14): name the RIGHT MOMENT to sync, not just the button.
                ? "סנכרנו את המערכת ישירות ליומן שלכם. הרגע הכי טוב — אחרי שסגרתם את מערכת הסמסטר."
                : "Sync your schedule directly to your calendar. Best moment — right after you lock in your semester timetable.")}
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
