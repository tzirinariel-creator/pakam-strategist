"use client";

import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * M1 (note 46) — THE miluim quota stepper, shared by every surface that shows
 * or edits the cumulative counters (the miluim strip's benefits panel and the
 * settings section). One component, one behavior: stepper writes go through
 * the same updateProfile mutation immediately, so a change anywhere shows
 * everywhere at once (the R6 mutual-refresh fix already keeps caches in sync).
 */
export function QuotaCard({
  icon: Icon,
  label,
  used,
  cap,
  hint,
  onChange,
  pending,
  isHe,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  used: number;
  cap: number;
  hint: React.ReactNode;
  onChange?: (next: number) => void;
  pending: boolean;
  isHe: boolean;
}) {
  // #26 (13.8) — "הפלוס מינוס … נראה שהם לא עובדים".
  //
  // They did work. What Ariel saw was worse than a dead button: `used` was a
  // pure server prop, so a tap changed NOTHING on screen, and `pending` then
  // disabled BOTH steppers down to opacity-25 while the mutation flew. For the
  // second or two until the refetch landed, the number sat still and the
  // controls greyed out — which reads exactly like a broken control, and
  // invites a second tap that does nothing either.
  //
  // The tap now moves the number immediately. The optimistic value is dropped
  // the moment the server agrees, and reverts on its own if the server never
  // does (a failed mutation leaves `used` untouched, and the parent already
  // toasts the error), so an optimistic display can never harden into a lie.
  const [optimistic, setOptimistic] = useState<number | null>(null);
  useEffect(() => {
    if (optimistic == null) return;
    if (used === optimistic) {
      setOptimistic(null);
      return;
    }
    const t = setTimeout(() => setOptimistic(null), 4000);
    return () => clearTimeout(t);
  }, [used, optimistic]);
  const shown = optimistic ?? used;
  const step = (next: number) => {
    setOptimistic(next);
    onChange?.(next);
  };

  const stepBtn =
    "flex size-6 items-center justify-center rounded-md border border-border/60 text-foreground/70 transition-colors hover:bg-foreground/5 hover:text-foreground/80 disabled:opacity-40 disabled:hover:bg-transparent";
  return (
    <div className="rounded-xl border border-border/60 bg-foreground/[0.02] p-3.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground/60">
        <Icon className="size-3.5" />
        {label}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        {/* #43 — the counter is a pure number pair, so it stays in ONE
            explicitly-LTR run: two adjacent spans linearized as "0/ 10"
            wherever the text was copied or read out. */}
        <div className="flex items-baseline" dir="ltr">
          <span
            className={cn(
              "font-mono text-xl font-bold text-foreground/85 transition-opacity",
              // Saving is shown by a slight fade on the NUMBER, which has
              // already moved — never by disabling the control the student is
              // trying to press.
              optimistic != null && "opacity-60",
            )}
          >
            {shown}
          </span>
          <span className="font-mono text-sm text-foreground/60">{` / ${cap}`}</span>
        </div>
        {onChange && (
          <div className="flex items-center gap-1" dir="ltr">
            <button
              type="button"
              disabled={shown <= 0}
              onClick={() => step(shown - 1)}
              aria-label={isHe ? `הפחתת ניצול — ${label}` : `Decrease used — ${label}`}
              className={stepBtn}
            >
              <Minus className="size-3" />
            </button>
            <button
              type="button"
              disabled={shown >= cap}
              onClick={() => step(shown + 1)}
              aria-label={isHe ? `הוספת ניצול — ${label}` : `Increase used — ${label}`}
              className={stepBtn}
            >
              <Plus className="size-3" />
            </button>
          </div>
        )}
      </div>
      <p className="mt-0.5 text-[10px] leading-tight text-foreground/60">{hint}</p>
    </div>
  );
}
