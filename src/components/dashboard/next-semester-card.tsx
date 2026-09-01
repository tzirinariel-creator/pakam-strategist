"use client";

// =========================================================================
// "אם סטודנט בוחר לתכנן רק את הסמסטר הקרוב — מתי זה מזכיר לו לתכנן את הסמסטר
// הבא?" (Ariel, 13.8.2026). Until now: never.
//
// The trigger lives in lib/next-semester-reminder.ts and is driven entirely by
// the published academic calendar. This component only renders it — and it is
// careful about ONE thing: it does not claim to know whether the registration
// round covers the whole year or just the coming semester. Nothing in this
// repo knows that, so the card says so and points at who does (the חוג).
// =========================================================================

import { useEffect, useState } from "react";
import { CalendarPlus2, X } from "lucide-react";
import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Bidi } from "@/lib/bidi";
import { daysUntilLabel } from "@/lib/days-until";
import { getNextSemesterReminder, type PlannedRow } from "@/lib/next-semester-reminder";

const KEY_PREFIX = "pk-next-semester-nudge-";

export function NextSemesterCard({
  courses,
  startYear,
  storedYear,
  now = new Date(),
}: {
  courses: PlannedRow[];
  startYear: number | null | undefined;
  storedYear: number;
  now?: Date;
}) {
  const isHe = useLocale() === "he";
  const reminder = getNextSemesterReminder({ courses, startYear, storedYear, now });

  // Per-device, per-target dismissal, read after mount so server and first
  // client paint agree. A new target semester gets a fresh key — dismissing
  // the סמסטר ב׳ nudge must not silence next year's.
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const key = reminder?.key;
  useEffect(() => {
    setMounted(true);
    if (!key) return;
    try {
      setDismissed(localStorage.getItem(KEY_PREFIX + key) === "1");
    } catch {
      /* storage blocked — treat as first-time */
    }
  }, [key]);

  if (!reminder || !mounted || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(KEY_PREFIX + reminder.key, "1");
    } catch {
      /* best-effort */
    }
  };

  const semHe = reminder.semester === "FALL" ? "סמסטר א׳" : "סמסטר ב׳";
  const semEn = reminder.semester === "FALL" ? "Fall" : "Spring";
  const startsHe = `${reminder.teachingStart.getDate()}.${reminder.teachingStart.getMonth() + 1}.${String(reminder.teachingStart.getFullYear()).slice(-2)}`;

  const title = isHe
    ? `${semHe} של ${reminder.yearLabelHe} עדיין ריק אצלכם`
    : `Your ${semEn} ${reminder.startYear}/${String((reminder.startYear + 1) % 100).padStart(2, "0")} is still empty`;

  const body =
    reminder.reason === "bidding-window"
      ? isHe
        ? `ההרשמה נפתחת ${daysUntilLabel(reminder.biddingDaysUntil ?? 0, true)}. אין לנו מקור רשמי שאומר אם היא מכסה גם את ${semHe} או רק את הסמסטר הקרוב — שווה לוודא מול החוג. בכל מקרה, פריסה של ${semHe} עכשיו תראה לכם עומס וחפיפות מראש.`
        : `Registration opens ${daysUntilLabel(reminder.biddingDaysUntil ?? 0, false)}. We have no official source telling us whether it covers ${semEn} as well or only the coming semester — worth checking with the department. Either way, laying ${semEn} out now shows you the load and the clashes in advance.`
      : isHe
        ? `הסמסטר שתכננתם מתקרב לסופו. ${semHe} מתחיל ב-${startsHe} ואין בו עדיין קורסים — פריסה שלו עכשיו תראה לכם עומס וחפיפות לפני שההרשמה נפתחת.`
        : `The semester you planned is wrapping up. ${semEn} starts ${startsHe} and has no courses in it yet — laying it out now shows the load and the clashes before registration opens.`;

  return (
    <div className="data-card flex flex-wrap items-start gap-3 border-border/60 p-4">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.06] text-foreground/60">
        <CalendarPlus2 className="size-4.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground/85">
          <Bidi text={title} />
        </p>
        <p className="mt-1 text-xs leading-relaxed text-foreground/60">
          <Bidi text={body} />
        </p>
        <Link
          href="/planner"
          onClick={dismiss}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-xs font-semibold text-background transition-colors hover:bg-foreground/90"
        >
          {isHe ? `לתכנון ${semHe}` : `Plan ${semEn}`}
        </Link>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label={isHe ? "סגור" : "Dismiss"}
        className="shrink-0 rounded-md p-1 text-foreground/60 transition-colors hover:text-foreground/90"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
