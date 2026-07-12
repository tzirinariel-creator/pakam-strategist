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
import { Bidi } from "@/lib/bidi";
import { CREDIT_REQUIREMENTS, DISCIPLINE_CONFIG } from "@/lib/constants";
import type { CourseWithSchedule, ScheduleConflict } from "@/lib/plan-generator";

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
  allCourses: CourseWithSchedule[];
  totalCreditsPlanned: number;
  conflicts: ScheduleConflict[];
  focusArea?: string | null;
  /** P2 — "מצאו לי שילוב בלי התנגשויות": offered when conflicts exist. */
  onFindCombination?: () => void;
}

// ─── Contextual workload explanation ──────────────────────────────────

function generateWorkloadExplanation(
  courses: CourseWithSchedule[],
  credits: number,
  hasSeminar: boolean,
  disciplineSpread: number,
  hardCourseCount: number,
  isHe: boolean,
): string | null {
  if (courses.length === 0) return null;

  const mandatoryCount = courses.filter(
    (c) => c.isMandatory || c.courseType === "MANDATORY"
  ).length;
  const mandatoryRatio = mandatoryCount / courses.length;

  // Priority-ordered contextual reasons (returns first match)

  // Difficulty-aware warnings take highest priority
  if (hardCourseCount >= 3) {
    return isHe
      ? `${hardCourseCount} קורסים קשים באותו סמסטר — שקלו להחליף אחד בקל יותר`
      : `${hardCourseCount} hard courses in one semester — consider swapping one for an easier option`;
  }
  if (hasSeminar && hardCourseCount >= 2) {
    return isHe
      ? "סמינריון + 2 קורסים קשים — סמסטר מאתגר במיוחד, תכננו היטב"
      : "Seminar + 2 hard courses — especially challenging semester, plan carefully";
  }
  if (hasSeminar && credits > 14) {
    return isHe
      ? "סמסטר של כתיבה + לימוד — תכננו זמן לעבודת הסמינריון"
      : "Writing + studying semester — plan time for your seminar paper";
  }
  if (hardCourseCount >= 2 && credits > 16) {
    return isHe
      ? "עומס גבוה עם קורסים קשים — שקלו להוריד ש\"ס"
      : "High load with hard courses — consider reducing credits";
  }
  if (mandatoryRatio === 1 && courses.length >= 4) {
    return isHe
      ? "כל הקורסים חובה — אין גמישות, חייבים לעבור הכל"
      : "All mandatory — no flexibility, must pass everything";
  }
  if (mandatoryRatio >= 0.8 && courses.length >= 4) {
    return isHe
      ? "רוב הקורסים חובה — שקלו להוסיף בחירה קלה לאיזון"
      : "Mostly mandatory — consider adding a light elective";
  }
  if (hasSeminar) {
    return isHe
      ? "כולל סמינריון — דורש כתיבת עבודה, תכננו זמן"
      : "Includes a seminar — requires a paper, plan accordingly";
  }
  if (disciplineSpread >= 4) {
    return isHe
      ? `מעבר בין ${disciplineSpread} תחומים — כדאי לקבץ ימים לפי נושא`
      : `Spans ${disciplineSpread} disciplines — try grouping days by topic`;
  }
  // Positive: no hard courses at all
  if (hardCourseCount === 0 && courses.length >= 3 && courses.some((c) => c.difficultyLevel)) {
    return isHe
      ? "סמסטר מאוזן — אין קורסים קשים במיוחד"
      : "Balanced semester — no particularly hard courses";
  }
  if (credits > 0 && credits <= 10) {
    return isHe
      ? "עומס קל — יש מקום להתנדבות או עבודה"
      : "Light load — room for volunteering or work";
  }
  const avgCredits = credits / courses.length;
  if (avgCredits > 3.5) {
    return isHe
      ? "קורסים כבדים בממוצע — כל קורס שווה הרבה ש״ס"
      : "Heavy courses on average — each one carries many credits";
  }
  if (credits <= 16 && credits >= 12) {
    return isHe
      ? "עומס סביר לסמסטר ממוצע"
      : "Reasonable load for a typical semester";
  }
  if (credits > 16) {
    return isHe
      ? "עומס גבוה — וודאו שאתם מסוגלים להתמודד"
      : "High load — make sure you can manage";
  }
  return null;
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

  // 1. Detect free days (no sessions at all)
  const freeDays: string[] = [];
  for (let d = 0; d < 5; d++) {
    const dayTotal = weekHeatmap[d]?.reduce((a, b) => a + b, 0) ?? 0;
    if (dayTotal === 0) freeDays.push(dayNames[d]!);
  }
  if (freeDays.length > 0 && freeDays.length < 5) {
    const dayList = freeDays.join(isHe ? " ו" : " & ");
    insights.push({
      icon: Coffee,
      text: isHe
        ? `יום ${dayList} פנוי! אפשר לנצל לעבודה או התמחות`
        : `${dayList} free! Use for work or internship`,
      type: "positive",
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
  allCourses,
  totalCreditsPlanned,
  conflicts,
  focusArea,
  onFindCombination,
}: InsightsBarProps) {
  const t = useTranslations("onboarding");
  const locale = useLocale();
  const isHe = locale === "he";
  const [showConflictDetails, setShowConflictDetails] = useState(false);

  // Course-mix facts (P3′) — the simple, verifiable counts the tips and
  // insights need. The old 0-100 magic score is gone; these are just counts.
  const mix = useMemo(() => {
    const hardCourseCount = selectedCourses.filter(
      (c) => c.difficultyLevel === "hard" || c.difficultyLevel === "very_hard"
    ).length;
    return {
      hasSeminar: selectedCourses.some((c) => c.courseType === "SEMINAR"),
      disciplineSpread: new Set(selectedCourses.map((c) => c.discipline)).size,
      hardCourseCount,
    };
  }, [selectedCourses]);

  // Honest 3-number load (#2) — real facts, no prediction:
  //   contact hours (from the grid) · ש״ס · tightest gap between exam dates.
  const honestLoad = useMemo(() => {
    return calculateHonestLoad(
      selectedCourses.map((c) => ({
        credits: c.credits,
        sessions: (c.scheduleSessions ?? []).map((s) => ({
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
        })),
        examDate: c.examDateA ?? null,
      }))
    );
  }, [selectedCourses]);

  // Course name map for conflict display
  const courseNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of allCourses) {
      map.set(c.id, isHe ? c.nameHe : (c.nameEn ?? c.nameHe));
    }
    return map;
  }, [allCourses, isHe]);

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

  // Contextual workload explanation
  const workloadTip = useMemo(() => {
    return generateWorkloadExplanation(
      selectedCourses,
      semesterCredits,
      mix.hasSeminar,
      mix.disciplineSpread,
      mix.hardCourseCount,
      isHe,
    );
  }, [selectedCourses, semesterCredits, mix, isHe]);

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
        const hour = parseInt(s.startTime?.split(":")[0] ?? "12", 10);
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
        const start = parseInt(s.startTime?.split(":")[0] ?? "8", 10);
        const end = parseInt(s.endTime?.split(":")[0] ?? "9", 10);
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
      selectedCourses,
      weekHeatmap,
      earlyMorningCount,
      mix.disciplineSpread,
      mix.hardCourseCount,
      isHe,
    );
  }, [selectedCourses, weekHeatmap, earlyMorningCount, mix.disciplineSpread, mix.hardCourseCount, isHe]);

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
            <p className="mt-0.5 text-[10px] text-foreground/40" dir="auto">
              {isHe
                ? <>‏<Bidi text={honestLoad.weeklyHours} /> שעות לימוד בשבוע · <Bidi text={honestLoad.credits} /> ש״ס</>
                : `${honestLoad.weeklyHours}h · ${honestLoad.credits} cr.`}
            </p>
            {/* Contextual workload tip */}
            {workloadTip && (
              <p className="mt-1 text-[11px] text-foreground/30 leading-tight">
                {workloadTip}
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
            {/* P2 — one click asks the finder to search every group combination */}
            {conflictCount > 0 && onFindCombination && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onFindCombination();
                }}
                className="mt-1.5 w-full rounded-md bg-accent-brand/10 px-2 py-1 text-[11px] font-semibold text-accent-brand transition-colors hover:bg-accent-brand/20"
              >
                {isHe ? "מצאו לי שילוב בלי התנגשויות" : "Find me a clash-free combo"}
              </button>
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
                <span className="text-[11px] text-foreground/30 truncate">
                  {isHe ? "תחום: " : "Focus: "}
                  {isHe ? focusAreaCfg.nameHe : focusAreaCfg.nameEn}
                </span>
              </div>
              <span className="font-mono text-[11px] text-foreground/30 shrink-0" dir="ltr">
                {focusAreaCredits}/{CREDIT_REQUIREMENTS.FOCUS_AREA_MIN}
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
              {isHe ? "נקודות זכות" : "Credits"}
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
          {conflicts.map((conflict, idx) => {
            const nameA = courseNameMap.get(conflict.courseA) ?? conflict.courseA;
            const nameB = courseNameMap.get(conflict.courseB) ?? conflict.courseB;
            return (
              <div
                key={idx}
                className="flex items-start gap-2 rounded-lg bg-red-400/5 px-2.5 py-1.5"
              >
                <AlertTriangle className="h-3 w-3 shrink-0 text-red-400/60 mt-0.5" />
                <div className="text-[10px] text-foreground/60 leading-relaxed">
                  <span className="font-medium text-foreground/80">{nameA}</span>
                  {" "}
                  <X className="inline h-2.5 w-2.5 text-red-400" />
                  {" "}
                  <span className="font-medium text-foreground/80">{nameB}</span>
                  <span className="text-foreground/30 ms-1.5">
                    ({(isHe
                      ? ({ SUNDAY: "ראשון", MONDAY: "שני", TUESDAY: "שלישי", WEDNESDAY: "רביעי", THURSDAY: "חמישי", FRIDAY: "שישי", SATURDAY: "שבת" } as Record<string, string>)[conflict.day] ?? conflict.day
                      : ({ SUNDAY: "Sun", MONDAY: "Mon", TUESDAY: "Tue", WEDNESDAY: "Wed", THURSDAY: "Thu", FRIDAY: "Fri", SATURDAY: "Sat" } as Record<string, string>)[conflict.day] ?? conflict.day
                    )} <bdi>{conflict.time}</bdi>)
                  </span>
                </div>
              </div>
            );
          })}
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
