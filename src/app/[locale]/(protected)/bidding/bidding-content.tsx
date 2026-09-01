"use client";

// =========================================================================
// The bidding screen — both semesters, side by side, in one place
// =========================================================================
// Ariel, repeatedly, and most recently on 1.9:
//
//   "מה עם ההתייחסות לבידינג. אם אנחנו קרובים אליו למה אנחנו לא מאפשרים
//    לסטודנט רגע לתכנן את שני הסמסטרים בטאבים מקבילים ולנצח את כל פלטפורמות
//    הבידינג האחרות? זה סופר קריטי ליכולת שלנו לנצח אותם ודיברנו על זה כבר
//    המון פעמים"
//
//   "לחצתי על הכותרת של — הבידינג בעוד 8 ימים… זה הוביל אותי לזה. וגם למה
//    זה לא מופיע מוקדם יותר. וגם תכלס זה לא באמת עובד ואין איזה מסך ייעודי
//    וזה גרוע"
//
// He is right that there was no such screen. Every piece existed — the real
// תשפ״ז dates, the clash detector, the group picker, the copy-out worksheet —
// scattered across /planner, each one reachable only by scrolling past the
// thing you were not looking for. On the day itself a student has one job and
// about a minute to do it, and the app made them assemble the answer.
//
// WHY BOTH SEMESTERS TOGETHER. TAU's round covers the whole year: you submit
// autumn and spring in the same sitting. A planner that shows one term at a
// time is asking you to hold the other one in your head, which is exactly
// where mistakes come from — a clash across the year, a course counted twice,
// a term left at 12 credits because you never saw it next to the other.
//
// WHAT THIS SCREEN WILL NOT DO. It does not predict points, rank your odds, or
// tell you what will "probably" open. TAU does not publish the quota, the
// official guidance forbids extrapolating from prior years, and a confident
// number here would be the single most damaging thing this app could print.
// It shows what is true: the dates, your plan, and where it collides.

import { useMemo } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { CalendarClock, ExternalLink, ArrowLeft, TriangleAlert } from "lucide-react";
import { api } from "@/lib/trpc/react";
import { ThemedLoader } from "@/components/ui/themed-loader";
import { BiddingTimeline } from "@/components/planner/bidding-timeline";
import { BiddingExplainer } from "@/components/planner/bidding-explainer";
import { BiddingWorksheet } from "@/components/planner/bidding-worksheet";
import { yearAtAGlance, type TermPlan } from "@/lib/year-at-a-glance";
import { getBiddingPhase, BIDDING_LINKS } from "@/lib/bidding-calendar";
import { getPlanningAnchor, deriveYearOfStudy } from "@/lib/academic-calendar";
import { heNoun } from "@/lib/he-count";
import { Bidi } from "@/lib/bidi";
import type { UserCourseWithCourse } from "@/types/degree";

const TERM_HE: Record<string, string> = { FALL: "סמסטר א׳", SPRING: "סמסטר ב׳" };
const TERM_EN: Record<string, string> = { FALL: "Semester A", SPRING: "Semester B" };

