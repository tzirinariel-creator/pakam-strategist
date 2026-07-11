"use client";

// =========================================================================
// תיק המחזור (notes 3+16+20, approved plan stages א+ג+ד+ה) — the cohort's
// accumulated wisdom in one place, HOSTED BY THE REFERENT (stage ג: he's the
// community voice; the King stays the official-knowledge curator).
//
// Honesty rules carried over: everything shown cleared the k-anonymity bars
// (ratings N≥3, grades N≥5); "דבר הרפרנט" is pure counting, never an LLM
// guess; empty states invite seeding instead of faking life. The knowledge
// is deliberately cross-cohort — it outlives every graduating class
// (stage ה: inheritance is automatic because nothing filters by year).
// =========================================================================

import { useLocale } from "next-intl";
import {
  Users,
  ThumbsUp,
  Gauge,
  Flame,
  Share2,
  Sprout,
  MessageSquareQuote,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";
import { ReferentIcon } from "@/components/ui/referent-icon";
import { DISCIPLINE_CONFIG } from "@/lib/constants";
import { ThemedLoader } from "@/components/ui/themed-loader";

export function CohortFileContent() {
  const locale = useLocale();
  const isHe = locale === "he";
  const digestQuery = api.courseKnowledge.getCohortDigest.useQuery();

  if (digestQuery.isLoading) return <ThemedLoader />;

  const digest = digestQuery.data;
  const totals = digest?.totals;
  const hasData = (digest?.courses.length ?? 0) > 0;

  return (
    <div className="bg-mesh space-y-8 p-4 md:p-6">
      {/* Header — the Referent hosts */}
      <div className="animate-stagger-1 flex items-start gap-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent-brand text-accent-brand-fg">
          <ReferentIcon className="size-7" />
        </div>
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground/85">
            {isHe ? "תיק המחזור" : "The cohort file"}
          </h1>
          <p className="mt-1 text-foreground/55">
            {isHe
              ? "הרפרנט מארח: מה שהמחזורים שלפניכם למדו בדם — שמור, אנונימי, ועובר הלאה."
              : "Hosted by the Referent: what the cohorts before you learned the hard way — kept, anonymous, passed on."}
          </p>
        </div>
      </div>

      {/* דבר הרפרנט — data-driven, counting only */}
      <div className="animate-stagger-2 data-card flex flex-wrap items-center gap-3 p-4">
        <MessageSquareQuote className="size-5 shrink-0 text-accent-brand" />
        <p className="min-w-0 flex-1 text-sm leading-relaxed text-foreground/75">
          {!totals || totals.reviews === 0
            ? isHe
              ? "עוד אין כאן חוכמת-מחזור — מישהו צריך להיות ראשון. חוות-דעת אחת שלכם פותחת את התיק לכולם."
              : "No cohort wisdom yet — someone has to go first. One review of yours opens the file for everyone."
            : isHe
              ? `עד עכשיו נאספו כאן ${totals.reviews} חוות-דעת ו-${totals.gradePoints} תרומות-ציונים על ${totals.coursesCovered} קורסים.${totals.mostDiscussed ? ` הקורס המדובר ביותר: ${totals.mostDiscussed.nameHe} (${totals.mostDiscussed.count} חוות-דעת).` : ""}`
              : `${totals.reviews} reviews and ${totals.gradePoints} grade contributions across ${totals.coursesCovered} courses so far.${totals.mostDiscussed ? ` Most discussed: ${totals.mostDiscussed.nameHe} (${totals.mostDiscussed.count} reviews).` : ""}`}
        </p>
      </div>

      {hasData ? (
        <>
          {/* Course wisdom table */}
          <div className="animate-stagger-3 space-y-3">
            <h2 className="flex items-center gap-2 font-display text-xl font-bold text-foreground/85">
              <Gauge className="size-5 text-foreground/60" />
              {isHe ? "מה המחזור אומר על הקורסים" : "What the cohort says per course"}
            </h2>
            <div className="data-card overflow-x-auto p-0">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-start text-xs text-foreground/50">
                    <th className="px-4 py-2.5 text-start font-medium">{isHe ? "קורס" : "Course"}</th>
                    <th className="px-3 py-2.5 text-center font-medium">{isHe ? "ממליצים" : "Recommend"}</th>
                    <th className="px-3 py-2.5 text-center font-medium">{isHe ? "עומס" : "Workload"}</th>
                    <th className="px-3 py-2.5 text-center font-medium">{isHe ? "קושי" : "Difficulty"}</th>
                    <th className="px-3 py-2.5 text-center font-medium">{isHe ? "ממוצע המחזור" : "Cohort avg"}</th>
                    <th className="px-3 py-2.5 text-center font-medium">{isHe ? "חוות-דעת" : "Reviews"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {digest!.courses.map((c) => {
                    const cfg = c.discipline ? DISCIPLINE_CONFIG[c.discipline] : null;
                    return (
                      <tr key={c.courseCode}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            {cfg && (
                              <span
                                className="inline-block size-2 shrink-0 rounded-full"
                                style={{ backgroundColor: cfg.color }}
                              />
                            )}
                            <span className="font-medium text-foreground/85">
                              {isHe ? c.nameHe : (c.nameEn ?? c.nameHe)}
                            </span>
                            <span className="font-mono text-[11px] text-foreground/35">{c.courseCode}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {c.recommendShare != null ? (
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
                                c.recommendShare >= 0.6
                                  ? "bg-emerald-500/15 text-emerald-600"
                                  : "bg-foreground/8 text-foreground/60",
                              )}
                            >
                              <ThumbsUp className="size-3" />
                              {Math.round(c.recommendShare * 100)}%
                            </span>
                          ) : (
                            <span className="text-foreground/30">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center font-mono text-foreground/70">
                          {c.workload != null ? `${c.workload}/5` : <span className="text-foreground/30">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-center font-mono text-foreground/70">
                          {c.difficulty != null ? `${c.difficulty}/5` : <span className="text-foreground/30">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-center font-mono text-foreground/70">
                          {c.cohortAverage != null ? c.cohortAverage : <span className="text-foreground/30">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-center text-foreground/55">{c.ratingCount}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-foreground/40">
              {isHe
                ? "מוצג רק מה שעבר את סף האנונימיות: דירוגים מ-3 מדרגים, ציונים מ-5 תורמים. אף נתון אישי לא נחשף."
                : "Only data above the anonymity bar is shown: ratings from 3+ raters, grades from 5+ contributors. Nothing personal is exposed."}
            </p>
          </div>

          {/* Tips wall */}
          {digest!.tips.length > 0 && (
            <div className="animate-stagger-4 space-y-3">
              <h2 className="flex items-center gap-2 font-display text-xl font-bold text-foreground/85">
                <Flame className="size-5 text-foreground/60" />
                {isHe ? "טיפים מהשטח" : "Tips from the field"}
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {digest!.tips.map((t, i) => (
                  <div key={i} className="data-card space-y-1.5 p-4">
                    <p className="text-sm leading-relaxed text-foreground/80">{t.tip}</p>
                    <p className="text-xs text-foreground/45">{t.courseName}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        /* Seeding empty state — honest, inviting, no fake life */
        <div className="animate-stagger-3 data-card flex flex-col items-center gap-3 p-10 text-center">
          <Sprout className="size-10 text-foreground/25" />
          <p className="max-w-md text-sm leading-relaxed text-foreground/60">
            {isHe
              ? "התיק נפתח ברגע שיש מספיק תרומות כדי לשמור על אנונימיות (3 מדרגים לקורס). סיימתם קורס? דרגו אותו בתיק האקדמי — ותפתחו את הידע לכל המחזור."
              : "The file opens once enough contributions clear the anonymity bar (3 raters per course). Finished a course? Rate it in your record — and unlock the knowledge for the whole cohort."}
          </p>
          <Link
            href="/record"
            className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-foreground/90"
          >
            {isHe ? "לתיק האקדמי שלי" : "To my record"}
          </Link>
        </div>
      )}

      {/* Winning plans (stage ד) + inheritance note (stage ה) */}
      <div className="animate-stagger-5 grid gap-4 md:grid-cols-2">
        <div className="data-card space-y-2 p-5">
          <h3 className="flex items-center gap-2 font-semibold text-foreground/80">
            <Share2 className="size-4 text-accent-brand" />
            {isHe ? "מסלולים מנוצחים" : "Winning plans"}
          </h3>
          <p className="text-sm leading-relaxed text-foreground/60">
            {isHe
              ? "בניתם סמסטר שאתם גאים בו? שתפו את התוכנית מהמתכנן (כפתור \"שתף\") — החברים רואים אותה בלי חשבון, ומי שמתחבר יכול לבנות ממנה את שלו."
              : "Built a semester you're proud of? Share the plan from the planner — friends view it without an account, and signed-in students can build from it."}
          </p>
          <Link href="/planner" className="text-sm font-medium text-accent-brand hover:underline">
            {isHe ? "לתכנון התואר ←" : "To the planner →"}
          </Link>
        </div>
        <div className="data-card space-y-2 p-5">
          <h3 className="flex items-center gap-2 font-semibold text-foreground/80">
            <Users className="size-4 text-accent-brand" />
            {isHe ? "הידע עובר הלאה" : "Knowledge passes on"}
          </h3>
          <p className="text-sm leading-relaxed text-foreground/60">
            {isHe
              ? "כל מה שנאסף כאן נשאר גם אחרי שהמחזור שלכם מסיים — המחזור הבא מתחיל עם כל מה שלמדתם. זה כל הרעיון."
              : "Everything gathered here outlives your cohort — the next one starts with everything you learned. That's the whole point."}
          </p>
        </div>
      </div>
    </div>
  );
}
