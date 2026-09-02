"use client";

// End-of-semester rite — the card that closes the loop of #22: the semester
// ends → the app ASKS → the scanner / manual update answers. A QUIET card
// (static data-card, indigo icon), not a banner, not red: this isn't a block.
// Appears only when there really are courses awaiting an update.

import { useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { ScanLine } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getWrapTarget, wrapStorageKey } from "@/lib/semester-clock";
import { SEMESTER_CONFIG } from "@/lib/constants";
import { WhereIsMySheet } from "@/components/record/where-is-my-sheet";
import { heNoun } from "@/lib/he-count";

const SNOOZE_DAYS = 7;

export function SemesterWrapCard({
  profile,
  currentYear,
  courses,
  onVisibleChange,
}: {
  profile: { currentYear: number; currentSemester: string; email?: string | null } | undefined;
  /** The DERIVED year-of-study (the same value the planner writes as
   *  plannedYear) — comparing against the raw profile.currentYear would miss
   *  courses once the two drift apart. */
  currentYear: number;
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

  // Courses from the just-ended semester still lacking a grade/answer. Matched
  // on the DERIVED year (what the planner actually wrote), not the raw profile.
  const pending = courses.filter(
    (uc) =>
      wrap &&
      uc.plannedYear === currentYear &&
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

  // Note: "done" is written by the scanner (applySelected) once grades land —
  // the card just re-checks pending on next load.

  if (!visible || !wrap || !profile) return null;
  const semName = isHe
    ? SEMESTER_CONFIG[wrap.semester].nameHe
    : SEMESTER_CONFIG[wrap.semester].nameEn;

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
          <p className="text-xs text-foreground/60">
            {isHe
              ? `${heNoun(pending.length, "קורס", "קורסים")} מהסמסטר מחכים לעדכון. סריקה אחת של הגיליון סוגרת הכול.`
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
            className="rounded-lg px-2.5 py-2 text-xs font-medium text-foreground/70 hover:bg-foreground/5"
          >
            {isHe ? "עדכון ידני" : "Manual"}
          </Link>
          <button
            type="button"
            onClick={snooze}
            className="rounded-lg px-2.5 py-2 text-xs text-foreground/70 hover:bg-foreground/5"
          >
            {isHe ? "לא עכשיו" : "Not now"}
          </button>
        </div>
      </div>
      <div className="mt-2">
        <WhereIsMySheet />
      </div>
      {/* No "advance to next semester" button: year + semester are DERIVED from
          the academic calendar now (Theme II), so the semester rolls over on
          its own — a manual bump would only corrupt the startYear anchor. */}
    </div>
  );
}
