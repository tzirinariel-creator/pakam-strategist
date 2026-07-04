"use client";

import { useState, useEffect } from "react";
import {
  Settings,
  Palette,
  User,
  LogOut,
  Loader2,
  Check,
  Trash2,
  Sun,
  Moon,
  Monitor,
  Calendar,
  RefreshCw,
  Unlink,
  Link2,
  Key,
  Eye,
  EyeOff,
  ExternalLink,
  Shield,
  Swords,
} from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Bidi } from "@/lib/bidi";
import { DISCIPLINE_CONFIG, FOCUS_DISCIPLINE_IDS, MILUIM_CONFIG } from "@/lib/constants";
import { deriveGroupFromDays, getCurrentAcademicYear } from "@/lib/miluim";
import { ConnectGeminiGuide } from "@/components/settings/connect-gemini-guide";
import { MiluimDayCombatInputs } from "@/components/miluim/miluim-day-combat-inputs";
import { api } from "@/lib/trpc/react";
import { useUIStore } from "@/stores/ui-store";
import { useRouter, usePathname } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ---------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div
      className={cn(
        "data-card flex flex-col gap-5 p-6",
        danger && "border-destructive/30 hover:border-destructive/50"
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full",
            danger ? "bg-destructive/10" : "bg-foreground/10"
          )}
        >
          <Icon
            className={cn(
              "size-5",
              danger ? "text-destructive" : "text-foreground/80"
            )}
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <h2
            className={cn(
              "font-display text-lg font-bold",
              danger ? "text-destructive" : "text-foreground/80"
            )}
          >
            {title}
          </h2>
          <p className="text-sm text-foreground/60">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------
// Profile Section
// ---------------------------------------------------------------

