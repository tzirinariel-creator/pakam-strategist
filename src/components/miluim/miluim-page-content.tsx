"use client";

// =========================================================================
// /miluim — the dedicated reserve-duty hub (12.7 notes #18/#20/#21/#32).
// Everything the app can DERIVE is derived (per-year exemption entitlement
// from the recorded semesters, binary conversions counted from the plan);
// only real-world facts the app can't know (what was actually redeemed at
// the miluim desk) stay manual. The editor + 3010 uploader + playbook are
// the battle-tested components relocated from settings.
// =========================================================================

import { useState } from "react";
import { useLocale } from "next-intl";
import { Shield, CalendarRange, BadgeCheck, Scale as ScaleIcon, CalendarClock, Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { advisorError } from "@/lib/advisor-toast";
import { api } from "@/lib/trpc/react";
import { Link } from "@/i18n/navigation";
import { MiluimSection } from "@/components/settings/miluim-section";
import {
  deriveExemptionEntitlement,
  deriveCurrentGroup,
  binaryBenefitOf,
  getCurrentAcademicYear,
  type MiluimSemesterLite,
  type MiluimGroupKey,
} from "@/lib/miluim";
import { MILUIM_CONFIG } from "@/lib/constants";
import { hebrewYearLabel, getAcademicNow } from "@/lib/academic-calendar";
import { cn } from "@/lib/utils";

function groupChip(group: string, isHe: boolean): { label: string; cls: string } {
  const g = MILUIM_CONFIG.GROUPS[group as keyof typeof MILUIM_CONFIG.GROUPS];
  if (!g || group === "NONE") {
    return { label: isHe ? "ללא" : "None", cls: "bg-foreground/8 text-foreground/50" };
  }
  const letter = group.replace("GROUP_", "");
  const cls =
    group === "GROUP_C" || group === "GROUP_G"
      ? "bg-emerald-500/15 text-emerald-600"
      : group === "GROUP_B"
        ? "bg-sky-500/15 text-sky-600"
        : "bg-foreground/10 text-foreground/60";
  return { label: isHe ? `קבוצה ${letter}` : `Group ${letter}`, cls };
}

export function MiluimPageContent() {
  const locale = useLocale();
  const isHe = locale === "he";

  const utils = api.useUtils();
  const semestersQuery = api.user.listMiluimSemesters.useQuery();
  const profileQuery = api.user.getProfile.useQuery();
  const planQuery = api.plan.getUserPlan.useQuery();
  const invalidateMiluim = () => {
    void utils.user.listMiluimSemesters.invalidate();
    void utils.plan.getCredits.invalidate();
    void utils.regulation.checkCompliance.invalidate();
  };
  const deleteMutation = api.user.deleteMiluimSemester.useMutation({
    onSuccess: invalidateMiluim,
    onError: () => advisorError(isHe ? "המחיקה לא הצליחה — הרשומה נשארה במקומה. נסו שוב." : "The delete didn't go through — the row is still there. Try again."),
  });
  const upsertMutation = api.user.upsertMiluimSemester.useMutation({
    onSuccess: () => {
      invalidateMiluim();
      toast.success(isHe ? "הסמסטר נשמר — הקבוצה חושבה לבד" : "Semester saved — group derived");
    },
    onError: () => advisorError(isHe ? "השמירה לא הצליחה — נסו שוב. שום דבר לא אבד." : "The save didn't go through — try again. Nothing was lost."),
  });

  const rows = (semestersQuery.data ?? []) as MiluimSemesterLite[];
  const fallbackGroup = (profileQuery.data?.miluimGroup ?? "NONE") as MiluimGroupKey;
  // The fallback (manual) group is materialized for the CURRENT year only —
  // so a student with a group but no recorded semesters no longer sees a
  // false 0 (the two-engines disagreement, overnight verify 14.7).
  const entitlement = deriveExemptionEntitlement(rows, fallbackGroup, getCurrentAcademicYear());
  const creditsUsed = profileQuery.data?.miluimCreditsUsed ?? 0;

  // #18 — binary conversions are COUNTED from the plan, not typed by hand.
  const binaryCourses = (planQuery.data?.courses ?? []).filter(
    (c) => (c as { isBinary?: boolean }).isBinary,
  );
  const binaryFromPlan = binaryCourses.length;
  const binaryExternal = profileQuery.data?.miluimBinaryUsed ?? 0;
  const binaryTotal = binaryFromPlan + binaryExternal;
  // The binary card speaks each group's own unit: B/C in courses (X/5),
  // G in credits (עד 6 ש״ס), and no benefit → say so instead of a fake /5.
  const currentGroup = deriveCurrentGroup(semestersQuery.data ?? [], fallbackGroup, {
    academicYear: getCurrentAcademicYear(),
    semester: getAcademicNow().semester,
  });
  const binaryBenefit = binaryBenefitOf(currentGroup);
  const binaryCreditsUsed =
    binaryCourses.reduce(
      (s, c) => s + ((c as { course?: { credits?: number } }).course?.credits ?? 0),
      0,
    ) + binaryExternal * 2; // external conversions: assume the 2-ש״ס minimum — under-promise, never over

  // Add-a-semester mini form (the editor below only writes the CURRENT
  // semester — this is the any-semester door, overnight verify 14.7).
  const nowYear = getCurrentAcademicYear();
  const [addYear, setAddYear] = useState<number>(nowYear);
  const [addSemester, setAddSemester] = useState<"FALL" | "SPRING">("FALL");
  const [addDays, setAddDays] = useState<string>("");
  const [addCombat, setAddCombat] = useState(false);
  const yearOptions = [nowYear - 3, nowYear - 2, nowYear - 1, nowYear];
  const handleAddSemester = () => {
    const days = Number(addDays);
    if (!Number.isFinite(days) || days <= 0) {
      toast.error(isHe ? "כמה ימים שירתם באותו סמסטר?" : "How many days did you serve?");
      return;
    }
    upsertMutation.mutate({
      academicYear: addYear,
      semester: addSemester,
      daysServed: Math.min(365, Math.round(days)),
      isCombat: addCombat,
    });
    setAddDays("");
  };

  const sortedRows = [...rows].sort((a, b) =>
    a.academicYear === b.academicYear
      ? (a.semester === "FALL" ? 0 : 1) - (b.semester === "FALL" ? 0 : 1)
      : a.academicYear - b.academicYear,
  );

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Shield className="size-8 text-foreground/80" />
        <div className="flex flex-col gap-0.5">
          <h1 className="font-display text-2xl font-bold text-foreground/80 md:text-3xl">
            {isHe ? "מילואים" : "Reserve duty"}
          </h1>
          <p className="text-sm text-foreground/60">
            {isHe
              ? "כל הזכויות, הקבוצות והמעקב שלכם — במקום אחד. מה שאפשר לחשב, מחושב לבד."
              : "All your rights, groups and tracking in one place. Whatever can be computed, is."}
          </p>
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-3xl gap-6">
        {/* ── The service record, semester by semester ── */}
        <div className="data-card p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-foreground/80">
            <CalendarRange className="size-4 text-foreground/50" />
            {isHe ? "השירות שלכם, סמסטר-סמסטר" : "Your service, semester by semester"}
          </h2>
          {sortedRows.length === 0 ? (
            <p className="mt-3 text-xs leading-relaxed text-foreground/50">
              {isHe
                ? "עוד אין סמסטרים רשומים. הדרך הקלה: העלו טופס 3010 למטה — נחלק את הימים לסמסטרים בשבילכם."
                : "No semesters recorded yet. Easiest path: upload Form 3010 below — we'll split the days into semesters for you."}
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-start text-[11px] text-foreground/40">
                    <th className="pb-2 pe-3 text-start font-medium">{isHe ? "סמסטר" : "Semester"}</th>
                    <th className="pb-2 pe-3 text-start font-medium">{isHe ? "ימי שירות" : "Days"}</th>
                    <th className="pb-2 pe-3 text-start font-medium">{isHe ? "לחימה" : "Combat"}</th>
                    <th className="pb-2 text-start font-medium">{isHe ? "קבוצה" : "Group"}</th>
                    <th className="pb-2" aria-label={isHe ? "מחיקה" : "Delete"} />
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((r) => {
                    const chip = groupChip(r.derivedGroup, isHe);
                    return (
                      <tr key={`${r.academicYear}-${r.semester}`} className="border-t border-border/40">
                        <td className="py-2 pe-3 text-foreground/75">
                          {isHe
                            ? `${hebrewYearLabel(r.academicYear)} · ${r.semester === "FALL" ? "סמסטר א׳" : "סמסטר ב׳"}`
                            : `${r.academicYear}/${r.academicYear + 1} · ${r.semester === "FALL" ? "Fall" : "Spring"}`}
                        </td>
                        <td className="py-2 pe-3 font-mono text-foreground/80">
                          <bdi dir="ltr">{r.daysServed}</bdi>
                        </td>
                        <td className="py-2 pe-3 text-foreground/60">
                          {r.isCombat ? (isHe ? "כן" : "Yes") : (isHe ? "—" : "—")}
                        </td>
                        <td className="py-2">
                          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", chip.cls)}>
                            {chip.label}
                          </span>
                        </td>
                        <td className="py-2 ps-2 text-end">
                          <button
                            type="button"
                            disabled={deleteMutation.isPending}
                            aria-label={isHe ? `מחקו את ${hebrewYearLabel(r.academicYear)} ${r.semester === "FALL" ? "א׳" : "ב׳"}` : "Delete row"}
                            onClick={() => {
                              // Reversible by design: the undo toast re-writes
                              // the exact same row (12.7 #26 — nothing here is
                              // irreversible anymore).
                              const snapshot = { academicYear: r.academicYear, semester: r.semester as "FALL" | "SPRING", daysServed: r.daysServed, isCombat: r.isCombat ?? false };
                              deleteMutation.mutate(
                                { academicYear: r.academicYear, semester: r.semester as "FALL" | "SPRING" },
                                {
                                  onSuccess: () => {
                                    toast.success(isHe ? "הסמסטר נמחק" : "Semester deleted", {
                                      action: {
                                        label: isHe ? "בטלו" : "Undo",
                                        onClick: () => upsertMutation.mutate(snapshot),
                                      },
                                    });
                                  },
                                },
                              );
                            }}
                            className="rounded-md p-1 text-foreground/30 transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:opacity-40"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {/* Any-semester add form — the editor below writes only the CURRENT
              semester; here you can record ANY past semester (verify 14.7). */}
          <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-border/40 bg-foreground/[0.02] p-2.5">
            <label className="flex flex-col gap-1 text-[10px] text-foreground/45">
              {isHe ? "שנה" : "Year"}
              <select
                value={addYear}
                onChange={(e) => setAddYear(Number(e.target.value))}
                className="rounded-md border border-border/60 bg-card px-2 py-1.5 text-xs text-foreground/80 focus:outline-none"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>{isHe ? hebrewYearLabel(y) : `${y}/${y + 1}`}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[10px] text-foreground/45">
              {isHe ? "סמסטר" : "Semester"}
              <select
                value={addSemester}
                onChange={(e) => setAddSemester(e.target.value as "FALL" | "SPRING")}
                className="rounded-md border border-border/60 bg-card px-2 py-1.5 text-xs text-foreground/80 focus:outline-none"
              >
                <option value="FALL">{isHe ? "א׳" : "Fall"}</option>
                <option value="SPRING">{isHe ? "ב׳" : "Spring"}</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[10px] text-foreground/45">
              {isHe ? "ימי שירות" : "Days"}
              <input
                type="number"
                min={1}
                max={365}
                value={addDays}
                onChange={(e) => setAddDays(e.target.value)}
                placeholder="0"
                className="w-20 rounded-md border border-border/60 bg-card px-2 py-1.5 text-center font-mono text-xs tabular-nums text-foreground/80 focus:outline-none"
              />
            </label>
            <label className="flex items-center gap-1.5 pb-1.5 text-[11px] text-foreground/55">
              <input
                type="checkbox"
                checked={addCombat}
                onChange={(e) => setAddCombat(e.target.checked)}
                className="size-3.5 accent-current"
              />
              {isHe ? "תפקיד לחימה" : "Combat"}
            </label>
            <button
              type="button"
              disabled={upsertMutation.isPending}
              onClick={handleAddSemester}
              className="inline-flex items-center gap-1 rounded-md bg-foreground/10 px-2.5 py-1.5 text-xs font-medium text-foreground/75 transition-colors hover:bg-foreground/15 disabled:opacity-50"
            >
              {upsertMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              {isHe ? "הוסיפו סמסטר" : "Add semester"}
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-foreground/40">
            {isHe
              ? "הקבוצה נקבעת מחדש בכל סמסטר לפי הימים של אותו סמסטר — מוסיפים כאן ידנית או דרך טופס 3010 למטה, ומוחקים שורה בלחיצה (עם ביטול)."
              : "The group is re-assigned each semester from that semester's days — add here or via Form 3010 below; delete a row in one tap (with undo)."}
          </p>
        </div>

        {/* ── Auto-derived entitlements (#18) ── */}
        <div className="data-card p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-foreground/80">
            <BadgeCheck className="size-4 text-foreground/50" />
            {isHe ? "מה מגיע לכם — מחושב לבד" : "Your entitlements — computed automatically"}
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border/50 bg-foreground/[0.02] p-3">
              <p className="text-xs font-semibold text-foreground/70">
                {isHe ? "פטור ש״ס" : "Credit exemption"}
              </p>
              <p className="mt-1 font-mono text-xl font-bold text-foreground/85">
                <bdi dir="ltr">{entitlement.total}</bdi>
                <span className="ms-1 text-xs font-normal text-foreground/45">
                  {isHe ? `ש״ס מגיעים לכם (מקס׳ ${MILUIM_CONFIG.MAX_CREDIT_EXEMPTIONS_DEGREE} לתואר)` : `credits accrued (degree max ${MILUIM_CONFIG.MAX_CREDIT_EXEMPTIONS_DEGREE})`}
                </span>
              </p>
              {entitlement.perYear.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 text-[11px] text-foreground/50">
                  {entitlement.perYear.map((y) => (
                    <li key={y.academicYear}>
                      {isHe
                        ? `${hebrewYearLabel(y.academicYear)}: ${groupChip(y.group, true).label} → ${y.credits} ש״ס`
                        : `${y.academicYear}: ${groupChip(y.group, false).label} → ${y.credits} cr.`}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1.5 text-[11px] leading-relaxed text-foreground/45">
                {isHe
                  ? `לפי המתווה הרשמי (תשפ״ו): קבוצה C מזכה ב-8 ש״ס פטור. חשוב — C בשני סמסטרים של אותה שנה = 8, לא 16; ה-10 הוא תקרת-התואר, שמגיעים אליה רק בשילוב פטור נוסף של עד 2 ש״ס משנה אחרת. מימשתם בפועל: ${creditsUsed} ש״ס — את המימוש מגישים במדור מילואים, ומעדכנים בעורך למטה.`
                  : `Exemption accrues per YEAR (not per semester) — Group C grants 8 credits/year. Actually redeemed: ${creditsUsed} — redemption is filed at the miluim desk; update it in the editor below.`}
              </p>
            </div>
            <div className="rounded-lg border border-border/50 bg-foreground/[0.02] p-3">
              <p className="text-xs font-semibold text-foreground/70">
                {isHe ? "המרות בינארי" : "Binary conversions"}
              </p>
              {/* Each group's OWN unit: B/C count courses (X/5); G counts
                  CREDITS (עד 6 ש״ס per the מתווה); no benefit → say so
                  honestly instead of a fake /5 (verify 14.7). */}
              {binaryBenefit == null ? (
                <p className="mt-1.5 text-[11px] leading-relaxed text-foreground/45">
                  {isHe
                    ? "לקבוצה הנוכחית שלכם המתווה לא מעניק המרות בינארי. אם הקבוצה תשתנה — הזכאות תתעדכן כאן לבד."
                    : "Your current group doesn't grant binary conversions under the outline. If your group changes, this updates automatically."}
                </p>
              ) : binaryBenefit.unit === "credits" ? (
                <>
                  <p className="mt-1 font-mono text-xl font-bold text-foreground/85">
                    <bdi dir="ltr">{binaryCreditsUsed}/{binaryBenefit.degreeCap}</bdi>
                    <span className="ms-1 text-xs font-normal text-foreground/45">{isHe ? "ש״ס" : "credits"}</span>
                  </p>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-foreground/45">
                    {isHe ? (
                      <>
                        קבוצה G: המתווה מעניק המרה של עד {binaryBenefit.degreeCap} ש״ס לעובר/לא־עובר. נסכם מהקורסים שסימנתם כבינארי בתיק
                        {binaryExternal > 0 ? ` (+ ${binaryExternal} שדווחו מחוץ לאפליקציה, נספרו לפי 2 ש״ס כל אחת)` : ""}.{" "}
                        <Link href="/record" className="text-accent-brand hover:underline">
                          לסימון קורס בינארי ←
                        </Link>
                      </>
                    ) : (
                      <>Group G: the outline grants converting up to {binaryBenefit.degreeCap} credits to pass/fail — summed from courses you marked binary.</>
                    )}
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-1 font-mono text-xl font-bold text-foreground/85">
                    <bdi dir="ltr">{binaryTotal}/{binaryBenefit.degreeCap}</bdi>
                  </p>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-foreground/45">
                    {isHe ? (
                      <>
                        נספר אוטומטית מהקורסים שסימנתם כבינארי בתיק האקדמי ({binaryFromPlan})
                        {binaryExternal > 0 ? ` + ${binaryExternal} שדיווחתם שבוצעו מחוץ לאפליקציה` : ""}.
                        {" "}
                        <Link href="/record" className="text-accent-brand hover:underline">
                          לסימון קורס בינארי ←
                        </Link>
                      </>
                    ) : (
                      <>
                        Counted automatically from courses you marked binary in your record ({binaryFromPlan})
                        {binaryExternal > 0 ? ` + ${binaryExternal} reported outside the app` : ""}.
                      </>
                    )}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Alternative assessment pointer (#34) ── */}
        <div className="data-card flex flex-wrap items-center gap-3 p-4">
          <CalendarClock className="size-5 shrink-0 text-foreground/50" />
          <p className="min-w-0 flex-1 text-xs leading-relaxed text-foreground/60">
            {isHe
              ? "יש לכם קורס עם הערכה חלופית במקום מבחן (לפי מתווה תשפ״ו)? בתכנון-המבחנים אפשר לסמן את זה — והקורס יֵצא מציר-המבחנים ויקבל שורת-הגשה משלו."
              : "Have a course with alternative assessment instead of an exam (per the 2025-26 outline)? Mark it in the exam planner — it leaves the exam timeline and gets its own submission row."}
          </p>
          <Link
            href="/exam-planner"
            className="shrink-0 rounded-lg bg-foreground/8 px-3 py-1.5 text-xs font-medium text-foreground/70 transition-colors hover:bg-foreground/15"
          >
            {isHe ? "לתכנון המבחנים" : "Exam planner"}
          </Link>
        </div>

        {/* ── The full editor (relocated from settings): group, days, 3010, playbook ── */}
        <MiluimSection />

        <div className="flex items-center gap-2 text-[11px] text-foreground/40">
          <ScaleIcon className="size-3.5" />
          {isHe
            ? "הכללים לפי מתווה תשפ״ו והתקנון — במקרה של ספק, מדור מילואים ודיקנט הסטודנטים הם הסמכות."
            : "Rules per the 2025-26 outline and regulations — when in doubt, the miluim desk and Dean of Students are the authority."}
        </div>
      </div>
    </div>
  );
}
