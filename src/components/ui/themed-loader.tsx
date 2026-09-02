"use client";

import { useLocale } from "next-intl";
import { PhilosopherKingCharacter } from "@/components/ui/philosopher-king-character";
import { ReferentCharacter } from "@/components/ui/referent-character";
import { PersonaSwap } from "@/components/persona/use-persona";
import { cn } from "@/lib/utils";

interface ThemedLoaderProps {
  /**
   * `page` (default): replaces a whole page — tall vertical centering.
   * `inline`: sits UNDER an existing PageHeader — vertical padding, no min-height.
   */
  variant?: "page" | "inline";
  /**
   * #2 — what is ACTUALLY being waited on, in the user's words. Every loader in
   * the app is the same object; only this sentence changes. Omit for the
   * generic "the King is arranging your data" line.
   */
  label?: string;
  /** Optional second line — the honest detail (e.g. "already saved, just fetching"). */
  sublabel?: string;
  className?: string;
}

/**
 * Branded loading state (#10) — was a grey lucide cap in a near-invisible grey
 * spinner ("a colour square on white"). Now the CROWN emblem "thinks" (the orb
 * of the Good breathes) inside an INDIGO ring: the app's voice, identifiable
 * even with the label covered (design line, test 5). Indigo, never gold — gold
 * belongs to the King alone; a system loader isn't the King.
 */
export function ThemedLoader({
  variant = "page",
  label,
  sublabel,
  className,
}: ThemedLoaderProps) {
  const isHe = useLocale() === "he";

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 text-center",
        variant === "page" ? "min-h-[50vh]" : "py-16",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div className="relative size-20">
        {/* Indigo ring — the product's voice, not generic grey. */}
        <div className="absolute -inset-1.5 animate-spin rounded-full border-[3px] border-accent-brand/15 border-t-accent-brand [animation-duration:1100ms]" />
        {/* #2 (12.7) — the advisor personally minds the load, gently floating.
            A loader is painted by the SERVER (it is what a page renders while
            its client queries are still empty), so the persona is picked by CSS
            from the <html data-pk-persona> the head script stamps — a Referent
            user never watches the King's portrait for the first frame. */}
        <div className="absolute inset-0 flex items-center justify-center pk-float">
          <PersonaSwap
            king={<PhilosopherKingCharacter className="size-20" />}
            referent={<ReferentCharacter className="size-20" />}
          />
        </div>
      </div>
      <div className="flex flex-col items-center gap-1">
        <p className="text-sm text-foreground/60">
          {label ?? (
            <PersonaSwap
              king={isHe ? "המלך מסדר לכם את הנתונים…" : "The King is arranging your data…"}
              referent={isHe ? "הרפרנט מסדר לכם את הנתונים…" : "The Referent is arranging your data…"}
            />
          )}
        </p>
        {sublabel && <p className="text-xs text-foreground/60">{sublabel}</p>}
      </div>
    </div>
  );
}
