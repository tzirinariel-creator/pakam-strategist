"use client";

import { useLocale } from "next-intl";
import { usePersonalAddress } from "@/components/personal/use-personal-address";
import { usePersona, PersonaIcon } from "@/components/persona/use-persona";
import { personaLabels, withAdvisorName } from "@/lib/persona";

/**
 * One button to summon the student's advisor about a specific thing. Dispatches
 * the `pk:ask` CustomEvent the FloatingAssistant listens for, pre-filling the
 * question. Centralizes the icon + locale-prompt + event so every embed point
 * stays consistent (previously each call site hand-rolled its own copy).
 *
 * Was `AskKingButton`: it hardcoded the King's crown and the word "המלך" in
 * every label, so a student who chose הרפרנט was invited to "שאל את המלך" from
 * nine screens. Labels now carry the `{advisor}` token and the icon follows the
 * chosen persona.
 *
 * Pass `className` to fully control the look per context (chip, link, solid,
 * icon-only); omit `labelHe`/`labelEn` for an icon-only button.
 */

const DEFAULT_CHIP =
  "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-accent-brand transition-all hover:bg-accent-brand/6 hover:text-accent-brand";

export interface AskAdvisorButtonProps {
  promptHe: string;
  promptEn: string;
  /** Visible label. Use `{advisor}` where the advisor's name belongs. */
  labelHe?: string;
  labelEn?: string;
  /** Full class override for the button; defaults to the chip look. */
  className?: string;
  iconClassName?: string;
}

export function AskAdvisorButton({
  promptHe,
  promptEn,
  labelHe,
  labelEn,
  className,
  iconClassName,
}: AskAdvisorButtonProps) {
  const isHe = useLocale() === "he";
  const { g } = usePersonalAddress();
  const { persona } = usePersona();
  const labels = personaLabels(persona, isHe);
  // Every "שאלו את …" label across the app flows through here — gendering
  // the verb ONCE fixes all call sites (the systemic masculine-singular chip,
  // spirit-audit 14.7). Neutral fallback = plural, the product voice.
  const genderVerb = (l?: string) =>
    l?.startsWith("שאל ") ? `${g("שאל", "שאלי", "שאלו")} ${l.slice(4)}` : l;
  // `labels` is already locale-aware, so one substitution covers both languages.
  const label = withAdvisorName(isHe ? genderVerb(labelHe) : labelEn, labels.short);
  // Icon-only buttons still need an accessible name.
  const a11yLabel =
    label ??
    (isHe
      ? withAdvisorName(genderVerb("שאל את {advisor} על זה")!, labels.short)
      : `Ask ${labels.short}`);

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
      <PersonaIcon className={iconClassName ?? "size-3"} />
      {label}
    </button>
  );
}
