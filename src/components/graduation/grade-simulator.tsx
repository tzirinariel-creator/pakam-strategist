"use client";

// =========================================================================
// מצב סימולציה — "מה יקרה לממוצע אם…"
// =========================================================================
// Built from the app Ariel sent screenshots of, adapted to what a פכ״מ student
// actually has to decide. His framing: "כל מה שמישהו שצריך לדעת אם לגשת למועד
// ב או לא ובכללי מה מצבו ומה יכול להיות מצבו".
//
// That question — "is מועד ב׳ worth weeks of my life?" — is the one this screen
// exists to answer. Everything else follows from it: nudge a grade and watch
// the real average move, drop a course to see what it's costing you, or ask
// directly what grade you'd need to hit a number.
//
// Three rails, because a sandbox that lies is worse than no sandbox:
//   1. Every figure runs through `calculateGrades`, the same function the
//      dashboard uses — so "current" here IS the number on the home screen.
//   2. NOTHING is written. Overrides live in component state and die on exit.
//      The entry dialog says so before you touch anything.
//   3. When a target is unreachable we say so, rather than printing the 104
//      that would have got you there.
import { useState, useMemo } from "react";
import { useLocale } from "next-intl";
import { FlaskConical, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Bidi } from "@/lib/bidi";

/** Where a nudge starts when the student has no average yet either. */
const DEFAULT_ASSUMED_GRADE = 85;
import { heNoun } from "@/lib/he-count";
import {
  simulate, clampGrade, gradeDistribution, gradeNeededForTarget,
  type OverrideMap,
} from "@/lib/grade-simulator";
import { countsTowardAverage } from "@/lib/grade-calculator";
import type { UserCourseWithCourse } from "@/types/degree";

const NUDGES = [+5, +1, -1, -5] as const;

