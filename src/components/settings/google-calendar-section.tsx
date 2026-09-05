"use client";

import { useState, useEffect } from "react";
import { Calendar, CalendarClock, Check, Link2, Loader2, RefreshCw, ShieldCheck, Trash2, Unlink } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getCurrentOrUpcomingSemester, deriveYearOfStudy } from "@/lib/academic-calendar";
import { api } from "@/lib/trpc/react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionCard } from "./section-card";

// ---------------------------------------------------------------
// Google Calendar Section
// ---------------------------------------------------------------

function CalendarFeedCard({ isHe }: { isHe: boolean }) {
  const feed = api.user.getCalendarFeedUrl.useQuery();
  const [copied, setCopied] = useState(false);
  const profileQuery = api.user.getProfile.useQuery();
  const demoEmail = process.env.NEXT_PUBLIC_DEMO_USER_EMAIL;
  const isDemo = Boolean(demoEmail && profileQuery.data?.email === demoEmail);

  if (isDemo) return null;

  const copy = async () => {
    if (!feed.data) return;
    try {
      await navigator.clipboard.writeText(feed.data.httpUrl);
      setCopied(true);
      toast.success(isHe ? "הקישור הועתק" : "Link copied");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error(isHe ? "לא הצלחנו להעתיק" : "Couldn't copy");
    }
  };

  return (
    <div className="rounded-lg border border-accent-brand/30 bg-accent-brand/5 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground/80">
        <CalendarClock className="size-4 text-accent-brand" />
        {isHe ? "תזכורות ליומן שלכם (הכי מומלץ)" : "Reminders in your calendar (recommended)"}
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-foreground/60">
        {isHe
          ? "הירשמו פעם אחת, והיומן שלכם יראה מבחנים, מועד ב׳, ותזכורת \"עדכנו ציונים\" בסוף הסמסטר — עם התראה יום מראש, בלי להיכנס לאפליקציה."
          : "Subscribe once and your calendar shows exams, Moed B, and an end-of-semester \"enter grades\" reminder — with a day-before alert, no app-open needed."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {feed.data && (
          <>
            <a
              href={feed.data.webcalUrl}
              className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-background transition-colors hover:bg-foreground/90"
            >
              <CalendarClock className="size-3.5" />
              {isHe ? "הוספה ליומן" : "Add to my calendar"}
            </a>
            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-foreground/8 px-3 py-2 text-xs font-medium text-foreground/70 transition-colors hover:bg-foreground/15"
            >
              {copied ? <Check className="size-3.5" /> : null}
              {isHe ? "העתקת קישור" : "Copy link"}
            </button>
          </>
        )}
      </div>
      <p className="mt-2 text-[11px] text-foreground/60">
        {isHe
          ? "טיפ: ב-iPhone בחרו \"הוספה ליומן\" ← מנוי; ב-Google Calendar הדביקו את הקישור תחת \"יומנים אחרים ← מכתובת\"."
          : "Tip: on iPhone tap \"Add to my calendar\" → subscribe; in Google Calendar paste the link under \"Other calendars → From URL\"."}
      </p>
    </div>
  );
}

export function GoogleCalendarSection() {
  const t = useTranslations("settings");
  const locale = useLocale();
  const isHe = locale === "he";
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [syncYear, setSyncYear] = useState<string>("");
  const [syncSemester, setSyncSemester] = useState<string>("");
  const [syncContent, setSyncContent] = useState<"all" | "lectures" | "exams">("all");

  const profileQuery = api.user.getProfile.useQuery();
  const googleStatus = api.schedule.getGoogleStatus.useQuery();
  const syncMutation = api.schedule.syncToGoogle.useMutation({
    onSuccess: (data) => {
      const removed = data.removed ?? 0;
      const base = isHe ? `סונכרנו ${data.synced} אירועים ליומן` : `Synced ${data.synced} events to Google Calendar`;
      const tail = removed > 0 ? (isHe ? ` · הוסרו ${removed} של קורסים שהוסרו מהתוכנית` : ` · removed ${removed} for dropped courses`) : "";
      toast.success(base + tail);
      setSyncing(false);
    },
    onError: () => {
      toast.error(t("googleSyncError"));
      setSyncing(false);
    },
  });
  const deleteMutation = api.schedule.deleteGoogleEvents.useMutation({
    onSuccess: (data) => {
      toast.success(isHe ? `נמחקו ${data.deleted} אירועים מיומן Google` : `Deleted ${data.deleted} events from Google Calendar`);
      setDeleting(false);
      setConfirmDelete(false);
    },
    onError: () => {
      toast.error(t("googleSyncError"));
      setDeleting(false);
      setConfirmDelete(false);
    },
  });

  // Set defaults from profile
  useEffect(() => {
    if (profileQuery.data) {
      setSyncYear(String(deriveYearOfStudy(profileQuery.data.startYear, profileQuery.data.currentYear ?? 1)));
      // 4.9 — בחופשה getAcademicNow עדיין נוקב בסמסטר שנגמר ביוני, אז
      // מי שמחבר יומן היום היה דוחף לגוגל את מערכת השעות של סמסטר שעבר.
      // זו ברירת מחדל שאפשר לשנות, אבל ברירת מחדל שגויה נדחפת בפועל.
      setSyncSemester(getCurrentOrUpcomingSemester().semester);
    }
  }, [profileQuery.data]);

  // OAuth callback feedback. The Google callback redirects back to
  // /settings?google=connected|denied|error(&reason=...). Surface a toast per
  // outcome, refresh the connection status on success, then strip the params
  // from the URL so a refresh doesn't re-fire the toast.
  const searchParams = useSearchParams();
  useEffect(() => {
    const result = searchParams.get("google");
    if (!result) return;

    if (result === "connected") {
      toast.success(t("googleOauthConnected"));
      void googleStatus.refetch();
    } else if (result === "denied") {
      toast.error(t("googleOauthDenied"));
    } else if (result === "error") {
      const reason = searchParams.get("reason");
      const detail =
        reason === "no_session"
          ? t("googleOauthErrorNoSession")
          : reason === "mismatch"
            ? t("googleOauthErrorMismatch")
            : t("googleOauthError");
      toast.error(detail);
    }

    // Clean the OAuth params from the URL without a navigation/refetch.
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("google");
      url.searchParams.delete("reason");
      window.history.replaceState(null, "", url.toString());
    }
    // Run once per distinct query string; t/googleStatus are stable refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const isConnected = googleStatus.data?.connected ?? false;

  const handleConnect = () => {
    window.location.href = "/api/google/auth";
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const res = await fetch("/api/google/disconnect", { method: "POST" });
      if (res.ok) {
        toast.success(t("googleDisconnected"));
        void googleStatus.refetch();
      } else {
        toast.error(t("googleSyncError"));
      }
    } catch {
      toast.error(t("googleSyncError"));
    } finally {
      setDisconnecting(false);
    }
  };

  const handleSync = () => {
    setSyncing(true);
    const year = Number(syncYear) || 1;
    const semester = (syncSemester || "FALL") as "FALL" | "SPRING" | "SUMMER";
    syncMutation.mutate({ year, semester, contentFilter: syncContent });
  };

  const yearLabels = isHe
    ? { "1": "שנה א׳", "2": "שנה ב׳", "3": "שנה ג׳" }
    : { "1": "Year 1", "2": "Year 2", "3": "Year 3" };

  const semesterLabels = isHe
    ? { FALL: "סמסטר א׳", SPRING: "סמסטר ב׳" }
    : { FALL: "Fall", SPRING: "Spring" };

  const contentLabels = isHe
    ? { all: "הכול", lectures: "שיעורים בלבד", exams: "בחינות בלבד" }
    : { all: "All", lectures: "Lectures only", exams: "Exams only" };

  // Hide the whole section when Google Calendar isn't configured on the server,
  // so the "Connect" button can never lead to an error page.
  if (googleStatus.data && googleStatus.data.configured === false) {
    return null;
  }

  return (
    <SectionCard
      // /calendar links straight here (#google-calendar). Ariel, 5.9:
      // "וגם זה לא נגיש כל כך" — the button used to drop the student at the
      // top of a long settings page with no indication where to look.
      id="google-calendar"
      icon={Calendar}
      title={t("googleCalendar")}
      description={t("googleCalendarDesc")}
    >
      <div className="flex flex-col gap-4">
        {/* Retention hook #1 — subscribe once, get exam/grade/semester
            reminders in the calendar you already open, no app-open needed. */}
        <CalendarFeedCard isHe={isHe} />

        <div className="border-t border-border/40" />

        {/* Connection status */}
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "size-2 rounded-full",
              isConnected ? "bg-emerald-500" : "bg-foreground/30"
            )}
          />
          <span className="text-sm text-foreground/70">
            {isConnected ? t("googleConnected") : t("googleNotConnected")}
          </span>
        </div>

        {isConnected && (
          <>
            {/* Sync options */}
            <div className="grid grid-cols-3 gap-2">
              {/* Year selector */}
              <Select value={syncYear} onValueChange={setSyncYear}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={isHe ? "שנה" : "Year"} />
                </SelectTrigger>
                <SelectContent>
                  {(["1", "2", "3"] as const).map((y) => (
                    <SelectItem key={y} value={y}>
                      {yearLabels[y]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Semester selector */}
              <Select value={syncSemester} onValueChange={setSyncSemester}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={isHe ? "סמסטר" : "Semester"} />
                </SelectTrigger>
                <SelectContent>
                  {(["FALL", "SPRING"] as const).map((s) => (
                    <SelectItem key={s} value={s}>
                      {semesterLabels[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Content filter */}
              <Select value={syncContent} onValueChange={(v) => setSyncContent(v as "all" | "lectures" | "exams")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["all", "lectures", "exams"] as const).map((c) => (
                    <SelectItem key={c} value={c}>
                      {contentLabels[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Sync is per-semester: re-syncing updates only the chosen semester
                and removes courses you dropped from it. If you move a course to a
                different semester, re-sync the old one too to clear its events. */}
            <p className="text-xs text-foreground/60">
              {isHe
                ? "הסנכרון מעדכן את הסמסטר שנבחר בלבד — ומסיר קורסים שהורדתם ממנו. אם העברתם קורס לסמסטר אחר, סנכרנו גם את הסמסטר הקודם כדי לנקות את האירועים שלו."
                : "Sync updates only the chosen semester — and removes courses you dropped from it. If you moved a course to another semester, re-sync the old one too to clear its events."}
            </p>
          </>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          {isConnected ? (
            <>
              <Button
                variant="outline"
                onClick={handleSync}
                disabled={syncing}
                className="self-start"
              >
                {syncing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                {syncing ? t("googleSyncing") : t("googleSyncNow")}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  if (!confirmDelete) {
                    setConfirmDelete(true);
                    return;
                  }
                  setDeleting(true);
                  deleteMutation.mutate();
                }}
                disabled={deleting}
                className={cn(
                  "self-start",
                  confirmDelete
                    ? "text-destructive hover:text-destructive"
                    : "text-foreground/60 hover:text-destructive"
                )}
              >
                {deleting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                {confirmDelete
                  ? (isHe ? "לחצו שוב לאישור מחיקה" : "Click again to confirm delete")
                  : t("deleteGoogleEvents")}
              </Button>
              <Button
                variant="ghost"
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="self-start text-foreground/60 hover:text-destructive"
              >
                {disconnecting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Unlink className="size-4" />
                )}
                {t("googleDisconnect")}
              </Button>
            </>
          ) : (
            <div className="space-y-3">
              {/* #31 — Google's consent screen is worded alarmingly, and that
                  is the moment people abandon. Answer it BEFORE they click,
                  narrowly and checkably: calendar scope only, write-only, one
                  click to undo — and say what we do NOT get, which reassures
                  far more than a promise of "security" ever does. */}
              <div className="rounded-xl border border-border/60 bg-foreground/[0.02] p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground/80">
                  <ShieldCheck className="size-3.5 shrink-0 text-foreground/60" />
                  {t("googleScopeTitle")}
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-foreground/65">
                  {t("googleScopeBody")}
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-foreground/65">
                  {t("googleScopeControl")}
                </p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-foreground/60">
                  {t("googleScopeLegal")}
                </p>
              </div>
              <Button onClick={handleConnect} className="self-start">
                <Link2 className="size-4" />
                {t("googleConnect")}
              </Button>
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
