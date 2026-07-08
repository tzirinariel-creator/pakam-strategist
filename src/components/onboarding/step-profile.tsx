"use client";

import { useState, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Shield, ChevronDown, Swords, Check, BadgeCheck, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { Bidi } from "@/lib/bidi";
import { MILUIM_CONFIG, AMIRNET_CONFIG, ENGLISH_CONFIG, DISCIPLINE_CONFIG, FOCUS_DISCIPLINE_IDS } from "@/lib/constants";
import { deriveGroupFromDays, type MiluimGroupKey } from "@/lib/miluim";
import type { OnboardingData } from "./onboarding-wizard";

interface StepProfileProps {
  data: OnboardingData;
  onUpdate: (updates: Partial<OnboardingData>) => void;
}

// The miluim group is derived from days served + combat status via the shared
// pure logic in lib/miluim.ts (single source of truth). Per מתווה תשפ"ו
// (docs/pakam-domain-rules-2026.md §6). Alias kept for local readability.
const deriveGroup = deriveGroupFromDays;

export function StepProfile({ data, onUpdate }: StepProfileProps) {
  const t = useTranslations("onboarding");
  const tm = useTranslations("onboarding.miluim");
  const locale = useLocale();
  const isHe = locale === "he";

  const hasGroup = data.miluimGroup !== "NONE";
  const [showMiluimDetails, setShowMiluimDetails] = useState(hasGroup);
  // Common-path question state.
  const [served, setServed] = useState<boolean | null>(hasGroup ? true : null);
  const [days, setDays] = useState<number | null>(null);
  const [isCombat, setIsCombat] = useState(false);
  // Secondary panels.
  const [showSpecialCases, setShowSpecialCases] = useState(false);
  const [showManualSelect, setShowManualSelect] = useState(false);

  const derivedGroup = useMemo(
    () => deriveGroup(days ?? 0, isCombat),
    [days, isCombat]
  );

  // Keep data.miluimGroup in sync with the common-path derivation.
  const applyDerived = (g: MiluimGroupKey) => {
    onUpdate({ miluimGroup: g });
  };

  // Explicitly picking a group (a special case like career-service, or the
  // manual selector) overrides the day model. Clear the day inputs too — else a
  // day count entered earlier would re-derive a different group on save and
  // silently win over the explicit choice (audit #12).
  const setExplicitGroup = (g: MiluimGroupKey, career = false) => {
    setDays(null);
    setIsCombat(false);
    onUpdate({ miluimGroup: g, miluimDays: null, miluimCombat: false, miluimCareerService: career });
  };

  const yearOptions = [
    { value: 1, label: t("yearA") },
    { value: 2, label: t("yearB") },
    { value: 3, label: t("yearC") },
  ] as const;

  const semesterOptions = [
    { value: "FALL" as const, label: t("semesterA") },
    { value: "SPRING" as const, label: t("semesterB") },
  ] as const;

  const focusOptions = [
    ...FOCUS_DISCIPLINE_IDS.map((id) => {
      const cfg = DISCIPLINE_CONFIG[id]!;
      return {
        value: id as string | null,
        label: isHe ? cfg.nameHe : cfg.nameEn,
        glowClass: cfg.glowClass,
        borderClass: cfg.borderClass,
        // /20 (was /10) so the selected fill actually reads — at /10 the wash was
        // nearly invisible and you couldn't tell you'd picked it (#8).
        bgClass: `${cfg.bgClass}/20`,
        textClass: cfg.textClass,
      };
    }),
    {
      value: null as string | null,
      label: t("undecided"),
      glowClass: "",
      borderClass: "border-foreground/20",
      bgClass: "bg-foreground/5",
      textClass: "text-foreground/60",
    },
  ];

  // Amirnet / Psychometric English status label
  const getAmirnetStatus = (score: number | null) => {
    if (score == null) return null;
    if (score >= AMIRNET_CONFIG.EXEMPT_THRESHOLD) {
      return {
        text: isHe ? "פטור! עדיין צריך 2 קורסי תוכן באנגלית" : "Exempt! Still need 2 English content courses",
        detail: isHe ? "ציון 134+ — פטור מקורסי שפה, נדרשים 2 קורסים אקדמיים באנגלית" : "Score 134+ — exempt from language courses, 2 academic English courses required",
        color: "text-emerald-500",
      };
    }
    if (score >= AMIRNET_CONFIG.ADVANCED_B_THRESHOLD) {
      return {
        text: isHe ? "מתקדמים ב׳ — קורס שפה + 2 קורסי תוכן" : "Advanced B — 1 language + 2 content courses",
        detail: isHe ? "ציון 120-133 — קורס שפה אחד + 2 קורסים אקדמיים באנגלית" : "Score 120-133 — 1 language course + 2 academic English courses",
        color: "text-blue-400",
      };
    }
    if (score >= AMIRNET_CONFIG.ADVANCED_A_THRESHOLD) {
      return {
        text: isHe ? "מתקדמים א׳ — 2 קורסי שפה" : "Advanced A — 2 language courses",
        detail: isHe ? "ציון 100-119 — 2 קורסי אנגלית (רמת הקבלה המינימלית)" : "Score 100-119 — 2 English courses (minimum admission level)",
        color: "text-amber-500",
      };
    }
    if (score >= AMIRNET_CONFIG.BASIC_THRESHOLD) {
      return {
        text: isHe ? "בסיסי — 3 קורסי שפה" : "Basic — 3 language courses",
        detail: isHe ? "ציון 85-99 — 3 קורסי אנגלית נדרשים" : "Score 85-99 — 3 English courses required",
        color: "text-orange-400",
      };
    }
    return {
      text: isHe ? "טרום בסיסי — 4-5 קורסי שפה" : "Pre-basic — 4-5 language courses",
      detail: isHe ? "ציון מתחת ל-85 — מחייב 4-5 קורסי אנגלית" : "Score below 85 — requires 4-5 English courses",
      color: "text-red-400",
    };
  };

  const amirnetStatus = getAmirnetStatus(data.amirantScore);

  const groupCfg = hasGroup
    ? MILUIM_CONFIG.GROUPS[data.miluimGroup as MiluimGroupKey]
    : null;
  const exemptionShown = groupCfg
    ? Math.min(groupCfg.creditExemptionPerYear, MILUIM_CONFIG.MAX_CREDIT_EXEMPTIONS_DEGREE)
    : 0;

  return (
    <div className="flex flex-col items-center">
      {/* Header */}
      <div className="animate-stagger-1 text-center">
        <h2 className="font-display font-bold text-2xl text-foreground/90">
          {t("quickProfile")}
        </h2>
        <p className="mt-2 text-foreground/50">{t("quickProfileDesc")}</p>
      </div>

      <div className="mt-8 w-full max-w-xl space-y-6">
        {/* Personal address — name + gender, so the whole app talks to the
            student personally and in the right gender. Both optional. */}
        <div className="animate-stagger-1">
          <h3 className="mb-1 text-sm font-medium text-foreground/70">
            {t("personalTitle")}
          </h3>
          <p className="mb-3 text-xs text-foreground/40">{t("personalHint")}</p>
          <input
            type="text"
            value={data.firstName ?? ""}
            onChange={(e) => onUpdate({ firstName: e.target.value || null })}
            placeholder={t("firstNamePlaceholder")}
            maxLength={50}
            className="w-full rounded-xl border-2 border-border bg-card px-4 py-3 text-sm text-foreground/80 outline-none transition-colors focus:border-foreground/40"
          />
          <div className="mt-3 grid grid-cols-2 gap-3">
            {([
              { value: "female" as const, label: t("genderFemale") },
              { value: "male" as const, label: t("genderMale") },
            ]).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onUpdate({ gender: option.value })}
                className={cn(
                  "rounded-xl border-2 px-4 py-2.5 text-sm font-medium transition-all",
                  data.gender === option.value
                    ? "border-foreground bg-foreground/10 text-foreground/80 shadow-sm"
                    : "border-border bg-card text-foreground/60 hover:border-foreground/30"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Year selection */}
        <div className="animate-stagger-2">
          <h3 className="mb-3 text-sm font-medium text-foreground/70">
            {t("yourYear")}
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {yearOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => onUpdate({ year: option.value })}
                className={cn(
                  "rounded-xl border-2 px-4 py-3 text-sm font-medium transition-all",
                  data.year === option.value
                    ? "border-foreground bg-foreground/10 text-foreground/80 shadow-sm"
                    : "border-border bg-card text-foreground/60 hover:border-foreground/30"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Semester selection */}
        <div className="animate-stagger-3">
          <h3 className="mb-3 text-sm font-medium text-foreground/70">
            {t("yourSemester")}
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {semesterOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => onUpdate({ semester: option.value })}
                className={cn(
                  "rounded-xl border-2 px-4 py-3 text-sm font-medium transition-all",
                  data.semester === option.value
                    ? "border-foreground bg-foreground/10 text-foreground/80 shadow-sm"
                    : "border-border bg-card text-foreground/60 hover:border-foreground/30"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Focus area selection */}
        <div className="animate-stagger-4">
          <h3 className="mb-1 text-sm font-medium text-foreground/70">
            {t("yourFocus")}
          </h3>
          <p className="mb-3 text-xs text-foreground/40">
            {t("focusHint")}
          </p>
          <div className="grid grid-cols-2 gap-3">
            {focusOptions.map((option) => {
              const isSelected = data.focusArea === option.value;
              return (
                <button
                  key={option.value ?? "undecided"}
                  onClick={() => onUpdate({ focusArea: option.value })}
                  aria-pressed={isSelected}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-xl border-2 px-4 py-3.5 text-sm font-medium transition-all",
                    isSelected
                      ? cn(option.borderClass, option.bgClass, option.textClass, option.glowClass, "scale-[1.02] font-semibold shadow-sm")
                      : "border-border bg-card text-foreground/60 hover:border-foreground/20"
                  )}
                >
                  {isSelected && <Check className="h-3.5 w-3.5 shrink-0" />}
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ──────── Miluim (military reserve) section ──────── */}
        <div className="animate-stagger-4">
          <h3 className="mb-1 text-sm font-medium text-foreground/70">
            {tm("sectionTitle")}
          </h3>
          <p className="mb-3 text-xs text-foreground/40">{tm("optionalHint")}</p>

          {/* Collapsed entry button */}
          <button
            onClick={() => setShowMiluimDetails((v) => !v)}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3.5 text-sm font-medium transition-all",
              showMiluimDetails || hasGroup
                ? "border-emerald-500/40 bg-emerald-500/5 text-foreground/80"
                : "border-border bg-card text-foreground/60 hover:border-foreground/30"
            )}
          >
            <Shield className={cn(
              "h-5 w-5 shrink-0",
              showMiluimDetails || hasGroup ? "text-emerald-500" : "text-foreground/40"
            )} />
            <div className="flex-1 text-start">
              <span className="block">
                {hasGroup
                  ? groupCfg?.nameHe?.split("—")[0]?.trim()
                  : tm("collapsedPromptNone")}
              </span>
            </div>
            {hasGroup && exemptionShown > 0 && (
              <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-500">
                {tm("collapsedExempt", { credits: exemptionShown })}
              </span>
            )}
            <ChevronDown className={cn(
              "h-4 w-4 shrink-0 text-foreground/30 transition-transform",
              showMiluimDetails && "rotate-180"
            )} />
          </button>

          {showMiluimDetails && (
            <div className="mt-3 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">

              {/* ─── COMMON PATH: one short question block ─── */}
              <div className="rounded-xl border border-foreground/10 bg-foreground/3 p-3 space-y-3">
                {/* Q1: did you serve this year? */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-foreground/60">{tm("q1")}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setServed(true)}
                      className={cn(
                        "rounded-lg border px-3 py-2.5 text-xs transition-all",
                        served === true
                          ? "border-emerald-500/40 bg-emerald-500/5 text-foreground/80 font-medium"
                          : "border-foreground/15 bg-card text-foreground/60 hover:border-foreground/30"
                      )}
                    >
                      {tm("q1Yes")}
                    </button>
                    <button
                      onClick={() => {
                        setServed(false);
                        setDays(null);
                        setIsCombat(false);
                        onUpdate({ miluimGroup: "NONE", miluimDays: null, miluimCombat: false, miluimCareerService: false });
                      }}
                      className={cn(
                        "rounded-lg border px-3 py-2.5 text-xs transition-all",
                        served === false
                          ? "border-foreground/30 bg-foreground/10 text-foreground/70 font-medium"
                          : "border-foreground/15 bg-card text-foreground/60 hover:border-foreground/30"
                      )}
                    >
                      {tm("q1No")}
                    </button>
                  </div>
                </div>

                {/* Q2 + Q3: only when served === true */}
                {served === true && (
                  <div className="space-y-3 animate-in fade-in duration-200">
                    {/* Days */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-foreground/60">{tm("q2Days")}</label>
                      <input
                        type="number"
                        min={0}
                        max={365}
                        value={days ?? ""}
                        onChange={(e) => {
                          const v = e.target.value === "" ? null : parseInt(e.target.value, 10);
                          setDays(v);
                          applyDerived(deriveGroup(v ?? 0, isCombat));
                          // Day-derived path → never career service; clear the flag.
                          onUpdate({ miluimDays: v, miluimCombat: isCombat, miluimCareerService: false });
                        }}
                        placeholder={tm("q2DaysPlaceholder")}
                        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-foreground/25 focus:border-foreground/30 focus:outline-none transition-colors"
                      />
                      <p className="text-xs text-foreground/30">{tm("q2DaysHint")}</p>
                    </div>

                    {/* Combat */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-foreground/60">{tm("q3Combat")}</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => {
                            setIsCombat(true);
                            applyDerived(deriveGroup(days ?? 0, true));
                            onUpdate({ miluimDays: days, miluimCombat: true, miluimCareerService: false });
                          }}
                          className={cn(
                            "flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs transition-all",
                            isCombat
                              ? "border-amber-500/40 bg-amber-500/5 text-amber-600 font-medium"
                              : "border-foreground/15 bg-card text-foreground/60 hover:border-foreground/30"
                          )}
                        >
                          <Swords className="h-3 w-3" />
                          {tm("q3CombatYes")}
                        </button>
                        <button
                          onClick={() => {
                            setIsCombat(false);
                            applyDerived(deriveGroup(days ?? 0, false));
                            onUpdate({ miluimDays: days, miluimCombat: false, miluimCareerService: false });
                          }}
                          className={cn(
                            "rounded-lg border px-3 py-2 text-xs transition-all",
                            !isCombat && days != null
                              ? "border-foreground/30 bg-foreground/10 text-foreground/70 font-medium"
                              : "border-foreground/15 bg-card text-foreground/60 hover:border-foreground/30"
                          )}
                        >
                          {tm("q3CombatNo")}
                        </button>
                      </div>
                    </div>

                    {/* Result */}
                    {derivedGroup !== "NONE" && (days ?? 0) > 0 && (
                      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2.5 animate-in fade-in duration-200">
                        <p className="text-xs font-medium text-emerald-500">{tm("resultTitle")}</p>
                        <p className="mt-1 text-sm font-bold text-foreground/80">
                          <Bidi
                            text={
                              isHe
                                ? MILUIM_CONFIG.GROUPS[derivedGroup].nameHe
                                : MILUIM_CONFIG.GROUPS[derivedGroup].nameEn
                            }
                          />
                        </p>
                        <p className="mt-0.5 text-[11px] text-foreground/45">
                          {tm("resultExemption", {
                            credits: Math.min(
                              MILUIM_CONFIG.GROUPS[derivedGroup].creditExemptionPerYear,
                              MILUIM_CONFIG.MAX_CREDIT_EXEMPTIONS_DEGREE
                            ),
                          })}
                        </p>
                        <p className="mt-1.5 text-xs text-foreground/30">{tm("editLater")}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ─── Special cases (edge cases, behind a link) ─── */}
              <div>
                <button
                  onClick={() => setShowSpecialCases((v) => !v)}
                  className="flex w-full items-center gap-1.5 text-[11px] text-foreground/40 hover:text-foreground/60 transition-colors"
                >
                  <ChevronDown className={cn("h-3 w-3 transition-transform", showSpecialCases && "rotate-180")} />
                  {tm("specialCasesToggle")}
                </button>
                {showSpecialCases && (
                  <div className="mt-2 space-y-1.5 animate-in fade-in duration-200">
                    <p className="text-xs text-foreground/30"><Bidi text={tm("specialCasesHint")} /></p>
                    {/* 300+ */}
                    <button
                      onClick={() => setExplicitGroup("GROUP_C")}
                      className="w-full rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-start text-[11px] text-foreground/60 hover:border-amber-500/30 transition-all"
                    >
                      <span className="flex items-center gap-1.5 font-medium text-amber-500">
                        <Swords className="h-3 w-3" />
                        <Bidi text={tm("special300")} />
                      </span>
                      <span className="block mt-0.5 text-foreground/30">{tm("special300Desc")}</span>
                    </button>
                    {/* Career service in a service-track program → Group C
                        (owner-confirmed 4.7). A career soldier isn't a "300+
                        combat days" case, so they get their own explicit path. */}
                    <button
                      onClick={() => setExplicitGroup("GROUP_C", true)}
                      className="w-full rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-start text-[11px] text-foreground/60 hover:border-amber-500/30 transition-all"
                    >
                      <span className="flex items-center gap-1.5 font-medium text-amber-500">
                        <Shield className="h-3 w-3" />
                        <Bidi text={tm("specialCareer")} />
                      </span>
                      <span className="block mt-0.5 text-foreground/30">{tm("specialCareerDesc")}</span>
                    </button>
                    {/* Bereaved → G */}
                    <button
                      onClick={() => setExplicitGroup("GROUP_G")}
                      className="w-full rounded-lg border border-foreground/15 bg-card px-3 py-2 text-start text-[11px] text-foreground/60 hover:border-foreground/30 transition-all"
                    >
                      <span className="font-medium">{tm("specialBereaved")}</span>
                      <span className="block text-foreground/30">{tm("specialBereavedDesc")}</span>
                    </button>
                    {/* Wounded → G */}
                    <button
                      onClick={() => setExplicitGroup("GROUP_G")}
                      className="w-full rounded-lg border border-foreground/15 bg-card px-3 py-2 text-start text-[11px] text-foreground/60 hover:border-foreground/30 transition-all"
                    >
                      <span className="font-medium">{tm("specialWounded")}</span>
                      <span className="block text-foreground/30">{tm("specialWoundedDesc")}</span>
                    </button>
                    {/* Spouse → B (depends on partner; B as a sensible default, refine manually) */}
                    <button
                      onClick={() => setExplicitGroup("GROUP_B")}
                      className="w-full rounded-lg border border-foreground/15 bg-card px-3 py-2 text-start text-[11px] text-foreground/60 hover:border-foreground/30 transition-all"
                    >
                      <span className="font-medium">{tm("specialSpouse")}</span>
                      <span className="block text-foreground/30">{tm("specialSpouseDesc")}</span>
                    </button>
                    {/* Retroactive / regular-army front-line → opens manual select */}
                    <button
                      onClick={() => setShowManualSelect(true)}
                      className="w-full rounded-lg border border-foreground/10 bg-foreground/3 px-3 py-2 text-start text-[11px] text-foreground/50 hover:border-foreground/20 transition-all"
                    >
                      <span className="font-medium">{tm("specialRetro")}</span>
                      <span className="block text-foreground/30"><Bidi text={tm("specialRetroDesc")} /></span>
                    </button>
                  </div>
                )}
              </div>

              {/* ─── Manual group selector (secondary) ─── */}
              <div>
                <button
                  onClick={() => setShowManualSelect((v) => !v)}
                  className="flex w-full items-center gap-1.5 text-[11px] text-foreground/40 hover:text-foreground/60 transition-colors"
                >
                  <ChevronDown className={cn("h-3 w-3 transition-transform", showManualSelect && "rotate-180")} />
                  {tm("changeManually")}
                </button>
                {showManualSelect && (
                  <div className="mt-2 grid grid-cols-1 gap-2 animate-in fade-in duration-200">
                    {(Object.keys(MILUIM_CONFIG.GROUPS) as MiluimGroupKey[]).map((groupKey) => {
                      const group = MILUIM_CONFIG.GROUPS[groupKey];
                      const isSelected = data.miluimGroup === groupKey;
                      return (
                        <button
                          key={groupKey}
                          onClick={() => setExplicitGroup(groupKey)}
                          className={cn(
                            "rounded-xl border-2 px-4 py-2.5 text-start text-sm transition-all",
                            isSelected
                              ? "border-foreground bg-foreground/10 text-foreground/80 shadow-sm"
                              : "border-border bg-card text-foreground/60 hover:border-foreground/30"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium"><Bidi text={isHe ? group.nameHe : group.nameEn} /></span>
                            {groupKey !== "NONE" && (
                              <span className="rounded-full bg-foreground/5 px-1.5 py-0.5 text-[10px] font-mono text-foreground/40">
                                {Math.min(group.creditExemptionPerYear, MILUIM_CONFIG.MAX_CREDIT_EXEMPTIONS_DEGREE)} {isHe ? "ש״ס" : "cr."}
                              </span>
                            )}
                          </div>
                          {group.descHe && (
                            <span className="block mt-0.5 text-xs text-foreground/40">
                              {isHe ? group.descHe : group.descEn}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ─── BENEFITS: split into two clearly-labeled groups ─── */}
              {hasGroup && groupCfg && (
                <div className="space-y-3">
                  {/* (1) Auto-applied — the exemption */}
                  <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <BadgeCheck className="h-3.5 w-3.5 text-emerald-500" />
                      <p className="text-xs font-semibold text-emerald-600">{tm("appliedTitle")}</p>
                    </div>
                    <p className="text-[11px] text-foreground/40 mb-2">{tm("appliedSubtitle")}</p>
                    <div className="flex items-start gap-1.5 text-[11px] text-foreground/60">
                      <Check className="h-3 w-3 text-emerald-400 mt-0.5 shrink-0" />
                      <span>{tm("appliedExemption", { credits: exemptionShown })}</span>
                    </div>
                  </div>

                  {/* (2) Entitlements — claimed with the secretariat */}
                  <div className="rounded-xl border border-foreground/12 bg-foreground/3 p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-foreground/50" />
                        <p className="text-xs font-semibold text-foreground/70">{tm("entitlementsTitle")}</p>
                      </div>
                      <span className="rounded-full bg-foreground/5 px-2 py-0.5 text-[11px] font-medium text-foreground/40">
                        {tm("asof")}
                      </span>
                    </div>
                    <p className="text-[11px] text-foreground/40 mb-2">{tm("entitlementsSubtitle")}</p>
                    <ul className="space-y-2">
                      {buildEntitlements(data.miluimGroup as MiluimGroupKey, tm).map((ent) => (
                        <li key={ent.key} className="flex items-start gap-1.5">
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/25" />
                          <div className="leading-snug">
                            <span className="text-[11px] font-medium text-foreground/70"><Bidi text={ent.title} /></span>
                            <span className="block text-xs text-foreground/40"><Bidi text={ent.desc} /></span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Amirnet / Psychometric English score section */}
        <div className="animate-stagger-4">
          <h3 className="mb-2 text-sm font-medium text-foreground/70">
            {isHe ? "ציון אמירנט / פסיכומטרי אנגלית" : "AMIRANT / Psychometric English Score"}
          </h3>
          <p className="mb-3 text-xs text-foreground/40">
            {isHe
              ? <Bidi text={"הציון קובע כמה קורסי אנגלית תצטרכו. הסולם 50-150 זהה לאמירנט ולפסיכומטרי. בפכ״מ נדרשים 2 קורסי תוכן באנגלית בכל מקרה."} />
              : "Determines how many English courses you need. The 50-150 scale is shared by AMIRANT and Psychometric. PPE requires 2 English content courses regardless."
            }
          </p>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={50}
              max={150}
              value={data.amirantScore ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                onUpdate({ amirantScore: val === "" ? null : parseInt(val, 10) });
              }}
              placeholder={isHe ? "למשל: 134" : "e.g. 134"}
              className="w-32 rounded-xl border-2 border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/30 focus:border-foreground/30 focus:outline-none transition-colors"
            />
            {amirnetStatus && (
              <span className={cn("text-xs font-medium", amirnetStatus.color)}>
                <Bidi text={amirnetStatus.text} />
              </span>
            )}
          </div>
          {amirnetStatus?.detail && (
            <p className={cn("mt-1.5 text-xs", amirnetStatus.color.replace("text-", "text-") + "/70")}>
              <Bidi text={amirnetStatus.detail} />
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-foreground/30">
            <span><Bidi text={isHe ? "134+ = פטור" : "134+ = exempt"} /></span>
            <span><Bidi text={isHe ? "120-133 = מתקדמים ב׳" : "120-133 = adv. B"} /></span>
            <span><Bidi text={isHe ? "100-119 = מתקדמים א׳" : "100-119 = adv. A"} /></span>
            <span><Bidi text={isHe ? "85-99 = בסיסי" : "85-99 = basic"} /></span>
          </div>

          {/* #23 — a student who knows their LEVEL (as printed on the grade sheet
              with no number) but not their score can pick it directly. It wins
              over the score everywhere, so the English rules still fire. */}
          <div className="mt-4">
            <label htmlFor="onboarding-english-level" className="mb-1.5 block text-xs text-foreground/50">
              {isHe
                ? "לא יודעים את הציון? בחרו את הרמה מהגיליון (למשל “מתקדמים ב׳”)"
                : "Don't know the score? Pick your level from the grade sheet"}
            </label>
            <select
              id="onboarding-english-level"
              value={data.englishLevel ?? ""}
              onChange={(e) => onUpdate({ englishLevel: e.target.value || null })}
              className="w-full max-w-xs rounded-xl border-2 border-border bg-card px-4 py-2.5 text-sm text-foreground focus:border-foreground/30 focus:outline-none transition-colors"
            >
              <option value="">{isHe ? "לא יודע/לפי הציון" : "Not sure / use score"}</option>
              {ENGLISH_CONFIG.LEVELS.map((lvl) => (
                <option key={lvl.level} value={lvl.level}>
                  {isHe ? lvl.nameHe : lvl.nameEn}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Per-group "entitlements you claim" list, sourced from the group's flags in
 * MILUIM_CONFIG (which mirror docs/pakam-domain-rules-2026.md §6 Layer B).
 * The credit exemption is intentionally NOT here — it's the one auto-applied item.
 */
function buildEntitlements(
  group: MiluimGroupKey,
  tm: (key: string) => string
): { key: string; title: string; desc: string }[] {
  const cfg = MILUIM_CONFIG.GROUPS[group];
  const out: { key: string; title: string; desc: string }[] = [];

  if (cfg.examChoice2of3) {
    out.push({ key: "examDates", title: tm("entExamDates"), desc: tm("entExamDatesDesc") });
  }
  if (cfg.examTimeBonus > 0) {
    out.push({ key: "examTime", title: tm("entExamTime"), desc: tm("entExamTimeDesc") });
  }
  if (cfg.biddingBonus > 0) {
    out.push({ key: "bidding", title: tm("entBidding"), desc: tm("entBiddingDesc") });
  }
  // Binary conversion: B/C have binaryGradePerYear; G converts 6 credits.
  if (cfg.binaryGradePerYear > 0 || group === "GROUP_G") {
    out.push({ key: "binary", title: tm("entBinary"), desc: tm("entBinaryDesc") });
  }
  if (cfg.attendanceExempt) {
    out.push({ key: "attendance", title: tm("entAttendance"), desc: tm("entAttendanceDesc") });
  }
  // Tuition-drag waiver: a Group-C specific completion benefit.
  if (group === "GROUP_C") {
    out.push({ key: "tuition", title: tm("entTuition"), desc: tm("entTuitionDesc") });
  }
  // Recordings: available to all groups that have any benefit.
  out.push({ key: "recordings", title: tm("entRecordings"), desc: tm("entRecordingsDesc") });

  return out;
}
