"use client";

// End-of-semester rite — the card that closes the loop of #22: the semester
// ends → the app ASKS → the scanner / manual update answers. A QUIET card
// (static data-card, indigo icon), not a banner, not red: this isn't a block.
// Appears only when there really are courses awaiting an update.

import { useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { ScanLine, ChevronLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { toast } from "sonner";
import { api } from "@/lib/trpc/react";
import { getWrapTarget, wrapStorageKey } from "@/lib/semester-clock";
import { SEMESTER_CONFIG } from "@/lib/constants";
import { WhereIsMySheet } from "@/components/record/where-is-my-sheet";

const SNOOZE_DAYS = 7;

export function SemesterWrapCard({
  profile,
  courses,
  onVisibleChange,
}: {
  profile: { currentYear: number; currentSemester: string; email?: string | null } | undefined;
  courses: { plannedYear: number; plannedSemester: string; status: string; grade: number | null }[];
  /** Lets the dashboard hide the redundant "returning student" prompt while
   *  the rite is visible (critique fix 8 — one ask, not two). */
  onVisibleChange?: (visible: boolean) => void;
}) {
  const isHe = useLocale() === "he";
  const [visible, setVisible] = useState(false);
  const wrap = getWrapTarget();

  const demoEmail = process.env.NEXT_PUBLIC_DEMO_USER_EMAIL;
  const isDemo = !!demoEmail && profile?.email === demoEmail;

  // Courses from the just-ended semester still lacking a grade/answer.
  const pending = courses.filter(
    (uc) =>
      profile &&
      wrap &&
      uc.plannedYear === profile.currentYear &&
      uc.plannedSemester === wrap.semester &&
      (uc.status === "PLANNED" || uc.status === "IN_PROGRESS"),
  );

  useEffect(() => {
    // Demo never shows it (the recruiter's first screen must not be a chore,
    // and the scanner CTA is 403 for demo anyway — critique fix 5).
    if (isDemo || !wrap || !profile || pending.length === 0) {
      setVisible(false);
      onVisibleChange?.(false);
      return;
    }
    let show = true;
    try {
      const stored = localStorage.getItem(wrapStorageKey(wrap.key));
      if (stored === "done") show = false;
      else if (stored && Date.now() - new Date(stored).getTime() < SNOOZE_DAYS * 86_400_000) show = false;
    } catch {
      /* storage blocked — default to showing */
    }
    setVisible(show);
    onVisibleChange?.(show);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by wrap+pending
  }, [wrap?.key, profile, pending.length, isDemo]);

  const snooze = useCallback(() => {
    try {
      if (wrap) localStorage.setItem(wrapStorageKey(wrap.key), new Date().toISOString());
    } catch {
      /* ignore */
    }
    setVisible(false);
    onVisibleChange?.(false);
  }, [wrap, onVisibleChange]);

  const markDone = useCallback(() => {
    try {
      if (wrap) localStorage.setItem(wrapStorageKey(wrap.key), "done");
    } catch {
      /* ignore */
    }
    setVisible(false);
    onVisibleChange?.(false);
  }, [wrap, onVisibleChange]);

  const updateProfile = api.user.updateProfile.useMutation({
    onSuccess: () => {
      toast.success(isHe ? "הפרופיל עודכן לסמסטר הבא" : "Profile moved to the next semester");
      markDone();
    },
    onError: () =>
      toast.error(isHe ? "העדכון נכשל — אפשר לעדכן בהגדרות" : "Update failed — try settings"),
  });

  if (!visible || !wrap || !profile) return null;
  const semName = isHe
    ? SEMESTER_CONFIG[wrap.semester].nameHe
    : SEMESTER_CONFIG[wrap.semester].nameEn;
  const stillOnEnded = profile.currentSemester === wrap.semester;

  return (
    <div className="animate-stagger-1 data-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-brand-muted text-accent-brand">
          <ScanLine className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground/85">
            {isHe ? `${semName} הסתיים — יש כבר ציונים?` : `${semName} is over — got grades yet?`}
          </p>
          <p className="text-xs text-foreground/50">
            {isHe
              ? `${pending.length} קורסים מהסמסטר מחכים לעדכון. סריקה אחת של הגיליון סוגרת הכול.`
              : `${pending.length} courses from the semester await an update. One sheet scan closes them all.`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/record?scan=1"
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent-brand px-3 py-2 text-sm font-semibold text-accent-brand-fg transition-colors hover:bg-accent-brand-hover"
          >
            <ScanLine className="size-4" />
            {isHe ? "לסריקת הגיליון" : "Scan the sheet"}
          </Link>
          <Link
            href="/record"
            className="rounded-lg px-2.5 py-2 text-xs font-medium text-foreground/55 hover:bg-foreground/5"
          >
            {isHe ? "עדכון ידני" : "Manual"}
          </Link>
          <button
            type="button"
            onClick={snooze}
            className="rounded-lg px-2.5 py-2 text-xs text-foreground/40 hover:bg-foreground/5"
          >
            {isHe ? "לא עכשיו" : "Not now"}
          </button>
        </div>
      </div>
      <div className="mt-2">
        <WhereIsMySheet />
      </div>
      {stillOnEnded && (
        <div className="mt-2 flex items-center gap-2 border-t border-border/40 pt-2 text-xs text-foreground/50">
          {isHe ? "סיימת לעדכן?" : "Done updating?"}
          <button
            type="button"
            onClick={() =>
              updateProfile.mutate(
                wrap.semester === "FALL"
                  ? { currentSemester: "SPRING" }
                  : { currentSemester: "FALL", currentYear: Math.min(profile.currentYear + 1, 4) },
              )
            }
            className="inline-flex items-center gap-1 font-medium text-accent-brand hover:text-accent-brand-hover"
          >
            {isHe ? "עברתי לסמסטר הבא — עדכן פרופיל" : "Moved on — update profile"}
            <ChevronLeft className="size-3 ltr:rotate-180" />
          </button>
        </div>
      )}
    </div>
  );
}
