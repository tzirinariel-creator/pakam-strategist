"use client";

// -----------------------------------------------------------------------
// The timetable assistant, said out loud
// -----------------------------------------------------------------------
// Ariel, twice: "כל פיצר סיוע תכנון המערכת שעות לא מספיק מוטמע ומורגש", and
// then "אמרנו להנגיש יותר את עוזר המתכנן".
//
// The combination finder is real and good — it searches every group
// combination for a clash-free week, or one with fewer days on campus. It was
// an 11px link inside the conflicts card, appearing only when the plan already
// had a group to swap. So the students who most needed it were the ones least
// likely to find it, and nobody learned it existed.
//
// This is the entry point: it says what the assistant can do, in the three
// terms students actually care about, and it states the CURRENT week honestly
// first — because "0 clashes" is a good answer and should not be dressed up as
// a problem to make a button look useful.
//
// It never silently rearranges anything. A search proposes; the student's
// existing plan stands until they accept it.

import type React from "react";
import { useState } from "react";
import { useLocale } from "next-intl";
import { CalendarCheck, Sunrise, CheckCircle2 } from "lucide-react";
import { PhilosopherKingIcon } from "@/components/ui/philosopher-king-icon";
import { heNoun } from "@/lib/he-count";
import { ComboPreferencesControl } from "./combo-preferences-control";
import type { ComboPreferences } from "@/lib/combo-finder";

export function PlannerAssistantCard({
  conflicts,
  canSwapGroups,
  campusDays,
  onFindCombination,
}: {
  /** Clashes in the week as it stands right now. */
  conflicts: number;
  /** At least one course offers a group choice — otherwise there is nothing
   *  to search and promising a search would be a lie. */
  canSwapGroups: boolean;
  /** Days the student is currently on campus, for the "fewer days" pitch. */
  campusDays: number;
  onFindCombination: (prefs?: ComboPreferences) => void;
}) {
  const isHe = useLocale() === "he";
  const [busy, setBusy] = useState<string | null>(null);
  // #8 — the student's own constraints, asked at the moment of searching
  // rather than kept as a profile setting. They ride along with whichever
  // framing the student presses, so "fewer campus days" and "keep Wednesday
  // clear" compose instead of overriding each other.
  const [prefs, setPrefs] = useState<ComboPreferences>({});

  if (!canSwapGroups) return null;

  const run = (key: string, extra?: ComboPreferences) => {
    setBusy(key);
    onFindCombination({ ...prefs, ...extra });
    // The search is synchronous; this only keeps the pressed state visible
    // long enough to read as a response.
    setTimeout(() => setBusy(null), 600);
  };

  const actions: {
    key: string;
    // Not `typeof CalendarCheck`: the King's mark is an ordinary component,
    // not a lucide ForwardRef, and the only thing this list asks of an icon is
    // that it accepts a className.
    icon: React.ComponentType<{ className?: string }>;
    he: string;
    en: string;
    prefs?: ComboPreferences;
  }[] = [
    {
      key: "clash",
      // Was `Sparkle`. The comment eight lines below this one says a generic
      // wand is the AI icon this project forbids and that the advisor already
      // has a face — and then the first button carried a generic sparkle
      // anyway. The King's mark is the mark.
      icon: PhilosopherKingIcon,
      he: conflicts > 0 ? "סדרו לי שבוע בלי התנגשויות" : "נסו לשפר לי את השבוע",
      en: conflicts > 0 ? "Build me a clash-free week" : "Try to improve my week",
    },
    {
      key: "days",
      icon: CalendarCheck,
      he: "פחות ימים בקמפוס",
      en: "Fewer days on campus",
      prefs: {},
    },
    {
      key: "late",
      icon: Sunrise,
      he: "בלי בקרים מוקדמים",
      en: "No early mornings",
      prefs: { earliestHour: 10 },
    },
  ];

  return (
    <div className="data-card p-4">
      <div className="flex items-start gap-2.5">
        {/* Ariel, 22.8: "למה זה לא המלך?" — a generic wand is the AI
            icon this project forbids, and the advisor already has a face. */}
        <PhilosopherKingIcon className="mt-0.5 size-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-foreground/90">
            {isHe ? "עוזר המערכת — שיסדר לכם את השבוע" : "The timetable assistant"}
          </h3>

          {/* The state of the week, said honestly BEFORE the offer. "0 clashes"
              is a good answer, not a problem to manufacture. */}
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-foreground/60">
            {conflicts > 0 ? (
              <span className="font-semibold text-amber-600 dark:text-amber-400">
                {isHe ? (
                  <>
                    {heNoun(conflicts, "התנגשות", "התנגשויות")} בשבוע שלכם
                  </>
                ) : (
                  <>{conflicts} clashes in your week</>
                )}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-3.5" />
                {isHe ? "אין התנגשויות" : "No clashes"}
              </span>
            )}
            {campusDays > 0 && (
              <span>
                ·{" "}
                {isHe ? (
                  <>
                    {heNoun(campusDays, "יום", "ימים")} בקמפוס
                  </>
                ) : (
                  <>{campusDays} days on campus</>
                )}
              </span>
            )}
          </p>

          {/* P-ג: "למה לא בונה תוכנית לימוד." The app arranges the GROUPS of
              courses you chose, and never chooses the courses — which is a
              deliberate position, not a missing feature. It was simply never
              said anywhere, so someone who expected a generated plan met
              silence and read it as the tool falling short.

              Whether it SHOULD ever pick courses is Ariel's decision and is
              not being taken here; what is fixed is that the current answer is
              now stated out loud, where the question comes up. */}
          <p className="mt-1.5 text-xs leading-relaxed text-foreground/50">
            {isHe
              ? "הוא עובר על כל הקבוצות של כל הקורסים שבחרתם ומחפש שילוב שמסתדר. התוכנית שלכם לא משתנה עד שתאשרו."
              : "It searches every group of every course you picked for a combination that works. Your plan does not change until you accept."}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-foreground/40">
            {isHe
              ? "את הקורסים עצמם אתם בוחרים — פכמון לא בוחר בשבילכם. הוא מסמן מה חסר לכם לדרישות, מה חופף, ומה הידיעון אומר; ההחלטה מה ללמוד היא שלכם."
              : "You choose the courses — Pakamon does not choose for you. It flags what your requirements are still missing, what clashes, and what the ידיעון says; what to study stays your call."}
          </p>

          <div className="mt-2.5 flex flex-wrap gap-2">
            {actions.map((a) => {
              const Icon = a.icon;
              return (
                <button
                  key={a.key}
                  type="button"
                  disabled={busy !== null}
                  onClick={() => run(a.key, a.prefs)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-accent-brand/30 bg-accent-brand/[0.07] px-3 py-1.5 text-xs font-semibold text-accent-brand transition-colors hover:bg-accent-brand/15 disabled:opacity-50"
                >
                  <Icon className="size-3.5" />
                  {busy === a.key
                    ? isHe ? "מחפש…" : "Searching…"
                    : isHe ? a.he : a.en}
                </button>
              );
            })}
          </div>

          <ComboPreferencesControl prefs={prefs} onChange={setPrefs} isHe={isHe} />
        </div>
      </div>
    </div>
  );
}
