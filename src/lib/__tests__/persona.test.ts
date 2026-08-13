// =========================================================================
// The advisor-persona resolver (lib/persona.ts).
//
// This module is the single answer to "who is the advisor?" — the question the
// app used to answer separately in seven components, which is how a student who
// had chosen הרפרנט kept meeting the King ("רגע של המלך", "היי, אני המלך
// הפילוסוף", "שאל את המלך על זה"). Locking the resolution rules here so a
// future component cannot quietly re-invent them.
// =========================================================================
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  PERSONA_KEY,
  normalizePersona,
  otherPersona,
  personaLabels,
  readStoredPersona,
  withAdvisorName,
  writeStoredPersona,
} from "@/lib/persona";

// A minimal localStorage stand-in (this suite runs in the node env).
function installStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
  return map;
}

afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe("normalizePersona — the King is the default, structurally", () => {
  it("only the exact string 'referent' is the Referent", () => {
    expect(normalizePersona("referent")).toBe("referent");
    for (const raw of ["king", "", "Referent", "REFERENT", "referent ", "rf", null, undefined]) {
      expect(normalizePersona(raw)).toBe("king");
    }
  });
});

describe("storage round-trip", () => {
  beforeEach(() => installStorage());

  it("reads the stored choice", () => {
    expect(readStoredPersona()).toBe("king");
    writeStoredPersona("referent");
    expect(readStoredPersona()).toBe("referent");
  });

  it("writing 'king' REMOVES the key — a default choice looks like no choice", () => {
    const map = installStorage({ [PERSONA_KEY]: "referent" });
    writeStoredPersona("king");
    expect(map.has(PERSONA_KEY)).toBe(false);
    expect(readStoredPersona()).toBe("king");
  });

  it("never throws when storage is blocked (private mode / SSR) — falls back to the King", () => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
      removeItem() {
        throw new Error("blocked");
      },
    };
    expect(readStoredPersona()).toBe("king");
    expect(() => writeStoredPersona("referent")).not.toThrow();
  });

  it("reads as the King when there is no localStorage at all (server render)", () => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
    expect(readStoredPersona()).toBe("king");
  });
});

describe("names — one place, so no surface can drift", () => {
  it("gives each persona its full name and a mid-sentence short form", () => {
    expect(personaLabels("king", true)).toEqual({
      name: "המלך הפילוסוף",
      short: "המלך",
      bare: "מלך הפילוסוף",
    });
    expect(personaLabels("referent", true)).toEqual({
      name: "הרפרנט",
      short: "הרפרנט",
      bare: "רפרנט",
    });
    expect(personaLabels("king", false).name).toBe("The Philosopher King");
    expect(personaLabels("referent", false).name).toBe("The Referent");
  });

  it("the `bare` form exists so Hebrew prepositions contract correctly", () => {
    // #24 — the switch toast once read "להרפרנט", which is not a word.
    for (const p of ["king", "referent"] as const) {
      const bare = personaLabels(p, true).bare;
      expect(bare.startsWith("ה")).toBe(false);
      expect(`ל${bare}`).not.toContain("לה");
    }
  });

  it("otherPersona is the one a switch affordance offers", () => {
    expect(otherPersona("king")).toBe("referent");
    expect(otherPersona("referent")).toBe("king");
  });
});

describe("withAdvisorName — call sites write {advisor}, never a hardcoded name", () => {
  it("substitutes every occurrence", () => {
    expect(withAdvisorName("שאלו את {advisor} על זה", "הרפרנט")).toBe("שאלו את הרפרנט על זה");
    expect(withAdvisorName("{advisor} ו{advisor}", "המלך")).toBe("המלך והמלך");
  });

  it("passes through text without the token, and undefined stays undefined", () => {
    expect(withAdvisorName("בלי טוקן", "המלך")).toBe("בלי טוקן");
    expect(withAdvisorName(undefined, "המלך")).toBeUndefined();
  });
});
