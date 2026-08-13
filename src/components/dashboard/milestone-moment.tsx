"use client";

// =========================================================================
// A King-voiced milestone MOMENT (Wave-4 gamification, the honest version):
// when the student's own data crosses a real threshold, the King marks it —
// once, quietly, dismissible. No points, no badges, no leaderboards, no
// streaks, nothing to "collect". At most ONE card at a time; dismissing
// acknowledges every reached milestone so returning students are never
// nagged with a backlog.
// =========================================================================

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { PhilosopherKingIcon } from "@/components/ui/philosopher-king-icon";
import { Bidi } from "@/lib/bidi";
import { reachedMilestones, type MilestoneInput } from "@/lib/milestones";

const SEEN_KEY = "pk-milestones-seen";

function readSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export function MilestoneMoment(props: MilestoneInput & { isHe: boolean }) {
  const { isHe, ...input } = props;
  // Resolved on the client only (localStorage) — render nothing on the server.
  const [seen, setSeen] = useState<Set<string> | null>(null);
  useEffect(() => setSeen(readSeen()), []);

  if (!seen) return null;
  const reached = reachedMilestones(input);
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
        <PhilosopherKingIcon className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-accent-brand">
          {isHe ? "רגע של המלך" : "A word from the King"}
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
        className="shrink-0 rounded-md p-1 text-foreground/25 transition-colors hover:text-foreground/60"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
