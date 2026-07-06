import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * הרפרנט — the second advisor persona's emblem: a clean staff/ID badge (the
 * budget-division referent's lanyard tag), deliberately NOT a crown — gold and
 * regalia stay exclusive to the King. Renders in currentColor like its sibling
 * PhilosopherKingIcon.
 */
export function ReferentIcon({
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
      {/* Lanyard clip */}
      <rect x="10" y="2.2" width="4" height="3" rx="1" fillOpacity="0.9" />
      {/* Badge card */}
      <rect x="4.5" y="5.6" width="15" height="16" rx="2.4" fillOpacity="0.95" />
      {/* Photo circle + text lines — knocked out of the card */}
      <circle cx="12" cy="11" r="2.6" fill="var(--background, #fff)" fillOpacity="0.9" />
      <rect x="7.5" y="15.6" width="9" height="1.5" rx="0.75" fill="var(--background, #fff)" fillOpacity="0.9" />
      <rect x="9" y="18.2" width="6" height="1.3" rx="0.65" fill="var(--background, #fff)" fillOpacity="0.7" />
    </svg>
  );
}
