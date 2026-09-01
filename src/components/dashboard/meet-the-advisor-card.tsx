"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { useLocale } from "next-intl";
import { usePersonalAddress } from "@/components/personal/use-personal-address";
import { usePersona, PersonaCharacter } from "@/components/persona/use-persona";
import { personaLabels } from "@/lib/persona";
import { cn } from "@/lib/utils";

// Kept as-is on purpose: real students have already dismissed this card under
// this key, and renaming it would resurrect it on their dashboard.
const DISMISS_KEY = "pk-met-king-card";

/**
 * "Meet your advisor" card (#13/#14/#26) — the biggest gap a first-timer hit was
 * finishing onboarding + the tour and never learning the advisor is a chattable,
 * always-present, *commandable* assistant. This card introduces them on the (near-
 * empty) first dashboard and hands three real starter prompts — one of which
 * teaches that you can COMMAND them ("mark a course done") — that pre-fill the
 * assistant via the same `pk:ask` event the AskAdvisorButton uses. It NEVER auto-
 * opens the panel (the accepted "he never pops up on his own" rule); a tap does.
 * One-time + dismissible.
 *
 * Was hardcoded to the King (portrait, name and voice) even for a student who
 * had chosen הרפרנט — the card Ariel screenshotted while the Referent was his
 * chosen advisor. It now follows the choice, greets by name, and each persona
 * introduces itself in its OWN voice (the King's counsel vs. the Referent's
 * been-there peer), not one text with two faces.
 */
export function MeetTheAdvisorCard() {
  const isHe = useLocale() === "he";
  const { g: pg, greetName } = usePersonalAddress();
  const { persona, isReferent } = usePersona();
  const labels = personaLabels(persona, isHe);
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

  // Three starters that show the RANGE: a status question, an action they
  // execute, and a recommendation. The middle one teaches interactivity — the
  // core gap.
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

  // The advisor speaks 1:1 here, so this is the gendered SINGULAR voice (the
  // product's plural voice belongs to the app's own cards). The advisor itself
  // is always male ("היועץ") — only the STUDENT-facing verbs are gendered; the
  // female form used to say "היועצת", misgendering the King himself (14.7).
  const hello = isHe
    ? `היי${greetName ? ` ${greetName}` : ""}, אני ${labels.name}`
    : `Hi${greetName ? ` ${greetName}` : ""}, I'm ${labels.name}`;

  const body = isReferent
    ? isHe
      ? `שנה ג׳ בפכ״מ — כבר עברתי את כל מה שמחכה ${pg("לך", "לך", "לכם")}. ${pg("תשאל", "תשאלי", "תשאלו")} אותי הכול בגובה העיניים, או פשוט ${pg("תגיד", "תגידי", "תגידו")} לי מה קרה: "סיימתי מיקרו עם 88", "נכשלתי בסטטיסטיקה", "תעביר לי את חקיקה לסמסטר ב׳" — ואני מקפיץ כרטיס־אישור שמעדכן את התוכנית בפועל. אני כאן בכל מסך.`
      : `A final-year PPE student who's already been through what's ahead of you. Ask me anything at eye level, or just tell me what happened: "finished micro with 88", "failed statistics", "move legislation to spring" — and I'll raise a confirm card that actually updates your plan. I'm on every screen.`
    : isHe
      ? `היועץ האישי שלך לתואר. ${pg("שאל", "שאלי", "שאלו")} אותי כל דבר — או פשוט ${pg("ספר", "ספרי", "ספרו")} לי מה קרה: "סיימתי מיקרו עם 88", "נכשלתי בסטטיסטיקה", "תעביר לי את חקיקה לסמסטר ב׳" — ואני אעדכן בשבילך (תמיד עם אישור). אני כאן בכל מסך.`
      : `Your personal degree advisor. Ask me anything — or just tell me what happened: "finished micro with 88", "failed statistics", "move legislation to spring" — and I'll update it for you (always with a confirm). I'm on every screen.`;

  return (
    <div className="data-card relative overflow-hidden p-5">
      <button
        type="button"
        onClick={close}
        aria-label={isHe ? "סגירה" : "Dismiss"}
        className="absolute end-3 top-3 rounded-md p-1 text-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground/70"
      >
        <X className="size-4" />
      </button>

      <div className="flex items-start gap-4">
        <div className="pk-float shrink-0">
          <PersonaCharacter className="size-14 drop-shadow-sm" />
        </div>
        <div className="min-w-0">
          <h3 className="font-display text-base font-bold text-foreground/90">{hello}</h3>
          <p className="mt-1 text-sm leading-relaxed text-foreground/60">{body}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {starters.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => ask(s)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium text-foreground/75 transition-colors",
              // Gold is the King's alone (design line) — the Referent's chips
              // carry his teal, so even the accent follows the chosen advisor.
              isReferent
                ? "border-referent-teal/30 bg-referent-teal/5 hover:border-referent-teal/60 hover:bg-referent-teal/10"
                : "border-crown-gold-bright/30 bg-crown-gold-bright/5 hover:border-crown-gold-bright/60 hover:bg-crown-gold-bright/10",
            )}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
