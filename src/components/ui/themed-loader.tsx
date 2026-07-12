"use client";

import { useLocale } from "next-intl";
import { PhilosopherKingIcon } from "@/components/ui/philosopher-king-icon";
import { PhilosopherKingCharacter } from "@/components/ui/philosopher-king-character";
import { cn } from "@/lib/utils";

interface ThemedLoaderProps {
  /**
   * `page` (default): replaces a whole page — tall vertical centering.
   * `inline`: sits UNDER an existing PageHeader — vertical padding, no min-height.
   */
  variant?: "page" | "inline";
  className?: string;
}

/**
 * Branded loading state (#10) — was a grey lucide cap in a near-invisible grey
 * spinner ("a colour square on white"). Now the CROWN emblem "thinks" (the orb
 * of the Good breathes) inside an INDIGO ring: the app's voice, identifiable
 * even with the label covered (design line, test 5). Indigo, never gold — gold
 * belongs to the King alone; a system loader isn't the King.
 */
export function ThemedLoader({ variant = "page", className }: ThemedLoaderProps) {
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
        {/* #2 (12.7) — the King himself minds the load, gently floating. */}
        <div className="absolute inset-0 flex items-center justify-center pk-float">
          <PhilosopherKingCharacter className="size-20" />
        </div>
      </div>
      <p className="text-sm text-foreground/55">
        {isHe ? "המלך מסדר לכם את הנתונים…" : "The King is arranging your data…"}
      </p>
    </div>
  );
}
