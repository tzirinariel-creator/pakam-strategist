"use client";

import { useLocale } from "next-intl";
import { PhilosopherKingIcon } from "@/components/ui/philosopher-king-icon";
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
      <div className="relative size-16">
        {/* Indigo ring — the product's voice, not generic grey. */}
        <div className="absolute inset-0 animate-spin rounded-full border-[3px] border-accent-brand/15 border-t-accent-brand [animation-duration:900ms]" />
        {/* The crown, thinking (the orb of the Good breathes) while it loads. */}
        <div className="absolute inset-0 flex items-center justify-center">
          <PhilosopherKingIcon state="thinking" className="size-7 text-accent-brand" />
        </div>
      </div>
      <p className="text-sm text-foreground/55">
        {isHe ? "טוען את התוכנית שלך…" : "Loading your plan…"}
      </p>
    </div>
  );
}
