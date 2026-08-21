"use client";

// =========================================================================
// "התאריך טרם פורסם — אבל היום והשעה כן ידועים"
// =========================================================================
// Ariel: "תבחן את הפיצר של התכנון מועדי ב׳ הזה ותראה שהוא נגיש … זה יכול
// להיות פיצר אדיר שיעזור לאנשים".
//
// The blocker was that the exam planner had nothing to work with before the
// university publishes dates — so for most of the year it showed an honest but
// useless "טרם פורסם" and that was that.
//
// Parsing the ידיעון's own board turned up something better: for תשפ״ז it
// publishes 270 exam sittings WITH day-of-week and time, and no dates. So we
// can say "מועד א׳ ביום ד׳ ב-14:00" today — sourced, checkable, and enough to
// start planning around, months before a single date exists.
//
// It still refuses to invent the date. That is the whole point: this turns
// "we know nothing" into "here is exactly what is known and what isn't".
import { useLocale } from "next-intl";
import { CalendarClock } from "lucide-react";
import { Bidi } from "@/lib/bidi";
import { heNoun } from "@/lib/he-count";
import { examSittingsFor, describeSitting } from "@/lib/yedion-assessments";

export interface PlannedCourseLite {
  courseCode: string;
  nameHe: string;
  nameEn?: string | null;
  /** The student's chosen group, when they have one — sittings can differ. */
  group?: string | null;
}

export function KnownSittings({ courses }: { courses: PlannedCourseLite[] }) {
  const isHe = useLocale() === "he";

  const rows = courses
    .map((c) => ({ course: c, sittings: examSittingsFor(c.courseCode, c.group) }))
    .filter((r) => r.sittings.length > 0);

  if (rows.length === 0) return null;

  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground/85">
        <CalendarClock className="size-4 shrink-0 text-foreground/45" />
        {isHe ? "מה שכן ידוע כבר עכשיו" : "What's already known"}
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-foreground/60">
        {isHe
          ? `הידיעון כבר מפרסם את היום והשעה של כל מועד — רק התאריך עוד לא נקבע. ל${heNoun(rows.length, "קורס", "קורסים")} בתכנית שלכם יש מידע כזה, ואפשר להתחיל לתכנן סביבו.`
          : `The ידיעון already publishes the day and time of each sitting — only the date isn't set yet. ${rows.length} of your courses have this, and you can start planning around it.`}
      </p>

      <ul className="mt-2.5 space-y-2">
        {rows.map(({ course, sittings }) => (
          <li key={course.courseCode} className="rounded-lg border border-border/40 p-2.5">
            <p className="truncate text-xs font-medium text-foreground/85">
              {isHe ? course.nameHe : (course.nameEn ?? course.nameHe)}
            </p>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {sittings.map((s) => (
                <span key={s.sitting} className="text-[11px] text-foreground/60">
                  <Bidi text={describeSitting(s, isHe)} />
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-2.5 text-[11px] leading-relaxed text-foreground/40">
        {isHe
          ? "מקור: לוח הבחינות והמטלות בידיעון פכ״מ תשפ״ז. התאריכים עצמם יתווספו כאן ברגע שהאוניברסיטה תפרסם אותם — אנחנו לא ננחש אותם."
          : "Source: the PPE תשפ״ז exam and assignment board. The dates themselves will appear here the moment the university publishes them — we won't guess them."}
      </p>
    </div>
  );
}