function TermColumn({
  term,
  isHe,
  isBiddingTerm,
}: {
  term: TermPlan;
  isHe: boolean;
  isBiddingTerm: boolean;
}) {
  const label = isHe ? TERM_HE[term.term] : TERM_EN[term.term];

  return (
    <div
      className={
        isBiddingTerm
          ? "rounded-xl border border-accent-brand/40 bg-accent-brand/[0.04] p-4"
          : "rounded-xl border border-border/60 p-4"
      }
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-base font-bold text-foreground/90">
          {label}
          {isBiddingTerm && (
            <span className="ms-2 rounded-full bg-accent-brand/15 px-2 py-0.5 text-[10px] font-semibold text-accent-brand">
              {isHe ? "הסמסטר הקרוב" : "the near term"}
            </span>
          )}
        </h3>
        <span className="text-xs font-semibold tabular-nums text-foreground/55">
          <Bidi text={term.credits} /> {isHe ? "ש״ס" : "cr."}
        </span>
      </div>

      {term.courses.length === 0 ? (
        // An empty term in a bidding round is a finding, not a blank. Saying it
        // plainly beats an empty box the student has to interpret.
        <p className="mt-3 rounded-lg border border-amber-500/35 bg-amber-500/[0.06] p-2.5 text-xs leading-relaxed text-foreground/70">
          {isHe
            ? "אין כאן קורסים. אם התכוונתם לקחת סמסטר קל — זה בסדר גמור. אם לא, זה סמסטר שלא הגשתם עליו בקשה."
            : "Nothing here yet. If you meant to take a light semester that's fine — otherwise this is a term you haven't requested anything for."}
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1.5">
          {term.courses.map((c) => (
            <li
              key={c.userCourseId}
              className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg border border-border/50 bg-card/60 px-2.5 py-1.5 text-xs"
            >
              {/* The CODE leads. It is what you type into the TAU system, and
                  the name is what you recognise — in that order, because on the
                  day the code is the thing being copied. */}
              <span className="font-data text-[11px] text-foreground/50" dir="ltr">
                {c.code}
              </span>
              <span className="min-w-0 flex-1 truncate text-foreground/85">{c.name}</span>
              {c.isMandatory && (
                <span className="shrink-0 rounded bg-foreground/[0.07] px-1.5 py-px text-[10px] text-foreground/55">
                  {isHe ? "חובה" : "required"}
                </span>
              )}
              <span className="shrink-0 font-mono text-[11px] text-foreground/40">
                {c.credits}
              </span>
            </li>
          ))}
        </ul>
      )}

      {term.courses.length > 0 && (
        <p className="mt-2 text-[11px] text-foreground/45">
          {isHe ? (
            <>
              {heNoun(term.courses.length, "קורס", "קורסים")}
              {term.mandatoryCredits > 0 && (
                <>
                  {" · "}
                  <Bidi text={term.mandatoryCredits} /> ש״ס מתוכם חובה
                </>
              )}
            </>
          ) : (
            <>
              {term.courses.length} courses
              {term.mandatoryCredits > 0 && <> · {term.mandatoryCredits} required</>}
            </>
          )}
        </p>
      )}
    </div>
  );
}

