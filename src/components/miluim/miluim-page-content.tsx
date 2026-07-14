"use client";

// =========================================================================
// /miluim — the dedicated reserve-duty hub (12.7 notes #18/#20/#21/#32).
// Everything the app can DERIVE is derived (per-year exemption entitlement
// from the recorded semesters, binary conversions counted from the plan);
// only real-world facts the app can't know (what was actually redeemed at
// the miluim desk) stay manual. The editor + 3010 uploader + playbook are
// the battle-tested components relocated from settings.
// =========================================================================

import { useLocale } from "next-intl";
import { Shield, CalendarRange, BadgeCheck, Scale as ScaleIcon, CalendarClock } from "lucide-react";
import { api } from "@/lib/trpc/react";
import { Link } from "@/i18n/navigation";
import { MiluimSection } from "@/components/settings/settings-content";
import { deriveExemptionEntitlement, type MiluimSemesterLite } from "@/lib/miluim";
import { MILUIM_CONFIG } from "@/lib/constants";
import { hebrewYearLabel } from "@/lib/academic-calendar";
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

  const semestersQuery = api.user.listMiluimSemesters.useQuery();
  const profileQuery = api.user.getProfile.useQuery();
  const planQuery = api.plan.getUserPlan.useQuery();

  const rows = (semestersQuery.data ?? []) as MiluimSemesterLite[];
  const entitlement = deriveExemptionEntitlement(rows);
  const creditsUsed = profileQuery.data?.miluimCreditsUsed ?? 0;

  // #18 — binary conversions are COUNTED from the plan, not typed by hand.
  const binaryFromPlan = (planQuery.data?.courses ?? []).filter(
    (c) => (c as { isBinary?: boolean }).isBinary,
  ).length;
  const binaryExternal = profileQuery.data?.miluimBinaryUsed ?? 0;
  const binaryTotal = binaryFromPlan + binaryExternal;

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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-foreground/40">
            {isHe
              ? "הקבוצה נקבעת מחדש בכל סמסטר לפי הימים של אותו סמסטר. עדכון או הוספה — בעורך למטה או דרך טופס 3010."
              : "The group is re-assigned each semester from that semester's days. Update or add — in the editor below or via Form 3010."}
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
              <p className="mt-1 font-mono text-xl font-bold text-foreground/85">
                <bdi dir="ltr">{binaryTotal}/5</bdi>
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
