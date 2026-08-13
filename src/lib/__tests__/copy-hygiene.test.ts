import { describe, it, expect } from "vitest";
import he from "@/messages/he.json";
import en from "@/messages/en.json";

/**
 * Copy-hygiene guard (text sweep, 13.8).
 *
 * Ariel's standing copy rules keep getting re-broken one string at a time, so
 * they are locked here instead of living in a review checklist:
 *   1. NO emoji in product copy.
 *   2. ש״ס with gershayim — never נ"ז, never a straight-quote ש"ס.
 *   3. Hebrew product copy is PLURAL (אתם/שלכם); the singular advisor voice
 *      belongs to the 1:1 chat, not to the message catalog. The one legitimate
 *      exception is the landing page's SAMPLE advisor answer.
 *   4. No numeric range (e.g. "50–150") left where a reader gets it reversed —
 *      those strings must be rendered through <Bidi>, so each one is listed
 *      here on purpose with the component that isolates it.
 */

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

function flatten(obj: Json, prefix = "", out = new Map<string, string>()): Map<string, string> {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    if (prefix) out.set(prefix, String(obj));
    return out;
  }
  for (const [key, value] of Object.entries(obj)) {
    flatten(value as Json, prefix ? `${prefix}.${key}` : key, out);
  }
  return out;
}

const HE = flatten(he as Json);
const EN = flatten(en as Json);
const ALL = [...HE, ...EN];

// Pictographs only. Typographic marks that carry meaning in a table (✓, ☐, ·,
// arrows) are NOT emoji and are deliberately allowed.
const EMOJI =
  /[\u{1F300}-\u{1FAFF}\u{1F900}-\u{1F9FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;

describe("copy hygiene — product strings", () => {
  it("contains no emoji", () => {
    const offenders = ALL.filter(([, v]) => EMOJI.test(v)).map(([k, v]) => `${k}: ${v}`);
    expect(offenders, `Emoji found in product copy:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("never uses נ\"ז, and always writes ש״ס with gershayim", () => {
    const offenders = [...HE]
      .filter(([, v]) => /נ["״]ז/.test(v) || /ש"ס/.test(v))
      .map(([k, v]) => `${k}: ${v}`);
    expect(offenders, `Credit-unit drift:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("keeps Hebrew product copy in the plural voice", () => {
    // The landing page prints a SAMPLE answer from the advisor, whose voice is
    // singular and gendered by design (CLAUDE.md). Everything else is plural.
    const ADVISOR_VOICE = new Set(["landing.king.chatA", "mentor.you"]);
    const SINGULAR = /(שלך|אליך|אותך|עליך|ברצונך)/;
    const offenders = [...HE]
      .filter(([k, v]) => !ADVISOR_VOICE.has(k) && SINGULAR.test(v))
      .map(([k, v]) => `${k}: ${v}`);
    expect(offenders, `Singular address in product copy:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("only carries a bidi-risky numeric range in strings that are rendered through <Bidi>", () => {
    // A "50–150" inside RTL Hebrew reorders to "150–50" unless it is isolated.
    // Each key below is rendered with <Bidi>; anything NEW showing up here must
    // either be wrapped too, or reworded.
    const ISOLATED_AT_RENDER = new Set([
      "settings.amirantScoreHint", // settings/profile-section.tsx → <Bidi>
      "record.gradeAria", // aria-label only — never painted
      "onboarding.historyGradeAria", // aria-label only — never painted
    ]);
    const RANGE = /[0-9]\s*[-–—]\s*[0-9]/;
    const offenders = [...HE]
      .filter(([k, v]) => RANGE.test(v) && !ISOLATED_AT_RENDER.has(k))
      .map(([k, v]) => `${k}: ${v}`);
    expect(offenders, `Unisolated numeric range:\n${offenders.join("\n")}`).toEqual([]);
  });
});
