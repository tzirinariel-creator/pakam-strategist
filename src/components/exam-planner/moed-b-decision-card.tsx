"use client";

// -----------------------------------------------------------------------
// "כדאי לי ללכת למועד ב׳?" — with your own numbers, both ways
// -----------------------------------------------------------------------
// Ariel, 21.8: "איפה הפיצר / אשף בחירה האם לעשות מועדי ב׳ וסימולציות ציון כמו
// באפליקציה שהעליתי לך צילומי מסך שלה?" — and, about the current state:
// "הוא פחות עוזר להחליט אם לגשת למועדי ב או לא ולהבין את המצב בכללי".
//
// The parts existed and never met. The simulator was a general "what if"
// sandbox on the graduation page; the exam planner knew the sittings; nothing
// answered the question at the moment it gets asked, which is while a student
// is looking at a grade they are not happy with.
//
// Three things decide it, and this shows all three:
//   · what the retake could gain,
//   · what it could COST — for most students מועד ב׳ replaces מועד א׳ even when
//     it is worse, and that half is what gets left out,
//   · how little one course moves a whole degree average, which is the fact
//     students most reliably over-estimate.
//
// It does not recommend. Whether four tenths of a point is worth an August is
// not something this app can weigh for someone.

import { useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { CalendarClock, TrendingUp, TrendingDown, Shield } from "lucide-react";
import { Bidi } from "@/lib/bidi";
import { moedBOutcome, courseWeightInAverage } from "@/lib/moed-b-decision";
import { countsTowardAverage } from "@/lib/grade-calculator";
import type { UserCourseWithCourse } from "@/types/degree";

export function MoedBDecisionCard({
  courses,
  keepsHigherGrade,
}: {
  courses: UserCourseWithCourse[];
  /** Reservist groups B/C/G keep the higher sitting — flips the whole answer. */
  keepsHigherGrade: boolean;
}) {
  const isHe = useLocale() === "he";

  // Only graded, completed courses can be reconsidered — there is no decision
  // to model until there is a result to improve on.
  const candidates = useMemo(
    () =>
      courses
        .filter((c) => c.status === "COMPLETED" && c.grade != null && countsTowardAverage(c))
        .sort((a, b) => (a.grade ?? 0) - (b.grade ?? 0)),
    [courses],
  );

  // Default to the lowest grade — the one a student is most likely asking about.
  const [selectedId, setSelectedId] = useState<string>(() => candidates[0]?.id ?? "");
  const [optimistic, setOptimistic] = useState(90);

  const active = candidates.find((c) => c.id === selectedId) ?? candidates[0];

  const outcome = useMemo(() => {
    if (!active) return null;
    return moedBOutcome({
      courses,
      userCourseId: active.id,
      keepsHigherGrade,
      optimisticGrade: optimistic,
      // A realistic bad day: a few points below what they already have. Not a
      // catastrophe — an honest downside, not a scare tactic.
      pessimisticGrade: Math.max(0, (active.grade ?? 0) - 8),
    });
  }, [courses, active, keepsHigherGrade, optimistic]);

  const weight = useMemo(
    () => (active ? courseWeightInAverage(courses, active.id, countsTowardAverage) : null),
    [courses, active],
  );

  if (!active || !outcome) return null;

  return (
    <div className="data-card p-5">
      <div className="flex items-start gap-2.5">
        <CalendarClock className="mt-0.5 size-4 shrink-0 text-accent-brand" />
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base font-bold text-foreground/90">
            {isHe ? "כדאי לגשת למועד ב׳?" : "Is a second sitting worth it?"}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-foreground/55">
            {isHe
              ? "בחרו קורס ותראו את שתי האפשרויות — כמה הממוצע יכול לעלות, וכמה הוא יכול לרדת."
              : "Pick a course and see both outcomes — how much the average could rise, and how much it could fall."}
          </p>

          <label className="mt-3 block">
            <span className="mb-1 block text-[11px] font-medium text-foreground/45">
              {isHe ? "הקורס" : "Course"}
            </span>
            <select
              value={active.id}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full rounded-lg border border-foreground/15 bg-background px-2.5 py-2 text-sm text-foreground/85"
            >
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.course.nameHe} — {c.grade}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-3 block">
            <span className="mb-1 block text-[11px] font-medium text-foreground/45">
              {isHe ? `אם במועד ב׳ תקבלו ${optimistic}` : `If the retake scores ${optimistic}`}
            </span>
            <input
              type="range"
              min={Math.min(100, (active.grade ?? 0) + 1)}
              max={100}
              value={optimistic}
              onChange={(e) => setOptimistic(Number(e.target.value))}
              className="w-full accent-[var(--accent-brand)]"
              aria-label={isHe ? "ציון משוער במועד ב׳" : "Estimated second-sitting grade"}
            />
          </label>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <Cell
              label={isHe ? "הממוצע היום" : "Average now"}
              value={outcome.currentAverage}
              tone="neutral"
            />
            <Cell
              label={isHe ? "אם ילך טוב" : "If it goes well"}
              value={outcome.averageIfBetter}
              tone="up"
              delta={outcome.upside}
            />
            <Cell
              label={isHe ? "אם ילך רע" : "If it goes badly"}
              value={outcome.averageIfWorse}
              tone={outcome.canLose ? "down" : "safe"}
              delta={outcome.downside == null ? null : -outcome.downside}
            />
          </div>

          {/* The rule that governs the whole decision, stated where it is
              being made rather than as a footnote somewhere else. */}
          <p className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-foreground/60">
            <Shield className="mt-0.5 size-3.5 shrink-0 text-foreground/35" />
            {outcome.canLose
              ? isHe
                ? "מועד ב׳ מחליף את מועד א׳ — גם אם הוא נמוך יותר. הציון החדש הוא זה שנספר."
                : "The second sitting replaces the first — even if it is lower. The new grade is the one that counts."
              : isHe
                ? "בקבוצת המילואים שלכם נשמר הציון הגבוה מבין השניים, אז אין מה להפסיד ממועד ב׳."
                : "Your reserve group keeps the higher of the two sittings, so a second sitting cannot cost you anything."}
          </p>

          {weight != null && (
            <p className="mt-1.5 text-xs leading-relaxed text-foreground/45">
              {isHe ? (
                <>
                  הקורס הזה הוא <Bidi text={weight} />% מהממוצע שלכם — קורס בודד מזיז
                  פחות ממה שנדמה.
                </>
              ) : (
                <>
                  This course is {weight}% of your average — a single course moves it
                  less than it feels like.
                </>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Cell({
  label,
  value,
  tone,
  delta,
}: {
  label: string;
  value: number | null;
  tone: "neutral" | "up" | "down" | "safe";
  delta?: number | null;
}) {
  const toneClass =
    tone === "up"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "down"
        ? "text-rose-600 dark:text-rose-400"
        : "text-foreground/80";
  const Icon = tone === "up" ? TrendingUp : tone === "down" ? TrendingDown : null;

  return (
    <div className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-3">
      <span className="block text-[11px] font-medium text-foreground/45">{label}</span>
      <span className={`mt-0.5 flex items-baseline gap-1 text-lg font-bold tabular-nums ${toneClass}`}>
        {value == null ? "—" : <Bidi text={value} />}
        {Icon && <Icon className="size-3.5" />}
      </span>
      {delta != null && delta !== 0 && (
        <span className="text-[11px] tabular-nums text-foreground/40">
          <Bidi text={`${delta > 0 ? "+" : ""}${delta}`} />
        </span>
      )}
    </div>
  );
}
