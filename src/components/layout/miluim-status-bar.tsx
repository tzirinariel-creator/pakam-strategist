"use client";

import { useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Shield, X, Check, CalendarClock, Clock, Target, BookOpen, GraduationCap, ChevronLeft, ChevronRight, BadgeCheck } from "lucide-react";
import { advisorError } from "@/lib/advisor-toast";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/lib/trpc/react";
import { getAcademicNow } from "@/lib/academic-calendar";
import { MILUIM_CONFIG } from "@/lib/constants";
import { buildBenefitGroups, BENEFITS_HONESTY_NOTE } from "@/lib/miluim-benefits";
import { QuotaCard } from "@/components/miluim/quota-card";
import {
  deriveCurrentGroup,
  computeCreditExemption,
  binaryCapRemaining,
  binaryBenefitOf,
  binaryDegreeCap,
  getCurrentAcademicYear,
  honorsBinaryPercent,
  type MiluimGroupKey,
} from "@/lib/miluim";
import { Link } from "@/i18n/navigation";
import { Bidi } from "@/lib/bidi";
import { cn } from "@/lib/utils";

// Per-group accent. Higher service tier → "warmer/stronger" accent. NONE never
// renders this bar at all.
const GROUP_STYLE: Record<Exclude<MiluimGroupKey, "NONE">, { bar: string; chip: string; dot: string }> = {
  GROUP_A: { bar: "border-sky-400/20 bg-sky-400/[0.06]", chip: "text-sky-500", dot: "bg-sky-400" },
  GROUP_B: { bar: "border-amber-400/20 bg-amber-400/[0.06]", chip: "text-amber-500", dot: "bg-amber-400" },
  GROUP_C: { bar: "border-emerald-400/20 bg-emerald-400/[0.06]", chip: "text-emerald-500", dot: "bg-emerald-400" },
  GROUP_G: { bar: "border-violet-400/20 bg-violet-400/[0.06]", chip: "text-violet-500", dot: "bg-violet-400" },
};

/** Short label for the chip ("C") derived from the group key. */
function shortGroup(group: MiluimGroupKey): string {
  return group === "NONE" ? "" : group.replace("GROUP_", "");
}

/**
 * Persistent, always-visible miluim status bar.
 *
 * Sits directly under the demo banner on every protected page. Shows which
 * "miluimnik" group the student is (A/B/C/G) plus a one-line benefit headline,
 * and opens a full benefits + quota panel ("ההטבות שלי") on click. For students
 * who don't serve (group NONE) it renders nothing — zero footprint.
 *
 * All numbers come straight from MILUIM_CONFIG + the pure miluim helpers (the
 * same resolution path plan/regulation use), so it never invents domain rules.
 */
