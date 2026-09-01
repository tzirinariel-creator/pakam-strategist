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
    <div className="flex flex-col items-center gap-5 text-center">
      {/* The bob is gone from THIS screen only. `pk-float` loops forever, and a
          mascot bobbing above the page's title is the loudest thing on the
          first screen a new student sees — part of the "childish" note (#1).
          It stays where it earns its keep: loaders, where the motion means the
          app is working. Here nothing is happening, so nothing should move. */}
      <div className="animate-stagger-1">
        <PhilosopherKingCharacter className="size-14 drop-shadow-sm" />
      </div>
      <div className="animate-stagger-2 max-w-sm">
        {/* Was text-foreground/85 — the page's only h1, dimmed. */}
        <h1 className="font-display text-2xl font-bold text-foreground">פכמון</h1>
        <p className="mt-1.5 text-sm text-foreground/55">{subtitle}</p>
        {/* Ariel note #1 — "יש בו גם איזה רווח מוזר אחרי השורה הראשונה".
            Root cause: warmLine and the benefit list were two separate mt-2
            blocks at nearly identical size and opacity, so they read as ONE
            paragraph with an unexplained hole in it. Now there is a real
            hierarchy instead: the lead line is its own visible promise, and
            the benefits sit under it as a marked, evenly-spaced list. */}
        {warmLine && (
          <p className="mt-3 text-sm font-medium leading-snug text-foreground/70">{warmLine}</p>
        )}
        {/* Ariel note #2 — the three dots did not line up.
            `justify-center` was on the <li>, so every row was its own flex
            container centring its own dot+text pair against its own width.
            Three lines of different lengths put the marker in three different
            places: the zig-zag he saw. Markers can only align if the rows share
            a start edge, so the LIST is centred (mx-auto w-fit) and the rows
            start together. `text-start` is needed to undo the text-center this
            inherits from the wrapper above.
            The opacity also moved 45% → 60%: 45% at 12px does not clear
            contrast, and this app ships an /accessibility page. */}
        {benefits && benefits.length > 0 && (
          <ul
            className={
              warmLine
                ? "mx-auto mt-3 w-fit max-w-full space-y-1.5 text-start"
                : "mx-auto mt-3.5 w-fit max-w-full space-y-1.5 text-start"
            }
          >
            {benefits.slice(0, 3).map((b) => (
              <li
                key={b}
                className="flex items-start gap-2 text-xs leading-relaxed text-foreground/60"
              >
                <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-accent-brand/60" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
