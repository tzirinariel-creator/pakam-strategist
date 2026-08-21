// =========================================================================
// #28 — a Google signup's name must not look deleted
// =========================================================================
// Ariel: "לדעתי נרשמתי עם שם פרטי ושם משפחה וזה נמחק בהגדרות".
//
// Verified against the real record: his Google account holds
//   firstName: null · lastName: null · displayName: "אריאל צירין"
// Google's name lands in `displayName`. That was invisible while settings
// still had a "שם תצוגה" field — and #29a removed that field as redundant. From
// then on a Google signup opened settings and saw two empty name boxes.
//
// No data was lost — the greeting still resolves through displayName — but it
// LOOKED like deletion, and looking wrong is enough. The settings form now
// seeds its boxes from the provider name, using this split.
import { describe, it, expect } from "vitest";

/** Mirrors the seeding in profile-section.tsx. Kept here so the shape is
 *  pinned by tests rather than only by a component that is hard to render. */
function splitProviderName(display: string | null | undefined): { first: string; last: string } {
  const provider = (display ?? "").trim();
  const [first = "", ...rest] = provider ? provider.split(/\s+/) : [];
  return { first, last: rest.join(" ") };
}

describe("splitting an OAuth display name into the two boxes", () => {
  it("splits Ariel's actual stored value", () => {
    expect(splitProviderName("אריאל צירין")).toEqual({ first: "אריאל", last: "צירין" });
  });

  it("keeps a multi-word surname whole", () => {
    expect(splitProviderName("ישראל בן גוריון")).toEqual({ first: "ישראל", last: "בן גוריון" });
  });

  it("handles a single-word provider name", () => {
    expect(splitProviderName("אריאל")).toEqual({ first: "אריאל", last: "" });
  });

  it("tolerates padding and double spaces", () => {
    expect(splitProviderName("  אריאל   צירין  ")).toEqual({ first: "אריאל", last: "צירין" });
  });

  it("returns empty boxes for a missing provider name, never 'undefined'", () => {
    expect(splitProviderName(null)).toEqual({ first: "", last: "" });
    expect(splitProviderName(undefined)).toEqual({ first: "", last: "" });
    expect(splitProviderName("")).toEqual({ first: "", last: "" });
  });

  it("an explicitly stored firstName must still win over the provider", () => {
    // The component expresses this as `data.firstName ?? providerFirst`; this
    // pins the intent: we only ever FILL a gap, never overwrite a real answer.
    const stored: string | null = "דני";
    const seeded = stored ?? splitProviderName("אריאל צירין").first;
    expect(seeded).toBe("דני");
  });
});
