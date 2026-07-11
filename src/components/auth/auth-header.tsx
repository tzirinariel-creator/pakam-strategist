import { PhilosopherKingIcon } from "@/components/ui/philosopher-king-icon";

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
      <div className="animate-stagger-1 flex size-14 items-center justify-center rounded-2xl bg-accent-brand shadow-sm ring-1 ring-crown-gold-bright/30">
        <PhilosopherKingIcon className="size-8 text-crown-gold-bright" />
      </div>
      <div className="animate-stagger-2">
        <h1 className="font-display text-2xl font-bold text-foreground/85">פכמון</h1>
        <p className="mt-1 text-sm text-foreground/55">{subtitle}</p>
        {warmLine && <p className="mt-2 text-xs text-foreground/45">{warmLine}</p>}
        {benefits && benefits.length > 0 && (
          <ul className="mt-2 space-y-0.5">
            {benefits.slice(0, 3).map((b) => (
              <li key={b} className="text-xs text-foreground/40">
                {b}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
