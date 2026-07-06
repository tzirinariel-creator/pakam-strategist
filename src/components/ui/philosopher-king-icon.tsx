import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * The Philosopher King emblem — a refined royal crown (not the generic
 * three-triangle crown): a smooth heraldic silhouette with orbs crowning each
 * peak, the center peak taller and topped with the "orb of the Good". Renders
 * in currentColor so a parent can tint it gold on the indigo FAB. This is the
 * app's AI identity (see docs/מלך-פילוסוף-עיצוב.md) — regal, tailored, not a
 * stock sparkle or robot. Deliberately CROWN-ONLY (no face): expression comes
 * from motion and the "orb of the Good", not eyes.
 *
 * Character states (via `state`): `idle` (static), `thinking` (the center orb
 * breathes while the King considers — wired to LLM streaming), `muted` (dimmed
 * when offline/disabled). A severity `dot` marks a pending proactive suggestion.
 */
export function PhilosopherKingIcon({
  className,
  title,
  style,
  state = "idle",
  dot = null,
}: {
  className?: string;
  title?: string;
  style?: CSSProperties;
  state?: "idle" | "thinking" | "muted";
  /** A pending proactive suggestion — shows a small severity dot above the crown. */
  dot?: "critical" | "warning" | null;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={cn(
        "size-5",
        state === "thinking" && "pk-king--thinking",
        state === "muted" && "opacity-50",
        className,
      )}
      style={style}
    >
      {/* Crown body — left peak · center peak (tallest) · right peak */}
      <path
        d="M3.4 18.2 L4.7 9.6 L8.9 13.1 L12 6.9 L15.1 13.1 L19.3 9.6 L20.6 18.2 Z"
        fillOpacity="0.95"
      />
      {/* Peak orbs — the center "orb of the Good" breathes in the thinking state */}
      <circle cx="4.7" cy="8.7" r="1.1" />
      <circle cx="12" cy="5.9" r="1.35" className="pk-king-orb" />
      <circle cx="19.3" cy="8.7" r="1.1" />
      {/* Base band */}
      <rect x="3" y="18" width="18" height="2.7" rx="0.9" />
      {/* Pending-suggestion dot — the only new visual affordance, drawing the eye
          without a badge-count or bounce. Severity-tinted, floats above the crown. */}
      {dot && (
        <circle
          cx="12"
          cy="3.4"
          r="2.1"
          className={dot === "critical" ? "fill-red-500" : "fill-amber-500"}
          stroke="var(--accent-brand, #4f46e5)"
          strokeWidth="0.9"
        />
      )}
    </svg>
  );
}