export function GradeSimulator({
  courses,
  preferHigherGrade,
}: {
  courses: UserCourseWithCourse[];
  preferHigherGrade?: boolean;
}) {
  const isHe = useLocale() === "he";
  const [active, setActive] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [overrides, setOverrides] = useState<OverrideMap>({});

  const opts = useMemo(() => ({ preferHigherGrade: !!preferHigherGrade }), [preferHigherGrade]);
  const result = useMemo(() => simulate(courses, overrides, opts), [courses, overrides, opts]);
  const distribution = useMemo(() => gradeDistribution(courses, opts), [courses, opts]);

  // Only courses that can actually move the average are worth showing knobs for.
  const simulatable = useMemo(
    () => courses.filter((uc) => countsTowardAverage(uc) || uc.grade == null),
    [courses],
  );

  const nudge = (uc: UserCourseWithCourse, by: number) =>
    setOverrides((o) => {
      // A PLANNED course has no grade yet, and `?? 0` made zero its starting
      // point — so pressing "+5" on it set the grade to 5 and took 25 points
      // off the average. A button marked with a plus that subtracts twenty-five
      // is not confusing, it is broken, and it is the moment a student closes
      // the app.
      //
      // With nothing to nudge FROM, the honest starting point is where the
      // student already stands: their current course average. Nudging from
      // there answers the question they were actually asking — "what if this
      // one goes well?" — instead of answering a question about zero.
      const fallback = result.current.courseAverage ?? DEFAULT_ASSUMED_GRADE;
      const base = o[uc.id]?.grade ?? uc.grade ?? Math.round(fallback);
      return { ...o, [uc.id]: { ...o[uc.id], grade: clampGrade(base + by) } };
    });

  const resetOne = (id: string) =>
    setOverrides((o) => {
      const next = { ...o };
      delete next[id];
      return next;
    });

  const exit = () => { setOverrides({}); setActive(false); };

  const gradeOf = (uc: UserCourseWithCourse) => overrides[uc.id]?.grade ?? uc.grade;
  const isChanged = (uc: UserCourseWithCourse) => {
    const o = overrides[uc.id];
    return !!o && (o.included === false || (o.grade !== undefined && o.grade !== uc.grade));
  };

  // ── Entry ───────────────────────────────────────────────────────────────
  if (!active) {
    return (
      <>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground/75 transition-colors hover:border-foreground/30"
        >
          <FlaskConical className="size-4" />
          {isHe ? "מצב סימולציה" : "Simulation mode"}
        </button>

        {confirming && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-xl">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-foreground text-background">
                <FlaskConical className="size-5" />
              </div>
              <h3 className="mt-3 text-center font-display text-lg font-bold text-foreground">
                {isHe ? "כניסה למצב סימולציה" : "Enter simulation mode"}
              </h3>
              <p className="mt-2 text-center text-sm leading-relaxed text-foreground/60">
                {isHe
                  ? "כאן אפשר לשחק עם הציונים ולראות איך הם משפיעים על הממוצע — בלי לשנות את הנתונים האמיתיים שלכם."
                  : "Play with your grades and watch what happens to the average — without changing any of your real data."}
              </p>
              <p className="mt-2 text-center text-xs text-foreground/45">
                {isHe
                  ? "שום דבר כאן לא נשמר. ביציאה הכול חוזר למה שהיה."
                  : "Nothing here is saved. On exit everything returns to what it was."}
              </p>
              <button
                type="button"
                onClick={() => { setConfirming(false); setActive(true); }}
                className="mt-4 w-full rounded-xl bg-foreground py-3 text-sm font-semibold text-background"
              >
                {isHe ? "המשך" : "Continue"}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="mt-2 w-full py-2 text-sm text-foreground/50"
              >
                {isHe ? "ביטול" : "Cancel"}
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // ── Active ──────────────────────────────────────────────────────────────
  const cur = result.current.courseAverage;
  const sim = result.simulated.courseAverage;
  const moved = result.changedCount > 0 && result.averageDelta !== 0;

  return (
    <div className="rounded-2xl border border-border bg-card/40 p-4">
      {/* Headline: the new number, and the one it replaced */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-foreground/50">
            {isHe ? "ממוצע בסימולציה" : "Simulated average"}
          </p>
          <p className={cn("font-mono text-3xl font-bold tabular-nums",
            moved ? "text-accent-brand" : "text-foreground")}>
            <Bidi text={sim != null ? sim.toFixed(2) : "—"} />
          </p>
          <p className="mt-0.5 text-xs text-foreground/45">
            {isHe ? "נוכחי " : "current "}
            <Bidi text={cur != null ? cur.toFixed(2) : "—"} />
            {result.changedCount > 0 && (
              <>
                {" · "}
                <span className="text-foreground/70">
                  {isHe
                    ? `${heNoun(result.changedCount, "קורס שונה", "קורסים שונו")}`
                    : `${result.changedCount} changed`}
                </span>
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={exit}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground/70"
        >
          <X className="size-3.5" />
          {isHe ? "סיום סימולציה" : "Exit"}
        </button>
      </div>

      {/* Distribution of the REAL grades — context for the nudging */}
      <div className="mt-4">
        <p className="text-[11px] text-foreground/40">
          {isHe ? "התפלגות הציונים שלכם" : "Your grade distribution"}
        </p>
        <div className="mt-1.5 flex gap-1">
          {distribution.map((b) => (
            <div key={b.band} className="flex-1 text-center">
              <div
                className="rounded bg-foreground/10"
                style={{ height: `${8 + b.count * 6}px` }}
                aria-hidden
              />
              <p className="mt-1 font-mono text-[10px] text-foreground/50">
                <Bidi text={b.count} />
              </p>
              <p className="text-[10px] text-foreground/35">{b.band}</p>
            </div>
          ))}
        </div>
      </div>

      {/* The courses */}
      <ul className="mt-4 space-y-2">
        {simulatable.map((uc) => {
          const g = gradeOf(uc);
          const changed = isChanged(uc);
          const excluded = overrides[uc.id]?.included === false;
          return (
            <li
              key={uc.id}
              className={cn(
                "rounded-xl border p-2.5 transition-colors",
                changed ? "border-accent-brand/50 bg-accent-brand/[0.04]" : "border-border/50",
                excluded && "opacity-45",
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-sm text-foreground/85">{uc.course.nameHe}</span>
                {/* Ariel, 1.9: "הציונים מימין לשמאל במצב סימולציה. לא כמו
                    מספרים טבעיים משמאל לימין."
                    Each number was isolated on its own and the "/100 · "
                    between them was left bare — a run of neutrals inside an
                    RTL paragraph, which the bidi algorithm resolves
                    right-to-left and lays out backwards. The whole numeric run
                    belongs in ONE isolate; only the Hebrew unit stays outside.
                    Same family as the "%8.6" fix on the levers card. */}
                <span className="shrink-0 font-mono text-xs text-foreground/55 tabular-nums">
                  <Bidi text={`${g ?? "—"}/100 · ${uc.course.credits}`} />{" "}
                  {isHe ? "ש״ס" : "cr"}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                {NUDGES.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => nudge(uc, n)}
                    disabled={excluded}
                    className="rounded-lg bg-foreground px-2.5 py-1 font-mono text-xs font-semibold text-background disabled:opacity-30"
                  >
                    <Bidi text={n > 0 ? `+${n}` : String(n)} />
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => resetOne(uc.id)}
                  disabled={!overrides[uc.id]}
                  aria-label={isHe ? "איפוס הקורס" : "Reset course"}
                  className="ms-auto rounded-lg p-1.5 text-foreground/40 disabled:opacity-25"
                >
                  <RotateCcw className="size-3.5" />
                </button>
                <label className="flex cursor-pointer items-center gap-1 text-[11px] text-foreground/50">
                  <input
                    type="checkbox"
                    checked={!excluded}
                    onChange={(e) =>
                      setOverrides((o) => ({ ...o, [uc.id]: { ...o[uc.id], included: e.target.checked } }))
                    }
                  />
                  {isHe ? "נספר" : "counted"}
                </label>
              </div>
              {/* The מועד ב׳ answer, per course */}
              {g != null && cur != null && (
                <TargetHint course={uc} courses={courses} current={cur} opts={opts} isHe={isHe} />
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-[11px] leading-relaxed text-foreground/40">
        {isHe
          ? "הסימולציה משתמשת באותו חישוב ממוצע כמו שאר האפליקציה — כולל החרגת בינאריים ואנגלית וקורסים חוזרים. שום דבר כאן לא נשמר."
          : "The simulation uses the same average calculation as the rest of the app — binary, English and retakes handled identically. Nothing here is saved."}
      </p>
    </div>
  );
}

/**
 * "What would this course need for my average to reach the next whole point?"
 * — the מועד ב׳ question in its most useful form. Says "not reachable" out
 * loud rather than printing an impossible number.
 */
function TargetHint({
  course, courses, current, opts, isHe,
}: {
  course: UserCourseWithCourse;
  courses: UserCourseWithCourse[];
  current: number;
  opts: { preferHigherGrade: boolean };
  isHe: boolean;
}) {
  const target = Math.floor(current) + 1;
  const needed = useMemo(
    () => gradeNeededForTarget(courses, course.id, target, opts),
    [courses, course.id, target, opts],
  );
  if (needed == null) {
    return (
      <p className="mt-1.5 text-[11px] text-foreground/35">
        {isHe
          ? `הקורס הזה לבדו לא יכול להביא אתכם ל-${target}`
          : `Even a 100 here wouldn't bring the average to ${target}`}
      </p>
    );
  }
  if (needed <= (course.grade ?? 0)) return null;
  return (
    <p className="mt-1.5 text-[11px] text-foreground/45">
      {isHe ? "כדי להגיע לממוצע " : "To reach an average of "}
      <Bidi text={target} />
      {isHe ? " צריך כאן " : ", you'd need "}
      <span className="font-mono font-semibold text-foreground/70"><Bidi text={needed} /></span>
    </p>
  );
}