export function BiddingContent() {
  const isHe = useLocale() === "he";

  const planQuery = api.plan.getUserPlan.useQuery(undefined, { retry: 1 });
  const profileQuery = api.user.getProfile.useQuery(undefined, { retry: 1 });

  const courses = useMemo(
    () => (planQuery.data?.courses ?? []) as UserCourseWithCourse[],
    [planQuery.data],
  );

  // The study year the round is FOR. Deliberately not getBiddingTarget: that
  // returns null past year 3, which would blank this whole screen for anyone
  // the calendar reads as a fourth-year — including students who simply
  // declared an early start year. A bidding screen that disappears is worse
  // than one showing a year the student can correct in settings.
  const anchor = useMemo(() => getPlanningAnchor(), []);
  const yearOfStudy = useMemo(
    () =>
      deriveYearOfStudy(
        profileQuery.data?.startYear,
        profileQuery.data?.currentYear ?? 1,
        anchor.startYear,
      ),
    [profileQuery.data, anchor],
  );

  const plan = useMemo(() => yearAtAGlance(courses, yearOfStudy), [courses, yearOfStudy]);
  const phase = useMemo(() => getBiddingPhase(), []);

  if (planQuery.isLoading || profileQuery.isLoading) {
    return <ThemedLoader variant="page" />;
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <CalendarClock className="size-5 text-accent-brand" />
          <h1 className="font-display text-2xl font-bold text-foreground/95">
            {isHe ? "המכרז" : "Course bidding"}
          </h1>
        </div>
        <p className="text-sm leading-relaxed text-foreground/60">
          {isHe
            ? "שני הסמסטרים יחד — כי המכרז מגיש את שניהם באותה פעם. כאן רואים את התאריכים, את מה שתכננתם, ואיפה יש התנגשות."
            : "Both semesters together — the round submits them in one sitting. Here are the dates, your plan, and where it collides."}
        </p>
      </header>

      <BiddingTimeline isHe={isHe} />

      {/* Both terms, side by side. This is the ask. */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg font-bold text-foreground/90">
            {isHe ? `השנה שאתם מגישים עליה — שנה ${yearOfStudy}` : `The year you're bidding for — year ${yearOfStudy}`}
          </h2>
          <span className="text-xs font-semibold tabular-nums text-foreground/55">
            {isHe ? (
              <>
                סה״כ <Bidi text={plan.totalCredits} /> ש״ס ·{" "}
                {heNoun(plan.totalCourses, "קורס", "קורסים")}
              </>
            ) : (
              <>
                {plan.totalCredits} credits · {plan.totalCourses} courses
              </>
            )}
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <TermColumn term={plan.fall} isHe={isHe} isBiddingTerm={anchor.semester === "FALL"} />
          <TermColumn term={plan.spring} isHe={isHe} isBiddingTerm={anchor.semester === "SPRING"} />
        </div>

        {plan.hasEmptyTerm && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/35 bg-amber-500/[0.06] p-3">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-xs leading-relaxed text-foreground/70">
              {isHe
                ? "אחד הסמסטרים ריק. המכרז מגיש את שני הסמסטרים יחד — סמסטר שלא הגשתם עליו בקשה נסגר, ומה שנשאר בו בסבב השני הוא מה שאחרים לא רצו."
                : "One semester is empty. The round submits both together — a term you request nothing for fills up, and what's left in round two is what nobody else wanted."}
            </p>
          </div>
        )}

        <Link
          href="/planner/semester"
          className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-accent-brand transition-colors hover:underline"
        >
          <ArrowLeft className="size-4" />
          {isHe ? "לעריכת התכנון ולבחירת קבוצות" : "Edit the plan and pick groups"}
        </Link>
      </section>

      {/* The copy-out sheet for the round itself. */}
      <BiddingWorksheet
        courses={courses}
        targetYear={yearOfStudy}
        targetSemester={anchor.semester as "FALL" | "SPRING"}
      />

      <BiddingExplainer isHe={isHe} />

      <a
        href={BIDDING_LINKS.system}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex w-fit items-center gap-1.5 rounded-xl border border-border/70 px-4 py-2 text-sm font-semibold text-foreground/80 transition-colors hover:border-foreground/30"
      >
        <ExternalLink className="size-4" />
        {isHe ? "למערכת המכרז של האוניברסיטה" : "Open the university's bidding system"}
      </a>

      {/* The line this screen exists to be trusted for. */}
      <p className="rounded-xl border border-border/50 bg-foreground/[0.02] p-3 text-[11px] leading-relaxed text-foreground/50">
        {isHe
          ? "פכמון לא מנחש כמה נקודות צריך לקורס. האוניברסיטה לא מפרסמת את המכסות, וההנחיות הרשמיות אומרות מפורשות לא להסיק משנים קודמות — אז כל מספר כזה היה ניחוש שעלול לעלות לכם במקום."
          : "Pakamon does not guess how many points a course needs. The university does not publish the quotas, and the official guidance says explicitly not to extrapolate from previous years — so any such number would be a guess that could cost you a seat."}
        {phase.kind === "before" && phase.daysUntil != null && (
          <>
            {" "}
            {isHe ? (
              <>
                הסבב נפתח בעוד <Bidi text={phase.daysUntil} /> {heNoun(phase.daysUntil, "יום", "ימים")}.
              </>
            ) : (
              <>Round opens in {phase.daysUntil} days.</>
            )}
          </>
        )}
      </p>
    </div>
  );
}