function ProfileSection() {
  const t = useTranslations("settings");
  const locale = useLocale();
  const isHe = locale === "he";
  const utils = api.useUtils();

  const profileQuery = api.user.getProfile.useQuery();
  const updateMutation = api.user.updateProfile.useMutation({
    onSuccess: () => {
      void utils.user.getProfile.invalidate();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast.success(t("profileSaved"));
    },
    onError: () => {
      toast.error(t("profileSaveError"));
    },
  });

  const [displayName, setDisplayName] = useState<string>("");
  const [firstName, setFirstName] = useState<string>("");
  const [gender, setGender] = useState<string>(""); // "" | "male" | "female"
  const [amirantScore, setAmirantScore] = useState<string>("");
  const [focusArea, setFocusArea] = useState<string>("");
  const [currentYear, setCurrentYear] = useState<string>("");
  const [currentSemester, setCurrentSemester] = useState<string>("");
  const [saved, setSaved] = useState(false);

  // Populate from query data
  useEffect(() => {
    if (profileQuery.data) {
      setDisplayName(profileQuery.data.displayName ?? "");
      setFirstName(profileQuery.data.firstName ?? "");
      setGender(profileQuery.data.gender ?? "");
      setAmirantScore(
        profileQuery.data.amiramScore != null
          ? String(profileQuery.data.amiramScore)
          : ""
      );
      setFocusArea(profileQuery.data.focusArea ?? "UNDECIDED");
      setCurrentYear(String(profileQuery.data.currentYear ?? ""));
      setCurrentSemester(profileQuery.data.currentSemester ?? "");
    }
  }, [profileQuery.data]);

  const handleSaveProfile = () => {
    const input: Record<string, unknown> = {};
    // Display name — Hebrew greeting name. Only send a non-empty value
    // (the backend schema requires min length 1).
    const trimmedName = displayName.trim();
    if (trimmedName) {
      input.displayName = trimmedName;
    }
    // Personal address — first name (for greetings) + gender (for gendered copy).
    input.firstName = firstName.trim() || null;
    input.gender = gender === "male" || gender === "female" ? gender : null;
    // AMIRANT/English-placement score — clamp into the 50–150 zod range, or
    // clear it (null) when the field is emptied.
    const trimmedScore = amirantScore.trim();
    if (trimmedScore === "") {
      input.amiramScore = null;
    } else {
      const parsed = Number(trimmedScore);
      if (Number.isFinite(parsed)) {
        input.amiramScore = Math.min(150, Math.max(50, Math.round(parsed)));
      }
    }
    if (focusArea && focusArea !== "UNDECIDED") {
      input.focusArea = focusArea;
    } else {
      input.focusArea = null;
    }
    if (currentYear) {
      input.currentYear = Number(currentYear);
    }
    if (currentSemester) {
      input.currentSemester = currentSemester as "FALL" | "SPRING" | "SUMMER";
    }
    updateMutation.mutate(input as Parameters<typeof updateMutation.mutate>[0]);
  };

  const focusOptions = [
    ...FOCUS_DISCIPLINE_IDS.map((id) => {
      const cfg = DISCIPLINE_CONFIG[id]!;
      return { value: id, label: isHe ? cfg.nameHe : cfg.nameEn };
    }),
    { value: "UNDECIDED", label: t("focusOptions.undecided") },
  ];

  const yearOptions = [
    { value: "1", label: t("yearOptions.1") },
    { value: "2", label: t("yearOptions.2") },
    { value: "3", label: t("yearOptions.3") },
  ] as const;

  const semesterOptions = [
    { value: "FALL", label: t("semesterOptions.A") },
    { value: "SPRING", label: t("semesterOptions.B") },
    { value: "SUMMER", label: t("semesterOptions.summer") },
  ] as const;

  if (profileQuery.isLoading) {
    return (
      <SectionCard
        icon={User}
        title={t("profile")}
        description={t("profileDescription")}
      >
        <div className="flex flex-col gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <div className="h-4 w-24 animate-pulse rounded bg-foreground/10" />
              <div className="h-10 w-full animate-pulse rounded-md bg-foreground/10" />
            </div>
          ))}
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      icon={User}
      title={t("profile")}
      description={t("profileDescription")}
    >
      <div className="flex flex-col gap-4">
        {/* Email (read-only) */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="settings-email" className="text-sm font-medium text-foreground/80">
            {t("email")}
          </label>
          <Input
            id="settings-email"
            value={profileQuery.data?.email ?? ""}
            disabled
            className="bg-muted/50 text-foreground/60"
          />
        </div>

        {/* Display name — the Hebrew name used in the greeting */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="settings-display-name" className="text-sm font-medium text-foreground/80">
            {t("displayName")}
          </label>
          <p className="text-xs text-foreground/40">
            {t("displayNameHint")}
          </p>
          <Input
            id="settings-display-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={100}
            placeholder={t("displayNamePlaceholder")}
          />
        </div>

        {/* Personal address — first name + gender for a personalized, gendered UI */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="settings-first-name" className="text-sm font-medium text-foreground/80">
            {t("firstNameLabel")}
          </label>
          <p className="text-xs text-foreground/40">{t("firstNameHint")}</p>
          <Input
            id="settings-first-name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            maxLength={50}
            placeholder={t("firstNamePlaceholder")}
          />
          <div className="mt-1 grid grid-cols-3 gap-2">
            {([
              { value: "female", label: t("genderFemale") },
              { value: "male", label: t("genderMale") },
              { value: "", label: t("genderNeutral") },
            ]).map((opt) => (
              <button
                key={opt.value || "neutral"}
                type="button"
                onClick={() => setGender(opt.value)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                  gender === opt.value
                    ? "border-foreground bg-foreground/10 text-foreground/80"
                    : "border-border bg-card text-foreground/55 hover:border-foreground/30"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* AMIRANT / English-placement score */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="settings-amirant" className="text-sm font-medium text-foreground/80">
            {t("amirantScore")}
          </label>
          <p className="text-xs text-foreground/40">
            {t("amirantScoreHint")}
          </p>
          <Input
            id="settings-amirant"
            type="number"
            inputMode="numeric"
            min={50}
            max={150}
            value={amirantScore}
            onChange={(e) => setAmirantScore(e.target.value)}
            placeholder={t("amirantScorePlaceholder")}
          />
        </div>

        {/* Focus Area */}
        <div className="flex flex-col gap-1.5">
          <label id="settings-focus-label" className="text-sm font-medium text-foreground/80">
            {t("focusArea")}
          </label>
          <p className="text-xs text-foreground/40">
            {t("focusAreaHint")}
          </p>
          {/* "What IS a focus area and why choose one" — the #6/#29 question a
              first-year student actually asks, answered where the choice is. */}
          <div className="rounded-lg border border-border/50 bg-foreground/[0.02] p-2.5 text-[11px] leading-relaxed text-foreground/55">
            {isHe
              ? "מה זה בכלל? מתוך שלוש הדיסציפלינות של פכ״מ בוחרים אחת להעמקה — לפחות 60 ש״ס ממנה בתואר. הבחירה קובעת גם את הסיווג בשירות המדינה, והיא משפיעה על אילו קורסי-בחירה כדאי לקחת. אפשר להתלבט בשנה א׳ ולבחור אחר-כך — האפליקציה תסמן לך אילו קורסים נספרים לכל כיוון."
              : "What is this? Of PPE's three disciplines you pick one to specialize in — at least 60 credits from it across the degree. It also sets your civil-service classification and shapes which electives are worth taking. It's fine to stay undecided in year 1 — the app marks which courses count toward each direction."}
          </div>
          <Select value={focusArea} onValueChange={setFocusArea}>
            <SelectTrigger className="w-full" aria-labelledby="settings-focus-label">
              <SelectValue placeholder={t("focusArea")} />
            </SelectTrigger>
            <SelectContent>
              {focusOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Academic Year */}
        <div className="flex flex-col gap-1.5">
          <label id="settings-year-label" className="text-sm font-medium text-foreground/80">
            {t("academicYear")}
          </label>
          <Select value={currentYear} onValueChange={setCurrentYear}>
            <SelectTrigger className="w-full" aria-labelledby="settings-year-label">
              <SelectValue placeholder={t("academicYear")} />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Current Semester */}
        <div className="flex flex-col gap-1.5">
          <label id="settings-semester-label" className="text-sm font-medium text-foreground/80">
            {t("semester")}
          </label>
          <Select value={currentSemester} onValueChange={setCurrentSemester}>
            <SelectTrigger className="w-full" aria-labelledby="settings-semester-label">
              <SelectValue placeholder={t("semester")} />
            </SelectTrigger>
            <SelectContent>
              {semesterOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Save button */}
        <Button
          onClick={handleSaveProfile}
          disabled={updateMutation.isPending}
          className="self-start bg-foreground text-background hover:bg-foreground/90"
        >
          {updateMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : saved ? (
            <Check className="size-4" />
          ) : null}
          {saved ? t("profileSaved") : t("saveProfile")}
        </Button>
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------
// Appearance Section
// ---------------------------------------------------------------

function AppearanceSection() {
  const t = useTranslations("settings");
  const locale = useLocale();
  const { theme, setTheme } = useUIStore();
  const router = useRouter();
  const pathname = usePathname();

  const handleLocaleSwitch = (newLocale: "he" | "en") => {
    router.replace(pathname, { locale: newLocale });
  };

  return (
    <SectionCard
      icon={Palette}
      title={t("appearance")}
      description={t("appearanceDescription")}
    >
      <div className="flex flex-col gap-5">
        {/* Theme toggle */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground/80">
            {t("theme")}
          </label>
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => setTheme("system")}
              className={cn(
                "flex items-center gap-3 rounded-lg border p-4 transition-all",
                theme === "system"
                  ? "border-foreground/20 bg-foreground/10 text-foreground/80"
                  : "border-border bg-card text-foreground/60 hover:border-foreground/30"
              )}
            >
              <Monitor className="size-5" />
              <span className="text-sm font-medium">{t("systemMode")}</span>
            </button>
            <button
              onClick={() => setTheme("light")}
              className={cn(
                "flex items-center gap-3 rounded-lg border p-4 transition-all",
                theme === "light"
                  ? "border-foreground/20 bg-foreground/10 text-foreground/80"
                  : "border-border bg-card text-foreground/60 hover:border-foreground/30"
              )}
            >
              <Sun className="size-5" />
              <span className="text-sm font-medium">{t("lightMode")}</span>
            </button>
            <button
              onClick={() => setTheme("dark")}
              className={cn(
                "flex items-center gap-3 rounded-lg border p-4 transition-all",
                theme === "dark"
                  ? "border-foreground/20 bg-foreground/10 text-foreground/80"
                  : "border-border bg-card text-foreground/60 hover:border-foreground/30"
              )}
            >
              <Moon className="size-5" />
              <span className="text-sm font-medium">{t("darkMode")}</span>
            </button>
          </div>
        </div>

        {/* Language toggle */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground/80">
            {t("language")}
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleLocaleSwitch("he")}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg border p-4 transition-all",
                locale === "he"
                  ? "border-foreground/20 bg-foreground/10 text-foreground/80"
                  : "border-border bg-card text-foreground/60 hover:border-foreground/30"
              )}
            >
              <span className="text-sm font-medium">{t("hebrew")}</span>
            </button>
            <button
              onClick={() => handleLocaleSwitch("en")}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg border p-4 transition-all",
                locale === "en"
                  ? "border-foreground/20 bg-foreground/10 text-foreground/80"
                  : "border-border bg-card text-foreground/60 hover:border-foreground/30"
              )}
            >
              <span className="text-sm font-medium">{t("english")}</span>
            </button>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------
// Google Calendar Section
// ---------------------------------------------------------------

function GoogleCalendarSection() {
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
      toast.success(isHe ? `סונכרנו ${data.synced} אירועים ליומן` : `Synced ${data.synced} events to Google Calendar`);
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
      setSyncYear(String(profileQuery.data.currentYear ?? 1));
      setSyncSemester(profileQuery.data.currentSemester ?? "FALL");
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
      icon={Calendar}
      title={t("googleCalendar")}
      description={t("googleCalendarDesc")}
    >
      <div className="flex flex-col gap-4">
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
                    : "text-foreground/50 hover:text-destructive"
                )}
              >
                {deleting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                {confirmDelete
                  ? (isHe ? "לחץ שוב לאישור מחיקה" : "Click again to confirm delete")
                  : t("deleteGoogleEvents")}
              </Button>
              <Button
                variant="ghost"
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="self-start text-foreground/50 hover:text-destructive"
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
            <Button
              onClick={handleConnect}
              className="self-start bg-foreground text-background hover:bg-foreground/90"
            >
              <Link2 className="size-4" />
              {t("googleConnect")}
            </Button>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------
// Account Section
// ---------------------------------------------------------------

function AccountSection() {
  const t = useTranslations("settings");
  const router = useRouter();
  const queryClient = useQueryClient();
  const profileQuery = api.user.getProfile.useQuery();

  const testEmail = process.env.NEXT_PUBLIC_TEST_USER_EMAIL;
  const isTestUser = testEmail && profileQuery.data?.email === testEmail;

  const resetTestMutation = api.user.resetTestUser.useMutation({
    onSuccess: () => {
      queryClient.clear();
      toast.success(t("resetSuccess"));
      router.push("/dashboard");
      router.refresh();
    },
    onError: () => {
      toast.error(t("profileSaveError"));
    },
  });

  const handleSignOut = async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch (e) {
      console.error("Sign-out failed:", e);
    } finally {
      queryClient.clear();
      router.replace("/");
    }
  };

  const handleResetTestData = () => {
    if (window.confirm(t("confirmResetTestData"))) {
      resetTestMutation.mutate();
    }
  };

  return (
    <SectionCard
      icon={LogOut}
      title={t("account")}
      description={t("accountDescription")}
      danger
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-foreground/50">{t("dangerZone")}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="destructive" onClick={handleSignOut} className="self-start">
            <LogOut className="size-4" />
            {t("signOut")}
          </Button>
          {isTestUser && (
            <Button
              variant="destructive"
              onClick={handleResetTestData}
              disabled={resetTestMutation.isPending}
              className="self-start"
            >
              {resetTestMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              {t("resetTestData")}
            </Button>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------
// API Key Section (Claude BYOK)
// ---------------------------------------------------------------

function ApiKeySection() {
  const t = useTranslations("settings");
  const utils = api.useUtils();
  const profileQuery = api.user.getProfile.useQuery();
  const keyQuery = api.ai.hasApiKey.useQuery();

  const [keyInput, setKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);

  const demoEmail = process.env.NEXT_PUBLIC_DEMO_USER_EMAIL;
  const isDemoUser = Boolean(
    demoEmail && profileQuery.data?.email === demoEmail
  );

  const saveMutation = api.ai.saveApiKey.useMutation({
    onSuccess: () => {
      setKeyInput("");
      setShowKey(false);
      void utils.ai.hasApiKey.invalidate();
      toast.success(t("apiKeySaved"));
    },
    onError: (err) => {
      // The backend returns a specific message for an invalid key format.
      toast.error(err.message || t("apiKeySaveError"));
    },
  });

  const removeMutation = api.ai.removeApiKey.useMutation({
    onSuccess: () => {
      void utils.ai.hasApiKey.invalidate();
      toast.success(t("apiKeyRemoved"));
    },
    onError: () => {
      toast.error(t("apiKeyRemoveError"));
    },
  });

  const hasKey = keyQuery.data?.hasKey ?? false;
  const masked = keyQuery.data?.masked ?? null;
  const provider = keyQuery.data?.provider ?? null;

  return (
    <SectionCard
      icon={Key}
      title={t("apiKey")}
      description={t("apiKeyDescription")}
    >
      {isDemoUser ? (
        <p className="text-sm text-foreground/50">{t("apiKeyDemoNote")}</p>
      ) : hasKey ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm text-foreground/70">
            <Check className="size-4 text-emerald-500" />
            <span>{t("apiKeySet")}</span>
            {masked && (
              <code className="rounded bg-foreground/5 px-2 py-0.5 font-mono text-xs">
                {masked}
              </code>
            )}
            {provider && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground/5 px-2 py-0.5 text-xs text-foreground/60">
                {t("apiKeyProvider")}{" "}
                {provider === "gemini" ? "Google Gemini" : "Anthropic Claude"}
                {provider === "gemini" && (
                  <span className="rounded-full bg-emerald-400/15 px-1.5 text-[10px] font-bold text-emerald-600">
                    {t("apiKeyFreeBadge")}
                  </span>
                )}
              </span>
            )}
          </div>
          <Button
            variant="destructive"
            onClick={() => removeMutation.mutate()}
            disabled={removeMutation.isPending}
            className="self-start"
          >
            {removeMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
            {t("removeApiKey")}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Guided onboarding + plain-words privacy — a student who never
              heard "API key" should get through this in two minutes. */}
          <ConnectGeminiGuide />
          <div className="relative">
            <Input
              type={showKey ? "text" : "password"}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder={t("enterApiKey")}
              autoComplete="off"
              spellCheck={false}
              className="pe-10 font-mono"
            />
            <button
              type="button"
              onClick={() => setShowKey((s) => !s)}
              className="absolute inset-y-0 end-0 flex items-center px-3 text-foreground/50 transition-colors hover:text-foreground"
              aria-label={showKey ? "Hide key" : "Show key"}
            >
              {showKey ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </div>
          <p className="text-xs text-foreground/50">{t("apiKeyInfo")}</p>
          <p className="text-xs text-foreground/40">{t("apiKeyFreeLimits")}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => saveMutation.mutate({ apiKey: keyInput })}
              disabled={!keyInput.trim() || saveMutation.isPending}
              className="self-start bg-foreground text-background hover:bg-foreground/90"
            >
              {saveMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Key className="size-4" />
              )}
              {t("saveApiKey")}
            </Button>
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-brand transition-colors hover:text-accent-brand-hover"
            >
              <ExternalLink className="size-3.5" />
              {t("getApiKey")}
            </a>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------
// Miluim Section — current-semester group + cumulative quota tracker
// ---------------------------------------------------------------

function MiluimSection() {
  const t = useTranslations("settings.miluim");
  const locale = useLocale();
  const isHe = locale === "he";
  const utils = api.useUtils();

  const profileQuery = api.user.getProfile.useQuery();
  const semestersQuery = api.user.listMiluimSemesters.useQuery();

  const [days, setDays] = useState<number | null>(null);
  const [combat, setCombat] = useState(false);
  const [saved, setSaved] = useState(false);

  // Cumulative quota counters — student-editable (the army doesn't feed these,
  // so without a way to enter them the degree cap / PKM-024 / PKM-025 stay inert).
  const [creditsUsed, setCreditsUsed] = useState<number | null>(null);
  const [binaryUsedInput, setBinaryUsedInput] = useState<number | null>(null);
  const [countersSaved, setCountersSaved] = useState(false);
  // Manual group override for special cases the day-model can't capture
  // (career service / 300+ days → C, bereaved/wounded → G) — #9.
  const [manualGroup, setManualGroup] = useState<string>("NONE");

  // The current academic year + semester come from the profile; the current
  // miluim row (if any) seeds the day/combat inputs. SUMMER has no miluim row
  // of its own (fix E) — fold it onto SPRING so the editor reads/writes the
  // same bucket group resolution uses.
  const profileSemester = (profileQuery.data?.currentSemester ?? "FALL") as
    | "FALL"
    | "SPRING"
    | "SUMMER";
  const editorSemester: "FALL" | "SPRING" =
    profileSemester === "SUMMER" ? "SPRING" : profileSemester;
  const academicYear = getCurrentAcademicYear();

  // Human-readable label of the record being edited (academic year + semester).
  const yearLabelHe = `תשפ"ו`; // נכון לתשפ"ו — the academicYear key maps to this
  const academicYearLabel = isHe
    ? `${yearLabelHe} (${academicYear}/${academicYear + 1})`
    : `${academicYear}/${academicYear + 1}`;
  const semesterLabel = isHe
    ? editorSemester === "FALL" ? "סמסטר א׳" : "סמסטר ב׳"
    : editorSemester === "FALL" ? "Fall" : "Spring";

  // Seed inputs from the matching per-semester row once data loads.
  useEffect(() => {
    const rows = semestersQuery.data;
    if (!rows) return;
    const row = rows.find(
      (r) => r.academicYear === academicYear && r.semester === editorSemester
    );
    if (row) {
      setDays(row.daysServed);
      setCombat(row.isCombat);
    }
  }, [semestersQuery.data, academicYear, editorSemester]);

  // Seed the cumulative counters from the profile once loaded.
  useEffect(() => {
    if (!profileQuery.data) return;
    setCreditsUsed(profileQuery.data.miluimCreditsUsed ?? 0);
    setBinaryUsedInput(profileQuery.data.miluimBinaryUsed ?? 0);
    setManualGroup(profileQuery.data.miluimGroup ?? "NONE");
  }, [profileQuery.data]);

  const upsertMutation = api.user.upsertMiluimSemester.useMutation({
    onSuccess: () => {
      void utils.user.listMiluimSemesters.invalidate();
      void utils.plan.getCredits.invalidate();
      void utils.regulation.checkCompliance.invalidate();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast.success(t("saved"));
    },
    onError: () => toast.error(isHe ? "השמירה נכשלה" : "Save failed"),
  });

  const updateProfileMutation = api.user.updateProfile.useMutation({
    onSuccess: () => {
      void utils.user.getProfile.invalidate();
      void utils.plan.getCredits.invalidate();
      void utils.regulation.checkCompliance.invalidate();
      setCountersSaved(true);
      setTimeout(() => setCountersSaved(false), 2000);
      toast.success(t("saved"));
    },
    onError: () => toast.error(isHe ? "השמירה נכשלה" : "Save failed"),
  });

  // Derived group preview from the current inputs (mirrors onboarding).
  const derivedGroup = deriveGroupFromDays(days ?? 0, combat);
  const groupCfg = MILUIM_CONFIG.GROUPS[derivedGroup];
  const groupName = isHe ? groupCfg.nameHe : groupCfg.nameEn;

  // Cumulative quota caps.
  const creditCap = MILUIM_CONFIG.MAX_CREDIT_EXEMPTIONS_DEGREE; // 10
  const binaryCap = MILUIM_CONFIG.BINARY_GRADE.BA_DEGREE_CAP; // 5

  const handleSave = () => {
    upsertMutation.mutate({
      academicYear,
      semester: editorSemester,
      daysServed: days ?? 0,
      isCombat: combat,
    });
  };

  const handleSaveCounters = () => {
    updateProfileMutation.mutate({
      miluimCreditsUsed: Math.min(creditCap, Math.max(0, creditsUsed ?? 0)),
      miluimBinaryUsed: Math.min(binaryCap, Math.max(0, binaryUsedInput ?? 0)),
    });
  };

  // Mount gate: the section holds Radix Selects, and its per-semester list
  // renders conditionally on client-hydrated query data (which SSR doesn't
  // have). That shifts Radix's internal useId between server and client and
  // trips a hydration mismatch on aria-controls (#6). Rendering an identical
  // skeleton on SSR + the first client render, then the real content after
  // mount, keeps the trees in sync — the Selects only appear post-hydration.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return (
      <SectionCard icon={Shield} title={t("title")} description={t("description")}>
        <div className="h-40 animate-pulse rounded-xl bg-foreground/[0.03]" />
      </SectionCard>
    );
  }

  return (
    <SectionCard icon={Shield} title={t("title")} description={t("description")}>
      <div className="flex flex-col gap-5">
        {/* Which record is being edited — academic year + semester (fix C) */}
        <div className="flex items-center justify-between rounded-lg border border-foreground/10 bg-foreground/3 px-4 py-2.5">
          <span className="text-xs text-foreground/50">{t("editingRecord")}</span>
          <span className="text-xs font-medium text-foreground/70">
            <Bidi text={academicYearLabel} /> · {semesterLabel}
          </span>
        </div>

        {/* Day + combat inputs (shared with onboarding) */}
        <MiluimDayCombatInputs
          days={days}
          combat={combat}
          onDaysChange={setDays}
          onCombatChange={setCombat}
          labels={{
            daysLabel: t("daysServed"),
            daysHint: t("daysServedHint"),
            combatLabel: t("combat"),
            combatYes: t("combatYes"),
            combatNo: t("combatNo"),
          }}
        />

        {/* Derived current group */}
        <div className="flex items-center justify-between rounded-lg border border-foreground/10 bg-foreground/3 px-4 py-3">
          <span className="text-sm text-foreground/60">{t("currentGroup")}</span>
          <span className="text-sm font-medium text-foreground/80">
            {(days ?? 0) > 0 ? <Bidi text={groupName} /> : t("noService")}
          </span>
        </div>

        {/* Save current-semester group */}
        <Button
          onClick={handleSave}
          disabled={upsertMutation.isPending}
          className="self-start bg-foreground text-background hover:bg-foreground/90"
        >
          {upsertMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : saved ? (
            <Check className="size-4" />
          ) : null}
          {saved ? t("saved") : t("save")}
        </Button>

        {/* Per-semester service timeline (#12/#3) — so the student sees their
            WHOLE reserve history, not just the one semester being edited. */}
        {semestersQuery.data && semestersQuery.data.length > 0 && (
          <div className="border-t border-border pt-5">
            <h4 className="mb-2 text-sm font-medium text-foreground/70">
              {isHe ? "היסטוריית השירות שלך" : "Your service history"}
            </h4>
            <div className="flex flex-col gap-1.5">
              {[...semestersQuery.data]
                .sort((a, b) =>
                  a.academicYear - b.academicYear ||
                  (a.semester === "FALL" ? -1 : 1)
                )
                .map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between rounded-lg bg-foreground/[0.03] px-3 py-2 text-xs"
                  >
                    <span className="text-foreground/70">
                      {isHe
                        ? `שנה ${s.academicYear} · ${s.semester === "FALL" ? "סמסטר א׳" : "סמסטר ב׳"}`
                        : `Year ${s.academicYear} · ${s.semester === "FALL" ? "Fall" : "Spring"}`}
                    </span>
                    <span className="flex items-center gap-2 text-foreground/60">
                      <span dir="ltr">
                        {s.daysServed} {isHe ? "ימים" : "days"}
                      </span>
                      {s.isCombat && (
                        <span className="text-amber-500">{isHe ? "לוחם/ת" : "combat"}</span>
                      )}
                      <span className="rounded-full bg-foreground/8 px-2 py-0.5 font-bold text-foreground/70">
                        {s.derivedGroup === "NONE"
                          ? "—"
                          : `${isHe ? "קבוצה " : "Group "}${s.derivedGroup.replace("GROUP_", "")}`}
                      </span>
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Manual group override — special cases the day-model doesn't capture:
            career service / 300+ days since 7.10.23 → C; bereaved/wounded → G (#9).
            Writes the fallback user.miluimGroup; a per-semester days row, if any,
            still takes precedence for that semester. */}
        <div className="border-t border-border pt-5">
          <label
            id="miluim-manual-group-label"
            className="mb-1.5 block text-sm font-medium text-foreground/70"
          >
            {isHe ? "סיווג ידני (מקרים מיוחדים)" : "Manual group (special cases)"}
          </label>
          <p className="mb-2.5 text-xs text-foreground/45">
            {isHe
              ? "שירות-קבע / 300+ ימים מ-7.10.23 ← קבוצה C · שכול או נפגע-פעולה ← קבוצה G. אם זה המצב שלך, בחר כאן."
              : "Career service / 300+ days since Oct 7 2023 → Group C · bereaved or wounded → Group G. If that's you, pick it here."}
          </p>
          <Select
            value={manualGroup}
            onValueChange={(g) => {
              setManualGroup(g);
              updateProfileMutation.mutate({
                miluimGroup: g as "NONE" | "GROUP_A" | "GROUP_B" | "GROUP_C" | "GROUP_G",
              });
            }}
          >
            <SelectTrigger className="w-full sm:w-72" aria-labelledby="miluim-manual-group-label">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(MILUIM_CONFIG.GROUPS) as Array<keyof typeof MILUIM_CONFIG.GROUPS>).map((g) => (
                <SelectItem key={g} value={g}>
                  {isHe ? MILUIM_CONFIG.GROUPS[g].nameHe : MILUIM_CONFIG.GROUPS[g].nameEn}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Make the day-row precedence visible: if the student set a manual
              group AND entered days that derive a different group, the day-row
              wins for THIS semester — say so instead of silently overriding. */}
          {manualGroup !== "NONE" &&
            (days ?? 0) > 0 &&
            deriveGroupFromDays(days ?? 0, combat) !== manualGroup && (
              <p className="mt-2 rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-[11px] leading-relaxed text-amber-600">
                {isHe
                  ? "שים לב: הזנת ימים לסמסטר הנוכחי — הם קובעים את הקבוצה לסמסטר זה ויגברו על הסיווג-הידני. הסיווג-הידני חל על סמסטרים שבהם לא הזנת ימים."
                  : "Note: you entered days for the current semester — those set the group for this semester and override the manual classification. The manual classification applies to semesters with no days entered."}
              </p>
            )}
        </div>

        {/* Cumulative quota — STUDENT-EDITABLE so the degree cap + warnings
            actually engage (fix B). The army doesn't feed these, so the student
            records what they've already used across earlier semesters. */}
        <div className="border-t border-border pt-5">
          <p className="mb-3 text-sm font-medium text-foreground/70">
            {t("cumulativeTitle")}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
              <label
                htmlFor="miluim-credits-used"
                className="text-xs text-foreground/60"
              >
                {t("creditExemptionUsed")}
              </label>
              <input
                id="miluim-credits-used"
                type="number"
                min={0}
                max={creditCap}
                value={creditsUsed ?? ""}
                onChange={(e) =>
                  setCreditsUsed(
                    e.target.value === "" ? null : parseInt(e.target.value, 10)
                  )
                }
                className="w-full rounded-md border border-border bg-card px-3 py-1.5 font-mono text-sm text-foreground focus:border-foreground/30 focus:outline-none"
              />
              <p className="text-[10px] text-foreground/30">
                {t("creditExemptionUsedHint")}
              </p>
            </div>
            <div className="flex flex-col gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
              <label
                htmlFor="miluim-binary-used"
                className="flex items-center gap-1.5 text-xs text-foreground/60"
              >
                <Swords className="h-3 w-3 text-amber-500" />
                {t("binaryUsed")}
              </label>
              <input
                id="miluim-binary-used"
                type="number"
                min={0}
                max={binaryCap}
                value={binaryUsedInput ?? ""}
                onChange={(e) =>
                  setBinaryUsedInput(
                    e.target.value === "" ? null : parseInt(e.target.value, 10)
                  )
                }
                className="w-full rounded-md border border-border bg-card px-3 py-1.5 font-mono text-sm text-foreground focus:border-foreground/30 focus:outline-none"
              />
              <p className="text-[10px] text-foreground/30">{t("binaryUsedHint")}</p>
            </div>
          </div>

          {/* Save cumulative counters */}
          <Button
            onClick={handleSaveCounters}
            disabled={updateProfileMutation.isPending}
            className="mt-3 self-start bg-foreground text-background hover:bg-foreground/90"
          >
            {updateProfileMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : countersSaved ? (
              <Check className="size-4" />
            ) : null}
            {countersSaved ? t("saved") : t("saveCounters")}
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------
// Main Settings Content
// ---------------------------------------------------------------

export function SettingsContent() {
  const t = useTranslations("settings");

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Settings className="size-8 text-foreground/80" />
        <div className="flex flex-col gap-0.5">
          <h1 className="font-display text-2xl font-bold text-foreground/80 md:text-3xl">
            {t("title")}
          </h1>
          <p className="text-sm text-foreground/60">{t("subtitle")}</p>
        </div>
      </div>

      {/* Settings sections */}
      <div className="mx-auto grid w-full max-w-3xl gap-6">
        <ProfileSection />
        <MiluimSection />
        <ApiKeySection />
        <GoogleCalendarSection />
        <AppearanceSection />
        <AccountSection />
      </div>
    </div>
  );
}
