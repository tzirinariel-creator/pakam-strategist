"use client";

import { useState, useEffect } from "react";
import { User, Loader2, Check } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Bidi } from "@/lib/bidi";
import { getAcademicNow, deriveYearOfStudy, hebrewYearLabel } from "@/lib/academic-calendar";
import { DISCIPLINE_CONFIG, FOCUS_DISCIPLINE_IDS, YEAR_CONFIG, ENGLISH_CONFIG } from "@/lib/constants";
import { api } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionCard } from "./section-card";

// ---------------------------------------------------------------
// Profile Section
// ---------------------------------------------------------------

export function ProfileSection() {
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
          {/* The hint carries a numeric range ("50–150"); unisolated it
              reverses to "150–50" inside the RTL paragraph. */}
          <p className="text-xs text-foreground/40">
            <Bidi text={t("amirantScoreHint")} />
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
                  : `By the academic calendar: ${yearName} · ${semName}`}
              </p>
            );
          })()}
        </div>

        {/* Save button */}
        <Button
          onClick={handleSaveProfile}
          disabled={updateMutation.isPending}
          className="self-start"
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
