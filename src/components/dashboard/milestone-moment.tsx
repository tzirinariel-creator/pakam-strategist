"use client";

// =========================================================================
// An ADVISOR-voiced milestone MOMENT (Wave-4 gamification, the honest version):
// when the student's own data crosses a real threshold, the advisor marks it —
// once, quietly, dismissible. No points, no badges, no leaderboards, no
// streaks, nothing to "collect". At most ONE card at a time; dismissing
// acknowledges every reached milestone so returning students are never
// nagged with a backlog.
//
// The header used to read "רגע של המלך" with the King's crown for every
// student, including those who had chosen הרפרנט — one of the screens Ariel
// caught (13.8). Header, emblem AND line now follow the chosen persona.
// =========================================================================

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Bidi } from "@/lib/bidi";
import { usePersona, PersonaIcon } from "@/components/persona/use-persona";
import { personaLabels } from "@/lib/persona";
import { reachedMilestones, type MilestoneInput } from "@/lib/milestones";

const SEEN_KEY = "pk-milestones-seen";

function readSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export function MilestoneMoment(props: Omit<MilestoneInput, "persona"> & { isHe: boolean }) {
  const { isHe, ...input } = props;
  const { persona } = usePersona();
  const labels = personaLabels(persona, isHe);
  // Resolved on the client only (localStorage) — render nothing on the server.
  const [seen, setSeen] = useState<Set<string> | null>(null);
  useEffect(() => setSeen(readSeen()), []);

  if (!seen) return null;
  const reached = reachedMilestones({ ...input, persona });
  const current = reached.find((m) => !seen.has(m.id));
  if (!current) return null;

  const dismiss = () => {
    const next = new Set(seen);
    for (const m of reached) next.add(m.id); // acknowledge ALL — no backlog nag
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify([...next]));
    } catch {
      /* storage blocked — session-only */
    }
    setSeen(next);
  };

  return (
    <div className="animate-fade-in data-card relative flex items-start gap-3 border-accent-brand/25 bg-accent-brand/[0.04] p-4">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-brand-muted text-accent-brand">
        <PersonaIcon className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-accent-brand">
          {isHe ? `רגע של ${labels.short}` : `A word from ${labels.short}`}
        </p>
        {/* Milestone lines interpolate credit counts ("112 מתוך 150 ש״ס") —
            isolate the numeric runs the way tip-card already does. */}
        <p className="mt-0.5 text-sm leading-relaxed text-foreground/75">
          <Bidi text={isHe ? current.textHe : current.textEn} />
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label={isHe ? "הבנתי, סגרו" : "Got it, close"}
        className="shrink-0 rounded-md p-1 text-foreground/60 transition-colors hover:text-foreground/90"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
