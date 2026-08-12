"use client";

import { Minus, Plus } from "lucide-react";

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
  const stepBtn =
    "flex size-6 items-center justify-center rounded-md border border-border/60 text-foreground/50 transition-colors hover:bg-foreground/5 hover:text-foreground/80 disabled:opacity-25 disabled:hover:bg-transparent";
  return (
    <div className="rounded-xl border border-border/60 bg-foreground/[0.02] p-3.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground/50">
        <Icon className="size-3.5" />
        {label}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        {/* #43 — the counter is a pure number pair, so it stays in ONE
            explicitly-LTR run: two adjacent spans linearized as "0/ 10"
            wherever the text was copied or read out. */}
        <div className="flex items-baseline" dir="ltr">
          <span className="font-mono text-xl font-bold text-foreground/85">{used}</span>
          <span className="font-mono text-sm text-foreground/40">{` / ${cap}`}</span>
        </div>
        {onChange && (
          <div className="flex items-center gap-1" dir="ltr">
            <button
              type="button"
              disabled={pending || used <= 0}
              onClick={() => onChange(used - 1)}
              aria-label={isHe ? `הפחתת ניצול — ${label}` : `Decrease used — ${label}`}
              className={stepBtn}
            >
              <Minus className="size-3" />
            </button>
            <button
              type="button"
              disabled={pending || used >= cap}
              onClick={() => onChange(used + 1)}
              aria-label={isHe ? `הוספת ניצול — ${label}` : `Increase used — ${label}`}
              className={stepBtn}
            >
              <Plus className="size-3" />
            </button>
          </div>
        )}
      </div>
      <p className="mt-0.5 text-[10px] leading-tight text-foreground/45">{hint}</p>
    </div>
  );
}
