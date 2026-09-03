"use client";

// -----------------------------------------------------------------------
// "בידינג עוד N ימים" — said where the planning happens
// -----------------------------------------------------------------------
// Ariel, 21.8: "אנחנו קרובים לבידינג אז למה הוא לא ישר ממליץ לנו לתכנן כבר את
// כל השנה או משהו? ואיך הוא אמור להבין שיש פה עוד מסך תכנון יותר מסודר?"
//
// Two fair complaints in one sentence.
//
// The app knew the bidding calendar and surfaced it on the DASHBOARD — a
// screen a student sees after they finish planning. While they were actually
// choosing courses, nothing mentioned that registration opens in a couple of
// weeks, and nothing suggested planning semester ב׳ while they were at it.
//
// And the onboarding planner is deliberately one-semester: it is the quick
// start. The full three-year planner is a different screen, and the only way
// to discover it was to find it in the sidebar. So this names it.
//
// WHAT IT DOES NOT DO: predict points, or suggest how to spend them. TAU does
// not publish the quota, this app's hardest rule is that it never guesses one,
// and nothing here comes near it. It states a date and points at a screen.

import { useLocale } from "next-intl";
import { CalendarClock, ArrowLeft, ArrowRight } from "lucide-react";
import { Bidi } from "@/lib/bidi";
import { getBiddingPhase } from "@/lib/bidding-calendar";

export function BiddingProximityNudge({
  now = new Date(),
  otherSemesterLabel,
  onSwitchToOther,
}: {
  now?: Date;
  /** שם הסמסטר השני של אותה שנה, לתווית הכפתור. */
  otherSemesterLabel?: string;
  /** מעבר לסמסטר השני **בתוך הלוח**, בלי לעזוב אותו. */
  onSwitchToOther?: () => void;
}) {
  const isHe = useLocale() === "he";
  const phase = getBiddingPhase(now);
  const Arrow = isHe ? ArrowLeft : ArrowRight;

  // Only while it is genuinely imminent or live. Once both rounds are done
  // this is noise, and it is worse than noise during the year — a student
  // planning in March does not need a countdown to September.
  const relevant = phase.kind === "before" || phase.kind === "open" || phase.kind === "between-rounds";
  if (!relevant || phase.daysUntil == null) return null;

  const days = phase.daysUntil;
  const isOpen = phase.kind === "open";

  // Built as parts rather than one interpolated string: the number needs a
  // <bdi> of its own so RTL never reorders it against the Hebrew around it,
  // and splitting a finished sentence back apart on the digit is the kind of
  // trick that breaks the day the wording changes.
  const label = (() => {
    if (isHe) {
      if (isOpen) return { before: `מקצה ${phase.round} פתוח — נסגר בעוד `, after: ` ${days === 1 ? "יום" : "ימים"}` };
      if (days === 0) return { before: "הבידינג נפתח היום", after: "" };
      return { before: "הבידינג נפתח בעוד ", after: ` ${days === 1 ? "יום" : "ימים"}` };
    }
    if (isOpen) return { before: `Round ${phase.round} is open — closes in `, after: ` ${days === 1 ? "day" : "days"}` };
    if (days === 0) return { before: "Bidding opens today", after: "" };
    return { before: "Bidding opens in ", after: ` ${days === 1 ? "day" : "days"}` };
  })();

  return (
    <div className="rounded-xl border border-accent-brand/30 bg-accent-brand/[0.06] p-4">
      <div className="flex items-start gap-2.5">
        <CalendarClock className="mt-0.5 size-4 shrink-0 text-accent-brand" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground/90">
            {label.before}
            {label.after !== "" && <Bidi text={days} />}
            {label.after}
          </p>

          <p className="mt-1.5 text-xs leading-relaxed text-foreground/65">
            {isHe
              ? "בפכ״מ הרישום עובר דרך כמה חוגים, וחלק מהם רושמים לשנה שלמה ולא לסמסטר — כלומר קורסים של סמסטר ב׳ נבחרים כבר עכשיו. שווה לתכנן את שני הסמסטרים לפני שנפתח, ולא רק את הקרוב."
              : "PPE registration runs through several departments, and some of them register for a whole year rather than a semester — meaning semester B courses are chosen now. Worth planning both semesters before it opens, not only the near one."}
          </p>

          {/* אריאל, 3.9, אחרי שעבר את הזרימה כמשתמש:
              *"כשבאמצע התכנון עברתי לאיזה לחצן ששמת של תכנון בידינג ואז חזרתי
              — זה מחק לי את מה שהיה כבר לפני על בסיס הסילבוס"*, ואחר כך
              *"ובכללי אין סיבה לאיזה לחצן צדדי"*.

              הוא צודק בשני חלקי המשפט. זה היה `<Link href="/bidding">` בתוך
              לוח שהבחירה שלו חיה ב-React state עד "סיימתי" — כלומר קליק אחד
              על עצה טובה מחק תכנון שלם. וההערה עצמה מיותרת ככפתור: היא
              ממליצה לתכנן את שני הסמסטרים, והלוח **הוא** המקום שבו עושים
              את זה.

              אז הקישור הפך לכפתור שמבצע את ההמלצה במקום, בלי לעזוב. */}
          {onSwitchToOther && otherSemesterLabel && (
            <button
              type="button"
              onClick={onSwitchToOther}
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-accent-brand/40 px-2.5 py-1.5 text-xs font-semibold text-accent-brand transition-colors hover:bg-accent-brand/10"
            >
              {isHe ? `לתכנן גם את ${otherSemesterLabel}` : `Plan ${otherSemesterLabel} too`}
              <Arrow className="size-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
