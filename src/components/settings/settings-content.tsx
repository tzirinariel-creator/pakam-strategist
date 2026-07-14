"use client";

import { useState, useEffect, useRef } from "react";
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
  CalendarClock,
  RefreshCw,
  Unlink,
  Link2,
  Key,
  Eye,
  EyeOff,
  ExternalLink,
  Shield,
  Swords,
  Drama,
  Users,
  MessageSquare,
  Smartphone,
  Mail,
} from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getAcademicNow, deriveYearOfStudy, hebrewYearLabel } from "@/lib/academic-calendar";
import { Bidi } from "@/lib/bidi";
import { DISCIPLINE_CONFIG, FOCUS_DISCIPLINE_IDS, MILUIM_CONFIG, YEAR_CONFIG, ENGLISH_CONFIG } from "@/lib/constants";
import { deriveGroupFromDays, getCurrentAcademicYear } from "@/lib/miluim";
import { ConnectGeminiGuide } from "@/components/settings/connect-gemini-guide";
import { PersonaPicker } from "@/components/persona/persona-picker";
import { MiluimDayCombatInputs } from "@/components/miluim/miluim-day-combat-inputs";
import { QuotaCard } from "@/components/miluim/quota-card";
import { fileToBase64, SCANNER_ACCEPT } from "@/lib/upload";
import type { Form3010Summary } from "@/lib/form-3010";
import { api } from "@/lib/trpc/react";
import { useUIStore } from "@/stores/ui-store";
import { useRouter, usePathname, Link } from "@/i18n/navigation";
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
      // focusArea / englishLevel / amiramScore feed the credit breakdown + the
      // compliance check, so refresh those too or the dashboard shows stale
      // numbers until a reload (#audit-r6).
      void utils.plan.getCredits.invalidate();
      void utils.regulation.checkCompliance.invalidate();
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
  const [lastName, setLastName] = useState<string>("");
  const [gender, setGender] = useState<string>(""); // "" | "male" | "female"
  const [amirantScore, setAmirantScore] = useState<string>("");
  // #23 — the English level as printed on the grade sheet (no number). "" = לא
  // יודע/גזור מהציון. When set, it wins over the Amiram score everywhere.
  const [englishLevelSel, setEnglishLevelSel] = useState<string>("");
  const [focusArea, setFocusArea] = useState<string>("");
  const [startYear, setStartYear] = useState<string>("");
  const [saved, setSaved] = useState(false);

  // Populate from query data
  useEffect(() => {
    if (profileQuery.data) {
      setDisplayName(profileQuery.data.displayName ?? "");
      setFirstName(profileQuery.data.firstName ?? "");
      setLastName(profileQuery.data.lastName ?? "");
      setGender(profileQuery.data.gender ?? "");
      setAmirantScore(
        profileQuery.data.amiramScore != null
          ? String(profileQuery.data.amiramScore)
          : ""
      );
      setEnglishLevelSel(profileQuery.data.englishLevel ?? "");
      setFocusArea(profileQuery.data.focusArea ?? "UNDECIDED");
      // The start-year anchor replaces the year+semester questions (#43);
      // legacy profiles without it get a derived guess from the stored year.
      setStartYear(
        String(
          profileQuery.data.startYear ??
            getAcademicNow().startYear - ((profileQuery.data.currentYear ?? 1) - 1),
        ),
      );
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
    input.lastName = lastName.trim() || null;
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
    // #23 — send the directly-declared level, or clear it (null) to fall back
    // to the score-derived level. The enum guards anything unexpected.
    input.englishLevel =
      englishLevelSel === "" ? null : (englishLevelSel as (typeof ENGLISH_CONFIG.LEVELS)[number]["level"]);
    if (focusArea && focusArea !== "UNDECIDED") {
      input.focusArea = focusArea;
    } else {
      input.focusArea = null;
    }
    if (startYear) {
      // The server derives currentYear/currentSemester from the anchor.
      input.startYear = Number(startYear);
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

  // Degree-start years: this academic year back to -5 (the derived line below
  // shows what the calendar concludes from the choice).
  const nowStartYear = getAcademicNow().startYear;
  const startYearOptions = Array.from({ length: 6 }, (_, i) => {
    const y = nowStartYear - i;
    return { value: String(y), label: `${hebrewYearLabel(y)} · ${y}/${(y + 1) % 100}` };
  });

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
          <div className="grid grid-cols-2 gap-2">
            <Input
              id="settings-first-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              maxLength={50}
              placeholder={t("firstNamePlaceholder")}
            />
            <Input
              id="settings-last-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              maxLength={50}
              placeholder={t("lastNamePlaceholder")}
              aria-label={t("lastNamePlaceholder")}
            />
          </div>
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

        {/* English level (#23) — the grade sheet prints the level as text with no
            number ("מתקדמים ב'-מיון"), so a student who knows only the level can
            set it here; it overrides the score-derived level everywhere. */}
        <div className="flex flex-col gap-1.5">
          <label id="settings-english-level-label" className="text-sm font-medium text-foreground/80">
            {isHe ? "רמת אנגלית (מגיליון הציונים)" : "English level (from the grade sheet)"}
          </label>
          <p className="text-xs text-foreground/40">
            {isHe
              ? "בגיליון הרשמי הרמה מודפסת כמילים בלי מספר (למשל “מתקדמים ב׳”). אם אתם יודעים את הרמה, בחרו אותה — היא גוברת על ציון אמירנט."
              : "The official sheet prints the level as words, not a number. If you know your level, pick it — it overrides the Amirant score."}
          </p>
          <Select
            value={englishLevelSel || "DERIVE"}
            onValueChange={(v) => setEnglishLevelSel(v === "DERIVE" ? "" : v)}
          >
            <SelectTrigger className="w-full" aria-labelledby="settings-english-level-label">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="DERIVE">
                {isHe ? "לא יודע/גזור מהציון" : "Not sure / derive from score"}
              </SelectItem>
              {ENGLISH_CONFIG.LEVELS.map((lvl) => (
                <SelectItem key={lvl.level} value={lvl.level}>
                  {isHe ? lvl.nameHe : lvl.nameEn}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
              ? "מה זה בכלל? מתוך שלוש הדיסציפלינות של פכ״מ בוחרים אחת להעמקה — לפחות 60 ש״ס ממנה בתואר. הבחירה קובעת גם את הסיווג בשירות המדינה, והיא משפיעה על אילו קורסי-בחירה כדאי לקחת. אפשר להתלבט בשנה א׳ ולבחור אחר-כך — האפליקציה תסמן לכם אילו קורסים נספרים לכל כיוון."
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

        {/* Degree start year — the ONE anchor; year + semester are derived
            from the academic calendar, so the app never asks "which semester
            is it" again (#43). */}
        <div className="flex flex-col gap-1.5">
          <label id="settings-start-year-label" className="text-sm font-medium text-foreground/80">
            {isHe ? "שנת תחילת התואר" : "Degree start year"}
          </label>
          <Select value={startYear} onValueChange={setStartYear}>
            <SelectTrigger className="w-full" aria-labelledby="settings-start-year-label">
              <SelectValue placeholder={isHe ? "שנת תחילת התואר" : "Degree start year"} />
            </SelectTrigger>
            <SelectContent>
              {startYearOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {startYear && (() => {
            const acadNow = getAcademicNow();
            const y = deriveYearOfStudy(Number(startYear), 1);
            const yearName = YEAR_CONFIG[y as 1 | 2 | 3]?.[isHe ? "nameHe" : "nameEn"] ?? String(y);
            const semName = acadNow.semester === "FALL" ? (isHe ? "סמסטר א׳" : "Semester A") : (isHe ? "סמסטר ב׳" : "Semester B");
            return (
              <p className="text-sm text-foreground/55">
                {isHe
                  ? `לפי הלוח האקדמי: ${yearName} · ${semName} ${acadNow.labelHe}`
                  : `By the academic calendar: ${yearName} · ${semName} ${acadNow.labelHe}`}
              </p>
            );
          })()}
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

// ---------------------------------------------------------------
// Advisor Persona Section — same brain, two voices (device-local for now)
// ---------------------------------------------------------------

// ---------------------------------------------------------------
// Cohort Wisdom Section (S1b) — the cold-start engine of the social layer.
// importMyGrades existed server-side with NO UI (orphan found in the deep
// read); this is its door. Fully anonymous by construction (k-anonymous
// aggregates keyed by a one-way hash), with an equally-visible withdraw.
// ---------------------------------------------------------------

function CohortWisdomSection() {
  const isHe = useLocale() === "he";
  const [imported, setImported] = useState<number | null>(null);
  const importGrades = api.courseKnowledge.importMyGrades.useMutation({
    onSuccess: (r) => {
      setImported(r.imported);
      toast.success(
        isHe
          ? r.imported > 0
            ? `שותפו ${r.imported} ציונים כנקודות אנונימיות`
            : "אין ציונים חדשים לשתף — הכול כבר משותף"
          : r.imported > 0
            ? `Shared ${r.imported} grades as anonymous points`
            : "Nothing new to share — everything is already in",
      );
    },
    onError: (e) => toast.error(e.message),
  });
  const withdraw = api.courseKnowledge.withdrawMyContributions.useMutation({
    onSuccess: () => {
      setImported(null);
      toast.success(isHe ? "כל התרומות שלכם נמשכו ונמחקו" : "All your contributions were withdrawn");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <SectionCard
      icon={Users}
      title={isHe ? "חוכמת המחזור" : "Cohort wisdom"}
      description={
        isHe
          ? "ממוצעים אמיתיים מהמחזור — בנויים מתרומות אנונימיות של סטודנטים"
          : "Real cohort averages — built from students' anonymous contributions"
      }
    >
      <p className="text-xs leading-relaxed text-foreground/55">
        {isHe
          ? "שתפו את הציונים שלכם כנקודות אנונימיות — בלי שם, בלי דרך לשחזר מי — כדי שכולם יראו ממוצעים אמיתיים בקטלוג. ממוצע מוצג רק כשיש מספיק תורמים (5 ומעלה), ואפשר למשוך את הכול בכל רגע."
          : "Share your grades as anonymous points — no name, no way to trace back — so everyone sees real averages in the catalog. An average shows only with enough contributors (5+), and you can withdraw everything anytime."}
      </p>
      <div className="flex flex-wrap gap-2.5">
        <Button
          type="button"
          onClick={() => importGrades.mutate()}
          disabled={importGrades.isPending}
          className="gap-1.5"
        >
          {importGrades.isPending ? <Loader2 className="size-4 animate-spin" /> : <Users className="size-4" />}
          {isHe ? "שתפו את הציונים שלי" : "Share my grades"}
          {imported != null && imported > 0 && (
            <span className="rounded-full bg-background/20 px-1.5 text-xs">{imported}</span>
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => withdraw.mutate()}
          disabled={withdraw.isPending}
          className="gap-1.5"
        >
          {withdraw.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          {isHe ? "משכו את כל התרומות שלי" : "Withdraw all my contributions"}
        </Button>
      </div>
    </SectionCard>
  );
}

function PersonaSection() {
  const isHe = useLocale() === "he";
  return (
    <SectionCard
      icon={Drama}
      title={isHe ? "דמות היועץ" : "Advisor persona"}
      description={isHe ? "אותם נתונים, אותם כללים — קול אחר. ההחלפה חלה מההודעה הבאה." : "Same data, same rules — a different voice. Applies from the next message."}
    >
      {/* Q5 (notes 17/48): shared picker incl. the Plato origin story — the same
          component the onboarding finale uses, so the choice lives once. */}
      <PersonaPicker />
    </SectionCard>
  );
}

function AppearanceSection() {
  const t = useTranslations("settings");
  const locale = useLocale();
  const isHe = locale === "he";
  const { theme, setTheme } = useUIStore();

  // The King's proactive suggestion (note #12) — a global opt-out kept in
  // localStorage (pk-proactive-off). ON = the King may surface one critical gap
  // when you open him; OFF = he stays quiet until asked.
  const [proactiveOn, setProactiveOn] = useState(true);
  useEffect(() => {
    try {
      setProactiveOn(!localStorage.getItem("pk-proactive-off"));
    } catch {
      /* storage unavailable — default on */
    }
  }, []);
  const toggleProactive = () => {
    setProactiveOn((prev) => {
      const next = !prev;
      try {
        if (next) localStorage.removeItem("pk-proactive-off");
        else localStorage.setItem("pk-proactive-off", "1");
      } catch {
        /* ignore */
      }
      return next;
    });
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
                  ? "border-accent-brand/30 bg-accent-brand-muted text-accent-brand"
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
                  ? "border-accent-brand/30 bg-accent-brand-muted text-accent-brand"
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
                  ? "border-accent-brand/30 bg-accent-brand-muted text-accent-brand"
                  : "border-border bg-card text-foreground/60 hover:border-foreground/30"
              )}
            >
              <Moon className="size-5" />
              <span className="text-sm font-medium">{t("darkMode")}</span>
            </button>
          </div>
        </div>

        {/* King proactive suggestion — global opt-out (note #12) */}
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <label className="text-sm font-medium text-foreground/80">
              {isHe ? "המלך יציף פער קריטי כשאני פותח אותו" : "Let the King surface one critical gap when I open him"}
            </label>
            <p className="mt-0.5 text-xs text-foreground/50">
              {isHe ? "אם משהו אצלכם דורש טיפול — המלך יגיד את זה ברגע שתפתחו אותו. הוא אף פעם לא קופץ מעצמו באמצע העבודה." : "When you open the King and he sees something that needs attention — he says so. Only on entry, never mid-flow."}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={proactiveOn}
            aria-label={isHe ? "המלך יציף פער קריטי כשאני פותח אותו" : "Let the King surface one critical gap when I open him"}
            onClick={toggleProactive}
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
              proactiveOn ? "bg-accent-brand" : "bg-foreground/20",
            )}
          >
            <span
              className={cn(
                "inline-block size-4 rounded-full bg-white transition-transform",
                proactiveOn ? "translate-x-6 rtl:-translate-x-6" : "translate-x-1 rtl:-translate-x-1",
              )}
            />
          </button>
        </div>
      </div>
    </SectionCard>
  );
}

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
      <p className="mt-2 text-[11px] text-foreground/40">
        {isHe
          ? "טיפ: ב-iPhone בחרו \"הוספה ליומן\" ← מנוי; ב-Google Calendar הדביקו את הקישור תחת \"יומנים אחרים ← מכתובת\"."
          : "Tip: on iPhone tap \"Add to my calendar\" → subscribe; in Google Calendar paste the link under \"Other calendars → From URL\"."}
      </p>
    </div>
  );
}

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
      setSyncYear(String(deriveYearOfStudy(profileQuery.data.startYear, profileQuery.data.currentYear ?? 1)));
      setSyncSemester(getAcademicNow().semester);
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

// ---------------------------------------------------------------
// Feedback & install (L1 + L3)
// ---------------------------------------------------------------

function FeedbackSection() {
  const t = useTranslations("settings");
  const pathname = usePathname();

  // L3 — the feedback channel is a prefilled mail (no tracking, no extra
  // table); the page context rides along so the report lands actionable.
  const mailtoHref = `mailto:ariel@pakamon.app?subject=${encodeURIComponent(
    t("feedbackSubject"),
  )}&body=${t("feedbackBody")}${encodeURIComponent(pathname)}`;

  return (
    <SectionCard
      icon={MessageSquare}
      title={t("feedbackTitle")}
      description={t("feedbackDesc")}
    >
      <div className="space-y-4">
        <div>
          <a
            href={mailtoHref}
            className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-foreground/90"
          >
            <Mail className="size-4" />
            {t("feedbackButton")}
          </a>
          <p className="mt-2 text-xs text-foreground/50">{t("feedbackHint")}</p>
        </div>

        {/* L1 — install hint: the app is a PWA; surface the two magic paths */}
        <div className="rounded-lg border border-border/50 bg-foreground/[0.03] p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground/80">
            <Smartphone className="size-4" />
            {t("installTitle")}
          </p>
          <ul className="space-y-1 text-xs leading-relaxed text-foreground/60">
            <li>{t("installIos")}</li>
            <li>{t("installAndroid")}</li>
          </ul>
        </div>
      </div>
    </SectionCard>
  );
}

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
        {/* #26 (12.7) — signing out is an everyday action, not an irreversible
            one; it lives ABOVE the danger label, in a neutral style. */}
        <Button variant="outline" onClick={handleSignOut} className="self-start">
          <LogOut className="size-4" />
          {t("signOut")}
        </Button>

        <p className="mt-2 text-sm text-foreground/50">{t("dangerZone")}</p>
        <div className="flex flex-wrap gap-2">
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

        {/* SEC2 — permanent deletion (the privacy right). Type-to-confirm so a
            stray click can never erase a degree's worth of data. */}
        <DeleteAccountBlock onDone={handleSignOut} />
      </div>
    </SectionCard>
  );
}

function DeleteAccountBlock({ onDone }: { onDone: () => void }) {
  const isHe = useLocale() === "he";
  const [confirmText, setConfirmText] = useState("");
  const CONFIRM = isHe ? "מחקו לצמיתות" : "DELETE FOREVER";
  const deleteMutation = api.user.deleteAccount.useMutation({
    onSuccess: () => {
      toast.success(isHe ? "החשבון וכל הנתונים נמחקו" : "Account and all data deleted");
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="mt-2 rounded-xl border border-destructive/25 bg-destructive/[0.04] p-4">
      <p className="text-sm font-semibold text-destructive">
        {isHe ? "מחיקת החשבון לצמיתות" : "Delete account permanently"}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-foreground/55">
        {isHe
          ? "מוחק הכול: תוכנית, ציונים, משימות, שיחות עם היועץ, נתוני מילואים — וגם את התרומות האנונימיות שלכם לחוכמת-המחזור. אין דרך חזרה."
          : "Deletes everything: plan, grades, tasks, advisor chats, miluim data — and your anonymous cohort contributions. There is no way back."}
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={isHe ? `הקלידו: ${CONFIRM}` : `Type: ${CONFIRM}`}
          aria-label={isHe ? "אישור מחיקת חשבון" : "Confirm account deletion"}
          className="w-48 rounded-md border border-border bg-card px-3 py-1.5 text-sm focus:border-destructive/50 focus:outline-none"
        />
        <Button
          variant="destructive"
          disabled={confirmText.trim() !== CONFIRM || deleteMutation.isPending}
          onClick={() => deleteMutation.mutate()}
        >
          {deleteMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          {isHe ? "מחקו את החשבון שלי" : "Delete my account"}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// API Key Section (Claude BYOK)
// ---------------------------------------------------------------

function ApiKeySection() {
  const t = useTranslations("settings");
  const isHe = useLocale() === "he";
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
          <details className="rounded-lg border border-border/50 bg-foreground/[0.02] p-3">
            <summary className="cursor-pointer text-xs font-semibold text-foreground/70">
              {isHe ? "מה זה בכלל מפתח, ואיך משיגים אחד? מדריך של דקה" : "What's a key and how do I get one? 1-minute guide"}
            </summary>
            <div className="mt-2.5 space-y-2.5 text-xs leading-relaxed text-foreground/65">
              <p>
                {isHe
                  ? "מפתח הוא כמו כרטיס-כניסה אישי ל-AI של גוגל — חינמי לגמרי, בלי כרטיס אשראי. הוא נראה כמו שורת אותיות ומספרים ארוכה. ככה משיגים:"
                  : "A key is a personal, completely free entry ticket to Google's AI (no credit card). It looks like a long string of letters and numbers. Here's how:"}
              </p>
              <ol className="space-y-2">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-brand/15 text-[10px] font-bold text-accent-brand">1</span>
                  <span>
                    {isHe ? <>נכנסים ל-<a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="font-medium text-accent-brand hover:underline">aistudio.google.com/apikey</a> ומתחברים עם חשבון הגוגל הרגיל שלכם.</> : <>Open <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="font-medium text-accent-brand hover:underline">aistudio.google.com/apikey</a> and sign in with your regular Google account.</>}
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-brand/15 text-[10px] font-bold text-accent-brand">2</span>
                  <span className="min-w-0 flex-1">
                    {isHe ? "מחפשים את הכפתור הכחול הזה ולוחצים עליו:" : "Find and click this blue button:"}
                    <span dir="ltr" className="mt-1 flex w-fit items-center gap-1.5 rounded-md bg-[#1a73e8] px-3 py-1.5 text-[11px] font-medium text-white shadow-sm">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
                      Create API key
                    </span>
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-brand/15 text-[10px] font-bold text-accent-brand">3</span>
                  <span className="min-w-0 flex-1">
                    {isHe ? "נוצרת שורה ארוכה שמתחילה ב-AIza. לוחצים על אייקון-ההעתקה שלידה:" : "A long string starting with AIza appears. Click the copy icon beside it:"}
                    <span dir="ltr" className="mt-1 flex w-fit items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 font-mono text-[11px] text-foreground/60">
                      AIzaSy••••••••••••••••
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden><rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.8"/><path d="M5 15V5a2 2 0 0 1 2-2h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
                    </span>
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-brand/15 text-[10px] font-bold text-accent-brand">4</span>
                  <span>
                    {isHe ? "מדביקים בשדה כאן למעלה ולוחצים שמירה. זהו — מהרגע הזה המלך עובד על המכסה הפרטית שלכם." : "Paste it in the field above and hit save. Done — the King now runs on your private quota."}
                  </span>
                </li>
              </ol>
              <p className="text-[11px] text-foreground/40">
                {isHe
                  ? "המפתח נשמר אצלנו מוצפן, ואפשר למחוק אותו מכאן בכל רגע. אם משהו לא מסתדר — פשוט תמשיכו על המכסה המשותפת, זה בסדר גמור."
                  : "The key is stored encrypted and can be removed here anytime. If anything's confusing — just keep using the shared quota, that's perfectly fine."}
              </p>
            </div>
          </details>
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

export function MiluimSection() {
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
  // Manual group override for special cases the day-model can't capture
  // (career service / 300+ days → C, bereaved/wounded → G) — #9.
  const [manualGroup, setManualGroup] = useState<string>("NONE");

  // The current academic year + semester come from the profile; the current
  // miluim row (if any) seeds the day/combat inputs. SUMMER has no miluim row
  // of its own (fix E) — fold it onto SPRING so the editor reads/writes the
  // same bucket group resolution uses.
  // Resolve the CURRENT semester from the real-time calendar — the SAME source
  // plan.getCredits + regulation.checkCompliance use to pick the MiluimSemester
  // row. Deriving it from the stale stored profile.currentSemester wrote the
  // student's days into the wrong (previous) semester row after a rollover, so
  // they granted 0 exemption everywhere despite the preview (#audit-r4).
  const nowSemester = getAcademicNow().semester;
  const editorSemester: "FALL" | "SPRING" = nowSemester === "SPRING" ? "SPRING" : "FALL";
  const academicYear = getCurrentAcademicYear();

  // Human-readable label of the record being edited (academic year + semester).
  // Derived from academicYear (not hardcoded) so it stays correct across the
  // rollover to תשפ"ז and beyond (#audit-r4).
  const academicYearLabel = isHe
    ? `${hebrewYearLabel(academicYear)} (${academicYear}/${academicYear + 1})`
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
    setManualGroup(
      profileQuery.data.miluimCareerService
        ? "CAREER_SERVICE"
        : (profileQuery.data.miluimGroup ?? "NONE")
    );
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
  // Quiet twins for the 3010 UNDO path — restoring N rows must not fire N
  // "saved" toasts; ONE invalidate at the end.
  const silentUpsert = api.user.upsertMiluimSemester.useMutation();
  const silentDelete = api.user.deleteMiluimSemester.useMutation();
  const restoreSnapshot = (
    snapshot: Array<{ prior: { academicYear: number; semester: "FALL" | "SPRING"; daysServed: number; isCombat: boolean } | null; academicYear: number; semester: "FALL" | "SPRING" }>,
  ) => {
    void Promise.allSettled(
      snapshot.map((s) =>
        s.prior
          ? silentUpsert.mutateAsync(s.prior)
          : silentDelete.mutateAsync({ academicYear: s.academicYear, semester: s.semester }),
      ),
    ).then(() => {
      void utils.user.listMiluimSemesters.invalidate();
      void utils.plan.getCredits.invalidate();
      void utils.regulation.checkCompliance.invalidate();
      toast.success(isHe ? "הייבוא בוטל — הנתונים חזרו למצב הקודם" : "Import undone — data restored");
    });
  };
  const snapshotOf = (academicYear: number, semester: "FALL" | "SPRING") => {
    const row = (semestersQuery.data ?? []).find(
      (r) => r.academicYear === academicYear && r.semester === semester,
    );
    return row
      ? { academicYear: row.academicYear, semester: row.semester as "FALL" | "SPRING", daysServed: row.daysServed, isCombat: row.isCombat ?? false }
      : null;
  };

  const updateProfileMutation = api.user.updateProfile.useMutation({
    onSuccess: () => {
      void utils.user.getProfile.invalidate();
      void utils.plan.getCredits.invalidate();
      void utils.regulation.checkCompliance.invalidate();
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

        {/* M2 (note 45) — Form 3010 scanner: upload the official confirmation,
            Gemini extracts the periods, and EVERY semester is applied only on
            explicit approval (through the same upsert the manual editor uses). */}
        <Form3010Uploader
          isHe={isHe}
          existing={semestersQuery.data ?? []}
          pending={upsertMutation.isPending}
          onApply={(academicYearApply, semesterApply, daysApply) => {
            const prior = snapshotOf(academicYearApply, semesterApply);
            upsertMutation.mutate(
              {
                academicYear: academicYearApply,
                semester: semesterApply,
                daysServed: daysApply,
                // Preserve an existing combat flag — the form doesn't state it.
                isCombat: prior?.isCombat ?? false,
              },
              {
                onSuccess: () =>
                  toast.success(isHe ? "הסמסטר עודכן מהטופס" : "Semester applied from the form", {
                    action: {
                      label: isHe ? "בטלו" : "Undo",
                      onClick: () => restoreSnapshot([{ prior, academicYear: academicYearApply, semester: semesterApply }]),
                    },
                  }),
              },
            );
          }}
          onApplyAll={(items) => {
            // Snapshot EVERYTHING before the first write — one tap restores all.
            const snapshot = items.map((it) => ({
              prior: snapshotOf(it.academicYear, it.semester),
              academicYear: it.academicYear,
              semester: it.semester,
            }));
            void Promise.allSettled(
              items.map((it) =>
                silentUpsert.mutateAsync({
                  academicYear: it.academicYear,
                  semester: it.semester,
                  daysServed: it.days,
                  isCombat: snapshot.find((s) => s.academicYear === it.academicYear && s.semester === it.semester)?.prior?.isCombat ?? false,
                }),
              ),
            ).then((results) => {
              void utils.user.listMiluimSemesters.invalidate();
              void utils.plan.getCredits.invalidate();
              void utils.regulation.checkCompliance.invalidate();
              const ok = results.filter((r) => r.status === "fulfilled").length;
              toast.success(
                isHe ? `הוחלו ${ok} סמסטרים מהטופס` : `Applied ${ok} semesters from the form`,
                {
                  action: {
                    label: isHe ? "בטלו הכול" : "Undo all",
                    onClick: () => restoreSnapshot(snapshot),
                  },
                },
              );
            });
          }}
        />

        {/* Per-semester service timeline (#12/#3) — so the student sees their
            WHOLE reserve history, not just the one semester being edited. */}
        {semestersQuery.data && semestersQuery.data.length > 0 && (
          <div className="border-t border-border pt-5">
            <h4 className="mb-2 text-sm font-medium text-foreground/70">
              {isHe ? "היסטוריית השירות שלכם" : "Your service history"}
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
                      <span>
                        <bdi dir="ltr">{s.daysServed}</bdi> {isHe ? "ימים" : "days"}
                      </span>
                      {s.isCombat && (
                        <span className="text-amber-500">{isHe ? "תפקיד לחימה" : "combat"}</span>
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
              ? <Bidi text="מקרים מיוחדים: 300+ ימי לחימה מאז 7.10.23 מקנים קבוצה C; שכול או פגיעת-פעולה — קבוצה G; שירות קבע בתוכנית שירות — האפשרות הייעודית למטה. אם זה המצב שלכם, בחרו כאן." />
              : <Bidi text="300+ combat days since Oct 7 2023 → Group C · bereaved or wounded → Group G · career service → the dedicated option below. If that's you, pick it here." />}
          </p>
          <Select
            value={manualGroup}
            onValueChange={(g) => {
              setManualGroup(g);
              if (g === "CAREER_SERVICE") {
                // Career service in a service-track program → Group C, WITH the
                // marker so the label reads "משרת/ת קבע", not "35+ reserve days".
                updateProfileMutation.mutate({ miluimGroup: "GROUP_C", miluimCareerService: true });
              } else {
                updateProfileMutation.mutate({
                  miluimGroup: g as "NONE" | "GROUP_A" | "GROUP_B" | "GROUP_C" | "GROUP_G",
                  // A plain group pick is not career service — clear the flag.
                  miluimCareerService: false,
                });
              }
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
              <SelectItem value="CAREER_SERVICE">
                {isHe ? "שירות קבע (בתוכנית שירות) — קבוצה C" : "Career service (service-track) — Group C"}
              </SelectItem>
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
                  ? "שימו לב: הזנתם ימים לסמסטר הנוכחי — הם קובעים את הקבוצה לסמסטר הזה וגוברים על הסיווג הידני. הסיווג הידני חל על סמסטרים בלי ימים."
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
          {/* M1 (note 46): the SAME QuotaCard steppers the miluim strip's
              benefits panel uses — a step writes immediately through the same
              updateProfile mutation, so every surface updates at once. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <QuotaCard
              icon={Shield}
              label={t("creditExemptionUsed")}
              used={creditsUsed ?? 0}
              cap={creditCap}
              hint={t("creditExemptionUsedHint")}
              pending={updateProfileMutation.isPending}
              isHe={isHe}
              onChange={(next) => {
                setCreditsUsed(next);
                updateProfileMutation.mutate({ miluimCreditsUsed: Math.min(creditCap, Math.max(0, next)) });
              }}
            />
            <QuotaCard
              icon={Swords}
              label={t("binaryUsed")}
              used={binaryUsedInput ?? 0}
              cap={binaryCap}
              hint={t("binaryUsedHint")}
              pending={updateProfileMutation.isPending}
              isHe={isHe}
              onChange={(next) => {
                setBinaryUsedInput(next);
                updateProfileMutation.mutate({ miluimBinaryUsed: Math.min(binaryCap, Math.max(0, next)) });
              }}
            />
          </div>
        </div>

        {/* #27 — the binary/rights playbook, sourced from the domain rules
            (docs/pakam-domain-rules-2026.md) + the national תשפ"ו outline.
            Everything here is policy that changes yearly — hence the tag. */}
        <details className="rounded-lg border border-border/50 bg-foreground/[0.02] p-4">
          <summary className="cursor-pointer text-sm font-semibold text-foreground/75">
            {isHe ? "איך מנצלים את הזכויות חכם? המדריך הקצר" : "How to use the benefits wisely — the short playbook"}
            <span className="ms-2 rounded-full bg-foreground/8 px-2 py-0.5 text-[10px] font-normal text-foreground/50">
              {isHe ? "נכון לתשפ״ו" : "As of 2025-26"}
            </span>
          </summary>
          {isHe ? (
            <div className="mt-3 space-y-3 text-xs leading-relaxed text-foreground/65">
              <div>
                <p className="font-semibold text-foreground/75">רגע, מה זה הקבוצות?</p>
                <p className="mt-1">
                  האוניברסיטה מסווגת כל מי ששירת במילואים לקבוצה, לפי כמה ימים שירתם באותו סמסטר.
                  ככל שהקבוצה &quot;גבוהה&quot; יותר — ההטבות גדולות יותר:
                </p>
                <ul className="mt-1.5 space-y-1">
                  <li>• <b>קבוצה A</b> — עד 20 ימי מילואים בסמסטר.</li>
                  <li>• <b>קבוצה B</b> — 21 עד 34 ימים (לוחמים: כבר מ-14 ימים).</li>
                  <li>• <b>קבוצה C</b> — 35 ימים ומעלה (לוחמים: כבר מ-21).</li>
                  <li>• <b>קבוצה G</b> — נפגעי מלחמה, פצועים ומשפחות שכולות — מטופלים אישית בדיקנט.</li>
                </ul>
                <p className="mt-1.5">
                  הקבוצה נקבעת מחדש בכל סמסטר לפי הימים של אותו סמסטר (הצבא מדווח לאוניברסיטה
                  אוטומטית). מה שכן נשאר איתכם לאורך כל התואר: הפטורים שצברתם (עד 10 ש״ס)
                  וההמרות הבינאריות שניצלתם (עד 5).
                </p>
              </div>
              <div>
                <p className="font-semibold text-foreground/75">בינארי — למי וכמה?</p>
                <p className="mt-1">
                  קבוצה B יכולה להמיר עד 2 קורסים בשנה לציון &quot;עובר&quot;, וקבוצה C עד 3 (לשתיהן —
                  מקסימום 5 בכל התואר). את ההמרה עצמה מבצעים מול מזכירות החוג; כאן רק מתכננים אותה חכם:
                  שווה להמיר קורס כבד שהציון הצפוי בו נמוך מהממוצע שלכם — ההמרה מוציאה אותו מהממוצע.
                  לא כדאי (ולפעמים אסור) להמיר קורסים שדורשים ציון מספרי למעבר-שנה (רף 75/80), סמינרים,
                  או קורסים שחשובים לקבלה לתואר שני.
                </p>
                <p className="mt-1">
                  <b>ועוד אזהרה חשובה:</b> מי שממיר יותר מ-25% משעות-השנה מאבד זכאות להצטיינות
                  דקאן/רקטור. בדיקת-המסלול תתריע לפני שמתקרבים לזה.
                </p>
              </div>
              <div>
                <p className="font-semibold text-foreground/75">מבחנים והערכה חלופית</p>
                <p className="mt-1">
                  קבוצות B ו-C ניגשות ל-2 מתוך 3 מועדי בחינה — והציון הגבוה מביניהם נשמר אוטומטית.
                  בנוסף, לפי המתווה הארצי לתשפ״ו אפשר לקבל בחלק מהקורסים הערכה חלופית במקום בחינה —
                  היישום המדויק משתנה מקורס לקורס, אז מוודאים מול מדור-מילואים.
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-xs leading-relaxed text-foreground/65">
              The group is re-assigned each semester; exemptions and binary conversions accumulate (caps: 10 credits, 5 binary). Convert heavy low-grade courses — never gate courses (the 75/80 numeric bar), seminars, or grad-school-critical ones. Converting more than 25% of a year&apos;s hours forfeits honors. Groups B/C/G sit 2-of-3 exam dates, higher counts. Alternative assessment per the national 2025-26 outline — confirm specifics with the miluim desk.
            </p>
          )}
        </details>
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------
// M2 — Form 3010 uploader (extraction → explicit per-semester approval)
// ---------------------------------------------------------------

export function Form3010Uploader({
  isHe,
  existing,
  pending,
  onApply,
  onApplyAll,
}: {
  isHe: boolean;
  existing: Array<{ academicYear: number; semester: string; daysServed: number }>;
  pending: boolean;
  onApply: (academicYear: number, semester: "FALL" | "SPRING", days: number) => void;
  /** Batch apply — lets the parent snapshot BEFORE the whole import and offer
   *  ONE undo for all of it (the last irreversible bulk-write, 12.7 #26). */
  onApplyAll?: (items: Array<{ academicYear: number; semester: "FALL" | "SPRING"; days: number }>) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [summary, setSummary] = useState<Form3010Summary | null>(null);
  const [edited, setEdited] = useState<Record<string, number>>({});

  const handleFile = async (file: File) => {
    setScanning(true);
    setSummary(null);
    try {
      const { b64, mime } = await fileToBase64(file);
      if (b64.length > 5_000_000) {
        toast.error(isHe ? "הקובץ גדול מדי — צלמו את העמוד עצמו (עד ~3.5MB)." : "File too large — photograph the page (max ~3.5MB).");
        return;
      }
      const res = await fetch("/api/ai/scan-3010", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: b64, mimeType: mime }),
      });
      const data = (await res.json()) as { summary?: Form3010Summary; error?: string };
      if (!res.ok || !data.summary) {
        toast.error(data.error ?? (isHe ? "הסריקה נכשלה" : "Scan failed"));
        return;
      }
      setSummary(data.summary);
      setEdited({});
    } catch {
      toast.error(isHe ? "הסריקה נכשלה — נסו שוב" : "Scan failed — try again");
    } finally {
      setScanning(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="rounded-xl border border-border/60 bg-foreground/[0.02] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground/75">
            {isHe ? "יש לכם טופס 3010? נמלא את הימים בשבילכם" : "Have a Form 3010? We'll fill the days for you"}
          </p>
          <p className="text-xs text-foreground/45">
            {isHe
              ? "מעלים את האישור הרשמי — אנחנו מחלצים את תקופות השירות ומציעים חלוקה לסמסטרים. שום דבר לא נשמר בלי אישור שלכם."
              : "Upload the official confirmation — we extract the service periods and suggest a per-semester split. Nothing is saved without your approval."}
          </p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept={SCANNER_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
        <Button type="button" variant="outline" disabled={scanning} onClick={() => fileRef.current?.click()} className="gap-1.5">
          {scanning ? <Loader2 className="size-4 animate-spin" /> : <Shield className="size-4" />}
          {scanning ? (isHe ? "קורא את הטופס…" : "Reading…") : isHe ? "העלו טופס 3010" : "Upload Form 3010"}
        </Button>
      </div>

      {summary && (
        <div className="mt-3 space-y-2">
          {summary.suggestions.length > 1 && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                const items = summary.suggestions.map((s) => ({
                  academicYear: s.academicYear,
                  semester: s.semester,
                  days: edited[`${s.academicYear}-${s.semester}`] ?? Math.round(s.days),
                }));
                if (onApplyAll) onApplyAll(items);
                else for (const it of items) onApply(it.academicYear, it.semester, it.days);
              }}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent-brand px-3 py-2 text-xs font-semibold text-accent-brand-fg transition-colors hover:bg-accent-brand-hover disabled:opacity-50"
            >
              <Check className="size-3.5" />
              {isHe
                ? `אישור והחלה של הכול (${summary.suggestions.length} סמסטרים)`
                : `Apply all (${summary.suggestions.length} semesters)`}
            </button>
          )}
          {summary.suggestions.length === 0 && (
            <p className="text-xs text-foreground/50">
              {isHe ? "לא נמצאו תקופות בטווח הלוחות המוכרים — אפשר להזין ידנית למטה." : "No periods within the known calendars — enter manually below."}
            </p>
          )}
          {summary.suggestions.map((s) => {
            const key = `${s.academicYear}-${s.semester}`;
            const days = edited[key] ?? Math.round(s.days);
            const current = existing.find((r) => r.academicYear === s.academicYear && r.semester === s.semester);
            return (
              <div key={key} className="flex flex-wrap items-center gap-2 rounded-lg border border-border/50 p-2 text-xs">
                <span className="min-w-0 flex-1 text-foreground/75">
                  <Bidi text={isHe ? `${s.labelHe} · ${s.semester === "FALL" ? "סמסטר א׳" : "סמסטר ב׳"}` : `${s.academicYear} · ${s.semester === "FALL" ? "Fall" : "Spring"}`} />
                  <span className="ms-1 text-foreground/40">
                    ({s.periodCount} {isHe ? "תקופות" : "periods"})
                  </span>
                </span>
                <input
                  type="number"
                  min={0}
                  max={366}
                  value={days}
                  aria-label={isHe ? `ימי שירות ל${s.labelHe}` : `Service days for ${s.labelHe}`}
                  onChange={(e) => setEdited((prev) => ({ ...prev, [key]: Math.max(0, Math.min(366, parseInt(e.target.value, 10) || 0)) }))}
                  className="w-16 rounded-md border border-border bg-card px-2 py-1 text-center font-mono"
                  dir="ltr"
                />
                {current && current.daysServed !== days && (
                  <span className="rounded bg-amber-500/10 px-1.5 py-px text-[10px] font-semibold text-amber-600">
                    {isHe ? <>רשום כרגע <bdi dir="ltr">{current.daysServed}</bdi> — יוחלף</> : `Recorded ${current.daysServed} — will replace`}
                  </span>
                )}
                <Button type="button" size="sm" disabled={pending} onClick={() => onApply(s.academicYear, s.semester, days)} className="h-7 px-2.5 text-xs">
                  {isHe ? "החילו לסמסטר" : "Apply"}
                </Button>
              </div>
            );
          })}
          {summary.unmapped.length > 0 && (
            // #21 (12.7) — the old one-line dump of 14 periods was unreadable.
            // Collapsed by default; opens to a proper table, oldest first.
            <details className="rounded-lg border border-border/40 bg-foreground/[0.02] p-2.5">
              <summary className="cursor-pointer text-[11px] font-medium text-foreground/55">
                {isHe
                  ? `עוד ${summary.unmapped.length} תקופות שירות שלא שויכו לסמסטר — לפירוט`
                  : `${summary.unmapped.length} more service period(s) not assigned to a semester — details`}
              </summary>
              <table className="mt-2 w-full text-[11px]">
                <thead>
                  <tr className="text-foreground/40">
                    <th className="pb-1 pe-3 text-start font-medium">{isHe ? "מתאריך" : "From"}</th>
                    <th className="pb-1 pe-3 text-start font-medium">{isHe ? "עד תאריך" : "To"}</th>
                    <th className="pb-1 text-start font-medium">{isHe ? "ימים" : "Days"}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...summary.unmapped]
                    .sort((a, b) => a.startDate.localeCompare(b.startDate))
                    .map((p) => (
                      <tr key={`${p.startDate}-${p.endDate}`} className="border-t border-border/30 text-foreground/60">
                        <td className="py-1 pe-3"><bdi dir="ltr">{p.startDate}</bdi></td>
                        <td className="py-1 pe-3"><bdi dir="ltr">{p.endDate}</bdi></td>
                        <td className="py-1 font-mono"><bdi dir="ltr">{p.days}</bdi></td>
                      </tr>
                    ))}
                </tbody>
              </table>
              <p className="mt-1.5 text-[10px] leading-relaxed text-foreground/40">
                {isHe
                  ? "לא הצלחנו לשייך את התקופות האלה לסמסטר — לוחות-הזמנים שבאפליקציה מתחילים בתשפ״ד. אם שירתם בזמן הלימודים לפני כן, הזינו את הימים ידנית לסמסטר המתאים והם ייספרו. שירות שקדם לתואר לא מזכה בהטבות."
                  : "We couldn't assign these periods to a semester — the app's calendars start at 2023-24. If you served during earlier study semesters, enter those days manually for the right semester and they'll count. Service from before the degree doesn't grant benefits."}
              </p>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

// המילואים קיבלו עמוד משלהם (12.7 #18/#32) — ההגדרות מפנות אליו.
function MiluimLinkCard() {
  const locale = useLocale();
  const isHe = locale === "he";
  return (
    <SectionCard
      icon={Shield}
      title={isHe ? "מילואים" : "Miluim (reserve duty)"}
      description={isHe ? "הזכויות, הקבוצה, טופס 3010 והמעקב — בעמוד ייעודי" : "Rights, group, Form 3010 and tracking — on a dedicated page"}
    >
      <Link
        href="/miluim"
        className="inline-flex items-center gap-1.5 rounded-lg bg-foreground/8 px-3 py-2 text-sm font-medium text-foreground/75 transition-colors hover:bg-foreground/15"
      >
        <Shield className="size-4" />
        {isHe ? "לעמוד המילואים" : "Open the Miluim page"}
      </Link>
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
        <MiluimLinkCard />
        <ApiKeySection />
        <CohortWisdomSection />
        <PersonaSection />
        <GoogleCalendarSection />
        <AppearanceSection />
        <FeedbackSection />
        <AccountSection />
      </div>
    </div>
  );
}
