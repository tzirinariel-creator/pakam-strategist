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
import { heNoun } from "@/lib/he-count";
import { simulate } from "@/lib/grade-simulator";
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
  const shown = useMemo(() => levers.slice(0, limit), [levers, limit]);

  // The combined figure, simulated ONCE over the courses actually listed.
  //
  // It used to be the sum of the individual upsides, and that sum is not a
  // number: each lever's delta was computed on its own, against a denominator
  // that a PLANNED course also enlarges when it gains a grade. Adding them
  // therefore over-counts, and not slightly — run on a real second-year with
  // an 83.6 average it printed "+25.12", which would put the average at 108.7.
  // The true answer for that student is 11.39. On a first-year with five
  // grades it printed 102.5.
  //
  // This sentence exists to be the most honest one on the screen — it is the
  // paragraph that tells a student not to give up their summer over one course
  // — so a fabricated number here costs more than anywhere else on the page.
  // NOTE on the clause in the sentence below. Fixing the number alone traded
  // an impossible figure for a visible contradiction: the four green tags
  // above still read +8.5, +7.5, +5.3, +5.3, and a student who adds them gets
  // 26.7 while the line underneath says 16. Both numbers are correct — each
  // tag is that course ON ITS OWN — and the reason they do not add up is the
  // whole insight the card exists to deliver. So it is said, once, in the
  // sentence rather than left for the reader to catch us out on.
  const combinedUpside = useMemo(() => {
    if (shown.length === 0) return null;
    const overrides = Object.fromEntries(
      shown.map((l) => [l.userCourseId, { grade: l.assumedGrade }]),
    );
    return simulate(courses, overrides, { preferHigherGrade: keepsHigherGrade }).averageDelta;
  }, [courses, shown, keepsHigherGrade]);

  if (!summary) return null;

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
                    {/* Wraps rather than truncates. At 375px "מיקרו כלכלה א׳ -
                        החלטות כלכליות + תרגול" needs 250px and had 181, and
                        this list exists to help someone choose WHICH course to
                        sit again — the delta beside it is meaningless if you
                        cannot read which course it belongs to. */}
                    <span className="min-w-0 flex-1 text-balance text-sm font-medium text-foreground/85">
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
                      {/* The % has to be INSIDE the isolate. Left outside it, it is a
                          bidi-neutral between an isolate and Hebrew text, so it resolves
                          RTL and renders on the wrong side of the digits — "%8.6" where a
                          person writes "8.6%". Seen on the live page, not deduced. */}
                      <Bidi text={`${l.weightPct}%`} /> {isHe ? "מהממוצע" : "of your average"}
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
          {/* Ariel, 22.8: "סתכל איך העברית והמלל שבור במסך התכנון של
              'מה יזיז לכם את הממוצע'".
              The paragraph itself was `display:flex`, put there to line the
              icon up with the first line. Under flex, every child of the <p>
              becomes a FLEX ITEM — and that includes each anonymous run of
              text between the <b> and <bdi> tags. So the sentence stopped
              being flowing text and became eight independent boxes laid side
              by side: "גם" and "אם" landed on different lines, "כל" sat alone,
              and the numbers stranded mid-air. Measured on the live page — the
              three atoms sat at x=860, 724, 603 on one row with the prose
              wrapping around them.
              The flex belongs on a WRAPPER, with the whole sentence as one
              item inside it, so the text flows as text again. */}
          <div className="mt-3 flex items-start gap-1.5">
            <Info className="mt-0.5 size-3.5 shrink-0 text-foreground/35" />
            <p className="min-w-0 flex-1 text-xs leading-relaxed text-foreground/55">
            {isHe ? (
              <>
                גם אם {shown.length === 1 ? "הקורס הזה היה מסתיים" : "כל הקורסים שלמעלה היו מסתיימים"} ב־
                <Bidi text={summary.best.assumedGrade} />, הממוצע היה עולה ב־
                <b>
                  <Bidi text={combinedUpside ?? 0} />
                </b>{" "}
                נקודות בסך הכול
                {shown.length > 1 && (
                  <>
                    {" "}— פחות מסכום המספרים שלמעלה, כי קורס שנכנס לממוצע גם מגדיל את
                    המכנה
                  </>
                )}
                . קורס בודד מזיז פחות ממה שנדמה — שווה לדעת את זה לפני
                שמוותרים על חופשה.
                {keepsHigherGrade
                  ? " בקבוצת המילואים שלכם נשמר הציון הגבוה, אז מועד ב׳ לא מסכן כלום."
                  : " ומועד ב׳ מחליף את מועד א׳ — גם אם יצא נמוך יותר."}
              </>
            ) : (
              <>
                Even if {shown.length === 1 ? "this course" : "all of the courses above"} ended at{" "}
                {summary.best.assumedGrade}, your average would rise by{" "}
                <b>{combinedUpside ?? 0}</b> points in total
                {shown.length > 1 && <> — less than the figures above add up to, because a course
                that joins the average also enlarges the denominator</>}
                . A single course moves it less than it feels like.
                {keepsHigherGrade
                  ? " Your reserve group keeps the higher sitting, so a resit risks nothing."
                  : " And a resit replaces the first sitting, even if it goes worse."}
              </>
            )}
            </p>
          </div>

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
