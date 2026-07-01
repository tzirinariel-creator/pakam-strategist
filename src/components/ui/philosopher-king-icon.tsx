import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * The Philosopher King emblem — a refined royal crown (not the generic
 * three-triangle crown): a smooth heraldic silhouette with orbs crowning each
 * peak, the center peak taller and topped with the "orb of the Good". Renders
 * in currentColor so a parent can tint it gold on the indigo FAB. This is the
 * app's AI identity (see docs/מלך-פילוסוף-עיצוב.md) — regal, tailored, not a
 * stock sparkle or robot.
 */
export function PhilosopherKingIcon({
  className,
  title,
  style,
}: {
  className?: string;
  title?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={cn("size-5", className)}
      style={style}
    >
      {/* Crown body — left peak · center peak (tallest) · right peak */}
      <path
        d="M3.4 18.2 L4.7 9.6 L8.9 13.1 L12 6.9 L15.1 13.1 L19.3 9.6 L20.6 18.2 Z"
        fillOpacity="0.95"
      />
      {/* Peak orbs */}
      <circle cx="4.7" cy="8.7" r="1.1" />
      <circle cx="12" cy="5.9" r="1.35" />
      <circle cx="19.3" cy="8.7" r="1.1" />
      {/* Base band */}
      <rect x="3" y="18" width="18" height="2.7" rx="0.9" />
    </svg>
  );
}
