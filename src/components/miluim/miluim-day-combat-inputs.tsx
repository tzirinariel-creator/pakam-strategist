"use client";

import { Swords } from "lucide-react";
import { cn } from "@/lib/utils";
import { MILUIM_CONFIG } from "@/lib/constants";
import { deriveGroupFromDays, type MiluimGroupKey } from "@/lib/miluim";

/**
 * Shared "days served + combat" input block, extracted so onboarding
 * (step-profile) and Settings (MiluimSection) drive the SAME derivation without
 * duplicating the markup/logic. Controlled component: the parent owns days /
 * combat state and renders the derived group from the returned value.
 */
export interface MiluimDayCombatInputsProps {
  days: number | null;
  combat: boolean;
  onDaysChange: (days: number | null) => void;
  onCombatChange: (combat: boolean) => void;
  labels: {
    daysLabel: string;
    daysHint?: string;
    daysPlaceholder?: string;
    combatLabel: string;
    combatYes: string;
    combatNo: string;
  };
}

export function MiluimDayCombatInputs({
  days,
  combat,
  onDaysChange,
  onCombatChange,
  labels,
}: MiluimDayCombatInputsProps) {
  return (
    <div className="space-y-3">
      {/* Days */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground/60">{labels.daysLabel}</label>
        <input
          type="number"
          min={0}
          max={365}
          value={days ?? ""}
          onChange={(e) =>
            onDaysChange(e.target.value === "" ? null : parseInt(e.target.value, 10))
          }
          placeholder={labels.daysPlaceholder}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-foreground/25 focus:border-foreground/30 focus:outline-none transition-colors"
        />
        {labels.daysHint && (
          <p className="text-[10px] text-foreground/30">{labels.daysHint}</p>
        )}
      </div>

      {/* Combat */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground/60">{labels.combatLabel}</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onCombatChange(true)}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs transition-all",
              combat
                ? "border-amber-500/40 bg-amber-500/5 text-amber-600 font-medium"
                : "border-foreground/15 bg-card text-foreground/60 hover:border-foreground/30"
            )}
          >
            <Swords className="h-3 w-3" />
            {labels.combatYes}
          </button>
          <button
            type="button"
            onClick={() => onCombatChange(false)}
            className={cn(
              "rounded-lg border px-3 py-2 text-xs transition-all",
              !combat
                ? "border-foreground/30 bg-foreground/10 text-foreground/70 font-medium"
                : "border-foreground/15 bg-card text-foreground/60 hover:border-foreground/30"
            )}
          >
            {labels.combatNo}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Re-export the shared derivation so callers import from one place. */
export { deriveGroupFromDays, MILUIM_CONFIG };
export type { MiluimGroupKey };
