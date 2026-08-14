"use client";

import { useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  BookOpen,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  GraduationCap,
  Sun,
  Coffee,
  Calendar,
  Briefcase,
  Zap,
  Lightbulb,
  Feather,
  Gauge,
  Weight,
  Flame,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { calculateHonestLoad, type HonestLoadLabel } from "@/lib/workload-calculator";
import { findDenseDay } from "@/lib/schedule-density";
import { hhmmToHours } from "@/lib/time-of-day";
import { Bidi } from "@/lib/bidi";
import type { ComboPreferences } from "@/lib/combo-finder";
import { CREDIT_REQUIREMENTS, DISCIPLINE_CONFIG } from "@/lib/constants";
import { ARAZIM_ENABLED } from "@/lib/arazim/visibility";
import { conflictDayLabel, type PlannerConflict } from "@/lib/planner-conflicts";
import type { CourseWithSchedule } from "@/lib/plan-generator";

// ─── Constants ────────────────────────────────────────────────────────

// P3′ — the load chip speaks the HONEST metric's language: it names the worst
// real pain (hours / credits / exam crunch) instead of a magic 0-100 level.
const LEVEL_ICONS: Record<HonestLoadLabel, React.ComponentType<{ className?: string }>> = {
  light: Feather,
  hours: Gauge,
  credits: Weight,
  examCrunch: Flame,
};

const LEVEL_LABELS_HE: Record<HonestLoadLabel, string> = {
  light: "קל",
  hours: "שבוע עמוס שעות",
  credits: "עומס ש״ס",
  examCrunch: "מבחנים צפופים",
};

const LEVEL_LABELS_EN: Record<HonestLoadLabel, string> = {
  light: "Light",
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

// ─── Types ────────────────────────────────────────────────────────────

interface InsightsBarProps {
  selectedCourses: CourseWithSchedule[];
  totalCreditsPlanned: number;
  /** From `detectPlannerConflicts` — the SAME deduped pairing the grid paints
   *  red. This card used to run its own engine and could print a green "0"
   *  under a grid that was showing red. */
  conflicts: PlannerConflict[];
  /** Selected courses whose catalog rows carry no meeting times at all. Every
   *  claim about the week is only about the courses we DO have times for, and
   *  this is how the card says so instead of implying the silence is data. */
  unscheduledCount?: number;
  /** At least one course offers a group choice — so the combination search has
   *  something to search. The button used to be gated on conflicts > 0, i.e. it
   *  was hidden in exactly the case where a swap could still improve the week. */
  canSwapGroups?: boolean;
  focusArea?: string | null;
  /** P2 — "מצאו לי שילוב בלי התנגשויות". */
  onFindCombination?: (preferences?: ComboPreferences) => void;
}

// ─── Smart Schedule Insights Generator ───────────────────────────────

interface ScheduleInsight {
  icon: typeof Sun;
  text: string;
  type: "positive" | "neutral" | "warning";
}

function generateScheduleInsights(
  courses: CourseWithSchedule[],
  weekHeatmap: number[][],
  earlyMorningCount: number,
  disciplineSpread: number,
  hardCourseCount: number,
  isHe: boolean,
  /** Selected courses we hold NO meeting times for. A day only looks empty
   *  because their hours are missing, so the free-day claim has to say so. */
  unscheduledCount: number,
): ScheduleInsight[] {
  if (courses.length === 0) return [];

  const insights: ScheduleInsight[] = [];
  const dayNames = isHe
    ? ["ראשון", "שני", "שלישי", "רביעי", "חמישי"]
    : ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"];

  // 0. Difficulty balance insight
  const easyCourseCount = courses.filter(
    (c) => c.difficultyLevel === "easy"
  ).length;
  if (hardCourseCount === 0 && easyCourseCount >= 2 && courses.length >= 3) {
    insights.push({
      icon: CheckCircle,
      text: isHe
        ? "מיקס טוב — רוב הקורסים קלים עד בינוניים"
        : "Good mix — mostly easy to moderate courses",
      type: "positive",
    });
  } else if (hardCourseCount >= 2) {
    const hardNames = courses
      .filter((c) => c.difficultyLevel === "hard" || c.difficultyLevel === "very_hard")
      .map((c) => isHe ? c.nameHe : (c.nameEn ?? c.nameHe))
      .slice(0, 3);
    insights.push({
      icon: AlertTriangle,
      text: isHe
        ? `${hardCourseCount} קורסים קשים: ${hardNames.join(", ")}`
        : `${hardCourseCount} hard courses: ${hardNames.join(", ")}`,
      type: "warning",
    });
  }

  // 1. Free days. "Free" is a claim a student can ACT on — an internship, a
  // shift — so it may only be made about a week we fully know. 75 of the 302
  // תשפ״ז courses (35 of 68 seminars among them) carry no meeting rows at all,
  // and a course with no hours made its day look empty. With any such course in
  // the semester the line still appears, but as what it is: silence in the data,
  // not a free day.
  const freeDays: string[] = [];
  for (let d = 0; d < 5; d++) {
    const dayTotal = weekHeatmap[d]?.reduce((a, b) => a + b, 0) ?? 0;
    if (dayTotal === 0) freeDays.push(dayNames[d]!);
  }
  if (freeDays.length > 0 && freeDays.length < 5) {
    // A list of days is a list, not a chain of "ו". `join(" ו")` produced
    // "יום ראשון ושני וחמישי פנוי" — wrong on three counts at once: the days
    // aren't comma-separated, "יום" is singular in front of three of them, and
    // "פנוי" doesn't agree either. Hebrew joins a list with commas and one
    // final "ו", and the noun + adjective follow the count.
    const many = freeDays.length > 1;
    const dayList = isHe
      ? many
        ? `${freeDays.slice(0, -1).join(", ")} ו${freeDays[freeDays.length - 1]}`
        : freeDays[0]!
      : many
        ? `${freeDays.slice(0, -1).join(", ")} and ${freeDays[freeDays.length - 1]}`
        : freeDays[0]!;
    const heSubject = many ? `ימים ${dayList} פנויים` : `יום ${dayList} פנוי`;
    insights.push({
      icon: Coffee,
      text:
        unscheduledCount > 0
          ? isHe
            // "פנוי בקורסים שיש לנו שעות עבורם" was a sentence nobody says.
            // The caveat is the point, so it gets its own clause.
            ? `${heSubject} — אבל רק לפי הקורסים שיש לנו שעות עבורם. ${
                unscheduledCount === 1
                  ? "לאחד מקורסי הסמסטר"
                  : `ל-${unscheduledCount} מקורסי הסמסטר`
              } אין שעות בידיעון, אז אל תקבעו כלום על סמך זה`
            : `${dayList} ${many ? "look" : "looks"} clear — but only among the courses we have times for. ${
                unscheduledCount === 1
                  ? "One of this semester's courses has"
                  : `${unscheduledCount} of this semester's courses have`
              } no hours in the catalog, so don't commit to anything on it`
          : isHe
            ? `${heSubject}! אפשר לנצל לעבודה או התמחות`
            : `${dayList} ${many ? "are" : "is"} free! Use it for work or an internship`,
      type: unscheduledCount > 0 ? "neutral" : "positive",
    });
  }

  // 2. Detect front-loaded or back-loaded week
  const firstHalfHours = (weekHeatmap[0]?.reduce((a, b) => a + b, 0) ?? 0) +
    (weekHeatmap[1]?.reduce((a, b) => a + b, 0) ?? 0);
  const secondHalfHours = (weekHeatmap[3]?.reduce((a, b) => a + b, 0) ?? 0) +
    (weekHeatmap[4]?.reduce((a, b) => a + b, 0) ?? 0);
  const totalHours = weekHeatmap.reduce((t, d) => t + d.reduce((a, b) => a + b, 0), 0);

  if (totalHours > 0 && firstHalfHours > totalHours * 0.7) {
    insights.push({
      icon: Calendar,
      text: isHe
        ? "רוב הלימודים בתחילת השבוע — סוף שבוע ארוך"
        : "Most classes early in the week — long weekend ahead",
      type: "positive",
    });
  } else if (totalHours > 0 && secondHalfHours > totalHours * 0.7) {
    insights.push({
      icon: Calendar,
      text: isHe
        ? "רוב הלימודים בסוף השבוע — תחילת שבוע פנויה"
        : "Most classes later in the week — free start",
      type: "neutral",
    });
  }

  // 3. Detect back-to-back sessions — the quoted hour count is COMPUTED from
  // the real heatmap by the tested pure helper (Q10, note 12); fires only past
  // DENSE_DAY_THRESHOLD_HOURS. One alert is enough.
  const dense = findDenseDay(weekHeatmap);
  if (dense) {
    insights.push({
      icon: Zap,
      text: isHe
        ? `יום ${dayNames[dense.dayIndex]} צפוף — ${dense.hours} שעות כמעט-רצופות. שווה לשבץ הפסקה של חצי שעה באמצע, או להזיז קורס אחד ליום אחר.`
        : `${dayNames[dense.dayIndex]} is packed — ${dense.hours} near-back-to-back hours. Worth slotting a 30-min break in the middle, or moving a course to another day.`,
      type: "warning",
    });
  }

  // 4. Early bird
  if (earlyMorningCount >= 3) {
    insights.push({
      icon: Sun,
      text: isHe
        ? `${earlyMorningCount} שיעורים לפני 10:00 — בוקר מוקדם`
        : `${earlyMorningCount} classes before 10:00 — early bird schedule`,
      type: "neutral",
    });
  }

  // 5. All finish by 16:00
  let allEndEarly = true;
  for (let d = 0; d < 5; d++) {
    for (let h = 8; h < 12; h++) { // hours 16-20 (index 8-11 in our grid of 8-20)
      if ((weekHeatmap[d]?.[h] ?? 0) > 0) {
        allEndEarly = false;
        break;
      }
    }
    if (!allEndEarly) break;
  }
  if (allEndEarly && totalHours > 0) {
    insights.push({
      icon: Briefcase,
      text: isHe
        ? "כל הימים מסתיימים עד 16:00 — זמן לעבודה"
        : "All days end by 4pm — time for work",
      type: "positive",
    });
  }

  // 6. Discipline diversity
  if (disciplineSpread >= 4) {
    insights.push({
      icon: Lightbulb,
      text: isHe
        ? `${disciplineSpread} תחומים שונים — מגוון אבל מאתגר`
        : `${disciplineSpread} different disciplines — diverse but demanding`,
      type: "neutral",
    });
  }

  return insights.slice(0, 4); // max 4 insights
}

// ─── Component ────────────────────────────────────────────────────────

export function InsightsBar({
  selectedCourses,
  totalCreditsPlanned,
  conflicts,
  unscheduledCount = 0,
  canSwapGroups = false,
  focusArea,
  onFindCombination,
}: InsightsBarProps) {
  const t = useTranslations("onboarding");
  const locale = useLocale();
  const isHe = locale === "he";
  const [showConflictDetails, setShowConflictDetails] = useState(false);
  // #8 — the student's own constraints for the combination search. Local and
  // deliberately unsaved: it is a question asked at the moment of searching,
  // not a profile setting to maintain.
  const [prefs, setPrefs] = useState<ComboPreferences>({});
  const hasPrefs =
    (prefs.freeDays?.length ?? 0) > 0 ||
    prefs.earliestHour != null ||
    prefs.latestHour != null;

  // Arazim gate: difficulty comes ONLY from Arazim. With it off ("בלי ארזים
  // כרגע") null out difficultyLevel so every difficulty-based insight (hard-count
  // warnings, "balanced semester", hard-course names) goes silent instead of
  // leaning on a hidden signal. Reversible via ARAZIM_ENABLED.
  const difficultyGatedCourses = useMemo(
    () =>
      ARAZIM_ENABLED
        ? selectedCourses
        : selectedCourses.map((c) => ({ ...c, difficultyLevel: null })),
    [selectedCourses],
  );

  // Course-mix facts (P3′) — the simple, verifiable counts the tips and
  // insights need. The old 0-100 magic score is gone; these are just counts.
  const mix = useMemo(() => {
    const hardCourseCount = difficultyGatedCourses.filter(
      (c) => c.difficultyLevel === "hard" || c.difficultyLevel === "very_hard"
    ).length;
    return {
      hasSeminar: difficultyGatedCourses.some((c) => c.courseType === "SEMINAR"),
      disciplineSpread: new Set(difficultyGatedCourses.map((c) => c.discipline)).size,
      hardCourseCount,
    };
  }, [difficultyGatedCourses]);

  // Honest 3-number load (#2) — real facts, no prediction:
  //   contact hours (from the grid) · ש״ס · tightest gap between exam dates.
  const honestLoad = useMemo(() => {
    return calculateHonestLoad(
      selectedCourses.map((c) => ({
        credits: c.credits,
        // sessionType + groupCode are REQUIRED for the de-duplication inside
        // calculateHonestLoad to tell a genuine second meeting from one of the
        // catalog's duplicate rows (140 meetings are stored more than once).
        // Without them this card announced more weekly hours than the summary
        // card computed for the very same semester.
        sessions: (c.scheduleSessions ?? []).map((s) => ({
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
          sessionType: s.sessionType,
          groupCode: s.groupCode ?? null,
        })),
        examDate: c.examDateA ?? null,
      }))
    );
  }, [selectedCourses]);

  const semesterCredits = selectedCourses.reduce((s, c) => s + c.credits, 0);
  const levelLabel = isHe ? LEVEL_LABELS_HE[honestLoad.label] : LEVEL_LABELS_EN[honestLoad.label];
  const IconComponent = LEVEL_ICONS[honestLoad.label] ?? Feather;
  const conflictCount = conflicts.length;

  // Focus area credits this semester
  const focusAreaCredits = useMemo(() => {
    if (!focusArea) return 0;
    return selectedCourses
      .filter((c) => c.discipline === focusArea)
      .reduce((s, c) => s + c.credits, 0);
  }, [selectedCourses, focusArea]);

  const focusAreaCfg = focusArea
    ? DISCIPLINE_CONFIG[focusArea]
    : null;

  // ─── Extra insights data ──────────────────────────────────────────

  // Discipline balance
  const disciplineBalance = useMemo(() => {
    if (selectedCourses.length === 0) return [];
    const counts = new Map<string, number>();
    for (const c of selectedCourses) {
      const d = c.discipline || "GENERAL";
      counts.set(d, (counts.get(d) ?? 0) + c.credits);
    }
    return [...counts.entries()]
      .map(([key, credits]) => ({
        key,
        credits,
        pct: Math.round((credits / semesterCredits) * 100),
        cfg: DISCIPLINE_CONFIG[key],
      }))
      .sort((a, b) => b.credits - a.credits);
  }, [selectedCourses, semesterCredits]);

  // Early morning count (before 10:00)
  const earlyMorningCount = useMemo(() => {
    let count = 0;
    for (const c of selectedCourses) {
      for (const s of c.scheduleSessions ?? []) {
        // One HH:MM parser (lib/time-of-day); an unreadable time is not counted
        // as an early morning (the 12 fallback said exactly that, by hand).
        const hour = hhmmToHours(s.startTime);
        if (hour < 10) count++;
      }
    }
    return count;
  }, [selectedCourses]);

  // Week heatmap (5 days x 12 hours: 8-20)
  const weekHeatmap = useMemo(() => {
    const grid: number[][] = Array.from({ length: 5 }, () =>
      Array.from({ length: 12 }, () => 0)
    );
    for (const c of selectedCourses) {
      for (const s of c.scheduleSessions ?? []) {
        const dayMap: Record<string, number> = {
          SUNDAY: 0, MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4,
        };
        const dayIdx = dayMap[s.dayOfWeek];
        if (dayIdx == null) continue;
        // Both ends FLOORED, exactly as the old `parseInt(split(":")[0])` did —
        // a 10:00–11:30 meeting shades hour 10 only. Unified parser, same grid.
        const start = Math.floor(hhmmToHours(s.startTime));
        const end = Math.floor(hhmmToHours(s.endTime));
        if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
        for (let h = Math.max(start, 8); h < Math.min(end, 20); h++) {
          grid[dayIdx]![h - 8]! += 1;
        }
      }
    }
    return grid;
  }, [selectedCourses]);

  // ─── Smart schedule insights (replaces heatmap grid) ─────────────
  const scheduleInsights = useMemo(() => {
    return generateScheduleInsights(
      difficultyGatedCourses,
      weekHeatmap,
      earlyMorningCount,
      mix.disciplineSpread,
      mix.hardCourseCount,
      isHe,
      unscheduledCount,
    );
  }, [difficultyGatedCourses, weekHeatmap, earlyMorningCount, mix.disciplineSpread, mix.hardCourseCount, isHe, unscheduledCount]);

  return (
    <div className="w-full space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {/* Card 1: Credits this semester */}
        <div className="rounded-xl border border-border/40 bg-card/30 p-2.5">
          <div className="flex items-center gap-1.5">
            <BookOpen className="h-3.5 w-3.5 text-foreground/80" />
            <span className="text-[10px] text-foreground/40 truncate">
              {t("creditsThisSemester")}
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="font-mono text-lg font-bold text-foreground/80">{semesterCredits}</span>
            <span className="text-[10px] text-foreground/30">{t("nz")}</span>
          </div>
        </div>

        {/* Card 2: Load (P3′) — names the worst REAL pain (honest metric),
            with the three verifiable numbers right under it. No magic score. */}
        <div
          className="rounded-xl border border-border/40 bg-card/30 p-2.5"
          title={
            isHe
              ? `${honestLoad.weeklyHours} שעות לימוד בשבוע · ${honestLoad.credits} ש״ס · ${honestLoad.tightestExamGapDays != null ? `מרווח מבחנים צפוף ביותר ${honestLoad.tightestExamGapDays} ימים` : "מרווח מבחנים עדיין לא ידוע"}`
              : `${honestLoad.weeklyHours} contact hrs · ${honestLoad.credits} cr. · ${honestLoad.tightestExamGapDays != null ? `tightest exam gap ${honestLoad.tightestExamGapDays} days` : "exam gap unknown yet"}`
          }
        >
          <div className="flex items-center gap-1.5">
            <IconComponent className={cn("size-4", LEVEL_COLORS[honestLoad.label])} />
            <span className="text-[10px] text-foreground/40 truncate">
              {t("workloadLevel")}
            </span>
          </div>
          <div className="mt-1">
            <span className={cn("font-mono text-sm font-bold", LEVEL_COLORS[honestLoad.label])}>
              {levelLabel}
            </span>
            {/* The word is OUR verdict over our own thresholds, not a fact from
                the university — say so, and let the two real numbers below it
                carry the weight. (A contradicting "עומס גבוה" sentence used to
                sit right here whenever the semester ran 17–19 ש״ס, while this
                very label said "קל".) */}
            <span className="ms-1 text-[10px] text-foreground/30">
              {isHe ? "לפי הספים שלנו" : "by our thresholds"}
            </span>
            <p className="mt-0.5 text-[10px] text-foreground/40" dir="auto">
              {isHe
                ? <>‏<Bidi text={honestLoad.weeklyHours} /> שעות לימוד בשבוע · <Bidi text={honestLoad.credits} /> ש״ס</>
                : `${honestLoad.weeklyHours}h · ${honestLoad.credits} cr.`}
            </p>
            {/* The hours number is only about the courses we HAVE times for —
                a quarter of the catalog carries no meeting rows, and a bare
                number implied we had counted them. */}
            {unscheduledCount > 0 && (
              <p className="mt-0.5 text-[10px] leading-tight text-foreground/35">
                {isHe
                  ? unscheduledCount === 1
                    // Hebrew counts: "1 קורסים" is not a thing a person writes.
                    // At one, the number becomes a word and the noun goes singular.
                    ? <>(קורס אחד בלי שעות ידועות לא נספר)</>
                    : <>(<Bidi text={unscheduledCount} /> קורסים בלי שעות ידועות לא נספרו)</>
                  : `(${unscheduledCount} course(s) with no known hours aren't counted)`}
              </p>
            )}
          </div>
        </div>

        {/* Card 3: Conflicts */}
        <div
          className={cn(
            "rounded-xl border border-border/40 bg-card/30 p-2.5",
            conflictCount > 0 && "cursor-pointer hover:border-red-400/30 transition-colors"
          )}
          onClick={() => conflictCount > 0 && setShowConflictDetails((v) => !v)}
        >
          <div className="flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              {conflictCount > 0 ? (
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-400" />
              ) : (
                <CheckCircle className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
              )}
              <span className="text-[10px] text-foreground/40 truncate">
                {t("conflicts")}
              </span>
            </div>
            {conflictCount > 0 && (
              <ChevronDown
                className={cn(
                  "h-3 w-3 shrink-0 text-foreground/30 transition-transform",
                  showConflictDetails && "rotate-180"
                )}
              />
            )}
          </div>
          <div className="mt-1">
            <span
              className={cn(
                "font-mono text-lg font-bold",
                conflictCount > 0 ? "text-red-400" : "text-emerald-400"
              )}
            >
              {conflictCount}
            </span>
            <p className="text-[10px] text-foreground/30">
              {conflictCount > 0 ? t("conflictsDetected") : t("noConflicts")}
            </p>
            {/* A zero here means "none among the courses we hold times for" —
                not "your week is clear". Say which one it is. */}
            {unscheduledCount > 0 && (
              <p className="mt-0.5 text-[10px] leading-tight text-foreground/35">
                {isHe
                  ? unscheduledCount === 1
                    ? <>נבדק רק מול הקורסים שיש להם שעות (אחד בלי שעות ידועות)</>
                    : <>נבדק רק מול הקורסים שיש להם שעות (<Bidi text={unscheduledCount} /> בלי שעות ידועות)</>
                  : `Checked only against courses with known hours (${unscheduledCount} without)`}
              </p>
            )}
            {/* P2 — one click asks the finder to search every group combination.
                It used to appear ONLY when a clash existed, i.e. it was hidden
                in exactly the case a student could still improve the week by
                swapping a group. Now it shows whenever there is a group to
                swap, and the wording matches what the search can promise. */}
            {canSwapGroups && onFindCombination && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFindCombination(hasPrefs ? prefs : undefined);
                  }}
                  className="mt-1.5 w-full rounded-md bg-accent-brand/10 px-2 py-1 text-[11px] font-semibold text-accent-brand transition-colors hover:bg-accent-brand/20"
                >
                  {conflictCount > 0
                    ? (isHe ? "מצאו לי שילוב בלי התנגשויות" : "Find me a clash-free combo")
                    : (isHe ? "מצאו לי שילוב עם פחות ימים בקמפוס" : "Find me fewer campus days")}
                </button>
                <ComboPreferencesControl
                  prefs={prefs}
                  onChange={setPrefs}
                  isHe={isHe}
                />
              </>
            )}
          </div>
        </div>

        {/* Card 4: Degree Progress */}
        <div className="rounded-xl border border-border/40 bg-card/30 p-2.5">
          <div className="flex items-center gap-1.5">
            <GraduationCap className="h-3.5 w-3.5 text-foreground/40" />
            <span className="text-[10px] text-foreground/40 truncate">
              {t("degreeProgress")}
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-1" dir="ltr">
            <span className="font-mono text-lg font-bold text-foreground/70">
              {totalCreditsPlanned}
            </span>
            <span className="text-[10px] text-foreground/30">/ {CREDIT_REQUIREMENTS.TOTAL}</span>
          </div>
          <div className="mt-1 h-1 w-full rounded-full bg-foreground/10 overflow-hidden">
            <div
              className="progress-gradient h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min((totalCreditsPlanned / CREDIT_REQUIREMENTS.TOTAL) * 100, 100)}%` }}
            />
          </div>
          {/* Focus area progress — clearer display */}
          {focusArea && focusAreaCfg && (
            <div className="mt-1.5 flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <div
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: focusAreaCfg.color }}
                />
                {/* "17/60" here was a fraction of two different things: the
                    numerator counted THIS SEMESTER's focus credits, the
                    denominator the whole degree's requirement — the same label
                    the dashboard uses for the degree-wide figure. The planner
                    only knows the semester, so it now says only that. */}
                <span className="text-[11px] text-foreground/30 truncate">
                  {isHe ? "תחום מיקוד בסמסטר הזה: " : "Focus area this semester: "}
                  {isHe ? focusAreaCfg.nameHe : focusAreaCfg.nameEn}
                </span>
              </div>
              <span className="font-mono text-[11px] text-foreground/30 shrink-0">
                <Bidi text={focusAreaCredits} /> {isHe ? "ש״ס" : "cr."}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Honest load — three verifiable facts (#2). No prediction: real weekly
          contact hours, ש״ס this semester, and the tightest gap between exam
          dates we actually hold. The worst of the three is tinted. */}
      {selectedCourses.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <div className={cn(
            "rounded-lg border border-border/30 bg-card/20 px-2.5 py-1.5",
            honestLoad.label === "hours" && "border-amber-500/30 bg-amber-500/[0.05]"
          )}>
            <div className="flex items-baseline gap-1">
              <span className="font-mono text-base font-bold text-foreground/80">
                <Bidi text={honestLoad.weeklyHours} />
              </span>
              <span className="text-[10px] text-foreground/40">
                {isHe ? "שע׳/שבוע" : "hrs/wk"}
              </span>
            </div>
            <p className="text-[10px] text-foreground/30">
              {isHe ? "שעות לימוד" : "Contact hours"}
            </p>
          </div>

          <div className={cn(
            "rounded-lg border border-border/30 bg-card/20 px-2.5 py-1.5",
            honestLoad.label === "credits" && "border-amber-500/30 bg-amber-500/[0.05]"
          )}>
            <div className="flex items-baseline gap-1">
              <span className="font-mono text-base font-bold text-foreground/80">
                <Bidi text={honestLoad.credits} />
              </span>
              <span className="text-[10px] text-foreground/40">{t("nz")}</span>
            </div>
            <p className="text-[10px] text-foreground/30">
              {isHe ? "שעות סמסטריאליות" : "Credits"}
            </p>
          </div>

          <div className={cn(
            "rounded-lg border border-border/30 bg-card/20 px-2.5 py-1.5",
            honestLoad.label === "examCrunch" && "border-red-400/40 bg-red-400/[0.05]"
          )}>
            <div className="flex items-baseline gap-1">
              {honestLoad.tightestExamGapDays != null ? (
                <>
                  <span className={cn(
                    "font-mono text-base font-bold",
                    honestLoad.label === "examCrunch" ? "text-red-400" : "text-foreground/80"
                  )}>
                    <Bidi text={honestLoad.tightestExamGapDays} />
                  </span>
                  <span className="text-[10px] text-foreground/40">
                    {isHe ? "ימים" : "days"}
                  </span>
                </>
              ) : (
                <span className="text-[11px] text-foreground/30">
                  {isHe ? "אין נתונים" : "no data"}
                </span>
              )}
            </div>
            <p className="text-[10px] text-foreground/30">
              {isHe ? "מרווח מבחנים קצר" : "Tightest exam gap"}
            </p>
          </div>
        </div>
      )}

      {/* Conflict details — expanded panel */}
      {showConflictDetails && conflictCount > 0 && (
        <div className="rounded-xl border border-red-400/20 bg-red-400/5 p-3 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
          <p className="text-[10px] font-semibold text-red-400">
            {isHe ? "התנגשויות בין קורסים:" : "Schedule conflicts:"}
          </p>
          {conflicts.map((conflict, idx) => (
            <div
              key={`${conflict.aName}|${conflict.bName}|${conflict.day}|${conflict.time}|${idx}`}
              className="flex items-start gap-2 rounded-lg bg-red-400/5 px-2.5 py-1.5"
            >
              <AlertTriangle className="h-3 w-3 shrink-0 text-red-400/60 mt-0.5" />
              <div className="text-[10px] text-foreground/60 leading-relaxed">
                <span className="font-medium text-foreground/80">{conflict.aName}</span>
                {" "}
                <X className="inline h-2.5 w-2.5 text-red-400" />
                {" "}
                <span className="font-medium text-foreground/80">{conflict.bName}</span>
                <span className="text-foreground/30 ms-1.5">
                  ({conflictDayLabel(conflict.day, isHe)}{" "}
                  <bdi dir="ltr">{conflict.time}</bdi>)
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Smart schedule insights (replaces old heatmap) */}
      {scheduleInsights.length > 0 && (
        <div className="space-y-1.5">
          {scheduleInsights.map((insight, idx) => {
            const Icon = insight.icon;
            return (
              <div
                key={idx}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[10px]",
                  insight.type === "positive" && "bg-emerald-500/5 text-emerald-600/70",
                  insight.type === "neutral" && "bg-foreground/[0.03] text-foreground/40",
                  insight.type === "warning" && "bg-amber-500/5 text-amber-600/70",
                )}
              >
                <Icon className="h-3 w-3 shrink-0" />
                <span className="leading-tight">{insight.text}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Discipline balance — always show when multiple disciplines */}
      {selectedCourses.length > 0 && disciplineBalance.length > 1 && (
        <div className="rounded-xl border border-border/30 bg-card/20 p-2.5">
          <div className="flex h-2.5 w-full overflow-hidden rounded-full">
            {disciplineBalance.map((d) => (
              <div
                key={d.key}
                className="h-full transition-all duration-300"
                style={{
                  width: `${d.pct}%`,
                  backgroundColor: d.cfg?.color ?? "var(--muted-foreground)",
                }}
                title={`${isHe ? d.cfg?.nameHe : d.cfg?.nameEn} — ${d.credits} (${d.pct}%)`}
              />
            ))}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            {disciplineBalance.map((d) => (
              <div key={d.key} className="flex items-center gap-1">
                <div
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: d.cfg?.color }}
                />
                <span className="text-[11px] text-foreground/30">
                  {isHe ? d.cfg?.nameHe : d.cfg?.nameEn} ({d.credits})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


// =========================================================================
// #8 — the questionnaire, kept to the two things a student can answer exactly
// =========================================================================
// The note asked for "שאלון → AI בונה מערכת", with Ariel's own condition
// attached: "ללכת על זה רק אם יעבוד ממש טוב". A model guessing at a week can't
// meet that bar. An exhaustive search can — so the questionnaire's job is only
// to collect constraints the search can honour exactly and report back on:
// days you need clear, and the hours you can actually be on campus.
//
// ש״ס and work hours from the original note are deliberately NOT here: the
// credit target is already the planner's own counter, and "I work Tuesdays"
// IS a free day. Asking the same thing twice in different words is how a
// questionnaire starts feeling like a form.
const COMBO_DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] as const;
const COMBO_DAY_SHORT_HE: Record<string, string> = {
  SUNDAY: "א", MONDAY: "ב", TUESDAY: "ג", WEDNESDAY: "ד", THURSDAY: "ה", FRIDAY: "ו",
};
const COMBO_DAY_SHORT_EN: Record<string, string> = {
  SUNDAY: "Su", MONDAY: "Mo", TUESDAY: "Tu", WEDNESDAY: "We", THURSDAY: "Th", FRIDAY: "Fr",
};

function ComboPreferencesControl({
  prefs,
  onChange,
  isHe,
}: {
  prefs: ComboPreferences;
  onChange: (next: ComboPreferences) => void;
  isHe: boolean;
}) {
  const [open, setOpen] = useState(false);
  const free = prefs.freeDays ?? [];
  const toggleDay = (day: string) =>
    onChange({
      ...prefs,
      freeDays: free.includes(day) ? free.filter((d) => d !== day) : [...free, day],
    });

  return (
    <div className="mt-1" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full rounded-md px-2 py-0.5 text-[10px] font-medium text-foreground/50 transition-colors hover:text-foreground/70"
        aria-expanded={open}
      >
        {isHe ? "יש לי בקשות לשבוע" : "I have constraints"}
      </button>
      {open && (
        <div className="mt-1 space-y-2 rounded-md border border-border/60 bg-card/50 p-2">
          <div>
            <p className="text-[10px] text-foreground/50">
              {isHe ? "ימים שהייתם רוצים לשמור פנויים" : "Days you'd like to keep clear"}
            </p>
            <div className="mt-1 flex gap-1">
              {COMBO_DAYS.map((day) => {
                const on = free.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    aria-pressed={on}
                    className={cn(
                      "size-6 rounded-md border text-[10px] font-semibold transition-colors",
                      on
                        ? "border-transparent bg-foreground text-background"
                        : "border-border/60 text-foreground/50 hover:text-foreground/80",
                    )}
                  >
                    {isHe ? COMBO_DAY_SHORT_HE[day] : COMBO_DAY_SHORT_EN[day]}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-[10px] text-foreground/50">
              {isHe ? "לא לפני" : "Not before"}
              <select
                value={prefs.earliestHour ?? ""}
                onChange={(e) =>
                  onChange({
                    ...prefs,
                    earliestHour: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                className="rounded border border-border/60 bg-transparent px-1 py-0.5 text-[10px] text-foreground/80"
              >
                <option value="">{isHe ? "—" : "—"}</option>
                {[8, 9, 10, 11, 12, 13, 14].map((h) => (
                  <option key={h} value={h}>{`${h}:00`}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1 text-[10px] text-foreground/50">
              {isHe ? "לא אחרי" : "Not after"}
              <select
                value={prefs.latestHour ?? ""}
                onChange={(e) =>
                  onChange({
                    ...prefs,
                    latestHour: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                className="rounded border border-border/60 bg-transparent px-1 py-0.5 text-[10px] text-foreground/80"
              >
                <option value="">{isHe ? "—" : "—"}</option>
                {[14, 15, 16, 17, 18, 19, 20, 21].map((h) => (
                  <option key={h} value={h}>{`${h}:00`}</option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-[10px] leading-relaxed text-foreground/40">
            {isHe
              ? "אלה בקשות, לא חוקים: אם הדרך היחידה לכבד אותן היא מערכת עם חפיפה — נעדיף מערכת בלי חפיפה, ונגיד לכם מה לא הסתדר."
              : "These are wishes, not rules: if the only way to honour one is a week with a clash, we'll pick the clash-free week and tell you what we couldn't keep."}
          </p>
        </div>
      )}
    </div>
  );
}
