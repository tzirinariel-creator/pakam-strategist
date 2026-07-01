"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { Zap } from "lucide-react";
import { DegreeAssistant } from "./degree-assistant";
import { MentorChat } from "./mentor-chat";
import { cn } from "@/lib/utils";
import { PhilosopherKingIcon } from "@/components/ui/philosopher-king-icon";

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

  return (
    <div className="flex flex-col gap-4">
      {/* Identity — the Philosopher King (matches the floating assistant). */}
      <div className="flex flex-col items-center gap-2 pt-1">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-accent-brand text-[#f2c879] shadow-sm ring-1 ring-[#f2c879]/40">
          <PhilosopherKingIcon className="size-7" />
        </div>
        <h1 className="font-display text-xl font-bold text-foreground/90">
          {isHe ? "המלך הפילוסוף" : "The Philosopher King"}
        </h1>
        <p className="max-w-sm text-center text-xs leading-relaxed text-foreground/50">
          {isHe
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
            <PhilosopherKingIcon className="size-3.5" />
            {isHe ? "המלך הפילוסוף" : "The King"}
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
