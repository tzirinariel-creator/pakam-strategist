import { cn } from "@/lib/utils";

/**
 * #38 (12.7) — the Philosopher King as a PHYSICAL character: a warm bust in
 * flat-modern style — heraldic gold crown (same silhouette family as the
 * emblem), calm wise eyes, the philosopher's beard, indigo robe with a gold
 * trim. Used at LARGE sizes (panel header, empty states); the crown-only
 * emblem remains the mark at small sizes (FAB, buttons), so the documented
 * crown identity survives while the King finally has a face.
 * Self-contained SVG, no external assets; colors are fixed by design (the
 * character looks the same in light/dark — like a portrait).
 */
export function PhilosopherKingCharacter({
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
      {/* backdrop medallion */}
      <circle cx="32" cy="32" r="31" fill="#312E81" />
      <circle cx="32" cy="32" r="31" fill="url(#pkc-glow)" />

      {/* robe (bust) */}
      <path
        d="M12 64c1-12 9-18 20-18s19 6 20 18Z"
        fill="#4338CA"
      />
      {/* gold trim on the robe collar */}
      <path
        d="M22 50c3-2.5 6.5-4 10-4s7 1.5 10 4c-3 1.8-6.5 2.8-10 2.8S25 51.8 22 50Z"
        fill="#F59E0B"
        opacity="0.9"
      />

      {/* neck */}
      <rect x="28.5" y="38" width="7" height="8" rx="3" fill="#E8B98B" />

      {/* face */}
      <circle cx="32" cy="29" r="12.5" fill="#F2C79C" />

      {/* beard — full philosopher's beard, soft white */}
      <path
        d="M20.5 30c0 9 4.5 15 11.5 15s11.5-6 11.5-15c-1.5 6-3.5 8-5.5 8.5.5-2 .3-3.5-.3-4.5-1.3 1.8-3.4 2.8-5.7 2.8s-4.4-1-5.7-2.8c-.6 1-.8 2.5-.3 4.5-2-.5-4-2.5-5.5-8.5Z"
        fill="#E5E7EB"
      />
      {/* mustache + calm smile */}
      <path d="M27 33.6c1.5-1.1 3.2-1.6 5-1.6s3.5.5 5 1.6c-1 1.5-2.9 2.2-5 2.2s-4-.7-5-2.2Z" fill="#F3F4F6" />
      <path d="M29.6 36.8c1.5.9 3.3.9 4.8 0" stroke="#9A6B45" strokeWidth="0.9" strokeLinecap="round" fill="none" />

      {/* eyes — calm, knowing */}
      <circle cx="27.2" cy="27.5" r="1.5" fill="#1F2937" />
      <circle cx="36.8" cy="27.5" r="1.5" fill="#1F2937" />
      <circle cx="27.7" cy="27" r="0.45" fill="#fff" />
      <circle cx="37.3" cy="27" r="0.45" fill="#fff" />
      {/* brows — one slightly raised: the Socratic questioning look */}
      <path d="M24.8 24.4c1.4-1 3.2-1.2 4.8-.6" stroke="#D1D5DB" strokeWidth="1.4" strokeLinecap="round" fill="none" />
      <path d="M34.4 23.4c1.6-.6 3.4-.4 4.8.6" stroke="#D1D5DB" strokeWidth="1.4" strokeLinecap="round" fill="none" />

      {/* nose */}
      <path d="M32 28.5c-.6 1.6-.9 2.6-.3 3.2.4.4 1 .4 1.4 0" stroke="#D9A16E" strokeWidth="1" strokeLinecap="round" fill="none" />

      {/* hair sides under the crown */}
      <path d="M20 26c-.8 2-.9 3.6-.6 5.4-1.6-2.2-2-4.8-1.2-7.2Z" fill="#E5E7EB" />
      <path d="M44 26c.8 2 .9 3.6.6 5.4 1.6-2.2 2-4.8 1.2-7.2Z" fill="#E5E7EB" />

      {/* crown — heraldic: smooth base, three peaks, orbs; center peak taller
          with the "orb of the Good" (the emblem's signature, kept). */}
      <path
        d="M21 20.5 23 12.8c.1-.5.7-.6 1-.2l4.2 4.9 3-6.8c.3-.6 1.2-.6 1.5 0l3 6.8 4.2-4.9c.3-.4.9-.3 1 .2l2 7.7c-3.4 1.6-7.2 2.4-11 2.4s-7.6-.8-10.9-2.4Z"
        fill="#F59E0B"
      />
      <path
        d="M21 20.5c3.3 1.6 7.1 2.4 10.9 2.4 3.9 0 7.7-.8 11-2.4l.6 2.2c-3.6 1.7-7.6 2.6-11.6 2.6s-7.9-.9-11.5-2.6Z"
        fill="#D97706"
      />
      {/* orbs on the peaks */}
      <circle cx="23.6" cy="11.6" r="1.5" fill="#FBBF24" />
      <circle cx="40.4" cy="11.6" r="1.5" fill="#FBBF24" />
      {/* the orb of the Good — center, brightest */}
      <circle cx="32" cy="8.6" r="2.1" fill="#FDE68A" />
      <circle cx="32" cy="8.6" r="2.1" fill="none" stroke="#F59E0B" strokeWidth="0.7" />
      {/* jewel on the band */}
      <rect x="30.6" y="19.2" width="2.8" height="2.8" rx="0.7" transform="rotate(45 32 20.6)" fill="#4338CA" />

      <defs>
        <radialGradient id="pkc-glow" cx="0.5" cy="0.35" r="0.75">
          <stop offset="0%" stopColor="#818CF8" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#312E81" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}
