"use client";

// -----------------------------------------------------------------------
// The whole year on one screen, for the round you are about to bid in
// -----------------------------------------------------------------------
// Ariel, 21.8: "אולי נעשה לקראת הבידינג מסך תכנון אחוד לכל השנה לשני סמסטרים
// כמו בביד-איט? כדי שנוכל להתחרות בהם".
//
// The board above already holds both terms and the bidding toolkit below
// already checks clashes — but that toolkit is scoped to the NEXT semester
// alone, which is the wrong scope for PPE. TAU's own wording is that
// "הרישום בחלק מהחוגים סמסטריאלי ובחלק שנתי", and a PPE student registers
// through several departments at once, so part of semester ב׳ is chosen in the
// same round as semester א׳. Reviewing only the near term reviews half of what
// is about to be registered.
//
// What it does NOT do is the entire reason it can exist at all: it never
// predicts a bidding point, never ranks a course's chances, never suggests how
// to divide a budget. TAU does not publish the quota. It counts what the
// student planned and hands it back in a form they can bid from.

import { useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { LayoutGrid, Copy, Check, AlertTriangle } from "lucide-react";
import { Bidi } from "@/lib/bidi";
import { heNoun } from "@/lib/he-count";
import { yearAtAGlance, yearPlanAsText, type TermPlan } from "@/lib/year-at-a-glance";
import type { UserCourseWithCourse } from "@/types/degree";

export function YearAtAGlanceCard({
  courses,
  yearOfStudy,
}: {
  courses: UserCourseWithCourse[];
  yearOfStudy: number;
}) {
  const isHe = useLocale() === "he";
  const [copied, setCopied] = useState(false);

  const plan = useMemo(() => yearAtAGlance(courses, yearOfStudy), [courses, yearOfStudy]);

  // Nothing planned at all → the board above already says so; a second empty
  // panel underneath it is noise.
  if (plan.totalCourses === 0) return null;

  return (
    <div className="data-card p-5">
      <div className="flex flex-wrap items-start gap-2.5">
        <LayoutGrid className="mt-0.5 size-4 shrink-0 text-accent-brand" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-display text-base font-bold text-foreground/90">
              {isHe ? "כל השנה במבט אחד" : "The whole year at a glance"}
            </h3>
            <span className="text-xs font-semibold tabular-nums text-foreground/55">
              <Bidi text={plan.totalCredits} /> {isHe ? "ש״ס" : "credits"} ·{" "}
              {isHe ? heNoun(plan.totalCourses, "קורס", "קורסים") : `${plan.totalCourses} courses`}
            </span>
          </div>

          <p className="mt-1 text-xs leading-relaxed text-foreground/55">
            {isHe
              ? "בפכ״מ הרישום עובר דרך כמה חוגים, וחלק מהם רושמים לשנה שלמה — כלומר קורסים של סמסטר ב׳ נבחרים כבר במקצה הזה. שני הסמסטרים כאן יחד, כדי לבדוק אותם לפני שהוא נפתח."
              : "PPE registration runs through several departments, some of which register for a whole year — so semester B courses are chosen in this round too. Both terms are here together, to review before it opens."}
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <TermColumn tp={plan.fall} isHe={isHe} />
            <TermColumn tp={plan.spring} isHe={isHe} />
          </div>

          {plan.hasEmptyTerm && (
            <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-amber-500/[0.07] p-2.5 text-xs leading-relaxed text-foreground/65">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              {isHe
                ? "אחד הסמסטרים ריק. אם החוג שלכם רושם לשנה שלמה, זה הרגע לתכנן גם אותו — אחרת הוא ייפתח בלי הקורסים שרציתם."
                : "One term is empty. If your department registers annually, this is the moment to plan it too — otherwise it opens without the courses you wanted."}
            </p>
          )}

          {/* A list you can work FROM, not just read. Codes lead, because a
              code is what gets typed into the registration form. */}
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(yearPlanAsText(plan, isHe));
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {
                /* clipboard blocked — the list is on screen either way */
              }
            }}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground/70 transition-colors hover:border-foreground/30"
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied
              ? isHe ? "הועתק" : "Copied"
              : isHe ? "העתקת הרשימה עם הקודים" : "Copy the list with course codes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TermColumn({ tp, isHe }: { tp: TermPlan; isHe: boolean }) {
  const title = isHe
    ? tp.term === "FALL" ? "סמסטר א׳" : "סמסטר ב׳"
    : tp.term === "FALL" ? "Semester A" : "Semester B";

  return (
    // min-w-0: a grid item defaults to `min-width: auto`, so it refuses to
    // shrink below its content and pushes the track wider than the card. The
    // card is a .data-card (overflow: hidden, no scroll), so the excess is not
    // merely scrolled past — it is GONE. Measured at 375px: this column came
    // out 352px wide inside a 327px card at left -48, which put "10 ש״ס" for
    // סמסטר א׳ off the edge with no way to reach it, on the card built for
    // reading your year before the registration round.
    <div className="min-w-0 rounded-xl border border-foreground/10 bg-foreground/[0.02] p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold text-foreground/85">{title}</span>
        <span className="text-xs font-semibold tabular-nums text-foreground/50">
          <Bidi text={tp.credits} /> {isHe ? "ש״ס" : "cr."}
        </span>
      </div>

      {tp.mandatoryCredits > 0 && (
        <p className="mt-0.5 text-[11px] text-foreground/45">
          {isHe ? (
            <>
              מתוכם <Bidi text={tp.mandatoryCredits} /> ש״ס חובה — לא נתונים לבחירה
            </>
          ) : (
            <>{tp.mandatoryCredits} of them mandatory — not a choice</>
          )}
        </p>
      )}

      {tp.courses.length === 0 ? (
        <p className="mt-2 text-xs text-foreground/40">
          {isHe ? "עוד לא תוכנן" : "Nothing planned yet"}
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1">
          {tp.courses.map((c) => (
            <li key={c.userCourseId} className="flex items-baseline gap-2 text-xs">
              <span className="shrink-0 font-data text-[10px] text-foreground/35" dir="ltr">
                {c.code}
              </span>
              <span className="min-w-0 flex-1 text-balance text-foreground/75">{c.name}</span>
              <span className="shrink-0 tabular-nums text-foreground/45">
                <Bidi text={c.credits} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
