"use client";

// =========================================================================
// "N ש״ס שלך לא נספרים לשום תחום" — asking, instead of guessing
// =========================================================================
// The degree needs 60 ש״ס inside your focus area, but 48% of the catalog is
// tagged GENERAL — counts toward nothing — including 66 of the 68 seminars,
// even though the ידיעון itself says a seminar IS in-field. With the catalog
// as it stands the focus meter cannot reach 60: the ceiling is 62, and only if
// every elective happens to land in-field. A student can do everything right
// and watch the bar stop moving, with nothing on screen explaining why.
//
// The tempting fix was to infer the discipline from the course-code prefix
// (0618 → philosophy, 1031 → political science; the match is near-perfect).
// Ariel's call, and it is the right one: the STUDENT knows which field their
// seminar was written in — we would be guessing, and a guess written into 24
// real students' records is not something to be casually confident about.
//
// `UserCourse.disciplineOverride` already exists, is already persisted, and
// /record already has a per-row picker. Every piece was in place except the
// one that mattered: nobody ever TOLD the student it was costing them. So this
// component does one job — state the cost in ש״ס, and point at the fix.
//
// It leads with credits, not with a course count, because "3 קורסים" is a
// chore and "8 ש״ס לא נספרים" is a consequence.

import { useLocale } from "next-intl";
import Link from "next/link";
import { Target } from "lucide-react";
import { Bidi } from "@/lib/bidi";
import { heNoun } from "@/lib/he-count";
import { summarizeUnassigned, type AssignableCourse } from "@/lib/unassigned-discipline";

export function UnassignedDisciplinePrompt({
  courses,
  hasFocusArea,
}: {
  courses: AssignableCourse[];
  /** No focus area picked yet → the meter isn't live, so this isn't the ask. */
  hasFocusArea: boolean;
}) {
  const isHe = useLocale() === "he";
  const summary = summarizeUnassigned(courses);

  if (!hasFocusArea || summary.courses.length === 0) return null;

  const names = summary.courses
    .slice(0, 3)
    .map((c) => (isHe ? c.nameHe : (c.nameEn ?? c.nameHe)));
  const more = summary.courses.length - names.length;

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
      <div className="flex items-start gap-2.5">
        <Target className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground/90">
            {isHe ? (
              <>
                <Bidi text={summary.credits} /> ש״ס שלכם לא נספרים לאף תחום מיקוד
              </>
            ) : (
              <>{summary.credits} of your credits count toward no focus area</>
            )}
          </p>

          <p className="mt-1.5 text-xs leading-relaxed text-foreground/70">
            {isHe
              ? "בתואר צריך 60 ש״ס בתחום המיקוד. הקורסים האלה מסומנים בקטלוג כ״כללי״, אז הם לא נספרים לשם — והמד שלכם תקוע בגללם."
              : "The degree needs 60 credits inside your focus area. These courses are tagged “General” in the catalog, so they count toward none of it — and your meter is stuck because of them."}
          </p>

          {summary.seminarCount > 0 && (
            <p className="mt-1.5 text-xs leading-relaxed text-foreground/70">
              {isHe ? (
                <>
                  {heNoun(summary.seminarCount, "סמינר", "סמינרים")} מתוכם — והידיעון
                  עצמו כותב ״סמינר בתחום המיקוד בו תוגש עבודה סמינריונית״, אז כמעט בטוח
                  שהם שייכים לתחום שלכם.
                </>
              ) : (
                <>
                  {summary.seminarCount} of them are seminars — and the ידיעון says a
                  seminar is written inside your focus area, so they almost certainly
                  belong to it.
                </>
              )}
            </p>
          )}

          <p className="mt-2 text-xs text-foreground/50">
            {names.join(isHe ? ", " : ", ")}
            {more > 0 && (isHe ? ` ועוד ${more}` : ` and ${more} more`)}
          </p>

          {/* N5 — Ariel asked "לפי מה אתה מחליט בשלב הראשוני באיזה תחום מיקוד
              כל קורס?". The honest answer is worth showing HERE, because it
              explains why we're asking at all: the classification comes from
              the ידיעון's own section header, and 66 of the 68 seminars sit
              under headers like "סמינר בתחום המיקוד בו תוגש עבודה סמינריונית"
              — which says a seminar HAS a field but never says which. We are
              not being lazy; the source genuinely doesn't say. */}
          <p className="mt-2 text-xs leading-relaxed text-foreground/60">
            {isHe
              ? "התחום של כל קורס נלקח מהכותרת שמתחתיה הוא מופיע בידיעון. חלק מהקורסים — בעיקר סמינרים — יושבים תחת כותרת שאומרת שיש להם תחום, אבל לא אומרת איזה. שם אנחנו נעצרים: רק אתם יודעים לאיזה תחום הקורס נספר אצלכם, ואנחנו לא מנחשים במקומכם."
              : "Each course's field comes from the ידיעון section header it appears under. Some courses — seminars especially — sit under a header that says they have a field but never says which. That's where we stop: only you know which field the course counts toward for you, and we won't guess for you."}
          </p>

          <Link
            href="/he/record"
            className="mt-3 inline-flex items-center rounded-lg bg-foreground px-3 py-1.5 text-xs font-semibold text-background transition-transform hover:scale-[1.02]"
          >
            {isHe ? "לשייך אותם בתיק האקדמי" : "Assign them in your record"}
          </Link>
        </div>
      </div>
    </div>
  );
}
