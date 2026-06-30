"use client";

import {
  GraduationCap,
  BookOpen,
  Scale,
  FileText,
  Languages,
  Target,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { CREDIT_REQUIREMENTS, GRADE_REQUIREMENTS, getEnglishLevel } from "@/lib/constants";
import { roundScore } from "@/lib/grade-calculator";
import { Bidi } from "@/lib/bidi";

// Humanities honors annual weighted-average threshold (dean's list), approx and
// drifts year to year (see docs/דומיין-עומק.md). Shown as a soft reference only.
const HONORS_THRESHOLD = 95;
import { cn } from "@/lib/utils";
import type { CreditBreakdown, GradeBreakdown } from "@/types/degree";

/**
 * "המצב שלי" — the unified status hero.
 *
 * The single answer to "where am I in the degree?": one coherent view that
 * synthesizes credits, the per-bucket breakdown (mandatory / elective / seminar
 * / English / focus area), the GPA, and the miluim-adjusted target — instead of
 * scattering them across separate widgets. This is the command center a
 * mid-degree student lands on.
 */
export function MyStatusHero({
  credits,
  grade,
  isHe,
  topGap,
  hasFocusArea,
  amiramScore,
  currentYear,
}: {
  credits: CreditBreakdown | null;
  grade: GradeBreakdown;
  isHe: boolean;
  /** The single most pressing unmet requirement, if any. */
  topGap?: { nameHe: string; nameEn: string } | null;
  /** Whether the student has chosen a focus-area discipline. */
  hasFocusArea: boolean;
  /** Amiram/Amirnet English placement score (50–150), or null. */
  amiramScore: number | null;
  /** Academic year (1–3). English LEVEL courses are only relevant in year 1 —
   *  the exemption deadline is end of year 1, so year-2+ students shouldn't be
   *  nudged about level courses (#11). The 2 CONTENT courses still count. */
  currentYear: number;
}) {
  const Arrow = isHe ? ArrowLeft : ArrowRight;
  const target = CREDIT_REQUIREMENTS.TOTAL;

  const earned = credits?.earned ?? 0;
  const planned = credits?.planned ?? 0;
  const exempt = credits?.miluimExemption ?? 0;
  const effective = credits?.effectiveTotal ?? earned + planned + exempt;
  const remaining = Math.max(0, target - effective);

  const pct = (n: number) => `${Math.min((n / target) * 100, 100)}%`;
  // Cumulative widths so the segments stack left→start without overlap.
  const earnedW = pct(earned);
  const plannedW = pct(earned + planned);
  const exemptW = pct(earned + planned + exempt);

  // Per-bucket progress. current = earned+planned (countable); target from reqs.
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
      label: isHe ? "התמחות" : "Focus",
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

  const gpa = roundScore(grade.courseAverage);
  const gpaBar = GRADE_REQUIREMENTS.YEAR_TRANSITION_OVERALL_GPA;
  const englishLevel = getEnglishLevel(amiramScore);
  // Soft honors reference: only when the average is high enough to be relevant.
  const nearHonors = gpa !== null && gpa >= 90;

  return (
    <div className="data-card p-5 md:p-6">
      <div className="mb-4 flex items-center gap-2">
        <GraduationCap className="h-5 w-5 text-accent-brand" />
        <h2 className="font-display text-lg font-bold text-foreground/90">
          {isHe ? "המצב שלי" : "My status"}
        </h2>
        {gpa !== null && (
          <span
            dir="ltr"
            className={cn(
              "ms-auto inline-flex items-baseline gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
              gpa >= gpaBar
                ? "bg-emerald-400/10 text-emerald-500"
                : "bg-amber-400/10 text-amber-500"
            )}
          >
            <span className="font-mono font-bold tabular-nums">{gpa.toFixed(1)}</span>
            <span className="opacity-60">{isHe ? "ממוצע" : "GPA"}</span>
          </span>
        )}
      </div>

      {/* Headline: remaining to complete */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="flex items-baseline gap-1.5" dir="ltr">
            <span className="font-mono text-3xl font-bold tabular-nums text-foreground/85">
              {effective}
            </span>
            <span className="font-mono text-base text-foreground/40">/ {target}</span>
            <span className="ms-1 text-sm text-foreground/50">{isHe ? "ש״ס" : "cr."}</span>
          </div>
          <p className="mt-0.5 text-xs text-foreground/55">
            <Bidi
              text={
                remaining > 0
                  ? isHe
                    ? `נשאר להשלים ${remaining} ש״ס`
                    : `${remaining} credits left`
                  : isHe
                    ? "השלמת את כל הש״ס לתואר 🎉"
                    : "All degree credits complete 🎉"
              }
            />
          </p>
          {/* Soft honors reference (annual weighted avg ≈95, drifts yearly). */}
          {nearHonors && gpa !== null && (
            <p className="mt-0.5 text-[11px] text-foreground/45">
              <Bidi
                text={
                  gpa >= HONORS_THRESHOLD
                    ? isHe
                      ? `בטווח ההצטיינות (סף שנתי סביב ${HONORS_THRESHOLD}) 🎓`
                      : `In honors range (annual bar ~${HONORS_THRESHOLD}) 🎓`
                    : isHe
                      ? `קרוב לטווח ההצטיינות — סף שנתי סביב ${HONORS_THRESHOLD}`
                      : `Close to honors — annual bar ~${HONORS_THRESHOLD}`
                }
              />
            </p>
          )}
        </div>
      </div>

      {/* 4-segment progress: earned · planned · miluim-exempt · remaining */}
      <div className="mt-2 flex h-3 w-full overflow-hidden rounded-full bg-foreground/10">
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
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-foreground/50">
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

      {/* Bucket breakdown — the "what's left" by category */}
      <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {buckets.map((b) => {
          const met = b.current >= b.target;
          const bpct = b.target > 0 ? Math.min((b.current / b.target) * 100, 100) : 0;
          const Icon = b.icon;

          // No focus area chosen yet → the focus card becomes a clear CTA to
          // pick one (reported #34: it showed "null" and didn't guide).
          if (b.key === "focus" && !hasFocusArea) {
            return (
              <Link
                key={b.key}
                href="/settings"
                className="group flex flex-col justify-between rounded-xl border border-dashed border-foreground/25 bg-foreground/[0.02] p-3 transition-colors hover:border-foreground/40 hover:bg-foreground/[0.04]"
              >
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground/55">
                  <Target className="size-3.5" />
                  {b.label}
                </div>
                <div className="mt-1 flex items-center gap-1 text-sm font-semibold text-foreground/80">
                  {isHe ? "בחר תחום" : "Choose one"}
                  <Arrow className="size-3 transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
                </div>
              </Link>
            );
          }

          return (
            <div
              key={b.key}
              className="rounded-xl border border-border/60 bg-foreground/[0.02] p-3"
            >
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground/55">
                <Icon className="size-3.5" />
                {b.label}
                {met && <CheckCircle2 className="ms-auto size-3.5 text-emerald-400" />}
              </div>
              <div className="mt-1 flex items-baseline gap-1" dir="ltr">
                <span className="font-mono text-lg font-bold tabular-nums text-foreground/85">
                  {b.current}
                </span>
                <span className="font-mono text-xs text-foreground/40">/ {b.target}</span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-foreground/8">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    met ? "bg-emerald-400" : "bg-foreground/45"
                  )}
                  style={{ width: `${bpct}%` }}
                />
              </div>
              {/* English bucket also surfaces the Amiram placement level (#18). */}
              {b.key === "english" && englishLevel && (
                <p
                  className={cn(
                    "mt-1 text-[10px] leading-tight",
                    englishLevel.isExempt ? "text-emerald-500/80" : "text-amber-500/90"
                  )}
                >
                  {isHe ? englishLevel.nameHe : englishLevel.nameEn}
                  {!englishLevel.isExempt &&
                    (currentYear <= 1
                      ? isHe
                        ? ` · ${englishLevel.levelCourses} קורסי רמה`
                        : ` · ${englishLevel.levelCourses} level course(s)`
                      : isHe
                        ? " · ודא שיש לך פטור — הדדליין היה סוף שנה א׳"
                        : " · ensure you're exempt — deadline was end of year 1")}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* The single most pressing thing left + jump to the full breakdown */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-3">
        {topGap ? (
          <p className="text-xs text-foreground/60">
            {isHe ? "הכי חשוב עכשיו: " : "Most pressing: "}
            <span className="font-medium text-foreground/80">
              {isHe ? topGap.nameHe : topGap.nameEn}
            </span>
          </p>
        ) : (
          <p className="text-xs text-foreground/45">
            {isHe ? "אתה בכיוון הנכון — המשך לתכנן." : "You're on track — keep planning."}
          </p>
        )}
        <Link
          href="/regulations"
          className="inline-flex items-center gap-1 text-xs font-medium text-foreground/60 transition-colors hover:text-foreground/85"
        >
          {isHe ? "פירוט מלא של הדרישות" : "Full requirement breakdown"}
          <Arrow className="size-3" />
        </Link>
      </div>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("size-2 rounded-full", className)} />
      {label}
    </span>
  );
}
