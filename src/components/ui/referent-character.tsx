import { cn } from "@/lib/utils";

/**
 * #3 (12.7) — the Referent as a PHYSICAL character, sibling of the King's
 * bust: same medallion composition, opposite temperament. A final-year
 * student in a teal hoodie with earphones around the neck, an easy grin and
 * a raised eyebrow — the friend who's been through it all. Fixed colors
 * (portrait-like), teal family to match the referent accent.
 */
export function ReferentCharacter({
  className,
  title,
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={cn("size-12", className)}
    >
      {/* backdrop medallion — deep teal */}
      <circle cx="32" cy="32" r="31" fill="#134E4A" />
      <circle cx="32" cy="32" r="31" fill="url(#rfc-glow)" />

      {/* hoodie (bust) */}
      <path d="M12 64c1-12 9-18 20-18s19 6 20 18Z" fill="#0D9488" />
      {/* hood behind the head */}
      <path
        d="M18 40c-1.5-9 4-17 14-17s15.5 8 14 17c-2-3-4.5-4.6-6.5-5.2 1-6-2.5-9.8-7.5-9.8s-8.5 3.8-7.5 9.8c-2 .6-4.5 2.2-6.5 5.2Z"
        fill="#0F766E"
      />
      {/* hoodie strings */}
      <path d="M27 48v6M37 48v6" stroke="#F0FDFA" strokeWidth="1.6" strokeLinecap="round" />

      {/* earphones around the neck */}
      <path d="M22 46c3 3.5 17 3.5 20 0" stroke="#1F2937" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      <circle cx="22" cy="46" r="2.2" fill="#1F2937" />
      <circle cx="42" cy="46" r="2.2" fill="#1F2937" />

      {/* neck */}
      <rect x="28.5" y="37" width="7" height="8" rx="3" fill="#E8B98B" />

      {/* face */}
      <circle cx="32" cy="28" r="11.5" fill="#F2C79C" />

      {/* short messy hair */}
      <path
        d="M21 26c-.5-7 4.5-12 11-12s11.5 5 11 12c-1.5-2.5-2.7-3.5-3.7-4-.2 1.2-.8 2.2-1.7 2.8-.3-1.5-1-2.6-2-3.2-.5 1.2-1.5 2-2.8 2.3-.2-1.3-.9-2.3-1.9-2.9-1 .9-2.3 1.4-3.7 1.4-.4-.9-.5-1.8-.3-2.7-2.3.8-4.4 3-5.9 6.3Z"
        fill="#3F3F46"
      />

      {/* eyes — bright, alert */}
      <circle cx="27.4" cy="27" r="1.5" fill="#1F2937" />
      <circle cx="36.6" cy="27" r="1.5" fill="#1F2937" />
      <circle cx="27.9" cy="26.5" r="0.45" fill="#fff" />
      <circle cx="37.1" cy="26.5" r="0.45" fill="#fff" />
      {/* one raised brow — the "אחי, תקשיב" look */}
      <path d="M25 24.2c1.4-.8 3-.9 4.4-.4" stroke="#3F3F46" strokeWidth="1.4" strokeLinecap="round" fill="none" />
      <path d="M34.6 22.8c1.5-.5 3.1-.2 4.3.6" stroke="#3F3F46" strokeWidth="1.4" strokeLinecap="round" fill="none" />

      {/* nose */}
      <path d="M32 27.5c-.5 1.4-.8 2.3-.3 2.8.4.4 1 .4 1.4 0" stroke="#D9A16E" strokeWidth="1" strokeLinecap="round" fill="none" />

      {/* easy grin, slightly asymmetric */}
      <path d="M28 33.4c1.6 1.6 5 1.7 7-.4" stroke="#9A6B45" strokeWidth="1.1" strokeLinecap="round" fill="none" />

      {/* light stubble hint */}
      <path d="M26.5 34.5c1.5 1.8 3.4 2.8 5.5 2.8s4-1 5.5-2.8" stroke="#D9A16E" strokeWidth="0.5" strokeDasharray="0.8 1.4" fill="none" opacity="0.7" />

      <defs>
        <radialGradient id="rfc-glow" cx="0.5" cy="0.35" r="0.75">
          <stop offset="0%" stopColor="#5EEAD4" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#134E4A" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}
