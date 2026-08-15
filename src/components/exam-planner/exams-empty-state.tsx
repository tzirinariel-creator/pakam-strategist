"use client";

// =========================================================================
// #39 — the exam planner's step 1 when the picker has nothing to show.
//
// The old screen printed one line for every possible cause ("אין מבחנים
// קרובים בתכנית שלכם"), so a student sitting INSIDE an exam period read it as
// a broken app. This component does two things the old line didn't:
//   1. States where the academic calendar actually is right now, with real
//      published dates (describeAcademicNow) — the app proves it knows the date.
//   2. Names the ACTUAL cause (classifyExamAvailability) and, when the cause is
//      missing data, says so honestly and hands over a manual way forward.
// It never invents a date and never shows a previous year's timetable as if it
// were this year's.
// =========================================================================

import { heNoun } from "@/lib/he-count";
import { CalendarClock, CalendarX2, FileText, GraduationCap } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Bidi } from "@/lib/bidi";
import { describeAcademicNow, getPlanningAnchor, hebrewYearLabel } from "@/lib/academic-calendar";
import type { ExamPlannerEmptyReason } from "@/lib/exam-availability";

export function AcademicStatusLine({ isHe, now }: { isHe: boolean; now?: Date }) {
  const status = describeAcademicNow(now);
  return (
    <p className="flex items-start gap-2 rounded-lg border border-border/50 bg-foreground/[0.02] px-3 py-2 text-xs leading-relaxed text-foreground/65">
      <CalendarClock className="mt-0.5 size-3.5 shrink-0 text-accent-brand" />
      <span>
        <Bidi text={isHe ? status.he : status.en} />
      </span>
    </p>
  );
}

export function ExamsEmptyState({
  isHe,
  reason,
  plannedCount,
  now,
  manualEntry,
}: {
  isHe: boolean;
  reason: ExamPlannerEmptyReason;
  /** How many not-yet-graded courses the plan holds (for the honest count). */
  plannedCount: number;
  now?: Date;
  /** The per-course manual-date rows — rendered only when they exist. */
  manualEntry?: React.ReactNode;
}) {
  // The year whose timetable a student would be planning against right now.
  const yearLabelHe = hebrewYearLabel(getPlanningAnchor(now).startYear);
  const yearLabelEn = `${getPlanningAnchor(now).startYear}/${String((getPlanningAnchor(now).startYear + 1) % 100).padStart(2, "0")}`;

  if (reason === "no-plan") {
    return (
      <div className="flex flex-col items-start gap-3">
        <AcademicStatusLine isHe={isHe} now={now} />
        <p className="text-sm text-foreground/60">
          {isHe
            ? "עוד אין לכם תכנית לימודים. בנו תכנית קודם — ואז נמשוך משם את תאריכי המבחנים."
            : "You don't have a study plan yet. Build one first — exam dates come from there."}
        </p>
        <Link
          href="/planner"
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent-brand px-3 py-2 text-sm font-semibold text-accent-brand-fg transition-colors hover:bg-accent-brand-hover"
        >
          <GraduationCap className="size-4" />
          {isHe ? "לבניית התכנית" : "Build my plan"}
        </Link>
      </div>
    );
  }

  if (reason === "no-exam-courses") {
    return (
      <div className="flex flex-col items-start gap-3">
        <AcademicStatusLine isHe={isHe} now={now} />
        <p className="flex items-start gap-2 text-sm leading-relaxed text-foreground/65">
          <FileText className="mt-0.5 size-4 shrink-0 text-foreground/40" />
          <span>
            {isHe
              ? "אף קורס בתכנית שלכם לא נבחן בבחינה — כולם מסתיימים בעבודה או ברפרט. אין כאן מבחנים לתכנן, אבל אפשר להוסיף דדליין הגשה למטה והוא יופיע בציר."
              : "None of the courses in your plan ends in an exam — they're all papers or referats. There are no sittings to plan, but you can add a submission deadline below and it will show on the timeline."}
          </span>
        </p>
      </div>
    );
  }

  // ── The two cases that used to look identical ───────────────────────────
  const isUnpublished = reason === "not-published";
  return (
    <div className="flex flex-col gap-3">
      <AcademicStatusLine isHe={isHe} now={now} />
      <div className="rounded-lg border border-amber-400/30 bg-amber-400/[0.06] p-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground/85">
          <CalendarX2 className="size-4 shrink-0 text-amber-500" />
          {isUnpublished
            ? isHe
              ? `לוח הבחינות של ${yearLabelHe} טרם פורסם`
              : `The ${yearLabelEn} exam timetable hasn't been published`
            : isHe
              ? "כל מועדי הבחינה שבתכנית שלכם כבר עברו"
              : "Every sitting in your plan is already behind you"}
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-foreground/65">
          {isUnpublished ? (
            <Bidi
              text={
                isHe
                  ? `בתכנית שלכם ${heNoun(plannedCount, "קורס", "קורסים")}, ולאף אחד מהם אין עדיין תאריך בחינה בקטלוג — האוניברסיטה פשוט לא פרסמה את הלוח. זו לא תקלה אצלכם, ואנחנו לא נמציא תאריכים ולא נציג לכם את הלוח של השנה שעברה. ברגע שהתאריכים יפורסמו הם ייכנסו לכאן מעצמם.`
                  : `Your plan holds ${plannedCount} courses and not one of them has an exam date in the catalog — the university simply hasn't published the timetable. Nothing is broken on your side; we won't invent dates or show you last year's timetable. The moment they're published they'll appear here.`
              }
            />
          ) : isHe ? (
            "התאריכים שהיו בקטלוג כבר עברו, ומועדים חדשים עוד לא פורסמו. מבחנים שכבר עברו אינם מוצגים."
          ) : (
            "The dates we had have passed, and new sittings haven't been published. Past sittings are hidden."
          )}
        </p>
        <p className="mt-2 text-xs font-medium text-foreground/70">
          {isHe
            ? "יודעים את התאריך? הזינו אותו כאן ונתכנן סביבו — התאריך שלכם תמיד גובר."
            : "Know the date? Enter it here and we'll plan around it — your date always wins."}
        </p>
      </div>
      {manualEntry}
    </div>
  );
}
