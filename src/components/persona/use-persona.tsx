"use client";

// =========================================================================
// usePersona() — the ONE way a component learns who the advisor is.
// =========================================================================
// Replaces the copy-pasted `localStorage.getItem("pk-persona")` effect that
// lived in seven components. Three properties matter:
//
//  1. SSR-safe. The store has a server snapshot ("king", the default), so a
//     server render never touches localStorage and hydration never mismatches.
//     useSyncExternalStore resolves the real value during hydration itself —
//     not in an effect after paint, which is what floating-assistant.tsx:66-76
//     documented as the trap ("a Referent user's FAB shows the King until the
//     effect runs").
//
//  2. No first-paint flash. The protected layout is dynamic SSR, so the server
//     HTML is painted before any React code runs and it CANNOT know a
//     device-local choice — no hook can fix that alone. The head script in
//     app/layout.tsx therefore stamps `data-pk-persona` on <html> before first
//     paint, and <PersonaSwap> renders both branches and lets CSS pick. Use it
//     for surfaces that are in the server HTML (the FAB, the loader); the hook
//     alone is enough for anything gated behind client data.
//
//  3. Live. setPersona() notifies every mounted subscriber (and other tabs via
//     the storage event), so switching in the FAB re-brands the dashboard, the
//     /mentor page and the toasts at once — no reload.

import { useSyncExternalStore } from "react";
import {
  PERSONA_ATTR,
  PERSONA_KEY,
  otherPersona,
  readStoredPersona,
  writeStoredPersona,
  type Persona,
} from "@/lib/persona";
import { PhilosopherKingIcon } from "@/components/ui/philosopher-king-icon";
import { ReferentIcon } from "@/components/ui/referent-icon";
import { PhilosopherKingCharacter } from "@/components/ui/philosopher-king-character";
import { ReferentCharacter } from "@/components/ui/referent-character";

// ── The store ────────────────────────────────────────────────────────────
let cached: Persona | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** Another tab (or a second window's picker) changed the choice. */
function onStorage(e: StorageEvent) {
  // key === null means "storage was cleared" — re-read in that case too.
  if (e.key !== null && e.key !== PERSONA_KEY) return;
  cached = readStoredPersona();
  syncAttribute(cached);
  emit();
}

function subscribe(onChange: () => void): () => void {
  // ONE window listener for all subscribers, attached with the first and
  // dropped with the last — not one per mounted component.
  if (listeners.size === 0) window.addEventListener("storage", onStorage);
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): Persona {
  // Cached, so the snapshot is stable between renders and localStorage isn't
  // read synchronously on every render of every persona-aware component.
  if (cached === null) cached = readStoredPersona();
  return cached;
}

/** The server (and the hydration pass) always sees the documented default. */
function getServerSnapshot(): Persona {
  return "king";
}

function syncAttribute(persona: Persona) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute(PERSONA_ATTR, persona);
}

/**
 * Change the advisor everywhere: persists the choice, flips the <html>
 * attribute the CSS swap reads, and re-renders every mounted subscriber.
 */
export function setPersona(next: Persona) {
  writeStoredPersona(next);
  cached = next;
  syncAttribute(next);
  emit();
}

/** Test-only: forget the cached value so a fresh localStorage read happens. */
export function __resetPersonaCache() {
  cached = null;
}

export interface UsePersona {
  persona: Persona;
  isReferent: boolean;
  /** Persist + broadcast a new choice. */
  setPersona: (next: Persona) => void;
  /** Flip to the other advisor (returns the one now chosen). */
  toggle: () => Persona;
}

/**
 * Deliberately does NOT read the locale: an emblem or a portrait needs to know
 * WHO the advisor is, not what language the page is in, and coupling the two
 * would force every component that shows the King's crown to sit inside an intl
 * provider (it broke four component suites when it did). Call sites that render
 * the NAME already know their locale — they pass it to `personaLabels(persona,
 * isHe)` from lib/persona, which is pure and testable on its own.
 */
export function usePersona(): UsePersona {
  const persona = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return {
    persona,
    isReferent: persona === "referent",
    setPersona,
    toggle: () => {
      const next = otherPersona(persona);
      setPersona(next);
      return next;
    },
  };
}

/**
 * A non-hook read for imperative code (toasts, event handlers) that has no
 * component to hang a hook on.
 */
export function getPersona(): Persona {
  return getSnapshot();
}

// ── Persona-aware brand marks ────────────────────────────────────────────

/** The small emblem — crown or badge. Never a generic AI icon. */
export function PersonaIcon({
  className,
  title,
  state,
  dot,
}: {
  className?: string;
  title?: string;
  /** King-only expressiveness; ignored by the Referent's flat badge. */
  state?: "idle" | "thinking" | "muted";
  dot?: "critical" | "warning" | null;
}) {
  const { isReferent } = usePersona();
  if (isReferent) return <ReferentIcon className={className} title={title} />;
  return <PhilosopherKingIcon className={className} title={title} state={state} dot={dot} />;
}

/** The full portrait — used at large sizes (panel header, empty states). */
export function PersonaCharacter({ className, title }: { className?: string; title?: string }) {
  const { isReferent } = usePersona();
  const Char = isReferent ? ReferentCharacter : PhilosopherKingCharacter;
  return <Char className={className} title={title} />;
}

/**
 * Zero-flash swap for surfaces that ARE in the server HTML. Both branches are
 * rendered; CSS (driven by the <html data-pk-persona> the head script stamps
 * before first paint) shows exactly one. The hidden branch is display:none, so
 * screen readers announce one advisor, not two.
 */
export function PersonaSwap({
  king,
  referent,
}: {
  king: React.ReactNode;
  referent: React.ReactNode;
}) {
  return (
    <>
      <span className="pk-persona-king">{king}</span>
      <span className="pk-persona-referent">{referent}</span>
    </>
  );
}
