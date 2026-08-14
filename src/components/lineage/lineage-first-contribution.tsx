"use client";

// =========================================================================
// "התרומה הבאה שלכם" — the door that the lineage's CTA always promised (#31).
// =========================================================================
// Ariel: "זה לא שלח אותי למקום הנכון בשושלת כשלחצתי על משהו".
//
// The bug, precisely: /lineage said "פתחו את התיק האקדמי ודרגו קורס אחד שכבר
// סיימתם" and linked to /record — and /record has no rating control anywhere on
// it. The only user-initiated way to rate a course lived in the CATALOG's
// course-detail modal; the record's single review path was a toast fired inside
// the onSuccess of a grade-locking write, marked "done" the first time it is
// merely shown. So the exact student the CTA addresses — the one who already
// entered their grades — landed on a page with nothing to click, and the same
// dead end was repeated in the cohort file's empty state.
//
// Rather than re-point the link at a page where the student still has to hunt
// for the course, the action is brought to the sentence that asks for it: their
// own completed courses, the ones they are allowed to rate, each opening the
// review sheet that already exists. Server-side nothing changes — the same
// contributeReview, the same "only someone who completed it may rate it" gate,
// the same k-anonymity bars on what comes back out.

import { useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { PenLine, Check, RotateCcw } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/trpc/react";
import { Bidi } from "@/lib/bidi";
import { cn } from "@/lib/utils";
import { ContributeReviewSheet } from "@/components/catalog/contribute-review-sheet";
import { RATING_MIN_N } from "@/lib/k-anonymity";

/** How many courses to list before folding the rest behind a toggle. */
const PREVIEW = 4;

export function LineageFirstContribution({ className }: { className?: string }) {
  const isHe = useLocale() === "he";
  const utils = api.useUtils();
  const mine = api.courseKnowledge.myReviewableCourses.useQuery();
  const [target, setTarget] = useState<{ courseCode: string; courseName: string } | null>(null);
  const [expanded, setExpanded] = useState(false);

  const unreviewed = useMemo(
    () => (mine.data?.courses ?? []).filter((c) => !c.reviewed),
    [mine.data],
  );

  if (mine.isLoading) return null;

  // An empty state is a fact about the student; a failed fetch is a fact about
  // us. Saying "you have no completed courses" because a request timed out is
  // the repo-wide defect this codebase keeps hunting — so it is never said here.
  if (mine.isError) {
    return (
      <div className={cn("data-card space-y-2 p-4", className)}>
        <p className="text-sm text-foreground/70">
          {isHe
            ? "לא הצלחנו לטעון את הקורסים שסיימתם. זו תקלה אצלנו — שום תרומה לא נמחקה."
            : "We couldn't load your completed courses. That's on us — no contribution was lost."}
        </p>
        <button
          type="button"
          onClick={() => void mine.refetch()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-foreground/8 px-3 py-1.5 text-xs font-medium text-foreground/65 transition-colors hover:bg-foreground/15"
        >
          <RotateCcw className="size-3.5" aria-hidden="true" />
          {isHe ? "נסו שוב" : "Try again"}
        </button>
      </div>
    );
  }

  const completedCount = mine.data?.completedCount ?? 0;
  const reviewedCount = mine.data?.reviewedCount ?? 0;

  // Nothing finished yet — then the honest next step really is the record, and
  // ?scan=1 opens it ON the grade scanner instead of at the top of the page.
  if (completedCount === 0) {
    return (
      <div className={cn("data-card space-y-2 p-4", className)}>
        <p className="text-sm leading-relaxed text-foreground/65">
          {isHe
            ? "אפשר לדרג רק קורס שסיימתם, ועוד אין כאן קורס מסומן כהושלם. ברגע שתזינו ציונים, הקורסים יופיעו כאן לדירוג."
            : "Only a course you finished can be rated, and nothing here is marked completed yet. Once you enter grades, those courses show up here to rate."}
        </p>
        <Link
          href="/record?scan=1"
          className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-foreground/90"
        >
          {isHe ? "להזנת הציונים שלי" : "Enter my grades"}
        </Link>
      </div>
    );
  }

  // Everything they could rate, they rated.
  if (unreviewed.length === 0) {
    return (
      <div className={cn("data-card space-y-2 p-4", className)}>
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground/80">
          <Check className="size-4 shrink-0 text-emerald-500" aria-hidden="true" />
          <Bidi
            text={
              isHe
                ? `דירגתם את כל ${completedCount} הקורסים שסיימתם.`
                : `You've rated all ${completedCount} courses you finished.`
            }
          />
        </p>
        <p className="text-sm leading-relaxed text-foreground/60">
          {isHe
            ? "מה שנשאר הוא הדבר שאי-אפשר לגזור ממספרים: תובנה אחת למי שיגיע לשלב שאתם כבר עברתם."
            : "What's left is the thing numbers can't carry: one insight for whoever reaches the stage you already passed."}
        </p>
        <Link
          href="/cohort"
          className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-foreground/8 px-3 py-2 text-sm font-medium text-foreground/70 transition-colors hover:bg-foreground/15"
        >
          {isHe ? "לכתיבת תובנה בתיק המחזור" : "Write an insight in the cohort file"}
        </Link>
      </div>
    );
  }

  const shown = expanded ? unreviewed : unreviewed.slice(0, PREVIEW);

  return (
    <div className={cn("data-card space-y-3 p-4", className)}>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground/80">
          <Bidi
            text={
              isHe
                ? unreviewed.length === 1
                  ? "קורס אחד שסיימתם עוד לא דורג"
                  : `${unreviewed.length} קורסים שסיימתם עוד לא דורגו`
                : unreviewed.length === 1
                  ? "1 course you finished isn't rated yet"
                  : `${unreviewed.length} courses you finished aren't rated yet`
            }
          />
        </p>
        <p className="text-xs leading-relaxed text-foreground/55">
          <Bidi
            text={
              isHe
                ? `עומס, קושי והמלצה נפתחים לכולם מ-${RATING_MIN_N} מדרגים לאותו קורס. הדירוג אנונימי, ואפשר למשוך אותו בכל רגע.`
                : `Workload, difficulty and verdict open for everyone from ${RATING_MIN_N} raters on the same course. Rating is anonymous and withdrawable anytime.`
            }
          />
        </p>
        {reviewedCount > 0 && (
          <p className="text-xs text-foreground/45">
            <Bidi
              text={
                isHe
                  ? `כבר דירגתם ${reviewedCount} מתוך ${completedCount}.`
                  : `You've already rated ${reviewedCount} of ${completedCount}.`
              }
            />
          </p>
        )}
      </div>

      <ul className="flex flex-col gap-1.5">
        {shown.map((c) => (
          <li key={c.courseCode} className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-sm text-foreground/80">
              {isHe ? c.nameHe : (c.nameEn ?? c.nameHe)}
            </span>
            <button
              type="button"
              onClick={() =>
                setTarget({
                  courseCode: c.courseCode,
                  courseName: isHe ? c.nameHe : (c.nameEn ?? c.nameHe),
                })
              }
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-accent-brand/10 px-3 py-1.5 text-xs font-semibold text-accent-brand transition-colors hover:bg-accent-brand/20"
            >
              <PenLine className="size-3.5" aria-hidden="true" />
              {isHe ? "לדירוג" : "Rate"}
            </button>
          </li>
        ))}
      </ul>

      {unreviewed.length > PREVIEW && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs font-medium text-foreground/50 transition-colors hover:text-foreground/80"
        >
          {expanded ? (
            isHe ? "הצגה מקוצרת" : "Show fewer"
          ) : (
            <Bidi
              text={
                isHe
                  ? `הצגת כל ${unreviewed.length} הקורסים`
                  : `Show all ${unreviewed.length} courses`
              }
            />
          )}
        </button>
      )}

      {target && (
        <ContributeReviewSheet
          courseCode={target.courseCode}
          courseName={target.courseName}
          open
          onClose={() => {
            setTarget(null);
            // The sheet only invalidates the per-course aggregate, so refresh
            // this list here — a course that was just rated has to leave it,
            // otherwise the student is invited to rate the same course twice.
            void utils.courseKnowledge.myReviewableCourses.invalidate();
          }}
        />
      )}
    </div>
  );
}
