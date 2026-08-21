"use client";

// -----------------------------------------------------------------------
// "יש לי בקשות לשבוע" — the constraints the search should try to honour
// -----------------------------------------------------------------------
// This lived inside the conflicts card in insights-bar, beside the button
// that consumed it. When the timetable assistant became its own card, that
// button went with it — and leaving the constraints behind would have left a
// student able to ask for Wednesday off with nothing on screen that reads it.
//
// So it moves to the trigger. A control that sets up an action and the action
// itself have to sit together, or the setting is decoration.

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ComboPreferences } from "@/lib/combo-finder";

const COMBO_DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] as const;
const COMBO_DAY_SHORT_HE: Record<string, string> = {
  SUNDAY: "א", MONDAY: "ב", TUESDAY: "ג", WEDNESDAY: "ד", THURSDAY: "ה", FRIDAY: "ו",
};
const COMBO_DAY_SHORT_EN: Record<string, string> = {
  SUNDAY: "Su", MONDAY: "Mo", TUESDAY: "Tu", WEDNESDAY: "We", THURSDAY: "Th", FRIDAY: "Fr",
};

export function ComboPreferencesControl({
  prefs,
  onChange,
  isHe,
}: {
  prefs: ComboPreferences;
  onChange: (next: ComboPreferences) => void;
  isHe: boolean;
}) {
  const [open, setOpen] = useState(false);
  const free = prefs.freeDays ?? [];
  const toggleDay = (day: string) =>
    onChange({
      ...prefs,
      freeDays: free.includes(day) ? free.filter((d) => d !== day) : [...free, day],
    });

  return (
    <div className="mt-1" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full rounded-md px-2 py-0.5 text-[10px] font-medium text-foreground/50 transition-colors hover:text-foreground/70"
        aria-expanded={open}
      >
        {isHe ? "יש לי בקשות לשבוע" : "I have constraints"}
      </button>
      {open && (
        <div className="mt-1 space-y-2 rounded-md border border-border/60 bg-card/50 p-2">
          <div>
            <p className="text-[10px] text-foreground/50">
              {isHe ? "ימים שהייתם רוצים לשמור פנויים" : "Days you'd like to keep clear"}
            </p>
            <div className="mt-1 flex gap-1">
              {COMBO_DAYS.map((day) => {
                const on = free.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    aria-pressed={on}
                    className={cn(
                      "size-6 rounded-md border text-[10px] font-semibold transition-colors",
                      on
                        ? "border-transparent bg-foreground text-background"
                        : "border-border/60 text-foreground/50 hover:text-foreground/80",
                    )}
                  >
                    {isHe ? COMBO_DAY_SHORT_HE[day] : COMBO_DAY_SHORT_EN[day]}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-[10px] text-foreground/50">
              {isHe ? "לא לפני" : "Not before"}
              <select
                value={prefs.earliestHour ?? ""}
                onChange={(e) =>
                  onChange({
                    ...prefs,
                    earliestHour: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                className="rounded border border-border/60 bg-transparent px-1 py-0.5 text-[10px] text-foreground/80"
              >
                <option value="">{isHe ? "—" : "—"}</option>
                {[8, 9, 10, 11, 12, 13, 14].map((h) => (
                  <option key={h} value={h}>{`${h}:00`}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1 text-[10px] text-foreground/50">
              {isHe ? "לא אחרי" : "Not after"}
              <select
                value={prefs.latestHour ?? ""}
                onChange={(e) =>
                  onChange({
                    ...prefs,
                    latestHour: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                className="rounded border border-border/60 bg-transparent px-1 py-0.5 text-[10px] text-foreground/80"
              >
                <option value="">{isHe ? "—" : "—"}</option>
                {[14, 15, 16, 17, 18, 19, 20, 21].map((h) => (
                  <option key={h} value={h}>{`${h}:00`}</option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-[10px] leading-relaxed text-foreground/40">
            {isHe
              ? "אלה בקשות, לא חוקים: אם הדרך היחידה לכבד אותן היא מערכת עם חפיפה — נעדיף מערכת בלי חפיפה, ונגיד לכם מה לא הסתדר."
              : "These are wishes, not rules: if the only way to honour one is a week with a clash, we'll pick the clash-free week and tell you what we couldn't keep."}
          </p>
        </div>
      )}
    </div>
  );
}
