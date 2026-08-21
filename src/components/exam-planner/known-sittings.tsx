"use client";

// =========================================================================
// "התאריך טרם פורסם — אבל היום והשעה כן ידועים"
// =========================================================================
// Ariel: "תבחן את הפיצר של התכנון מועדי ב׳ הזה ותראה שהוא נגיש … זה יכול
// להיות פיצר אדיר שיעזור לאנשים".
//
// The blocker was that the exam planner had nothing to work with when our own
// catalog lacked a date — so it showed an honest but useless "טרם פורסם".
//
// The ידיעון's board carries 269 courses with BOTH sittings dated, plus the day
// and time our catalog never had. Those dates now feed the planner directly
// (see exam-planner-content), and this block adds what a date alone doesn't
// say: which day of the week it falls on and at what hour.
//
// Nothing here is invented. Every line traces to the ידיעון page, and a date
// the student typed still beats it.
import { useLocale } from "next-intl";
import { CalendarClock } from "lucide-react";
import { Bidi } from "@/lib/bidi";
import { heNoun } from "@/lib/he-count";
import { examSittingsFor, describeSitting } from "@/lib/yedion-assessments";

/** "2027-01-28" → "28.1.2027". Rendered inside <Bidi>, so digits stay LTR. */
function formatIsoDate(iso: string, isHe: boolean): string {
  const [y, m, d] = iso.split("-");
  return isHe ? `${Number(d)}.${Number(m)}.${y}` : `${d}/${m}/${y}`;
}

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
        {isHe ? "מועדי הבחינה לפי הידיעון" : "Exam sittings per the ידיעון"}
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-foreground/60">
        {isHe
          ? `לפי לוח הבחינות בידיעון, ל${heNoun(rows.length, "קורס", "קורסים")} בתכנית שלכם יש מועד א׳ ומועד ב׳ עם תאריך, יום ושעה.`
          : `Per the ידיעון's exam board, ${rows.length} of your courses have both sittings with a date, day and time.`}
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
                  <Bidi text={`${describeSitting(s, isHe)}${s.date ? ` · ${formatIsoDate(s.date, isHe)}` : ""}`} />
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-2.5 text-[11px] leading-relaxed text-foreground/40">
        {isHe
          ? "מקור: לוח הבחינות והמטלות בידיעון פכ״מ תשפ״ז. תאריכים משתנים לפעמים — שווה לאמת מול הידיעון לפני שסוגרים משהו. אם הזנתם תאריך בעצמכם, הוא תמיד גובר."
          : "Source: the PPE תשפ״ז exam and assignment board. Dates do change — worth verifying against the ידיעון before you commit. A date you entered yourself always wins."}
      </p>
    </div>
  );
}
