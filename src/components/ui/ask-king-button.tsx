"use client";

import { useLocale } from "next-intl";
import { PhilosopherKingIcon } from "@/components/ui/philosopher-king-icon";
import { usePersonalAddress } from "@/components/personal/use-personal-address";

/**
 * One button to summon the Philosopher King about a specific thing. Dispatches
 * the `pk:ask` CustomEvent the FloatingAssistant listens for, pre-filling the
 * question. Centralizes the icon + locale-prompt + event so every embed point
 * stays consistent (previously each call site hand-rolled its own copy).
 *
 * Pass `className` to fully control the look per context (chip, link, solid,
 * icon-only); omit `labelHe`/`labelEn` for an icon-only button.
 */

const DEFAULT_CHIP =
  "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-accent-brand transition-all hover:bg-accent-brand/10 hover:text-accent-brand";

export interface AskKingButtonProps {
  promptHe: string;
  promptEn: string;
  /** Visible label (Hebrew). Omit both labels for an icon-only button. */
  labelHe?: string;
  labelEn?: string;
  /** Full class override for the button; defaults to the chip look. */
  className?: string;
  iconClassName?: string;
}

export function AskKingButton({
  promptHe,
  promptEn,
  labelHe,
  labelEn,
  className,
  iconClassName,
}: AskKingButtonProps) {
  const isHe = useLocale() === "he";
  const { g } = usePersonalAddress();
  // Every "שאל את המלך…" label across the app flows through here — gendering
  // the verb ONCE fixes all call sites (the systemic masculine-singular chip,
  // spirit-audit 14.7). Neutral fallback = plural, the product voice.
  const genderVerb = (l?: string) =>
    l?.startsWith("שאל ") ? `${g("שאל", "שאלי", "שאלו")} ${l.slice(4)}` : l;
  const label = isHe ? genderVerb(labelHe) : labelEn;
  // Icon-only buttons still need an accessible name.
  const a11yLabel = label ?? (isHe ? genderVerb("שאל את המלך על זה")! : "Ask the King");

  return (
    <button
      type="button"
      onClick={() =>
        window.dispatchEvent(
          new CustomEvent("pk:ask", { detail: { prompt: isHe ? promptHe : promptEn } }),
        )
      }
      className={className ?? DEFAULT_CHIP}
      aria-label={a11yLabel}
      title={label ? undefined : a11yLabel}
    >
      <PhilosopherKingIcon className={iconClassName ?? "size-3"} />
      {label}
    </button>
  );
}
