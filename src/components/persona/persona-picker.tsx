"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import { PhilosopherKingCharacter } from "@/components/ui/philosopher-king-character";
import { ReferentCharacter } from "@/components/ui/referent-character";

/**
 * Q5 (notes 17/48) — the ONE advisor-persona picker, shared by settings and
 * the last onboarding step so the choice + its explanation live once.
 * Device-local (localStorage "pk-persona", same key the FAB honors);
 * default = king (key removed).
 */
export type Persona = "king" | "referent";

export function readPersona(): Persona {
  try {
    return localStorage.getItem("pk-persona") === "referent" ? "referent" : "king";
  } catch {
    return "king";
  }
}

export function writePersona(p: Persona) {
  try {
    if (p === "king") localStorage.removeItem("pk-persona");
    else localStorage.setItem("pk-persona", p);
  } catch {
    /* storage blocked — the FAB will fall back to king */
  }
}

export function PersonaPicker({
  compact = false,
  onChange,
}: {
  /** Compact = onboarding variant (tighter, no origin story). */
  compact?: boolean;
  onChange?: (p: Persona) => void;
}) {
  const isHe = useLocale() === "he";
  const [persona, setPersona] = useState<Persona>("king");
  useEffect(() => setPersona(readPersona()), []);
  const choose = (p: Persona) => {
    setPersona(p);
    writePersona(p);
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
        ? "ענייני, פורמלי וקצר — ישר לשורה התחתונה."
        : "Matter-of-fact, formal and short — straight to the bottom line.",
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
              <div className="flex w-full items-center gap-2.5">
                <Char className="size-11 shrink-0 drop-shadow-sm" />
                <span className="text-sm font-bold text-foreground/85">{name}</span>
                {tag && (
                  <span className="ms-auto rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[10px] text-foreground/50">
                    {tag}
                  </span>
                )}
              </div>
              <p className="text-xs leading-relaxed text-foreground/55">{desc}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