export function MiluimStatusBar() {
  const t = useTranslations("miluim");
  const locale = useLocale();
  const isHe = locale === "he";
  const [open, setOpen] = useState(false);

  const profileQuery = api.user.getProfile.useQuery(undefined, {
    retry: 1,
    staleTime: 60_000,
  });
  const semestersQuery = api.user.listMiluimSemesters.useQuery(undefined, {
    retry: 1,
    staleTime: 60_000,
    enabled: !!profileQuery.data,
  });

  // The quota counters are editable RIGHT HERE — where the decision lives —
  // not only buried in Settings (note #46). Same mutation Settings uses.
  const utils = api.useUtils();
  const updateQuota = api.user.updateProfile.useMutation({
    onSuccess: () => {
      void utils.user.getProfile.invalidate();
      // The miluim credit-exemption + binary quota feed the credit breakdown and
      // the compliance check — refresh them so the dashboard headline doesn't lag
      // the stepper (#audit-r6).
      void utils.plan.getCredits.invalidate();
      void utils.regulation.checkCompliance.invalidate();
    },
    onError: (e) =>
      advisorError(e.message || (isHe ? "העדכון לא הצליח — הערך הקודם נשאר. נסו שוב." : "The update didn't go through — the previous value stands. Try again.")),
  });

  const profile = profileQuery.data;
  if (!profile) return null;

  const group = deriveCurrentGroup(
    semestersQuery.data ?? [],
    profile.miluimGroup,
    { academicYear: getCurrentAcademicYear(), semester: getAcademicNow().semester }
  );

  // Non-serving students get no bar at all.
  if (group === "NONE") return null;

  const cfg = MILUIM_CONFIG.GROUPS[group];
  const style = GROUP_STYLE[group as Exclude<MiluimGroupKey, "NONE">];
  // A career soldier is classified as Group C but did NOT serve 35+ reserve
  // days — show a career-service label instead of the reservist criteria.
  const isCareerService = !!profile.miluimCareerService && group === "GROUP_C";
  const groupName = isCareerService
    ? isHe
      ? "קבוצה C — שירות קבע"
      : "Group C — career service"
    : isHe
      ? cfg.nameHe
      : cfg.nameEn;
  const groupDesc = isCareerService
    ? isHe
      ? "שירות קבע בתוכנית שירות מקנה שיוך לקבוצה C, עם מלוא ההטבות של הקבוצה."
      : "Career service in a service-track program — classified as Group C with the full Group C benefits."
    : isHe
      ? cfg.descHe
      : cfg.descEn;
  // Grouped, human, honest benefits for THIS group (replaces the old flat list).
  const benefitGroups = buildBenefitGroups(group, cfg);

  // Live quota numbers — exact same path as the credit/binary calculators.
  const creditsUsed = profile.miluimCreditsUsed ?? 0;
  const binaryUsed = profile.miluimBinaryUsed ?? 0;
  const creditExemption = computeCreditExemption(group, creditsUsed);
  const creditCap = MILUIM_CONFIG.MAX_CREDIT_EXEMPTIONS_DEGREE;
  // Unit-aware (launch-gate 14.7): B/C count COURSES; G's benefit is
  // CREDIT-denominated (עד 6 ש״ס) — binaryDegreeCap(G) falls back to the
  // universal 5-course BA cap, which over-promised 5 phantom conversions in
  // this very bar. G gets an honest credit-worded hint instead of a counter.
  const binaryBenefit = binaryBenefitOf(group);
  const binaryCap = binaryBenefit?.unit === "courses" ? binaryDegreeCap(group) : 0;
  const binaryLeft = binaryCap > 0 ? binaryCapRemaining(binaryUsed, group) : 0;
  const binaryCreditHint =
    binaryBenefit?.unit === "credits"
      ? isHe
        ? `המרה של עד ${binaryBenefit.degreeCap} ש״ס בתואר (קבוצה G) — המעקב בעמוד המילואים.`
        : `Convert up to ${binaryBenefit.degreeCap} credits across the degree (Group G) — tracked on the miluim page.`
      : null;

  const Chevron = isHe ? ChevronLeft : ChevronRight;

  return (
    <>
      {/* Slim always-visible bar */}
      <div
        data-tour="miluim"
        className={cn(
          "flex items-center justify-center gap-2 border-b px-4 py-1 text-xs backdrop-blur-sm",
          style.bar
        )}
      >
        <Shield className={cn("size-3.5", style.chip)} />
        <span className="font-medium text-foreground/80">
          {t("barLabel")} · {t("groupShort", { group: shortGroup(group) })}
        </span>
        <span className="hidden text-foreground/45 sm:inline">
          ·{" "}
          {cfg.creditExemptionPerYear > 0 ? (
            <Bidi text={t("barCreditHeadline", { credits: cfg.creditExemptionPerYear })} />
          ) : (
            <Bidi text={isHe ? cfg.nameHe : cfg.nameEn} />
          )}
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "ms-1 inline-flex items-center gap-0.5 rounded-md px-2 py-0.5 font-medium transition-colors hover:bg-foreground/10",
            style.chip
          )}
        >
          {t("myBenefits")}
          <Chevron className="size-3" />
        </button>
      </div>

      {/* Benefits + quota panel */}
      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0" />
          <DialogPrimitive.Content
            // Explicit card styling (NOT .data-card — that unlayered rule would
            // override `fixed`).
            className={cn(
              "fixed top-1/2 start-1/2 z-[70] flex max-h-[85vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rtl:translate-x-1/2",
              "overflow-hidden rounded-2xl border border-border bg-card shadow-xl outline-none",
              "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95"
            )}
          >
            {/* Header */}
            <div className={cn("flex items-start gap-3 border-b border-border/60 p-5", style.bar)}>
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-card/70">
                <Shield className={cn("size-5", style.chip)} />
              </div>
              <div className="min-w-0 flex-1">
                <DialogPrimitive.Title className="font-display text-lg font-bold text-foreground/90">
                  <Bidi text={groupName} />
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-0.5 text-xs leading-relaxed text-foreground/55">
                  <Bidi text={groupDesc} />
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close
                aria-label={t("close")}
                className="rounded-md p-1 text-foreground/40 transition-colors hover:bg-foreground/10 hover:text-foreground/70"
              >
                <X className="size-4" />
              </DialogPrimitive.Close>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              {/* Quota cards: credit exemption + binary conversions */}
              <div className="grid grid-cols-2 gap-3">
                <QuotaCard
                  icon={GraduationCap}
                  label={t("creditExemption")}
                  used={creditsUsed}
                  cap={creditCap}
                  hint={<Bidi text={t("creditExemptionHint", { perYear: cfg.creditExemptionPerYear, available: creditExemption })} />}
                  onChange={(next) => updateQuota.mutate({ miluimCreditsUsed: next })}
                  pending={updateQuota.isPending}
                  isHe={isHe}
                />
                <QuotaCard
                  icon={Check}
                  label={t("binaryQuota")}
                  used={binaryUsed}
                  cap={binaryCap}
                  hint={
                    <Bidi
                      text={
                        binaryCap > 0
                          ? t("binaryQuotaHint", { left: binaryLeft, percent: honorsBinaryPercent() })
                          : (binaryCreditHint ?? t("binaryNone"))
                      }
                    />
                  }
                  onChange={binaryCap > 0 ? (next) => updateQuota.mutate({ miluimBinaryUsed: next }) : undefined}
                  pending={updateQuota.isPending}
                  isHe={isHe}
                />
              </div>

              {/* Headline benefits as an infographic (icon · value · label) —
                  clearer than a chip-row, and the value/label split fixes the
                  cramped "+25% זמן בבחינה" reading. */}
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {cfg.examTimeBonus > 0 && (
                  <InfoStat icon={Clock} value={`+${cfg.examTimeBonus}%`} label={isHe ? "זמן בבחינה" : "Exam time"} />
                )}
                {cfg.examChoice2of3 && (
                  <InfoStat
                    icon={CalendarClock}
                    value={isHe ? "2 מתוך 3" : "2 of 3"}
                    label={isHe ? "מועדי בחינה" : "Exam dates"}
                    title={isHe ? "אפשר לגשת ל-2 מתוך 3 המועדים — הציון הגבוה קובע, אוטומטית" : "Sit 2 of 3 exam dates — the highest grade counts, automatically"}
                  />
                )}
                {cfg.attendanceExempt && (
                  <InfoStat icon={BookOpen} value={isHe ? "פטור" : "Exempt"} label={isHe ? "נוכחות" : "Attendance"} />
                )}
                {cfg.biddingBonus > 0 && (
                  <InfoStat icon={Target} value={`+${cfg.biddingBonus}%`} label={isHe ? "בידינג" : "Bidding"} />
                )}
              </div>

              {/* Per-semester service timeline (#12/#30) — the group is
                  reassigned EVERY semester, so show the student their own
                  history: days served → derived group, with "now" marked. */}
              <ServiceTimeline
                semesters={semestersQuery.data ?? []}
                currentYear={getCurrentAcademicYear()}
                currentSemester={getAcademicNow().semester}
                isHe={isHe}
              />

              {/* Benefits, grouped into human categories with an "auto" chip on
                  the ones the app applies for you (#7 — was a flat, machine-like
                  checklist). Copy is code-grounded and honest about auto vs.
                  request-elsewhere. */}
              {benefitGroups.map((bg) => (
                <div key={bg.titleEn}>
                  <h4 className="mb-2 text-xs font-semibold text-foreground/50">
                    {isHe ? bg.titleHe : bg.titleEn}
                  </h4>
                  <ul className="space-y-2">
                    {bg.items.map((b, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-foreground/75">
                        {b.auto ? (
                          <BadgeCheck className={cn("mt-0.5 size-3.5 shrink-0", style.chip)} />
                        ) : (
                          <Check className="mt-0.5 size-3.5 shrink-0 text-foreground/35" />
                        )}
                        <span className="leading-snug">
                          <Bidi text={isHe ? b.he : b.en} />
                          {b.auto && (
                            <span
                              className={cn(
                                "ms-1.5 inline-block rounded px-1.5 py-px align-middle text-[10px] font-semibold",
                                style.bar,
                                style.chip
                              )}
                            >
                              {isHe ? "אוטומטי" : "auto"}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              {/* Honest "how this works" — what's automatic vs. what to request. */}
              <div className="rounded-xl border border-border/60 bg-foreground/[0.02] p-3.5 text-xs leading-relaxed text-foreground/55">
                {isHe ? BENEFITS_HONESTY_NOTE.he : BENEFITS_HONESTY_NOTE.en}
              </div>
            </div>

            {/* Footer link to update service data */}
            <div className="border-t border-border/60 p-4">
              <Link
                href="/miluim"
                onClick={() => setOpen(false)}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-card/40 px-4 py-2 text-sm font-medium text-foreground/70 transition-colors hover:border-foreground/25 hover:bg-foreground/5"
              >
                {t("updateService")}
                <Chevron className="size-3.5" />
              </Link>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}

/** Per-semester service history — the group is reassigned every semester, so
 *  the student sees exactly which service produced which group, and which row
 *  is "now". Data comes straight from the MiluimSemester rows (read-only). */
function ServiceTimeline({
  semesters,
  currentYear,
  currentSemester,
  isHe,
}: {
  semesters: {
    academicYear: number;
    semester: string;
    daysServed: number;
    isCombat: boolean;
    derivedGroup: string;
  }[];
  currentYear: number;
  currentSemester: string | null | undefined;
  isHe: boolean;
}) {
  const semLabel = (s: string) =>
    isHe ? (s === "FALL" ? "סמסטר א׳" : "סמסטר ב׳") : s === "FALL" ? "Fall" : "Spring";
  // SUMMER folds onto SPRING for miluim purposes (same rule the resolver uses).
  const nowSem = currentSemester === "SUMMER" ? "SPRING" : currentSemester;

  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold text-foreground/50">
        {isHe ? "השירות שלי לפי סמסטרים" : "My service by semester"}
      </h4>
      {semesters.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/60 bg-foreground/[0.02] p-3 text-xs leading-relaxed text-foreground/50">
          {isHe
            ? "הקבוצה נקבעת מחדש לכל סמסטר לפי ימי השירות בו. עוד לא הוזן שירות לפי סמסטרים — אפשר לעדכן בהגדרות (הכפתור למטה)."
            : "Your group is re-derived each semester from that semester's service days. No per-semester service entered yet — update it in settings (button below)."}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {semesters.map((s) => {
            const isNow = s.academicYear === currentYear && s.semester === nowSem;
            const g = s.derivedGroup as MiluimGroupKey;
            const chip = g !== "NONE" ? GROUP_STYLE[g as Exclude<MiluimGroupKey, "NONE">] : null;
            return (
              <li
                key={`${s.academicYear}-${s.semester}`}
                className={cn(
                  "flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs",
                  isNow ? "border-foreground/25 bg-foreground/[0.03]" : "border-border/50",
                )}
              >
                <span className="font-medium text-foreground/75" dir={isHe ? "rtl" : "ltr"}>
                  <bdi>{s.academicYear}–{(s.academicYear + 1) % 100}</bdi> · {semLabel(s.semester)}
                </span>
                {isNow && (
                  <span className="rounded bg-foreground/10 px-1.5 py-px text-[10px] font-semibold text-foreground/70">
                    {isHe ? "עכשיו" : "now"}
                  </span>
                )}
                <span className="text-foreground/50">
                  {isHe
                    ? s.daysServed === 1 ? "יום שירות אחד" : `${s.daysServed} ימי שירות`
                    : `${s.daysServed} day${s.daysServed === 1 ? "" : "s"} served`}
                </span>
                {s.isCombat && (
                  <span className="rounded bg-red-500/10 px-1.5 py-px text-[10px] font-semibold text-red-500">
                    {isHe ? "לחימה" : "combat"}
                  </span>
                )}
                <span
                  className={cn(
                    "ms-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold",
                    chip ? cn(chip.bar, chip.chip) : "bg-foreground/5 text-foreground/45",
                  )}
                >
                  {g === "NONE"
                    ? isHe ? "ללא קבוצה" : "no group"
                    : isHe ? `קבוצה ${shortGroup(g)}` : `Group ${shortGroup(g)}`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function InfoStat({
  icon: Icon,
  value,
  label,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  label: string;
  title?: string;
}) {
  return (
    <div
      title={title}
      className="flex flex-col items-center gap-1 rounded-xl border border-border/60 bg-foreground/[0.02] p-2.5 text-center"
    >
      <Icon className="size-4 text-foreground/55" />
      <span className="font-data text-sm font-bold text-foreground/85" dir="auto">
        {value}
      </span>
      <span className="text-[10px] leading-tight text-foreground/50">{label}</span>
    </div>
  );
}
