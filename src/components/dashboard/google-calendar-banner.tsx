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
        <Calendar className="size-5 text-status-green" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground/80">
          {isConnected ? t("googleBannerConnected") : t("googleBanner")}
        </p>
        <p className="text-xs text-foreground/60 mt-0.5">
          {isConnected
            ? (isHe ? "השיעורים והמבחנים שלכם מסונכרנים ליומן Google" : "Your classes and exams are synced to Google Calendar")
            : (isHe
                // Q4 (note 14): name the RIGHT MOMENT to sync, not just the button.
                // 13.8 (#40): name WHAT gets synced. The sync pushes lectures AND
                // exam sittings (schedule.syncToGoogle contentFilter all|lectures|
                // exams), but this line said only "המערכת" — so the half students
                // care about most, the exams, was invisible.
                ? "השיעורים והמבחנים עוברים ליומן שלכם — עם התזכורות. הרגע הכי טוב — אחרי שסגרתם את מערכת הסמסטר."
                : "Your classes and your exam sittings move into your calendar, reminders included. Best moment — right after you lock in your semester timetable.")}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {!isConnected && (
          <Link
            href="/settings#google-calendar"
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-status-green transition-colors hover:bg-emerald-500/20"
          >
            {t("googleBannerConnect")}
          </Link>
        )}
        {isConnected && (
          <Link
            href="/settings#google-calendar"
            className="inline-flex items-center gap-1.5 rounded-lg bg-foreground/5 px-3 py-1.5 text-sm font-medium text-foreground/70 transition-colors hover:bg-foreground/10"
          >
            <RefreshCw className="size-3.5" />
            {t("googleBannerSyncNow")}
          </Link>
        )}
        <button
          type="button"
          onClick={onDismiss}
          aria-label={isHe ? "סגרו את ההודעה על יומן Google" : "Dismiss the Google Calendar notice"}
          // /20 measured 1.75:1 (dark) and 1.53:1 (light) against the card —
          // WCAG 1.4.11 wants 3:1 for a control's icon. /50 measures 4.64:1 and
          // 3.40:1, the lowest step that clears it in BOTH themes.
          className="rounded-md p-1 text-foreground/60 hover:text-foreground/75 transition-colors"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
