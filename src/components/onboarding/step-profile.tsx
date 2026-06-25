"use client";

import { useState, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Shield, ChevronDown, HelpCircle, Swords, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { MILUIM_CONFIG, AMIRNET_CONFIG, DISCIPLINE_CONFIG, FOCUS_DISCIPLINE_IDS } from "@/lib/constants";
import type { OnboardingData } from "./onboarding-wizard";

type MiluimGroupKey = keyof typeof MILUIM_CONFIG.GROUPS;

interface StepProfileProps {
  data: OnboardingData;
  onUpdate: (updates: Partial<OnboardingData>) => void;
}

export function StepProfile({ data, onUpdate }: StepProfileProps) {
  const t = useTranslations("onboarding");
  const locale = useLocale();
  const isHe = locale === "he";
  const [showMiluimDetails, setShowMiluimDetails] = useState(data.miluimGroup !== "NONE");
  const [miluimMode, setMiluimMode] = useState<"select" | "guided">("guided");
  const [guidedStep, setGuidedStep] = useState(0);
  // miluimFormFile removed — file upload not implemented for pilot
  const [isCombat, setIsCombat] = useState(false);
  const [daysServedA, setDaysServedA] = useState<number | null>(null); // Days in semester A
  const [daysServedB, setDaysServedB] = useState<number | null>(null); // Days in semester B (including 3 months before)
  const [daysServedPreB, setDaysServedPreB] = useState<number | null>(null); // Days in 3 months before semester B (Dec-Mar)
  // Legacy — kept for computed group logic
  const daysServed = Math.max(daysServedA ?? 0, daysServedB ?? 0);
  const servicePattern: "single_semester" | "year_cumulative" | "pre_semester_b" | null =
    (daysServedA ?? 0) > 0 && (daysServedB ?? 0) > 0
      ? "year_cumulative" as const
      : (daysServedPreB ?? 0) > 0
        ? "pre_semester_b" as const
        : (daysServedA ?? 0) > 0 || (daysServedB ?? 0) > 0
          ? "single_semester" as const
          : null;

  // Compute the correct group based on semester-specific days + combat + pattern
  // Per official מתווה תשפ"ו document — precise rules per group
  // Returns separate groups per semester + best overall group
  const computedGroups = useMemo(() => {
    // Per-semester classification (official doc section 2)
    const classifySemester = (days: number, combat: boolean): MiluimGroupKey => {
      if (days <= 0) return "NONE";
      if (combat) {
        // Combat fighters (per official מתווה תשפ"ו): 21+ → C, 14-20 → B
        if (days >= 21) return "GROUP_C";
        if (days >= 14) return "GROUP_B";
        return "NONE"; // combat <14 days = not eligible
      }
      // Regular reservists
      if (days >= 35) return "GROUP_C";
      if (days >= 21) return "GROUP_B";
      if (days >= 1) return "GROUP_A"; // 1-20 days
      return "NONE";
    };

    const dA = daysServedA ?? 0;
    const dB = daysServedB ?? 0;
    const dPreB = daysServedPreB ?? 0;
    const totalDays = dA + dB;

    const semA = classifySemester(dA, isCombat);
    let semB = classifySemester(dB, isCombat);

    // === Year-cumulative upgrades (regular reservists only) ===

    // 35+ cumulative in year → GROUP_B for semester B (official doc: "35 יום ומעלה במצטבר בשנת תשפ"ו — מזכה בסמ' ב'")
    if (!isCombat && totalDays >= 35) {
      if (groupRank(semB) < groupRank("GROUP_B")) semB = "GROUP_B";
    }

    // 60+ days in 3 months before semester opening → GROUP_B for that semester
    // "60 יום ב-3 החודשים שלפני פתיחת השנה (מזכה בסמ' א' בלבד)"
    // "60 יום לפני סמסטר ב' (מזכה בסמ' ב' בלבד)"
    if (!isCombat && dPreB >= 60) {
      if (groupRank(semB) < groupRank("GROUP_B")) semB = "GROUP_B";
    }

    // 100+ days in sem A → GROUP_C also in sem B
    // "100 ימים ומעלה בסמסטר א' (מזכה גם בסמסטר ב')"
    if (dA >= 100) {
      if (groupRank(semB) < groupRank("GROUP_C")) semB = "GROUP_C";
    }

    // === Combat year-cumulative: 21+ cumulative in year → GROUP_B for sem B only ===
    // "לוחמים: 21 יום ומעלה במצטבר בשנת תשפ"ו (מזכה בסמ' ב' בלבד)"
    if (isCombat && totalDays >= 21) {
      if (groupRank(semB) < groupRank("GROUP_B")) semB = "GROUP_B";
    }

    // === Retroactive: 100+ in previous year (תשפ"ה) → B for sem A (not implemented in input yet) ===

    const overall = groupRank(semA) >= groupRank(semB) ? semA : semB;

    return { semA, semB, overall, totalDays };
  }, [daysServedA, daysServedB, daysServedPreB, isCombat]);

  // Helper: group ranking C > B > A > G > NONE
  function groupRank(g: MiluimGroupKey): number {
    switch (g) {
      case "GROUP_C": return 4;
      case "GROUP_B": return 3;
      case "GROUP_G": return 2;
      case "GROUP_A": return 1;
      default: return 0;
    }
  }

  const computedGroup = computedGroups.overall;

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
        bgClass: `${cfg.bgClass}/10`,
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

  const amirnetStatus = getAmirnetStatus(data.amiramScore);

  return (
    <div className="flex flex-col items-center">
      {/* Header */}
      <div className="animate-stagger-1 text-center">
        <h2 className="font-bold text-2xl text-foreground/90">
          {t("quickProfile")}
        </h2>
        <p className="mt-2 text-foreground/50">{t("quickProfileDesc")}</p>
      </div>

      <div className="mt-8 w-full max-w-xl space-y-6">
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
                  className={cn(
                    "rounded-xl border-2 px-4 py-3.5 text-sm font-medium transition-all",
                    isSelected
                      ? cn(option.borderClass, option.bgClass, option.textClass, option.glowClass)
                      : "border-border bg-card text-foreground/60 hover:border-foreground/20"
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Miluim (military reserve) section */}
        <div className="animate-stagger-4">
          <h3 className="mb-3 text-sm font-medium text-foreground/70">
            {isHe ? "שירות מילואים" : "Military Reserve Service"}
          </h3>
          <button
            onClick={() => setShowMiluimDetails((v) => !v)}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3.5 text-sm font-medium transition-all",
              showMiluimDetails || data.miluimGroup !== "NONE"
                ? "border-emerald-500/40 bg-emerald-500/5 text-foreground/80"
                : "border-border bg-card text-foreground/60 hover:border-foreground/30"
            )}
          >
            <Shield className={cn(
              "h-5 w-5 shrink-0",
              showMiluimDetails || data.miluimGroup !== "NONE"
                ? "text-emerald-500"
                : "text-foreground/40"
            )} />
            <div className="flex-1 text-start">
              <span className="block">
                {data.miluimGroup !== "NONE"
                  ? MILUIM_CONFIG.GROUPS[data.miluimGroup as MiluimGroupKey]?.nameHe?.split("—")[0]?.trim()
                  : isHe ? "שירתת במילואים? לחצו כאן" : "Served in reserves? Click here"
                }
              </span>
              {data.miluimGroup === "NONE" && (
                <span className="block text-[11px] text-foreground/35 mt-0.5">
                  {isHe ? "בדקו אם מגיעות לכם הקלות לפי מתווה תשפ״ו" : "Check if you qualify for accommodations under the תשפ\"ו framework"}
                </span>
              )}
            </div>
            {data.miluimGroup !== "NONE" && (
              <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold text-emerald-500">
                {MILUIM_CONFIG.GROUPS[data.miluimGroup as MiluimGroupKey]?.creditExemptionPerYear} {isHe ? "ש״ס פטור" : "cr. exempt"}
              </span>
            )}
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-foreground/30 transition-transform",
                showMiluimDetails && "rotate-180"
              )}
            />
          </button>

          {showMiluimDetails && (
            <div className="mt-3 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
              <p className="text-xs text-foreground/40">
                {isHe
                  ? "לפי מתווה תשפ״ו — שיוך הקבוצה נקבע על פי מספר ימי השירות בסמסטר ולפי סוג השירות (לוחם/ת או לא). ההטבות כוללות פטור ש״ס, מועדי בחינה, ועוד."
                  : "Per תשפ\"ו framework — group assignment is based on reserve days per semester and service type (combat/non-combat). Benefits include credit exemptions, exam dates, and more."
                }
              </p>

              {/* Mode toggle: Guided vs Direct */}
              <div className="flex gap-2">
                <button
                  onClick={() => { setMiluimMode("guided"); setGuidedStep(0); }}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs transition-all",
                    miluimMode === "guided"
                      ? "bg-foreground/10 text-foreground/70 font-medium"
                      : "bg-foreground/3 text-foreground/35 hover:bg-foreground/5"
                  )}
                >
                  <HelpCircle className="h-3 w-3" />
                  {isHe ? "שאלון קצר" : "Quick questionnaire"}
                </button>
                <button
                  onClick={() => setMiluimMode("select")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs transition-all",
                    miluimMode === "select"
                      ? "bg-foreground/10 text-foreground/70 font-medium"
                      : "bg-foreground/3 text-foreground/35 hover:bg-foreground/5"
                  )}
                >
                  <Shield className="h-3 w-3" />
                  {isHe ? "אני יודע/ת את הקבוצה" : "I know my group"}
                </button>
              </div>

              {/* ──── Guided flow — step-by-step based on official framework ──── */}
              {miluimMode === "guided" && (
                <div className="rounded-xl border border-foreground/10 bg-foreground/3 p-3 space-y-3 animate-in fade-in duration-200">

                  {/* Step 0: Did you serve? */}
                  {guidedStep === 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-foreground/60">
                        {isHe ? "האם שירתת במילואים במהלך שנת הלימודים תשפ״ו?" : "Did you serve in reserves during the תשפ\"ו academic year?"}
                      </p>
                      <p className="text-[10px] text-foreground/30">
                        {isHe ? "(סמ׳ א׳: 26.10.25-13.3.26 | סמ׳ ב׳: 15.3.26-16.10.26)" : "(Sem A: 26.10.25-13.3.26 | Sem B: 15.3.26-16.10.26)"}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => setGuidedStep(1)}
                          className="rounded-lg border border-foreground/15 bg-card px-3 py-2.5 text-xs text-foreground/60 hover:border-foreground/30 transition-all"
                        >
                          {isHe ? "כן, שירתתי" : "Yes, I served"}
                        </button>
                        <button
                          onClick={() => setGuidedStep(5)}
                          className="rounded-lg border border-foreground/15 bg-card px-3 py-2.5 text-xs text-foreground/60 hover:border-foreground/30 transition-all"
                        >
                          {isHe ? "לא שירתתי" : "No service"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Step 1: Combat status */}
                  {guidedStep === 1 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-foreground/60">
                        {isHe ? "האם שירתת בייעוד קדמי (לוחם/ת)?" : "Did you serve in a front-line (combat) designation?"}
                      </p>
                      <p className="text-[10px] text-foreground/30">
                        {isHe
                          ? "לוחמים זכאים לשיוך מיטיב — קבוצה גבוהה יותר גם עם פחות ימים"
                          : "Combat soldiers get enhanced group mapping — higher group with fewer days"}
                      </p>
                      <div className="grid grid-cols-1 gap-2">
                        <button
                          onClick={() => { setIsCombat(true); setGuidedStep(2); }}
                          className="flex items-center justify-center gap-1.5 rounded-lg border border-foreground/15 bg-card px-3 py-2.5 text-xs text-foreground/60 hover:border-foreground/30 transition-all"
                        >
                          <Swords className="h-3 w-3" />
                          {isHe ? "כן, לוחם/ת" : "Yes, combat"}
                        </button>
                        <button
                          onClick={() => { setIsCombat(false); setGuidedStep(2); }}
                          className="rounded-lg border border-foreground/15 bg-card px-3 py-2.5 text-xs text-foreground/60 hover:border-foreground/30 transition-all"
                        >
                          {isHe ? "לא, תפקיד אחר" : "No, other role"}
                        </button>
                        {/* 300+ fighters shortcut */}
                        <button
                          onClick={() => {
                            setIsCombat(true);
                            onUpdate({ miluimGroup: "GROUP_C" });
                            setGuidedStep(4);
                          }}
                          className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-start text-[11px] text-foreground/60 hover:border-amber-500/30 transition-all"
                        >
                          <span className="flex items-center gap-1.5 font-medium text-amber-500">
                            <Swords className="h-3 w-3" />
                            {isHe ? "לוחם/ת 300+ ימים מאז 7.10.23" : "300+ days combat since 7.10.23"}
                          </span>
                          <span className="block mt-0.5 text-foreground/30">
                            {isHe ? "קבוצה C אוטומטית — תמיכה מלאה עד סוף התואר" : "Automatic Group C — full support through degree"}
                          </span>
                        </button>
                        {/* קבע ייעודי-קדמי */}
                        <button
                          onClick={() => {
                            onUpdate({ miluimGroup: "GROUP_C" });
                            setGuidedStep(4);
                          }}
                          className="rounded-lg border border-foreground/10 bg-foreground/3 px-3 py-2 text-start text-[11px] text-foreground/50 hover:border-foreground/20 transition-all"
                        >
                          <span className="font-medium">{isHe ? "קבע ייעודי-קדמי" : "Front-line regular army"}</span>
                          <span className="block text-foreground/30">{isHe ? "שייך אוטומטית לקבוצה C" : "Automatically assigned to Group C"}</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Step 2: Semester-aware days input */}
                  {guidedStep === 2 && (
                    <div className="space-y-3">
                      <p className="text-xs font-medium text-foreground/60">
                        {isHe ? "כמה ימי מילואים שירתת בכל סמסטר?" : "How many reserve days per semester?"}
                      </p>
                      <p className="text-[10px] text-foreground/30">
                        {isHe
                          ? "הזינו את מספר הימים בכל תקופה בנפרד — המערכת תחשב את הקבוצה המיטיבה ביותר"
                          : "Enter days per period — the system will compute the best group automatically"}
                      </p>

                      {isCombat && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-500">
                          <Swords className="h-2.5 w-2.5" />
                          {isHe ? "לוחם/ת — שיוך מיטיב" : "Combat — enhanced mapping"}
                        </span>
                      )}

                      {/* Semester A */}
                      <div className="rounded-lg border border-foreground/10 bg-card/50 p-2.5 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-medium text-foreground/50">
                            {isHe ? "סמסטר א׳" : "Semester A"}
                          </label>
                          <span className="text-[9px] text-foreground/25 font-mono">26.10.25 – 13.3.26</span>
                        </div>
                        <input
                          type="number"
                          min={0}
                          max={180}
                          value={daysServedA ?? ""}
                          onChange={(e) => setDaysServedA(e.target.value === "" ? null : parseInt(e.target.value, 10))}
                          placeholder={isHe ? "ימים בסמ׳ א׳ (0 אם לא שירתת)" : "Days in Sem A (0 if none)"}
                          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-foreground/25 focus:border-foreground/30 focus:outline-none transition-colors"
                        />
                        {(daysServedA ?? 0) > 0 && computedGroups.semA !== "NONE" && (
                          <p className="text-[10px] text-emerald-500/70">
                            → {MILUIM_CONFIG.GROUPS[computedGroups.semA]?.nameHe?.split("—")[0]?.trim()} {isHe ? "בסמ׳ א׳" : "in Sem A"}
                          </p>
                        )}
                      </div>

                      {/* Semester B */}
                      <div className="rounded-lg border border-foreground/10 bg-card/50 p-2.5 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-medium text-foreground/50">
                            {isHe ? "סמסטר ב׳" : "Semester B"}
                          </label>
                          <span className="text-[9px] text-foreground/25 font-mono">15.3.26 – 16.10.26</span>
                        </div>
                        <input
                          type="number"
                          min={0}
                          max={180}
                          value={daysServedB ?? ""}
                          onChange={(e) => setDaysServedB(e.target.value === "" ? null : parseInt(e.target.value, 10))}
                          placeholder={isHe ? "ימים בסמ׳ ב׳ (0 אם לא שירתת)" : "Days in Sem B (0 if none)"}
                          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-foreground/25 focus:border-foreground/30 focus:outline-none transition-colors"
                        />
                        {(daysServedB ?? 0) > 0 && computedGroups.semB !== "NONE" && (
                          <p className="text-[10px] text-emerald-500/70">
                            → {MILUIM_CONFIG.GROUPS[computedGroups.semB]?.nameHe?.split("—")[0]?.trim()} {isHe ? "בסמ׳ ב׳" : "in Sem B"}
                          </p>
                        )}
                      </div>

                      {/* Optional: Pre-semester B service (3 months before) — advanced */}
                      {!isCombat && (
                        <details className="group">
                          <summary className="text-[10px] text-foreground/30 cursor-pointer hover:text-foreground/50 transition-colors">
                            {isHe ? "▸ שירתת גם ב-3 חודשים שלפני סמ׳ ב׳ (דצמבר–מרץ)?" : "▸ Service in 3 months before Sem B (Dec–Mar)?"}
                          </summary>
                          <div className="mt-1.5 rounded-lg border border-foreground/10 bg-card/50 p-2.5 space-y-1.5 animate-in fade-in duration-200">
                            <p className="text-[10px] text-foreground/30">
                              {isHe ? "60+ ימים ב-3 חודשים שלפני סמ׳ ב׳ → לפחות קבוצה B" : "60+ days in 3 months pre-Sem B → at least Group B"}
                            </p>
                            <input
                              type="number"
                              min={0}
                              max={90}
                              value={daysServedPreB ?? ""}
                              onChange={(e) => setDaysServedPreB(e.target.value === "" ? null : parseInt(e.target.value, 10))}
                              placeholder={isHe ? "ימים (דצמבר–מרץ)" : "Days (Dec–Mar)"}
                              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-foreground/25 focus:border-foreground/30 focus:outline-none transition-colors"
                            />
                          </div>
                        </details>
                      )}

                      {/* Show computed result — with per-semester breakdown */}
                      {((daysServedA ?? 0) > 0 || (daysServedB ?? 0) > 0) && computedGroup !== "NONE" && (
                        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2.5 animate-in fade-in duration-200">
                          <p className="text-xs font-medium text-emerald-500">
                            {isHe ? "שיוך לפי המתווה:" : "Framework classification:"}
                          </p>
                          <p className="mt-1 text-sm font-bold text-foreground/80">
                            {MILUIM_CONFIG.GROUPS[computedGroup].nameHe}
                          </p>
                          {/* Per-semester breakdown */}
                          <div className="mt-1 flex gap-3 text-[10px] text-foreground/40">
                            {computedGroups.semA !== "NONE" && (
                              <span>{isHe ? "סמ׳ א׳:" : "Sem A:"} {computedGroups.semA.replace("GROUP_", "")}</span>
                            )}
                            {computedGroups.semB !== "NONE" && (
                              <span>{isHe ? "סמ׳ ב׳:" : "Sem B:"} {computedGroups.semB.replace("GROUP_", "")}</span>
                            )}
                            {computedGroups.totalDays > 0 && (
                              <span>{isHe ? "סה״כ:" : "Total:"} {computedGroups.totalDays} {isHe ? "ימים" : "days"}</span>
                            )}
                          </div>
                          <p className="mt-0.5 text-[10px] text-foreground/40">
                            {isHe
                              ? `${isCombat ? "(לוחם/ת — שיוך מיטיב) " : ""}→ פטור ${MILUIM_CONFIG.GROUPS[computedGroup].creditExemptionPerYear} ש״ס בשנה`
                              : `${isCombat ? "(combat — enhanced) " : ""}→ ${MILUIM_CONFIG.GROUPS[computedGroup].creditExemptionPerYear} credits/year exemption`
                            }
                          </p>
                          <button
                            onClick={() => {
                              onUpdate({ miluimGroup: computedGroup });
                              setGuidedStep(4);
                            }}
                            className="mt-2 w-full rounded-lg bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-600 hover:bg-emerald-500/15 transition-all"
                          >
                            {isHe ? `אישור — ${MILUIM_CONFIG.GROUPS[computedGroup].nameHe.split("—")[0]?.trim()}` : `Confirm — ${computedGroup.replace("_", " ")}`}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Step 4: Done — show summary */}
                  {guidedStep === 4 && (
                    <div className="space-y-2 text-center">
                      <p className="text-xs font-medium text-emerald-500">
                        {isHe ? "הקבוצה נקבעה" : "Group set"}
                      </p>
                      <p className="text-sm font-bold text-foreground/80">
                        {MILUIM_CONFIG.GROUPS[data.miluimGroup as MiluimGroupKey]?.nameHe}
                      </p>
                      <button
                        onClick={() => setMiluimMode("select")}
                        className="text-[11px] text-foreground/40 hover:text-foreground/60 underline"
                      >
                        {isHe ? "שנה ידנית" : "Change manually"}
                      </button>
                    </div>
                  )}

                  {/* Step 5: Not serving, but maybe bereaved/special/spouse? */}
                  {guidedStep === 5 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-foreground/60">
                        {isHe ? "האם את/ה שייכ/ת לאחת מהקבוצות הבאות?" : "Do you belong to any of these groups?"}
                      </p>
                      <div className="grid grid-cols-1 gap-1.5">
                        <button
                          onClick={() => {
                            onUpdate({ miluimGroup: "GROUP_G" });
                            setGuidedStep(4);
                          }}
                          className="rounded-lg border border-foreground/15 bg-card px-3 py-2 text-start text-[11px] text-foreground/60 hover:border-foreground/30 transition-all"
                        >
                          <span className="font-medium">{isHe ? "בן/בת משפחה שכולה" : "Bereaved family member"}</span>
                          <span className="block text-foreground/30">{isHe ? "קרבה ראשונה לחלל/ת מערכות ישראל" : "First-degree relative of fallen soldier"}</span>
                        </button>
                        <button
                          onClick={() => {
                            onUpdate({ miluimGroup: "GROUP_G" });
                            setGuidedStep(4);
                          }}
                          className="rounded-lg border border-foreground/15 bg-card px-3 py-2 text-start text-[11px] text-foreground/60 hover:border-foreground/30 transition-all"
                        >
                          <span className="font-medium">{isHe ? "פצוע/ה או נפגע/ת 7.10" : "Wounded / Oct 7 victim"}</span>
                          <span className="block text-foreground/30">{isHe ? "פצועי מערכות, סדיר, נפגעי פעולות איבה" : "Wounded in action, regular army, terror attack victims"}</span>
                        </button>
                        <button
                          onClick={() => setGuidedStep(6)}
                          className="rounded-lg border border-foreground/15 bg-card px-3 py-2 text-start text-[11px] text-foreground/60 hover:border-foreground/30 transition-all"
                        >
                          <span className="font-medium">{isHe ? "בן/בת זוג של משרת/ת מילואים" : "Spouse of reservist"}</span>
                          <span className="block text-foreground/30">{isHe ? "הורה לילדים עד גיל 13 — הקבוצה תלויה בהיקף שירות בן/בת הזוג" : "Parent of children under 13 — group depends on partner's service"}</span>
                        </button>
                        <button
                          onClick={() => {
                            onUpdate({ miluimGroup: "NONE" });
                            setGuidedStep(4);
                          }}
                          className="rounded-lg border border-foreground/15 bg-card px-3 py-2 text-xs text-foreground/40 hover:border-foreground/30 transition-all"
                        >
                          {isHe ? "אף אחד מהנ״ל — אני לא זכאי/ת" : "None of the above — not eligible"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Step 6: Spouse — how much did your partner serve? */}
                  {guidedStep === 6 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-foreground/60">
                        {isHe ? "כמה ימים שירת/ה בן/בת הזוג בסמסטר?" : "How many days did your partner serve per semester?"}
                      </p>
                      <p className="text-[10px] text-foreground/30">
                        {isHe ? "הזכאות לבני/ות זוג (הורים לילדים עד גיל 13) תלויה בהיקף שירות בן/בת הזוג" : "Eligibility for spouses (parents of children under 13) depends on partner's service days"}
                      </p>
                      <div className="grid grid-cols-1 gap-1.5">
                        <button
                          onClick={() => {
                            onUpdate({ miluimGroup: "GROUP_C" });
                            setGuidedStep(4);
                          }}
                          className="rounded-lg border border-foreground/15 bg-card px-3 py-2 text-start text-[11px] text-foreground/60 hover:border-foreground/30 transition-all"
                        >
                          <span className="font-medium">{isHe ? "35+ ימים בסמסטר → קבוצה C" : "35+ days/semester → Group C"}</span>
                        </button>
                        <button
                          onClick={() => {
                            onUpdate({ miluimGroup: "GROUP_B" });
                            setGuidedStep(4);
                          }}
                          className="rounded-lg border border-foreground/15 bg-card px-3 py-2 text-start text-[11px] text-foreground/60 hover:border-foreground/30 transition-all"
                        >
                          <span className="font-medium">{isHe ? "21-34 ימים בסמסטר (או שירות ממושך) → קבוצה B" : "21-34 days/sem (or extended) → Group B"}</span>
                          <span className="block text-foreground/30">{isHe ? "כולל: 60+ ימים לפני סמסטר, 35+ ימים מצטברים בשנה" : "Including: 60+ days pre-semester, 35+ cumulative in year"}</span>
                        </button>
                        <button
                          onClick={() => {
                            onUpdate({ miluimGroup: "GROUP_C" });
                            setGuidedStep(4);
                          }}
                          className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-start text-[11px] text-foreground/60 hover:border-amber-500/30 transition-all"
                        >
                          <span className="font-medium text-amber-500">{isHe ? "300+ ימים מאז 7.10.23 (לוחם/ת) → קבוצה C" : "300+ days since 7.10.23 (combat) → Group C"}</span>
                          <span className="block text-foreground/30">{isHe ? "קבוצת 300+ — תמיכה מלאה עד סוף התואר" : "300+ group — full support through degree"}</span>
                        </button>
                        <button
                          onClick={() => { setGuidedStep(5); }}
                          className="rounded-lg border border-foreground/10 bg-foreground/3 px-3 py-1.5 text-[10px] text-foreground/35 hover:text-foreground/50 transition-all"
                        >
                          ← {isHe ? "חזרה" : "Back"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ──── Direct select mode ──── */}
              {miluimMode === "select" && (
                <div className="grid grid-cols-1 gap-2">
                  {(Object.keys(MILUIM_CONFIG.GROUPS) as MiluimGroupKey[]).map((groupKey) => {
                    const group = MILUIM_CONFIG.GROUPS[groupKey];
                    const isSelected = data.miluimGroup === groupKey;
                    return (
                      <button
                        key={groupKey}
                        onClick={() => onUpdate({ miluimGroup: groupKey })}
                        className={cn(
                          "rounded-xl border-2 px-4 py-2.5 text-start text-sm transition-all",
                          isSelected
                            ? "border-foreground bg-foreground/10 text-foreground/80 shadow-sm"
                            : "border-border bg-card text-foreground/60 hover:border-foreground/30"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">
                            {isHe ? group.nameHe : group.nameEn}
                          </span>
                          {groupKey !== "NONE" && (
                            <span className="rounded-full bg-foreground/5 px-1.5 py-0.5 text-[9px] font-mono text-foreground/40">
                              {group.creditExemptionPerYear} {isHe ? "ש״ס/שנה" : "cr/yr"}
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

              {/* Show benefits for selected miluim group */}
              {data.miluimGroup !== "NONE" && MILUIM_CONFIG.GROUPS[data.miluimGroup as MiluimGroupKey]?.benefits?.length > 0 && (
                <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-emerald-500">
                      {isHe ? "ההטבות שלך:" : "Your benefits:"}
                    </p>
                    <span className="text-[10px] font-mono text-emerald-500/60">
                      {isHe
                        ? `פטור ${MILUIM_CONFIG.GROUPS[data.miluimGroup as MiluimGroupKey].creditExemptionPerYear} ש״ס/שנה`
                        : `${MILUIM_CONFIG.GROUPS[data.miluimGroup as MiluimGroupKey].creditExemptionPerYear} credits/year`
                      }
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {(MILUIM_CONFIG.GROUPS[data.miluimGroup as MiluimGroupKey]?.benefits ?? []).map((benefit: string, idx: number) => (
                      <li key={idx} className="flex items-start gap-1.5 text-[11px] text-foreground/50">
                        <Check className="h-3 w-3 text-emerald-400 mt-0.5 shrink-0" />
                        {benefit}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Amirnet / Psychometric English score section */}
        <div className="animate-stagger-4">
          <h3 className="mb-2 text-sm font-medium text-foreground/70">
            {isHe ? "ציון אמירנ״ט / פסיכומטרי אנגלית" : "Amirnet / Psychometric English Score"}
          </h3>
          <p className="mb-3 text-xs text-foreground/40">
            {isHe
              ? "הציון קובע כמה קורסי אנגלית תצטרכו. הסולם 50-150 זהה לאמירנ״ט, אמיר״ם ופסיכומטרי. בפכ״מ נדרשים 2 קורסי תוכן באנגלית בכל מקרה."
              : "Determines how many English courses you need. The 50-150 scale is shared by Amirnet, AMIRAM and Psychometric. PPE requires 2 English content courses regardless."
            }
          </p>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={50}
              max={150}
              value={data.amiramScore ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                onUpdate({ amiramScore: val === "" ? null : parseInt(val, 10) });
              }}
              placeholder={isHe ? "למשל: 134" : "e.g. 134"}
              className="w-32 rounded-xl border-2 border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/30 focus:border-foreground/30 focus:outline-none transition-colors"
            />
            {amirnetStatus && (
              <span className={cn("text-xs font-medium", amirnetStatus.color)}>
                {amirnetStatus.text}
              </span>
            )}
          </div>
          {amirnetStatus?.detail && (
            <p className={cn("mt-1.5 text-[10px]", amirnetStatus.color.replace("text-", "text-") + "/70")}>
              {amirnetStatus.detail}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-foreground/30">
            <span>{isHe ? "134+ = פטור" : "134+ = exempt"}</span>
            <span>{isHe ? "120-133 = מתקדמים ב׳" : "120-133 = adv. B"}</span>
            <span>{isHe ? "100-119 = מתקדמים א׳" : "100-119 = adv. A"}</span>
            <span>{isHe ? "85-99 = בסיסי" : "85-99 = basic"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
