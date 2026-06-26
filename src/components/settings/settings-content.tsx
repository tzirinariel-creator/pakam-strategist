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
} from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { DISCIPLINE_CONFIG, FOCUS_DISCIPLINE_IDS } from "@/lib/constants";
import { api } from "@/lib/trpc/react";
import { useUIStore } from "@/stores/ui-store";
import { useRouter, usePathname } from "@/i18n/navigation";
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
              "text-lg font-bold",
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

  const [focusArea, setFocusArea] = useState<string>("");
  const [currentYear, setCurrentYear] = useState<string>("");
  const [currentSemester, setCurrentSemester] = useState<string>("");
  const [saved, setSaved] = useState(false);

  // Populate from query data
  useEffect(() => {
    if (profileQuery.data) {
      setFocusArea(profileQuery.data.focusArea ?? "UNDECIDED");
      setCurrentYear(String(profileQuery.data.currentYear ?? ""));
      setCurrentSemester(profileQuery.data.currentSemester ?? "");
    }
  }, [profileQuery.data]);

  const handleSaveProfile = () => {
    const input: Record<string, unknown> = {};
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

        {/* Focus Area */}
        <div className="flex flex-col gap-1.5">
          <label id="settings-focus-label" className="text-sm font-medium text-foreground/80">
            {t("focusArea")}
          </label>
          <p className="text-xs text-foreground/40">
            {t("focusAreaHint")}
          </p>
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
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-foreground/60 transition-colors hover:text-foreground"
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
          <h1 className="text-2xl font-bold text-foreground/80 md:text-3xl">
            {t("title")}
          </h1>
          <p className="text-sm text-foreground/60">{t("subtitle")}</p>
        </div>
      </div>

      {/* Settings sections */}
      <div className="mx-auto grid w-full max-w-3xl gap-6">
        <ProfileSection />
        <ApiKeySection />
        <GoogleCalendarSection />
        <AppearanceSection />
        <AccountSection />
      </div>
    </div>
  );
}
