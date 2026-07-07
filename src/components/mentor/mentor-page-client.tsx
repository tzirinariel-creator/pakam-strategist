"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { Zap } from "lucide-react";
import { DegreeAssistant } from "./degree-assistant";
import { MentorChat } from "./mentor-chat";
import { cn } from "@/lib/utils";
import { PhilosopherKingIcon } from "@/components/ui/philosopher-king-icon";
import { ReferentIcon } from "@/components/ui/referent-icon";

/**
 * The degree assistant page with two modes:
 *  - "quick"  → the deterministic Q&A (instant, free, no key, no hallucinations).
 *  - "ai"     → the Gemini-powered chat (richer, open-ended; needs a free key).
 *
 * Defaults to "quick" so a visit never spends the free-tier quota until the
 * student deliberately asks the AI. The AI mode handles its own no-key state.
 */
export function MentorPageClient() {
  const isHe = useLocale() === "he";
  const [mode, setMode] = useState<"quick" | "ai">("quick");
  // Same device-local persona the FAB honors — a Referent user must not land
  // here and meet the King (#47).
  const [persona, setPersona] = useState<"king" | "referent">("king");
  useEffect(() => {
    try {
      setPersona(localStorage.getItem("pk-persona") === "referent" ? "referent" : "king");
    } catch {
      /* default king */
    }
  }, []);
  const isReferent = persona === "referent";
  const advisorName = isReferent
    ? isHe ? "הרפרנט" : "The Referent"
    : isHe ? "המלך הפילוסוף" : "The Philosopher King";

  return (
    <div className="flex flex-col gap-4">
      {/* Identity — matches the floating assistant, persona-aware. */}
      <div className="flex flex-col items-center gap-2 pt-1">
        <div
          className={cn(
            "flex size-12 items-center justify-center rounded-2xl shadow-sm ring-1",
            isReferent
              ? "bg-referent-teal/15 text-referent-teal ring-referent-teal/40"
              : "bg-accent-brand text-crown-gold-bright ring-crown-gold-bright/40",
          )}
        >
          {isReferent ? <ReferentIcon className="size-7" /> : <PhilosopherKingIcon className="size-7" />}
        </div>
        <h1 className="font-display text-xl font-bold text-foreground/90">{advisorName}</h1>
        <p className="max-w-sm text-center text-xs leading-relaxed text-foreground/50">
          {isReferent
            ? isHe
              ? "שנה ג׳ שכבר עבר את זה — דוגרי, ותמיד מהנתונים האמיתיים שלך."
              : "A final-year who's been through it — straight talk, always from your real data."
            : isHe
              ? "יועץ התואר שלך — חכם, ישיר, ותמיד מהנתונים האמיתיים שלך."
              : "Your degree advisor — wise, direct, always from your real data."}
        </p>
      </div>

      {/* Mode toggle */}
      <div className="flex flex-col items-center gap-1.5">
        <div className="inline-flex rounded-xl border border-border/60 bg-card/40 p-1">
          <button
            type="button"
            onClick={() => setMode("quick")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all",
              mode === "quick"
                ? "bg-foreground text-background shadow-sm"
                : "text-foreground/55 hover:text-foreground/80"
            )}
          >
            <Zap className="size-3.5" />
            {isHe ? "תשובות מהירות" : "Quick answers"}
          </button>
          <button
            type="button"
            onClick={() => setMode("ai")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all",
              mode === "ai"
                ? "bg-accent-brand text-accent-brand-fg shadow-sm"
                : "text-foreground/55 hover:text-foreground/80"
            )}
          >
            {isReferent ? <ReferentIcon className="size-3.5" /> : <PhilosopherKingIcon className="size-3.5" />}
            {advisorName}
          </button>
        </div>
        <p className="text-center text-xs text-foreground/45">
          {mode === "quick"
            ? isHe
              ? "תשובות מיידיות מהנתונים שלך — בלי בינה מלאכותית, תמיד חינם."
              : "Instant answers from your data — no AI, always free."
            : isHe
              ? "שיחה חכמה עם בינה מלאכותית, מבוססת על התוכנית שלך (מפתח Gemini חינמי)."
              : "A smart AI conversation grounded in your plan (free Gemini key)."}
        </p>
      </div>

      {mode === "quick" ? <DegreeAssistant /> : <MentorChat />}
    </div>
  );
}
