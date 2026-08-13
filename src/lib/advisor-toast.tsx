"use client";

// =========================================================================
// System failures speak through the ADVISOR (13.7 #10 — "error messages
// through the King", the last piece of the no-generic-AI current: every
// mediated moment carries the brand character, never a cold system voice).
//
// Scope rule: ONLY system failures (save/scan/sync/AI/delete didn't work) go
// through here — form validation ("מלאו כותרת") stays a plain toast; it's
// feedback, not the app failing the student.
//
// Voice rule: honest and short. The advisor never minimizes ("קרתה שגיאה
// קטנה") and never blames — it states what failed, whether data is safe,
// and what to do. The persona icon marks WHO is speaking; the chosen
// persona (pk-persona — the same key the FAB and PersonaPicker honor)
// decides which face appears.
// =========================================================================

import { toast } from "sonner";
import { PhilosopherKingIcon } from "@/components/ui/philosopher-king-icon";
import { ReferentIcon } from "@/components/ui/referent-icon";
import { getPersona } from "@/components/persona/use-persona";

function personaIcon() {
  // Same store every component reads (SSR-safe, updates the instant the student
  // switches) instead of a private localStorage read.
  const referent = getPersona() === "referent";
  return referent ? (
    <ReferentIcon className="size-4 text-accent-brand" />
  ) : (
    <PhilosopherKingIcon className="size-4 text-accent-brand" />
  );
}

/** A system-failure toast in the advisor's voice, marked with their icon. */
export function advisorError(message: string) {
  toast.error(message, { icon: personaIcon() });
}

/** An advisor-voiced success for moments the advisor mediated (optional). */
export function advisorSuccess(message: string) {
  toast.success(message, { icon: personaIcon() });
}
