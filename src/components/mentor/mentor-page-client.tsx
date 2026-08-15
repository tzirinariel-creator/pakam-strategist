"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { DegreeAssistant } from "./degree-assistant";
import { MentorChat } from "./mentor-chat";
import { cn } from "@/lib/utils";
import { PhilosopherKingIcon } from "@/components/ui/philosopher-king-icon";
import { ReferentIcon } from "@/components/ui/referent-icon";
import { PersonaCharacter, PersonaIcon, usePersona } from "@/components/persona/use-persona";
import { otherPersona, personaLabels } from "@/lib/persona";

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
  // Same shared store the FAB, the dashboard cards and the toasts read — a
  // Referent user must not land here and meet the King (#47).
  const { persona, isReferent, toggle } = usePersona();
  const advisorName = personaLabels(persona, isHe).name;
  const otherName = personaLabels(otherPersona(persona), isHe).name;

  // In-context persona switch (#48): the referent used to be discoverable only
  // deep in Settings. One tap here flips the choice everywhere at once — every
  // mounted surface re-renders, no reload.
  const switchPersona = () => toggle();

  return (
    <div className="flex flex-col gap-4">
      {/* Identity — the full character (18:19), persona-aware. */}
      <div className="flex flex-col items-center gap-2 pt-1">
        <PersonaCharacter className="size-16 drop-shadow-sm" />
        <h1 className="font-display text-xl font-bold text-foreground/90">{advisorName}</h1>
        <p className="max-w-sm text-center text-xs leading-relaxed text-foreground/50">
          {isReferent
            ? isHe
              ? "שנה ג׳ שכבר עבר את זה — דוגרי, ותמיד מהנתונים האמיתיים שלכם."
              : "A final-year who's been through it — straight talk, always from your real data."
            : isHe
              ? "יועץ התואר שלכם — ישיר, מהנתונים האמיתיים שלכם."
              : "Your degree advisor — wise, direct, always from your real data."}
        </p>
        {/* Discover + switch the other persona in-context (#48). Same voice,
            same data — only the tone changes. */}
        <button
          type="button"
          onClick={switchPersona}
          className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1 text-xs text-foreground/55 transition-colors hover:border-foreground/25 hover:text-foreground/80"
        >
          {isReferent ? (
            <PhilosopherKingIcon className="size-3.5 text-crown-gold-bright" />
          ) : (
            <ReferentIcon className="size-3.5 text-referent-teal" />
          )}
          {isHe ? `מעדיפים את ${otherName}? החליפו` : `Prefer ${otherName}? Switch`}
        </button>
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
            <PersonaIcon className="size-3.5" />
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
            <PersonaIcon className="size-3.5" />
            {advisorName}
          </button>
        </div>
        <p className="text-center text-xs text-foreground/45">
          {mode === "quick"
            ? isHe
              ? "תשובות מיידיות מהנתונים שלכם — בלי בינה מלאכותית, תמיד חינם."
              : "Instant answers from your data — no AI, always free."
            : isHe
              ? "שיחה פתוחה עם בינה מלאכותית על התוכנית שלכם — עובד מיד וחינם. מפתח Gemini אישי (גם חינמי) נותן מכסה פרטית."
              : "A smart AI conversation grounded in your plan (free Gemini key)."}
        </p>
      </div>

      {mode === "quick" ? <DegreeAssistant /> : <MentorChat />}
    </div>
  );
}
