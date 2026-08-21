"use client";

// =========================================================================
// "העסקה" — the knowledge-sharing contract, on one screen (#34).
// =========================================================================
// Ariel's note: there isn't enough explanation of the knowledge sharing itself
// — why it exists and what it gives back. Until now the answer was scattered
// across a nudge card's fine print, a Settings paragraph, and a footnote under
// the course table. Nobody assembles that into a decision.
//
// So it is stated once, in four blocks, in the order a person actually asks:
//   what do I give → what do I get → what stays anonymous → how do I take it back.
// The withdrawal column is deliberately the same size as the others: a deal you
// can't exit isn't a deal. Every number here is the REAL threshold, imported
// from the one file that defines them, so this card cannot drift from the
// server's behaviour.

import { useLocale } from "next-intl";
import { Gift, Library, ShieldCheck, Undo2 } from "lucide-react";
import { Bidi } from "@/lib/bidi";
import { cn } from "@/lib/utils";
import { GRADE_MIN_N, RATING_MIN_N } from "@/lib/k-anonymity";
import { heNoun } from "@/lib/he-count";

interface PactBlock {
  icon: typeof Gift;
  titleHe: string;
  titleEn: string;
  linesHe: string[];
  linesEn: string[];
  /** Shown under the bullets — the one sentence that settles the block. */
  footHe: string;
  footEn: string;
}

export const PACT_BLOCKS: readonly PactBlock[] = [
  {
    icon: Gift,
    titleHe: "מה אתם נותנים",
    titleEn: "What you give",
    linesHe: [
      "ציונים של קורסים שכבר סיימתם, בלי השם שלכם.",
      "חוות-דעת על קורס: עומס, קושי, המלצה, טיפ.",
      "תובנה אחת לכל שלב — מה הייתם אומרים לעצמכם.",
      "המסלול שבניתם, אם בא לכם לפרסם אותו.",
    ],
    linesEn: [
      "Grades from courses you already finished, without your name.",
      "A course review: workload, difficulty, verdict, tip.",
      "One insight per stage — what you'd tell your past self.",
      "The plan you built, if you feel like publishing it.",
    ],
    footHe: "כל אחד מהם בנפרד ומרצון. אפשר לתת אחד ולוותר על השאר.",
    footEn: "Each one is separate and voluntary. Give one, skip the rest.",
  },
  {
    icon: Library,
    titleHe: "מה אתם מקבלים",
    titleEn: "What you get",
    linesHe: [
      "ממוצע אמיתי לקורס — לא הערכה, ציונים שדווחו בפועל.",
      "עומס וקושי כפי שדירגו אותם מי שכבר עברו את הקורס.",
      "טיפים מהשטח, צמודים לקורס שאליו הם שייכים.",
      "מסלולים של מחזורים קודמים, להעתקה לתכנון שלכם.",
    ],
    linesEn: [
      "A real course average — reported grades, not an estimate.",
      "Workload and difficulty as rated by people who took it.",
      "Tips from the field, attached to the course they belong to.",
      "Plans from earlier cohorts, copyable into your own.",
    ],
    footHe: "הכול פתוח לקריאה גם בלי לתרום — התרומה היא מה שממלא את זה לבאים.",
    footEn: "All readable even without contributing — your share is what fills it for the next ones.",
  },
  {
    icon: ShieldCheck,
    titleHe: "מה נשאר אנונימי",
    titleEn: "What stays anonymous",
    linesHe: [
      "ציון נשמר בלי קישור לזהות — אי-אפשר לשחזר ממנו מי אתם.",
      // Numbers are phrased to stand ALONE between Hebrew words: the "מ-5"
      // construction puts a neutral hyphen next to a digit and reorders in RTL.
      `ממוצע קורס נחשף רק כשיש ${GRADE_MIN_N} תורמים ומעלה.`,
      `עומס, קושי והמלצה נחשפים רק כשיש ${heNoun(RATING_MIN_N, "מדרג", "מדרגים")} ומעלה.`,
      "מתחת לסף לא מוצג כלום — עדיף חור בנתונים מאשר לחשוף אדם אחד.",
    ],
    linesEn: [
      "A grade is stored with no link to identity — it can't be traced back.",
      `A course average appears only from ${GRADE_MIN_N} contributors up.`,
      `Workload, difficulty and verdict appear only from ${RATING_MIN_N} raters up.`,
      "Below the bar nothing shows — a gap in the data beats exposing one person.",
    ],
    footHe: "זו הסיבה שאפשר לסמוך על מה שכתוב כאן. בלי זה אף אחד לא היה כותב את האמת.",
    footEn: "That's why what's here is trustworthy. Without it nobody would write the truth.",
  },
  {
    icon: Undo2,
    titleHe: "איך מושכים הכול",
    titleEn: "How to take it back",
    linesHe: [
      "בהגדרות, במקטע חוכמת המחזור — כפתור אחד מוחק את כל תרומות-הציונים שלכם.",
      "תובנה נמחקת מתיק המחזור בכפתור מחיקה, בכל שלב.",
      "מסלול שפרסמתם יורד מהגלריה מתי שתחליטו.",
      "חונכות מנותקת בלחיצה, והגישה לתוכנית נסגרת מיד.",
    ],
    linesEn: [
      "In Settings, under cohort wisdom — one button erases all your grade contributions.",
      "An insight is deleted from the cohort file with its delete button, any time.",
      "A published plan comes down from the gallery whenever you decide.",
      "A mentoring link ends in one click, and access closes immediately.",
    ],
    footHe: "אין תקופת המתנה ואין למי לפנות — זה כפתור, לא בקשה.",
    footEn: "No waiting period and nobody to ask — it's a button, not a request.",
  },
] as const;

