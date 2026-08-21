"use client";

// -----------------------------------------------------------------------
// "מה יזיז לי את הממוצע" — the answer, not a sandbox to find it in
// -----------------------------------------------------------------------
// Ariel, on the tenth asking: "המצב סימולציה גם לא מספיק מגניב ולא מספיק עוזר
// ואין בו איזה תובנות או המלצות או חיבור למתי יש מועדי ב׳ ואיך להחליט… זה
// כאילו די גרוע וטכני".
//
// The old simulator was a sandbox: nudge a grade by ±5 and watch a number
// move. That answers "what if" for someone who already knows which course to
// ask about, and says nothing to someone who does not — which is everyone
// opening it for the first time. A tool that needs you to arrive with the
// insight is not providing one.
//
// This leads with the answer: which courses can actually move your average,
// ranked, each with the two facts that decide whether acting on it is possible
// — how little it carries, and when its second sitting is.
//
// The two things it refuses to do, both of which make it look less impressive:
// it prints the weight (usually 2-4%) beside every upside, and it tells a
// student whose resit REPLACES the first sitting that the movement runs both
// ways. A screen that ranks levers without saying how short they are is
// selling something.

import { useMemo } from "react";
import { useLocale } from "next-intl";
import { TrendingUp, CalendarClock, Info } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Bidi } from "@/lib/bidi";
import { gradeLevers, leverSummary } from "@/lib/grade-levers";
import { yedionExamDates, examSittingsFor, describeSitting } from "@/lib/yedion-assessments";
import type { UserCourseWithCourse } from "@/types/degree";

/** dd.M.yyyy — the form the rest of the exam surfaces use. */
function formatDate(d: Date | null): string | null {
  if (!d) return null;
  return `${d.getUTCDate()}.${d.getUTCMonth() + 1}.${d.getUTCFullYear()}`;
}

export function WhatMovesMyAverage({
  courses,
  keepsHigherGrade,
  limit = 4,
}: {
  courses: UserCourseWithCourse[];
  keepsHigherGrade: boolean;
  limit?: number;
}) {
  const isHe = useLocale() === "he";

  const levers = useMemo(
    () => gradeLevers(courses, { keepsHigherGrade }),
    [courses, keepsHigherGrade],
  );
  const summary = useMemo(() => leverSummary(levers), [levers]);

  if (!summary) return null;
  const shown = levers.slice(0, limit);

  return (
    <div className="data-card p-5">
      <div className="flex items-start gap-2.5">
        <TrendingUp className="mt-0.5 size-4 shrink-0 text-accent-brand" />
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base font-bold text-foreground/90">
            {isHe ? "מה באמת יזיז לכם את הממוצע" : "What actually moves your average"}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-foreground/55">
            {isHe ? (
              <>
                אם כל אחד מהקורסים האלה היה מסתיים ב־
                <Bidi text={summary.best.assumedGrade} />, זה מה שהיה קורה לממוצע.
              </>
            ) : (
              <>If each of these ended at {summary.best.assumedGrade}, this is what would happen.</>
            )}
          </p>

          <ul className="mt-3 flex flex-col gap-2">
            {shown.map((l) => {
              const y = yedionExamDates(l.courseCode);
              const moedB = formatDate(y.examDateB);
              const sittingB = examSittingsFor(l.courseCode).find((s) => s.sitting === "B");
              const detail = sittingB ? describeSitting(sittingB, isHe) : null;

              return (
                <li
                  key={l.userCourseId}
                  className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-3"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground/85">
                      {l.courseName}
                    </span>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                      +<Bidi text={l.upside} />
                    </span>
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-foreground/50">
                    {l.currentGrade != null && (
                      <span>
                        {isHe ? "עכשיו" : "now"} <Bidi text={l.currentGrade} />
                      </span>
                    )}
                    <span>
                      <Bidi text={l.weightPct} />% {isHe ? "מהממוצע" : "of your average"}
                    </span>
                    {l.kind === "upcoming" && (
                      <span>{isHe ? "עוד לא נלמד" : "not taken yet"}</span>
                    )}
                  </div>

                  {/* The fact that decides whether this is actionable at all. */}
                  {l.kind === "retake" && (
                    <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-foreground/60">
                      <CalendarClock className="size-3 shrink-0 text-foreground/35" />
                      {moedB ? (
                        // describeSitting already opens with "מועד ב׳" — the
                        // label was being printed twice ("מועד ב׳ · מועד ב׳ ·
                        // יום חמישי"). It owns the label; this adds the date.
                        <span>
                          {detail ?? (isHe ? "מועד ב׳" : "Resit")} · <Bidi text={moedB} />
                        </span>
                      ) : (
                        <span>
                          {isHe
                            ? "מועד ב׳ לקורס הזה עוד לא פורסם"
                            : "No resit published for this course yet"}
                        </span>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {/* The honest counterweight, and the reason this screen exists at
              all: for most students even doing everything moves very little. */}
          <p className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-foreground/55">
            <Info className="mt-0.5 size-3.5 shrink-0 text-foreground/35" />
            {isHe ? (
              <>
                גם אם <b>כל</b> הקורסים האלה היו מסתיימים ב־
                <Bidi text={summary.best.assumedGrade} />, הממוצע היה עולה ב־
                <b>
                  <Bidi text={summary.totalUpside} />
                </b>{" "}
                נקודות בסך הכול. קורס בודד מזיז פחות ממה שנדמה — שווה לדעת את זה לפני
                שמוותרים על חופשה.
                {keepsHigherGrade
                  ? " בקבוצת המילואים שלכם נשמר הציון הגבוה, אז מועד ב׳ לא מסכן כלום."
                  : " ומועד ב׳ מחליף את מועד א׳ — גם אם יצא נמוך יותר."}
              </>
            ) : (
              <>
                Even if <b>all</b> of these ended at {summary.best.assumedGrade}, your average
                would rise by <b>{summary.totalUpside}</b> points in total. A single course moves
                it less than it feels like.
                {keepsHigherGrade
                  ? " Your reserve group keeps the higher sitting, so a resit risks nothing."
                  : " And a resit replaces the first sitting, even if it goes worse."}
              </>
            )}
          </p>

          <Link
            href="/exam-planner"
            className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-accent-brand hover:underline"
          >
            {isHe ? "להחליט על מועד ב׳ — תכנון המבחנים" : "Decide about a resit — exam planner"}
          </Link>
        </div>
      </div>
    </div>
  );
}
