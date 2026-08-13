"use client";

import { useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import { PhilosopherKingCharacter } from "@/components/ui/philosopher-king-character";
import { ReferentCharacter } from "@/components/ui/referent-character";
import { usePersona } from "@/components/persona/use-persona";
import type { Persona } from "@/lib/persona";

/**
 * Q5 (notes 17/48) — the ONE advisor-persona picker, shared by settings and
 * the last onboarding step so the choice + its explanation live once.
 * Device-local (localStorage "pk-persona"); default = king (key removed).
 *
 * Reads and writes through usePersona(), so choosing here immediately re-brands
 * every other mounted surface (FAB, dashboard cards, toasts) without a reload.
 */
export type { Persona };

export function PersonaPicker({
  compact = false,
  onChange,
}: {
  /** Compact = onboarding variant (tighter, no origin story). */
  compact?: boolean;
  onChange?: (p: Persona) => void;
}) {
  const isHe = useLocale() === "he";
  const { persona, setPersona } = usePersona();
  const choose = (p: Persona) => {
    setPersona(p);
    onChange?.(p);
  };

  const cards = [
    {
      id: "king" as const,
      Char: PhilosopherKingCharacter,
      name: isHe ? "המלך הפילוסוף" : "The Philosopher King",
      desc: isHe
        ? "חזון ואסטרטגיה בגובה העיניים — רואה את התמונה הגדולה של התואר."
        : "Vision and strategy at eye level — sees the whole degree.",
      tag: isHe ? "ברירת המחדל" : "Default",
    },
    {
      id: "referent" as const,
      Char: ReferentCharacter,
      name: isHe ? "הרפרנט" : "The Referent",
      desc: isHe
        ? "דוגרי, בגובה העיניים וקצר — ישר לשורה התחתונה, בלי סמכות מלמעלה."
        : "Straight-talking, eye-level and short — straight to the bottom line, no top-down authority.",
      tag: null,
    },
  ];

  return (
    <div className="space-y-3">
      {/* Origin story (settings only) — who the King is and why he fits. */}
      {!compact && (
        <p className="text-xs leading-relaxed text-foreground/55">
          {isHe
            ? "המלך הפילוסוף הוא הרעיון של אפלטון ב״פוליטיאה״: מי שמנהיג צריך להוביל לפי ידע, לא לפי ניחוש. בדיוק מה שיועץ־תואר אמור לעשות — ולכן בחרנו בו. שתי הדמויות עונות מאותם נתונים ולפי אותם כללים; ההבדל הוא רק בקול."
            : "The Philosopher King is Plato's idea in the Republic: whoever leads should lead by knowledge, not guesswork — exactly what a degree advisor should do. Both personas answer from the same data under the same rules; only the voice differs."}
        </p>
      )}
      <div className={cn("grid gap-3", compact ? "grid-cols-2" : "sm:grid-cols-2")}>
        {cards.map(({ id, Char, name, desc, tag }) => {
          const active = persona === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => choose(id)}
              className={cn(
                "flex flex-col items-start gap-2 rounded-xl border text-start transition-all",
                compact ? "p-3" : "p-4",
                active
                  ? "border-accent-brand/50 bg-accent-brand/[0.05] ring-1 ring-accent-brand/30"
                  : "border-border bg-card hover:border-foreground/25",
              )}
            >
              {/* #15 — the "ברירת מחדל" chip was a third flex child sitting next
                  to a 44px character and a name that cannot shrink. In the
                  COMPACT (onboarding) variant the grid is `grid-cols-2` at EVERY
                  width, so on a 375px phone each card is ~160px wide while the
                  three children need ~227px. The chip carried neither `shrink-0`
                  nor `whitespace-nowrap`, so flexbox squeezed IT (the only
                  shrinkable child) and its text wrapped — a one-line pill became
                  a tall multi-line blob jammed against the character. That is the
                  "broken position". Fix: the name and the chip share a `min-w-0`
                  track that is allowed to WRAP, and the chip itself never wraps —
                  so when the row runs out of room the chip drops to its own line
                  at the inline-end instead of deforming. */}
              <div className="flex w-full items-center gap-2.5">
                <Char className="size-11 shrink-0 drop-shadow-sm" />
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="min-w-0 text-sm font-bold text-foreground/85">{name}</span>
                  {tag && (
                    <span className="ms-auto shrink-0 whitespace-nowrap rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[10px] text-foreground/50">
                      {tag}
                    </span>
                  )}
                </div>
              </div>
              <p className="text-xs leading-relaxed text-foreground/55">{desc}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
