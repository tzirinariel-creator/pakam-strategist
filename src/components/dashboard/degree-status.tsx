"use client";

import { useState } from "react";
import {
  BookOpen,
  Scale,
  FileText,
  Languages,
  Target,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { CREDIT_REQUIREMENTS, resolveEnglishLevel } from "@/lib/constants";
import { Bidi } from "@/lib/bidi";
import { CountUp } from "@/components/ui/count-up";
import { PersonaCharacter, usePersona } from "@/components/persona/use-persona";
import { cn } from "@/lib/utils";
import type { CreditBreakdown } from "@/types/degree";

/** One PPE leg (philosophy / economics / political science / …): where the
 *  student stands against that discipline's minimum. Resolved on the dashboard
 *  from the same audit engine, so home and planner never disagree. */
export type DisciplineProgress = {
  nameHe: string;
  nameEn: string;
  color: string;
  earned: number;
  required: number;
  met: boolean;
};

/**
 * DegreeStatus — the ONE canonical "where am I in the degree" render, shared by
 * the home hero and the planner board so a student never sees two credit bars
 * that disagree (the "three surfaces" confusion). It owns the super-number, the
 * 4-segment progress bar (earned · planned · miluim-exempt · remaining) and its
 * legend — the shared core — and, in the `hero` variant, the per-discipline grid
 * and the 5 bucket cards. `compact` renders just the core for the board rail.
 *
 * All numbers come from ONE getCredits/CreditBreakdown shape — never re-derived.
 */
export function DegreeStatus({
  credits,
  isHe,
  variant,
  gpa,
  disciplines,
  hasFocusArea = true,
  amiramScore = null,
  declaredEnglishLevel = null,
  currentYear = 1,
}: {
  credits: CreditBreakdown | null;
  isHe: boolean;
  variant: "hero" | "compact";
  /** Course GPA — only used by the hero variant's soft honors reference. */
  gpa?: number | null;
  /** Per-discipline progress (hero only). Empty/undefined hides it. */
  disciplines?: DisciplineProgress[];
  hasFocusArea?: boolean;
  amiramScore?: number | null;
  /** #23 — level declared directly (grade sheet / settings); overrides the score. */
  declaredEnglishLevel?: string | null;
  currentYear?: number;
}) {
  const Arrow = isHe ? ArrowLeft : ArrowRight;
  const target = CREDIT_REQUIREMENTS.TOTAL;
  const isHero = variant === "hero";
  // The coronation below is the advisor personally marking the finish — so it
  // is the advisor the student chose, in that advisor's own words.
  const { isReferent } = usePersona();
  // Detail (disciplines + buckets) folds behind an expander so the hero reads
  // as ONE compass line. Year-1 students start expanded (they still need the
  // bucket map to understand the degree); returning students start collapsed.
  const [showDetail, setShowDetail] = useState(currentYear <= 1);

  // Loading skeleton: `credits === null` means the credits query hasn't landed
  // yet (getCredits always returns a real breakdown — zeros for a 0-course user
  // — so null is never an "empty student", only "still loading"). Without this
  // the hero briefly rendered "0% · 0/150" next to the plan-derived numbers that
  // HAD loaded, a jarring, contradictory flash on the two busiest screens. A new
  // user still sees a truthful 0% once their (non-null) zero-breakdown arrives.
  if (credits === null) {
    return (
      <div className="animate-pulse" aria-hidden="true">
        <div className={cn("flex items-baseline gap-2.5", isHero ? "mb-4" : "mb-2")}>
          <div className={cn("rounded-md bg-foreground/10", isHero ? "h-9 w-20" : "h-7 w-14")} />
          <div className="h-4 w-28 rounded bg-foreground/10" />
        </div>
        {isHero && <div className="mb-2 h-8 w-40 rounded-md bg-foreground/10" />}
        <div className={cn("w-full rounded-full bg-foreground/10", isHero ? "mt-2 h-3" : "h-2")} />
        <div className="mt-1.5 h-3 w-32 rounded bg-foreground/10" />
      </div>
    );
  }

  const earned = credits?.earned ?? 0;
  const planned = credits?.planned ?? 0;
  const exempt = credits?.miluimExemption ?? 0;
  // "הושלמו" must mean COMPLETED — only earned credits + the miluim exemption
  // (which IS granted), NEVER planned courses. A student who lays out their whole
  // degree in the planner must not see "100% מהתואר הושלמו" or a coronation for a
  // degree with zero courses done. The planned portion lives in the segmented bar
  // below, honestly separated (launch audit 24.7).
  const earnedEffective = earned + exempt;
  const remaining = Math.max(0, target - earnedEffective);

  const degreePct = target > 0 ? Math.min(100, Math.round((earnedEffective / target) * 100)) : 0;

  const pct = (n: number) => `${Math.min((n / target) * 100, 100)}%`;
  // Cumulative widths so the segments stack start→end without overlap.
  const earnedW = pct(earned);
  const plannedW = pct(earned + planned);
  const exemptW = pct(earned + planned + exempt);

  const nearHonors = gpa != null && gpa >= 90;

  const buckets: {
    key: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    current: number;
    target: number;
    unit: string;
  }[] = [
    {
      key: "mandatory",
      label: isHe ? "חובה" : "Mandatory",
      icon: BookOpen,
      current: credits?.mandatory ?? 0,
      target: CREDIT_REQUIREMENTS.MANDATORY_TOTAL,
      unit: isHe ? "ש״ס" : "cr.",
    },
    {
      key: "elective",
      label: isHe ? "בחירה" : "Elective",
      icon: Scale,
      current: credits?.elective ?? 0,
      target: CREDIT_REQUIREMENTS.ELECTIVE_TOTAL,
      unit: isHe ? "ש״ס" : "cr.",
    },
    {
      key: "seminar",
      label: isHe ? "סמינרים" : "Seminars",
      icon: FileText,
      current: credits?.seminar ?? 0,
      target: CREDIT_REQUIREMENTS.SEMINAR_TOTAL,
      unit: isHe ? "ש״ס" : "cr.",
    },
    {
      key: "focus",
      label: isHe ? "תחום מיקוד" : "Focus",
      icon: Target,
      current: credits?.focusArea ?? 0,
      target: credits?.focusAreaTarget ?? CREDIT_REQUIREMENTS.FOCUS_AREA_MIN,
      unit: isHe ? "ש״ס" : "cr.",
    },
    {
      key: "english",
      label: isHe ? "אנגלית" : "English",
      icon: Languages,
      current: credits?.englishCourseCount ?? 0,
      target: CREDIT_REQUIREMENTS.ENGLISH_MIN_COURSES,
      unit: isHe ? "קורסים" : "courses",
    },
  ];

  const englishLevel = resolveEnglishLevel(declaredEnglishLevel, amiramScore);

  return (
    <div>
      {/* 18:19 (#8) — the coronation: when the degree is 100% done, the advisor
          personally marks the moment. Gated hard on completion. */}
      {degreePct >= 100 && (
        <div
          className={cn(
            "mb-4 flex items-center gap-3 rounded-xl border bg-accent-brand/[0.05] p-3",
            // Gold framing is the King's; the Referent gets his own teal.
            isReferent ? "border-referent-teal/30" : "border-crown-gold-bright/30",
          )}
        >
          <PersonaCharacter className="size-12 shrink-0 pk-float" />
          <div>
            <p className="text-sm font-bold text-foreground/85">
              {isHe ? "סיימתם את כל הש״ס — כל הכבוד!" : "All credits complete — congratulations!"}
            </p>
            <p className="text-xs text-foreground/60">
              {isReferent
                ? isHe
                  ? "זהו, הש״ס סגורים. נשאר רק החלק הביורוקרטי — לסגור את זה פורמלית מול המזכירות."
                  : "That's the credits done. All that's left is the bureaucratic part — close it formally with the office."
                : isHe
                  ? "עברתם את הפוליס אבן-אבן. נשאר רק לסגור פורמלית מול המזכירות."
                  : "You built the polis stone by stone. Just close it formally with the office."}
            </p>
          </div>
        </div>
      )}

      {/* Super-number — the single "where am I in the degree" line. */}
      <div className={cn("flex items-baseline gap-2.5", isHero ? "mb-4" : "mb-2")}>
        <span
          className={cn(
            "font-display font-bold tabular-nums text-accent-brand",
            isHero ? "text-4xl" : "text-2xl",
          )}
          dir="ltr"
        >
          <CountUp value={degreePct} />%
        </span>
        <div className="flex flex-col">
          <span className={cn("font-semibold text-foreground/80", isHero ? "text-sm" : "text-xs")}>
            {isHe ? "מהתואר הושלמו" : "of the degree done"}
          </span>
          {remaining <= 0 && (
            <span className="text-xs text-emerald-500">
              {isHe ? "כל הש״ס הושלמו" : "all credits complete"}
            </span>
          )}
        </div>
      </div>

      {/* Headline: earned / target + remaining (hero shows the honors reference). */}
      {isHero && (
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="flex items-baseline gap-1.5">
              {/* RTL: number "107 / 150" is LTR-isolated; "ש״ס" stays RTL. */}
              <bdi dir="ltr" className="inline-flex items-baseline gap-1.5">
                <span className="font-mono text-3xl font-bold tabular-nums text-foreground/85">
                  <CountUp value={earnedEffective} />
                </span>
                <span className="font-mono text-base text-foreground/60">/ {target}</span>
              </bdi>
              <span className="ms-1 text-sm text-foreground/60">{isHe ? "ש״ס" : "cr."}</span>
            </div>
            <p className="mt-0.5 text-xs text-foreground/60">
              <Bidi
                text={
                  remaining > 0
                    ? isHe
                      ? `נשאר להשלים ${remaining} ש״ס`
                      : `${remaining} credits left`
                    : isHe
                      ? "השלמת את כל הש״ס לתואר"
                      : "All degree credits complete"
                }
              />
            </p>
            {nearHonors && gpa != null && (
              <p className="mt-0.5 text-[11px] text-foreground/60">
                {/* HONESTY: gpa here is the CUMULATIVE course average, but honors
                    is a per-STUDY-YEAR weighted average (honors.ts). So we must
                    NOT claim "you're in honors range" off the cumulative number —
                    we attribute it to the overall average and say honors is yearly,
                    pointing to /record where the true per-year check lives. */}
                {/* Ariel, 21.8: "לגבי כל נושא ההצטיינות - צריך להבהיר שמדובר
                    במשהו שצריך לקחת בערבון מוגבל … בסוף זה אחוזים ויחסי אז שום
                    דבר לא מוחלט".
                    טל, the PPE secretary, describes it as a PERCENTILE decided
                    around March against that year's cohort — roughly the top 3%
                    for dean's list, which has *happened* to land near 97, and
                    ~15% for a degree awarded with honours, near 92. Those are
                    outcomes, not thresholds: nobody knows the cut-off until the
                    lists are drawn, including her. So we name the historical
                    numbers as historical, and never imply a bar was cleared. */}
                <Bidi
                  text={
                    isHe
                      ? `הממוצע הכולל שלך גבוה. הצטיינות נקבעת לפי ממוצע שנתי ולפי אחוזון מול המחזור — לא לפי סף קבוע — ונסגרת סביב מרץ. בשנים קודמות החתך היה בסביבות 97 לדקאן ו-92 לתואר בהצטיינות.`
                      : `Your overall average is high. Honours goes by yearly average and by percentile against your cohort — not a fixed bar — and is settled around March. In past years the cut-off landed near 97 for dean's list and 92 for a degree with honours.`
                  }
                />
              </p>
            )}
          </div>
        </div>
      )}

      {/* 4-segment progress: earned · planned · miluim-exempt · remaining */}
      <div className={cn("flex w-full overflow-hidden rounded-full bg-foreground/10", isHero ? "mt-2 h-3" : "h-2")}>
        <div className="h-full bg-foreground transition-all duration-500" style={{ width: earnedW }} />
        <div
          className="h-full bg-foreground/30 transition-all duration-500"
          style={{ width: `calc(${plannedW} - ${earnedW})` }}
        />
        {exempt > 0 && (
          <div
            className="h-full bg-emerald-400/60 transition-all duration-500"
            style={{ width: `calc(${exemptW} - ${plannedW})` }}
          />
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-foreground/60">
        <Legend className="bg-foreground" label={isHe ? `${earned} הושלמו` : `${earned} done`} />
        {planned > 0 && (
          <Legend className="bg-foreground/30" label={isHe ? `${planned} מתוכננים` : `${planned} planned`} />
        )}
        {exempt > 0 && (
          <Legend
            className="bg-emerald-400/60"
            label={isHe ? `${exempt} פטור מילואים` : `${exempt} miluim exempt`}
          />
        )}
      </div>

      {/* Detail expander — the disciplines + buckets map folds away so the hero
          reads as a compass, not a form. Year-1 defaults open (see above). */}
      {isHero && (
        <button
          type="button"
          onClick={() => setShowDetail((s) => !s)}
          aria-expanded={showDetail}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-foreground/60 transition-colors hover:text-foreground/80"
        >
          <ChevronDown className={cn("size-3.5 transition-transform", showDetail && "rotate-180")} />
          {showDetail
            ? isHe ? "הסתירו פירוט" : "Hide breakdown"
            : isHe ? "הציגו פירוט לפי דיסציפלינה וקטגוריה" : "Show breakdown by discipline & category"}
        </button>
      )}

      {/* Per-discipline breakdown — the three PPE legs (hero only). */}
      {isHero && showDetail && disciplines && disciplines.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-[11px] font-medium text-foreground/60">
            {isHe ? "לפי דיסציפלינה" : "By discipline"}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
            {disciplines.map((d) => {
              const dpct = d.required > 0 ? Math.min((d.earned / d.required) * 100, 100) : 0;
              return (
                <div key={d.nameEn}>
                  <div className="flex items-baseline justify-between gap-2 text-[11px]">
                    <span className="flex items-center gap-1.5 text-foreground/65">
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: d.color }}
                      />
                      {isHe ? d.nameHe : d.nameEn}
                    </span>
                    <span className="font-mono tabular-nums text-foreground/60" dir="ltr">
                      {d.earned}/{d.required}
                      {d.met && <span className="text-emerald-500"> ✓</span>}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-foreground/8">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${dpct}%`,
                        backgroundColor: d.met ? "rgb(52 211 153)" : d.color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Bucket breakdown — the "what's left" by category (hero only). */}
      {isHero && showDetail && (
        <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          {buckets.map((b) => {
            const met = b.current >= b.target;
            const bpct = b.target > 0 ? Math.min((b.current / b.target) * 100, 100) : 0;
            const Icon = b.icon;

            if (b.key === "focus" && !hasFocusArea) {
              return (
                <Link
                  key={b.key}
                  href="/settings"
                  className="group flex flex-col justify-between rounded-xl border border-dashed border-foreground/25 bg-foreground/[0.02] p-3 transition-colors hover:border-foreground/40 hover:bg-foreground/[0.04]"
                >
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground/60">
                    <Target className="size-3.5" />
                    {b.label}
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-sm font-semibold text-foreground/80">
                    {isHe ? "בחרו תחום" : "Choose one"}
                    <Arrow className="size-3 transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
                  </div>
                </Link>
              );
            }

            return (
              <div key={b.key} className="rounded-xl border border-border/60 bg-foreground/[0.02] p-3">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground/60">
                  <Icon className="size-3.5" />
                  {b.label}
                  {met && <CheckCircle2 className="ms-auto size-3.5 text-emerald-400" />}
                </div>
                <div className="mt-1 flex items-baseline gap-1" dir="ltr">
                  <span className="font-mono text-lg font-bold tabular-nums text-foreground/85">
                    {b.current}
                  </span>
                  <span className="font-mono text-xs text-foreground/60">/ {b.target}</span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-foreground/8">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      met ? "bg-emerald-400" : "bg-foreground/45",
                    )}
                    style={{ width: `${bpct}%` }}
                  />
                </div>
                {b.key === "english" && englishLevel && (
                  <p
                    className={cn(
                      "mt-1 text-xs leading-tight",
                      englishLevel.isExempt ? "text-emerald-500/80" : "text-amber-500/90",
                    )}
                  >
                    {isHe ? englishLevel.nameHe : englishLevel.nameEn}
                    {!englishLevel.isExempt &&
                      (currentYear <= 1
                        ? isHe
                          ? englishLevel.levelCourses === 1
                            ? " · נשאר קורס-רמה אחד עד פטור"
                            : ` · נשארו ${englishLevel.levelCourses} קורסי-רמה עד פטור`
                          : englishLevel.levelCourses === 1
                            ? " · one level course to exemption"
                            : ` · ${englishLevel.levelCourses} level courses to exemption`
                        : isHe
                          ? " · ודאו שיש לכם פטור — הדדליין היה סוף שנה א׳"
                          : " · ensure you're exempt — deadline was end of year 1")}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Humanities honors annual weighted-average threshold (dean's list), approx and
// drifts year to year (see docs/דומיין-עומק.md). Shown as a soft reference only.
const HONORS_THRESHOLD = 95;

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("size-2 rounded-full", className)} />
      {label}
    </span>
  );
}
