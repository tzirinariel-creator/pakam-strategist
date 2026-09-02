"use client";

// The growth loop for the cohort layer. At ~24 users almost every course sits
// below the k-anon reveal threshold, so the social wisdom is invisible — and
// the ONE engine that fills it (importMyGrades) was buried in Settings. This
// component moves that engine into the natural flow: it explains, honestly,
// that the file fills as the cohort shares, and invites the student to
// contribute what they've ALREADY completed (the only thing they can honestly
// share). Two shapes:
//   variant="inline" — a slim strip inside the grade-scan summary, the moment
//                      right after a student imports their completed courses.
//   variant="card"   — a full, dismissible card for the empty home-screen
//                      teaser and the cohort page, so silence becomes an
//                      honest, motivating "this grows — and you can grow it".
//
// Honesty is load-bearing: the copy states exactly what is shared (completed
// grades, anonymised), that an average appears only at 5+ contributors, and
// that everything can be withdrawn. No fake data is ever seeded.

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { Users2, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { heNoun } from "@/lib/he-count";

const SHARED_KEY = "pk-cohort-shared"; // set once the student has contributed
const DISMISS_KEY = "pk-cohort-nudge-dismissed"; // card variant only

export function CohortShareNudge({
  variant = "card",
  className,
}: {
  variant?: "inline" | "card";
  className?: string;
}) {
  const isHe = useLocale() === "he";
  const [mounted, setMounted] = useState(false);
  const [shared, setShared] = useState<number | null>(null); // count from THIS session
  const [alreadyShared, setAlreadyShared] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Per-device flags read after mount only — never during render — so the
  // server and first client paint agree (this subtree lives on the hydration-
  // sensitive dashboard).
  useEffect(() => {
    setMounted(true);
    try {
      setAlreadyShared(localStorage.getItem(SHARED_KEY) === "1");
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      /* storage blocked — treat as first-time, best-effort */
    }
  }, []);

  const importGrades = api.courseKnowledge.importMyGrades.useMutation({
    onSuccess: (r) => {
      setShared(r.imported);
      try {
        localStorage.setItem(SHARED_KEY, "1");
      } catch {
        /* best-effort */
      }
      setAlreadyShared(true);
      toast.success(
        isHe
          ? r.imported > 0
            ? `שותפו ${heNoun(r.imported, "קורס", "קורסים")} באופן אנונימי — תודה שאתם בונים את זה לכולם`
            : "הכול כבר משותף — תודה שאתם חלק מזה"
          : r.imported > 0
            ? `Shared ${r.imported} courses anonymously — thank you for building this for everyone`
            : "Everything is already shared — thank you for being part of it",
      );
    },
    onError: (e) => toast.error(e.message),
  });

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* best-effort */
    }
  }

  if (!mounted) return null;
  // The card is a gentle, one-time invitation: once contributed or dismissed it
  // steps out of the way. The inline strip inside the scan summary keeps showing
  // its short "thanks" confirmation, since that surface is itself transient.
  if (variant === "card" && (dismissed || alreadyShared)) return null;

  const justSharedText =
    shared == null
      ? null
      : shared > 0
        ? isHe
          ? `שיתפתם ${heNoun(shared, "קורס", "קורסים")}. אתם עכשיו חלק מחוכמת המחזור.`
          : `You shared ${shared} courses. You're now part of the cohort's wisdom.`
        : isHe
          ? "הכול כבר משותף — תודה שאתם חלק מזה."
          : "Everything is already shared — thank you.";

  // ── inline: a slim strip for the grade-scan summary ──────────────────────
  if (variant === "inline") {
    if (justSharedText) {
      return (
        <p className={cn("flex items-center gap-1.5 text-xs text-status-green", className)}>
          <Check className="size-3.5 shrink-0" />
          {justSharedText}
        </p>
      );
    }
    return (
      <div className={cn("flex flex-wrap items-center gap-2 border-t border-border/50 pt-2.5", className)}>
        <p className="min-w-0 flex-1 text-xs leading-relaxed text-foreground/60">
          {isHe
            ? "רוצים לתרום את מה שסיימתם למחזור? אנונימי לגמרי — כך כולם רואים ממוצעים אמיתיים."
            : "Contribute what you've completed to the cohort? Fully anonymous — so everyone sees real averages."}
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => importGrades.mutate()}
          disabled={importGrades.isPending}
          className="h-7 shrink-0 gap-1.5 text-xs"
        >
          {importGrades.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Users2 className="size-3.5" />}
          {isHe ? "שתפו למחזור" : "Share"}
        </Button>
      </div>
    );
  }

  // ── card: the home-screen / cohort empty-state doorway ───────────────────
  return (
    <div className={cn("data-card p-4", className)}>
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-brand/10 text-accent-brand">
          <Users2 className="size-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-foreground/85">
            {isHe ? "תיק המחזור מתמלא" : "The cohort file is filling up"}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-foreground/60">
            {isHe
              ? "ככל שיותר מהמחזור משתפים, נחשפים כאן ממוצעים אמיתיים, עומס הקורסים והמלצות — מידע שאין בשום מקום אחר. שתפו את הקורסים שסיימתם ותהיו חלק מבנייתו."
              : "As more of the cohort shares, real averages, course loads and recommendations appear here — data you won't find anywhere else. Share the courses you've completed and be part of building it."}
          </p>

          {justSharedText ? (
            <p className="mt-2.5 flex items-center gap-1.5 text-xs font-medium text-status-green">
              <Check className="size-3.5 shrink-0" />
              {justSharedText}
            </p>
          ) : (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-2.5">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => importGrades.mutate()}
                  disabled={importGrades.isPending}
                  className="gap-1.5"
                >
                  {importGrades.isPending ? <Loader2 className="size-4 animate-spin" /> : <Users2 className="size-4" />}
                  {isHe ? "שתפו את הקורסים שסיימתי" : "Share my completed courses"}
                </Button>
                <Link
                  href="/cohort"
                  className="text-xs font-medium text-foreground/60 underline-offset-2 transition-colors hover:text-foreground/85 hover:underline"
                >
                  {isHe ? "לתיק המחזור" : "Open the file"}
                </Link>
                <button
                  type="button"
                  onClick={dismiss}
                  className="ms-auto text-xs text-foreground/60 transition-colors hover:text-foreground/65"
                >
                  {isHe ? "לא עכשיו" : "Not now"}
                </button>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-foreground/60">
                {isHe
                  ? "בלי שם, אי-אפשר לשחזר מי. ממוצע נחשף רק מ-5 תורמים ומעלה, ואפשר למשוך הכול בכל רגע."
                  : "No name, no way to trace back. An average appears only from 5+ contributors, and you can withdraw anytime."}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
