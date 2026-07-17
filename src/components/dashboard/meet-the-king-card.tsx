"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { useLocale } from "next-intl";
import { PhilosopherKingCharacter } from "@/components/ui/philosopher-king-character";
import { usePersonalAddress } from "@/components/personal/use-personal-address";

const DISMISS_KEY = "pk-met-king-card";

/**
 * "Meet the King" card (#13/#14/#26) — the biggest gap a first-timer hit was
 * finishing onboarding + the tour and never learning the King is a chattable,
 * always-present, *commandable* assistant. This card introduces him on the (near-
 * empty) first dashboard and hands three real starter prompts — one of which
 * teaches that you can COMMAND him ("mark a course done") — that pre-fill the
 * assistant via the same `pk:ask` event the AskKingButton uses. It NEVER auto-
 * opens the panel (the accepted "he never pops up on his own" rule); a tap does.
 * One-time + dismissible.
 */
export function MeetTheKingCard() {
  const isHe = useLocale() === "he";
  const { g: pg } = usePersonalAddress();
  const [dismissed, setDismissed] = useState(true); // default hidden → no SSR flash

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "true");
    } catch {
      setDismissed(false);
    }
  }, []);

  const close = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "true");
    } catch {
      /* storage blocked — hidden for this view anyway */
    }
  };

  const ask = (prompt: string) => {
    window.dispatchEvent(new CustomEvent("pk:ask", { detail: { prompt } }));
  };

  if (dismissed) return null;

  // Three starters that show his RANGE: a status question, an action he executes,
  // and a recommendation. The middle one teaches interactivity — the core gap.
  const starters = isHe
    ? [
        "כמה ש״ס נשארו לי, ובאיזה תחום?",
        "סיימתי קורס עם ציון — איך מעדכנים?",
        "מה כדאי לי לקחת בסמסטר הבא?",
      ]
    : [
        "How many credits are left, and in which area?",
        "I finished a course with a grade — how do I log it?",
        "What should I take next semester?",
      ];

  return (
    <div className="data-card relative overflow-hidden p-5">
      <button
        type="button"
        onClick={close}
        aria-label={isHe ? "סגירה" : "Dismiss"}
        className="absolute end-3 top-3 rounded-md p-1 text-foreground/35 transition-colors hover:bg-foreground/5 hover:text-foreground/70"
      >
        <X className="size-4" />
      </button>

      <div className="flex items-start gap-4">
        <div className="pk-float shrink-0">
          <PhilosopherKingCharacter className="size-14 drop-shadow-sm" />
        </div>
        <div className="min-w-0">
          <h3 className="font-display text-base font-bold text-foreground/90">
            {isHe ? "היי, אני המלך הפילוסוף" : "Hi, I'm the Philosopher King"}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-foreground/60">
            {/* The KING is always male ("היועץ") — only the STUDENT-facing verbs
                are gendered. The female form used to say "היועצת", misgendering
                the King himself (research 14.7). */}
            {isHe
              ? `היועץ האישי שלך לתואר. ${pg("שאל", "שאלי", "שאל/י")} אותי כל דבר — או פשוט ${pg("ספר", "ספרי", "ספר/י")} לי מה עשית, ואני אעדכן בשבילך. אני כאן בכל מסך.`
              : "Your personal degree advisor. Ask me anything — or just tell me what you did and I'll update it for you. I'm on every screen."}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {starters.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => ask(s)}
            className="rounded-full border border-crown-gold-bright/30 bg-crown-gold-bright/5 px-3 py-1.5 text-xs font-medium text-foreground/75 transition-colors hover:border-crown-gold-bright/60 hover:bg-crown-gold-bright/10"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
