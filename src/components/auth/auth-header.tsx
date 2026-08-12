import { PhilosopherKingCharacter } from "@/components/ui/philosopher-king-character";

/**
 * Shared auth-screen header (#6) — the identity chip uses the SAME grammar as
 * the floating King button (indigo fill, gold crown, gold ring), so the auth
 * screens carry the product's voice: cover the label and you still know it's
 * Pakamon (design line, test 5). Hebrew first, one title size.
 */
export function AuthHeader({
  subtitle,
  warmLine,
  benefits,
}: {
  subtitle: string;
  warmLine?: string;
  /** Q6 (note 6) — up to 3 short benefit lines under the value line. */
  benefits?: string[];
}) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="animate-stagger-1 pk-float">
        <PhilosopherKingCharacter className="size-16 drop-shadow-md" />
      </div>
      <div className="animate-stagger-2 max-w-sm">
        <h1 className="font-display text-2xl font-bold text-foreground/85">פכמון</h1>
        <p className="mt-1 text-sm text-foreground/55">{subtitle}</p>
        {/* Ariel note #1 — "יש בו גם איזה רווח מוזר אחרי השורה הראשונה".
            Root cause: warmLine and the benefit list were two separate mt-2
            blocks at nearly identical size and opacity, so they read as ONE
            paragraph with an unexplained hole in it. Now there is a real
            hierarchy instead: the lead line is its own visible promise, and
            the benefits sit under it as a marked, evenly-spaced list. */}
        {warmLine && (
          <p className="mt-3 text-sm font-medium leading-snug text-foreground/70">{warmLine}</p>
        )}
        {benefits && benefits.length > 0 && (
          <ul className={warmLine ? "mt-2.5 space-y-1" : "mt-3 space-y-1"}>
            {benefits.slice(0, 3).map((b) => (
              <li
                key={b}
                className="flex items-start justify-center gap-1.5 text-xs leading-relaxed text-foreground/45"
              >
                <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-accent-brand/50" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