export function LineagePact({ className }: { className?: string }) {
  const isHe = useLocale() === "he";

  return (
    <section className={cn("space-y-3", className)}>
      <div>
        <h2 className="font-display text-xl font-bold text-foreground/85">
          {isHe ? "העסקה, בלי אותיות קטנות" : "The deal, no small print"}
        </h2>
        <p className="mt-1 text-sm text-foreground/55">
          {isHe
            ? "שיתוף ידע כאן הוא חילופין, לא תרומה לצדקה. זה כל מה שיש בו."
            : "Sharing knowledge here is an exchange, not charity. This is all of it."}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {PACT_BLOCKS.map((block) => {
          const Icon = block.icon;
          return (
            <div key={block.titleEn} className="data-card flex flex-col gap-2.5 p-4">
              <div className="flex items-center gap-2">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.06] text-foreground/60">
                  <Icon className="size-4" />
                </div>
                <h3 className="font-semibold text-foreground/85">
                  {isHe ? block.titleHe : block.titleEn}
                </h3>
              </div>
              <ul className="space-y-1.5">
                {(isHe ? block.linesHe : block.linesEn).map((line) => (
                  <li key={line} className="flex items-start gap-2 text-sm leading-relaxed text-foreground/70">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-foreground/30" />
                    <span>
                      <Bidi text={line} />
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-auto border-t border-border/40 pt-2 text-xs leading-relaxed text-foreground/45">
                {isHe ? block.footHe : block.footEn}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * The same contract compressed to one strip, for surfaces where the student is
 * already mid-task (the cohort file itself). It states the deal in one line and
 * hands off to the full card rather than repeating it.
 */
export function LineagePactStrip({ className }: { className?: string }) {
  const isHe = useLocale() === "he";
  return (
    <p className={cn("text-xs leading-relaxed text-foreground/50", className)}>
      <Bidi
        text={
          isHe
            ? `אתם נותנים ציונים וחוות-דעת בלי שם, ומקבלים את מה שכל מי שלפניכם נתן. ממוצע נחשף רק כשיש ${GRADE_MIN_N} תורמים, דירוג רק כשיש ${heNoun(RATING_MIN_N, "מדרג", "מדרגים")}, ואפשר למשוך הכול בכפתור אחד.`
            : `You give grades and reviews without a name, and get everything everyone before you gave. An average appears only from ${GRADE_MIN_N} contributors, a rating only from ${RATING_MIN_N} raters, and one button withdraws it all.`
        }
      />
    </p>
  );
}
