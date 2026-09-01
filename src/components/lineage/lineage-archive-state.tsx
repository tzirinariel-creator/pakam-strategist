"use client";

// =========================================================================
// "מה יש בארכיון עכשיו" — the lineage's missing answer to "יש כאן בכלל משהו?"
// =========================================================================
// #30: /lineage explained the concept, named the two doors and printed the
// contract — and showed not one fact from the archive it is the front door of.
// A student arriving on it could not tell whether the file behind the door held
// three hundred reviews or nothing at all, and the door cards promised
// "ממוצעים אמיתיים, עומס וקושי, טיפים" whether or not any existed.
//
// Worse, the honest-but-silent case reads as breakage. In production today the
// file holds anonymous grade points and zero reviews, so both /cohort and the
// door card say a flat "עוד אין כאן חוכמת-מחזור" — which tells the students who
// DID import their grades that their contribution amounted to nothing. It
// didn't: it is sitting one contributor short of the reveal bar. That is a
// completely different sentence, and it is the motivating one.
//
// Every number here is counted server-side from the file itself (getCohortDigest
// → totals / almostUnlocked). Nothing is estimated, and no threshold moves: the
// card exists precisely to say why the bar is there and how far it is.

import { useLocale } from "next-intl";
import { Archive } from "lucide-react";
import { Bidi } from "@/lib/bidi";
import { cn } from "@/lib/utils";
import { GRADE_MIN_N, RATING_MIN_N } from "@/lib/k-anonymity";
import { heNoun, heNounF } from "@/lib/he-count";

export interface ArchiveTotals {
  reviews: number;
  gradePoints: number;
  coursesCovered: number;
}

export interface AlmostUnlocked {
  courses: number;
  reviewsNeeded: number;
}

export function LineageArchiveState({
  totals,
  almostUnlocked,
  className,
}: {
  totals: ArchiveTotals | null | undefined;
  almostUnlocked?: AlmostUnlocked | null;
  className?: string;
}) {
  const isHe = useLocale() === "he";
  if (!totals) return null;

  const { reviews, gradePoints, coursesCovered } = totals;
  const nothingAtAll = reviews === 0 && gradePoints === 0;
  const heldBack = reviews === 0 && gradePoints > 0;

  return (
    <section className={cn("space-y-3", className)}>
      <h2 className="font-display text-xl font-bold text-foreground/85">
        {isHe ? "מה יש בארכיון עכשיו" : "What's in the archive right now"}
      </h2>

      <div className="data-card space-y-3 p-5">
        <div className="flex items-start gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.06] text-foreground/60">
            <Archive className="size-4" aria-hidden="true" />
          </div>

          {nothingAtAll ? (
            <p className="text-sm leading-relaxed text-foreground/70">
              {isHe
                ? "הארכיון ריק. אף אחד עוד לא השאיר כאן כלום, ולכן מה שתשאירו אתם יהיה הדבר הראשון שהמחזור הבא ימצא."
                : "The archive is empty. Nobody has left anything here yet, so what you leave will be the first thing the next cohort finds."}
            </p>
          ) : heldBack ? (
            <p className="text-sm leading-relaxed text-foreground/70">
              <Bidi
                text={
                  isHe
                    ? `${heNounF(gradePoints, "תרומה", "תרומות")}-ציונים אנונימיות כבר נאספו כאן, ועדיין לא מוצג אף ממוצע — ממוצע של קורס נפתח רק כשיש ${GRADE_MIN_N} תורמים לאותו קורס. חוות-דעת עוד לא נכתבה אף אחת, ועומס, קושי והמלצה נפתחים מ-${heNoun(RATING_MIN_N, "מדרג", "מדרגים")} לקורס. זה לא ריק, זה מתחת לסף.`
                    : `${gradePoints} anonymous grade contributions are already here, and no average shows yet — a course average opens only at ${GRADE_MIN_N} contributors for that course. Not one review has been written, and workload, difficulty and verdict open from ${RATING_MIN_N} raters per course. This isn't empty, it's below the bar.`
                }
              />
            </p>
          ) : (
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                <Stat
                  value={coursesCovered}
                  label={isHe ? "קורסים פתוחים לקריאה" : "courses open to read"}
                />
                <Stat value={reviews} label={isHe ? "חוות-דעת" : "reviews"} />
                <Stat
                  value={gradePoints}
                  label={isHe ? "תרומות-ציונים" : "grade contributions"}
                />
              </div>
              {almostUnlocked && almostUnlocked.courses > 0 && (
                <p className="text-sm leading-relaxed text-foreground/65">
                  <Bidi
                    text={
                      isHe
                        ? almostUnlocked.reviewsNeeded === 1
                          ? `עוד חוות-דעת אחת פותחת עוד קורס לכל המחזור.`
                          : `עוד ${almostUnlocked.reviewsNeeded} חוות-דעת פותחות ${almostUnlocked.courses === 1 ? "עוד קורס אחד" : `עוד ${heNoun(almostUnlocked.courses, "קורס", "קורסים")}`} לכל המחזור.`
                        : almostUnlocked.reviewsNeeded === 1
                          ? `One more review opens another course for the whole cohort.`
                          : `${almostUnlocked.reviewsNeeded} more reviews open ${almostUnlocked.courses === 1 ? "another course" : `another ${almostUnlocked.courses} courses`} for the whole cohort.`
                    }
                  />
                </p>
              )}
            </div>
          )}
        </div>

        <p className="border-t border-border/40 pt-2 text-xs leading-relaxed text-foreground/60">
          {isHe
            ? "כל המספרים כאן נספרים מתיק המחזור עצמו ברגע הטעינה — לא הערכה ולא תחזית."
            : "Every number here is counted from the cohort file itself at load time — not an estimate, not a forecast."}
        </p>
      </div>
    </section>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="font-data text-2xl font-bold text-foreground/85">
        <bdi dir="ltr">{value}</bdi>
      </span>
      <span className="text-xs text-foreground/60">{label}</span>
    </div>
  );
}
