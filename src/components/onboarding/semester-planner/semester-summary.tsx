"use client";

import { useTranslations, useLocale } from "next-intl";
import { CheckCircle, Calendar, Feather, Gauge, Weight, Flame, Pencil, Loader2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { calculateHonestLoad, type HonestLoadLabel } from "@/lib/workload-calculator";
import { SEMESTER_CONFIG, YEAR_CONFIG } from "@/lib/constants";
import type { CourseWithSchedule } from "@/lib/plan-generator";

// P3′ — the summary speaks the HONEST load language (worst real pain), not a
// magic 0-100 level. Same vocabulary as the insights bar.
const LEVEL_ICONS: Record<HonestLoadLabel, React.ComponentType<{ className?: string }>> = {
  light: Feather,
  hours: Gauge,
  credits: Weight,
  examCrunch: Flame,
};

const LEVEL_LABELS_HE: Record<HonestLoadLabel, string> = {
  light: "עומס קל",
  hours: "שבוע עמוס שעות",
  credits: "עומס ש״ס",
  examCrunch: "מבחנים צפופים",
};

const LEVEL_LABELS_EN: Record<HonestLoadLabel, string> = {
  light: "Light load",
  hours: "Heavy contact week",
  credits: "Credit-heavy",
  examCrunch: "Exams packed",
};

const LEVEL_COLORS: Record<HonestLoadLabel, string> = {
  light: "text-emerald-400",
  hours: "text-amber-500",
  credits: "text-amber-500",
  examCrunch: "text-red-400",
};

interface SemesterSummaryProps {
  year: number;
  semester: "FALL" | "SPRING";
  courses: CourseWithSchedule[];
  totalCredits: number;
  hasMoreSemesters: boolean;
  onPlanNext: () => void;
  onFinish: () => void;
  /** Return to editing THIS semester (lossless) — "I forgot something" (#28). */
  onBack: () => void;
  /** Persisting the plan to the server (standalone edit). Drives the finish
   *  button's "saving…" state so the slow prod DB save feels responsive and the
   *  user doesn't double-submit or wonder whether it took (#18). Onboarding
   *  omits it — there the "finish" just advances a step, no async save. */
  isSaving?: boolean;
  /** P4 (note 35): this summary opened AUTOMATICALLY because the semester is
   *  mandatory-heavy — the copy presents a READY recommended timetable to
   *  confirm, not a "you finished building" congratulation. */
  autoRecommended?: boolean;
  /** #11 (12.7) — how many courses still have SEVERAL possible groups. >0
   *  surfaces a dedicated "בחרו קבוצות" step before confirming blindly. */
  multiGroupCount?: number;
  /** 18:19 (#6) — when the declared semester has already ENDED, group choice
   *  is moot (you're just marking what you took) — suppress the nudge. */
  semesterOver?: boolean;
}

export function SemesterSummary({
  year,
  semester,
  courses,
  totalCredits,
  hasMoreSemesters,
  onPlanNext,
  onFinish,
  onBack,
  isSaving = false,
  autoRecommended = false,
  multiGroupCount = 0,
  semesterOver = false,
}: SemesterSummaryProps) {
  const t = useTranslations("onboarding");
  const locale = useLocale();
  const isHe = locale === "he";

  // Three verifiable facts (P3′): contact hours from the actual grid sessions
  // (the caller passes semester+group-filtered courses), ש״ס, exam density.
  const honest = calculateHonestLoad(
    courses.map((c) => ({
      credits: c.credits,
      sessions: (c.scheduleSessions ?? []).map((s) => ({
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
      })),
      examDate: c.examDateA ?? null,
    }))
  );

  const semesterCredits = courses.reduce((s, c) => s + c.credits, 0);
  const yearLabel = isHe
    ? YEAR_CONFIG[year as 1 | 2 | 3]?.nameHe
    : YEAR_CONFIG[year as 1 | 2 | 3]?.nameEn;
  const semLabel = isHe
    ? SEMESTER_CONFIG[semester]?.nameHe
    : SEMESTER_CONFIG[semester]?.nameEn;
  const levelLabel = isHe ? LEVEL_LABELS_HE[honest.label] : LEVEL_LABELS_EN[honest.label];
  const IconComponent = LEVEL_ICONS[honest.label] ?? Feather;

  return (
    <div className="animate-fade-in w-full max-w-md mx-auto">
      <div className="data-card space-y-5 p-6 text-center">
        {/* Success icon */}
        <div className="flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-400/10">
            <CheckCircle className="h-7 w-7 text-emerald-400" />
          </div>
        </div>

        <div>
          <h3 className="text-lg font-bold text-foreground/90">
            {autoRecommended
              ? (isHe ? "המערכת המומלצת מוכנה" : "Your recommended timetable is ready")
              : t("semesterDone")}
          </h3>
          <p className="mt-1 text-sm text-foreground/50">
            {yearLabel} · {semLabel}
          </p>
          {autoRecommended && (
            <p className="mt-1.5 text-xs text-foreground/45">
              {isHe
                ? "רוב הסמסטר הזה חובה, אז הרכבנו אותו בשבילכם — אפשר לאשר, או לחזור לעריכה ולשנות."
                : "Most of this semester is mandatory, so we assembled it for you — confirm, or go back and tweak."}
            </p>
          )}
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-foreground/5 p-3">
            <div className="font-mono text-xl font-bold text-foreground/80">{courses.length}</div>
            <div className="text-[10px] text-foreground/40">{t("courses")}</div>
          </div>
          <div className="rounded-lg bg-foreground/5 p-3">
            <div className="font-mono text-xl font-bold text-foreground/80">{semesterCredits}</div>
            <div className="text-[10px] text-foreground/40">{t("nz")}</div>
          </div>
          <div
            className="rounded-lg bg-foreground/5 p-3"
            title={
              isHe
                ? `${honest.weeklyHours} שעות לימוד בשבוע · ${honest.credits} ש״ס${honest.tightestExamGapDays != null ? ` · מרווח מבחנים צפוף ביותר ${honest.tightestExamGapDays} ימים` : ""}`
                : `${honest.weeklyHours} weekly contact hours · ${honest.credits} cr.${honest.tightestExamGapDays != null ? ` · tightest exam gap ${honest.tightestExamGapDays} days` : ""}`
            }
          >
            <div className={cn("flex items-center justify-center gap-1", LEVEL_COLORS[honest.label])}>
              <IconComponent className="size-5" />
              <span className="font-mono text-xl font-bold">{honest.weeklyHours}</span>
            </div>
            <div className="text-[10px] text-foreground/40">
              {isHe ? "שעות לימוד בשבוע" : "weekly class hours"}
            </div>
          </div>
        </div>

        {/* #6 (12.7) — the load verdict, in a sentence a beginner understands
            instead of a cryptic "ש׳ מגע · מבחנים צפופים" chip. */}
        {honest.label !== "light" && (
          <p className={cn("text-xs leading-relaxed", LEVEL_COLORS[honest.label])}>
            {isHe
              ? honest.label === "examCrunch"
                ? `שימו לב: המבחנים בסמסטר הזה יוצאים קרובים זה לזה${honest.tightestExamGapDays != null ? ` (המרווח הצפוף ביותר — ${honest.tightestExamGapDays} ימים)` : ""}. שווה לתכנן את הלמידה מראש — יש לנו כלי בדיוק לזה.`
                : honest.label === "hours"
                  ? `זה שבוע עמוס בשעות (${honest.weeklyHours} שעות-לימוד) — לגמרי אפשרי, רק ודאו שאין יום בלתי-אפשרי.`
                  : `הסמסטר כבד בש״ס — נורמלי לפכ״מ, אבל טוב לדעת את זה מראש.`
              : levelLabel}
          </p>
        )}

        {/* B1 (audit launch-blocker) — the actual courses being confirmed.
            Blind approval on a 3-number card was the worst first-run moment;
            now the beginner sees exactly what "the recommended timetable" is. */}
        {courses.length > 0 && (
          <div className="space-y-1.5 rounded-lg border border-border/50 bg-foreground/[0.02] p-3 text-start">
            <p className="text-[11px] font-medium text-foreground/45">
              {isHe ? "הקורסים בסמסטר הזה:" : "Courses this semester:"}
            </p>
            <ul className="space-y-1">
              {courses.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate text-foreground/75">
                    {isHe ? c.nameHe : (c.nameEn ?? c.nameHe)}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-foreground/40">
                    {c.credits} {isHe ? "ש״ס" : "cr."}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Total progress */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-foreground/50">{t("creditsPlannedSoFar")}</span>
            <span className="font-mono font-medium text-foreground/70" dir="ltr">
              {totalCredits}/150
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-foreground/10">
            <div
              className="progress-gradient h-full rounded-full transition-all duration-700"
              style={{ width: `${Math.min((totalCredits / 150) * 100, 100)}%` }}
            />
          </div>
        </div>

        {/* #11 (12.7) — group choice is a real decision, not a footnote: when
            courses still have several groups, offer the dedicated step. */}
        {multiGroupCount > 0 && !semesterOver && (
          <button
            type="button"
            onClick={onBack}
            disabled={isSaving}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-accent-brand/40 bg-accent-brand/[0.06] px-6 py-3 text-sm font-semibold text-accent-brand transition-all hover:bg-accent-brand/10 press-scale disabled:opacity-50"
          >
            <Users className="h-4 w-4" />
            {isHe
              ? multiGroupCount === 1
                ? "לקורס אחד יש כמה קבוצות — בחרו את שלכם על המערכת"
                : `ל-${multiGroupCount} קורסים יש כמה קבוצות — בחרו את שלכם על המערכת`
              : `${multiGroupCount} course(s) have several groups — pick yours on the grid`}
          </button>
        )}

        {/* CTAs */}
        <div className="flex flex-col gap-2.5 pt-2">
          {hasMoreSemesters && (
            <button
              onClick={onPlanNext}
              disabled={isSaving}
              className="bg-foreground flex items-center justify-center gap-2 rounded-xl px-6 py-3 font-bold text-background shadow-sm transition-all hover:scale-[1.02] press-scale disabled:opacity-50"
            >
              <Calendar className="h-4 w-4" />
              {t("planNextSemester")}
            </button>
          )}
          <button
            onClick={onFinish}
            disabled={isSaving}
            aria-busy={isSaving}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-medium transition-all disabled:cursor-wait",
              hasMoreSemesters
                ? "border-2 border-border text-foreground/60 hover:border-foreground/30 hover:text-foreground/80 disabled:opacity-60"
                : "bg-foreground font-bold text-background shadow-sm hover:scale-[1.02] press-scale disabled:opacity-80"
            )}
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("savingPlan")}
              </>
            ) : (
              t("finishPlanning")
            )}
          </button>
          {/* Tertiary: go back to editing this semester — lossless (#28). */}
          <button
            onClick={onBack}
            disabled={isSaving}
            className="flex items-center justify-center gap-1.5 rounded-xl px-6 py-2 text-xs font-medium text-foreground/45 transition-colors hover:text-foreground/70 disabled:opacity-50"
          >
            <Pencil className="h-3 w-3" />
            {isHe ? "הצגה ועריכה של הקורסים" : "View & edit the courses"}
          </button>
        </div>
      </div>
    </div>
  );
}
