// =========================================================================
// The advisor persona — ONE source of truth for WHO is speaking.
// =========================================================================
// The app has exactly one advisor, and the student chooses which one it is:
// המלך הפילוסוף (default) or הרפרנט. The choice is device-local
// (localStorage "pk-persona") and every in-app surface that names, depicts or
// speaks as the advisor must follow it — the name, the face and the voice.
//
// Before this module every component re-implemented
// `localStorage.getItem("pk-persona") === "referent"` and hardcoded its own
// Hebrew name string, which is exactly how the app ended up saying "רגע של
// המלך" to a student who had chosen the Referent (Ariel, 13.8: "במקום אחד זה
// המלך ובמקום אחד הרפרנט — זה לא קוהרנטי").
//
// PURE module: no React, no DOM access at import time — so it is testable in
// the node environment and safe to import from the server.

/** localStorage key. Kept as-is: real students already have a value stored. */
export const PERSONA_KEY = "pk-persona";

/**
 * The attribute the head script stamps on <html> BEFORE first paint, so a
 * server-rendered surface can pick the right face with CSS instead of flashing
 * the King at a Referent user while React hydrates (see globals.css →
 * .pk-persona-king / .pk-persona-referent).
 */
export const PERSONA_ATTR = "data-pk-persona";

/** Same union as MentorPersona in lib/ai/mentor-prompt (kept structurally in sync). */
export type Persona = "king" | "referent";

/** Anything that is not exactly "referent" is the King — the documented default. */
export function normalizePersona(raw: string | null | undefined): Persona {
  return raw === "referent" ? "referent" : "king";
}

/** Read the device-local choice. Storage blocked / SSR → the King. */
export function readStoredPersona(): Persona {
  try {
    return normalizePersona(localStorage.getItem(PERSONA_KEY));
  } catch {
    return "king";
  }
}

/**
 * Persist the choice. The King (the default) REMOVES the key rather than
 * writing "king", so a device that never chose is indistinguishable from one
 * that chose the default — the behaviour persona-picker has always had.
 */
export function writeStoredPersona(persona: Persona): void {
  try {
    if (persona === "king") localStorage.removeItem(PERSONA_KEY);
    else localStorage.setItem(PERSONA_KEY, persona);
  } catch {
    /* storage blocked — the caller still switches for this view */
  }
}

export interface PersonaLabels {
  /** Standalone/full name: "המלך הפילוסוף" · "The Philosopher King". */
  name: string;
  /** Mid-sentence short form: "המלך" · "the King". Use inside a sentence. */
  short: string;
  /**
   * The name WITHOUT the Hebrew definite article, for prepositions that
   * contract with it: `ל${bare}` → "למלך הפילוסוף" (never "להמלך"). English
   * returns the mid-sentence form.
   */
  bare: string;
}

const NAMES: Record<Persona, { he: PersonaLabels; en: PersonaLabels }> = {
  king: {
    he: { name: "המלך הפילוסוף", short: "המלך", bare: "מלך הפילוסוף" },
    en: { name: "The Philosopher King", short: "the King", bare: "the Philosopher King" },
  },
  referent: {
    he: { name: "הרפרנט", short: "הרפרנט", bare: "רפרנט" },
    en: { name: "The Referent", short: "the Referent", bare: "the Referent" },
  },
};

/** The other persona — the one you'd switch to. */
export function otherPersona(persona: Persona): Persona {
  return persona === "referent" ? "king" : "referent";
}

/** Every name the UI needs for a persona, in the current locale. */
export function personaLabels(persona: Persona, isHe: boolean): PersonaLabels {
  return NAMES[persona][isHe ? "he" : "en"];
}

/**
 * Substitute the `{advisor}` token in a copy string with the chosen advisor's
 * name. Call sites write "שאלו את {advisor} על זה" instead of hardcoding
 * "המלך", so a Referent user never reads the King's name.
 */
export function withAdvisorName(text: string, advisor: string): string;
export function withAdvisorName(text: undefined, advisor: string): undefined;
export function withAdvisorName(text: string | undefined, advisor: string): string | undefined;
export function withAdvisorName(text: string | undefined, advisor: string): string | undefined {
  return text?.replaceAll("{advisor}", advisor);
}
