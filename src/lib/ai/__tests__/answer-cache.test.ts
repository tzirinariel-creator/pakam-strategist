import { describe, it, expect, beforeEach, vi } from "vitest";
import { hashContext, readCachedAnswer, writeCachedAnswer } from "@/lib/ai/answer-cache";
import type { QAContext } from "@/lib/degree-qa";

function ctx(over: Partial<QAContext> = {}): QAContext {
  return {
    isHe: true,
    effectiveTotal: 96,
    earned: 75,
    planned: 13,
    miluimExemption: 8,
    mandatory: 80,
    elective: 8,
    seminar: 0,
    focusAreaCredits: 38,
    focusAreaTarget: 60,
    englishCourseCount: 3,
    courseAverage: 84,
    hasFocusArea: true,
    focusAreaNameHe: "כלכלה",
    focusAreaNameEn: "Economics",
    currentYear: 2,
    amiramScore: 133,
    miluimGroupName: "קבוצה C",
    binaryRemaining: 5,
    failedRules: [],
    seminarPlannedCount: 0,
    ...over,
  };
}

// Minimal localStorage stub for the node test environment.
beforeEach(() => {
  const store = new Map<string, string>();
  const ls = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
  vi.stubGlobal("window", { localStorage: ls });
  vi.stubGlobal("localStorage", ls);
});

describe("hashContext", () => {
  it("is deterministic for the same plan", () => {
    expect(hashContext(ctx())).toBe(hashContext(ctx()));
  });

  it("changes when the plan changes", () => {
    expect(hashContext(ctx())).not.toBe(hashContext(ctx({ earned: 76 })));
    expect(hashContext(ctx())).not.toBe(hashContext(ctx({ courseAverage: 85 })));
    expect(hashContext(ctx())).not.toBe(hashContext(ctx({ isHe: false })));
  });

  it("changes when englishLevel / gender / focus discipline change (King-audit 22.7 — these were COLLIDING, letting a stale answer resurface)", () => {
    const base = hashContext(ctx());
    // Declared englishLevel overrides the amiram score everywhere — a change
    // (e.g. the King marking EXEMPT) must invalidate the cached English answer.
    expect(base).not.toBe(hashContext(ctx({ englishLevel: "EXEMPT" })));
    // A gender change must not serve a wrongly-gendered cached answer…
    expect(base).not.toBe(hashContext(ctx({ gender: "female" })));
    // …nor a focus-area switch (same 0 credits) a wrong-discipline answer.
    expect(base).not.toBe(hashContext(ctx({ focusAreaNameHe: "פילוסופיה" })));
  });
});

describe("answer cache", () => {
  it("returns a cached answer for the same question + plan", () => {
    const h = hashContext(ctx());
    writeCachedAnswer("כדאי בינארי?", h, "כן, שווה לשקול.");
    expect(readCachedAnswer("כדאי בינארי?", h)).toBe("כן, שווה לשקול.");
    // Normalization: whitespace/case-insensitive key.
    expect(readCachedAnswer("  כדאי   בינארי?  ", h)).toBe("כן, שווה לשקול.");
  });

  it("misses (and never resurfaces) once the plan changed", () => {
    const h1 = hashContext(ctx());
    writeCachedAnswer("מה עדיף?", h1, "תשובה ישנה");
    const h2 = hashContext(ctx({ earned: 90 }));
    expect(readCachedAnswer("מה עדיף?", h2)).toBeNull();
    // Writing under the new plan resets the store — the old answer is gone.
    writeCachedAnswer("שאלה אחרת", h2, "חדש");
    expect(readCachedAnswer("מה עדיף?", h1)).toBeNull();
  });
});
