import { describe, it, expect } from "vitest";
import he from "@/messages/he.json";
import en from "@/messages/en.json";

/**
 * i18n parity guard.
 *
 * The app ships two locales (Hebrew + English). Every translation key must
 * exist in BOTH message files — a key present in one locale but missing in the
 * other means a user on that locale sees a raw key (or a runtime miss) instead
 * of real copy. This test deep-flattens both files into dot-path key sets and
 * asserts they are IDENTICAL, failing with an explicit list of any drift.
 *
 * If this fails, the fix is almost always to ADD the missing key to the
 * lagging message file — not to weaken this test.
 */

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** Recursively collect every leaf key as a dot-path (e.g. "mentor.errors.retry"). */
function flattenKeys(obj: Json, prefix = "", out = new Set<string>()): Set<string> {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    // Leaf value — record the path that led here.
    if (prefix) out.add(prefix);
    return out;
  }
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    flattenKeys(value as Json, path, out);
  }
  return out;
}

/**
 * Intentional locale-specific keys, if any ever arise (e.g. a language-name
 * label that only makes sense in one locale). Prefer strict parity — keep this
 * empty unless a key is genuinely meant to exist in only one file, and document
 * why next to it.
 */
const ALLOWLIST: ReadonlySet<string> = new Set<string>([]);

describe("i18n message parity (he.json ↔ en.json)", () => {
  const heKeys = flattenKeys(he as Json);
  const enKeys = flattenKeys(en as Json);

  const missingInEn = [...heKeys]
    .filter((k) => !enKeys.has(k) && !ALLOWLIST.has(k))
    .sort();
  const missingInHe = [...enKeys]
    .filter((k) => !heKeys.has(k) && !ALLOWLIST.has(k))
    .sort();

  it("has no keys present in he.json but missing from en.json", () => {
    expect(
      missingInEn,
      `Keys in he.json missing from en.json:\n${missingInEn.join("\n")}`
    ).toEqual([]);
  });

  it("has no keys present in en.json but missing from he.json", () => {
    expect(
      missingInHe,
      `Keys in en.json missing from he.json:\n${missingInHe.join("\n")}`
    ).toEqual([]);
  });

  it("has identical key sets across both locales", () => {
    const allowed = (k: string) => !ALLOWLIST.has(k);
    expect([...heKeys].filter(allowed).sort()).toEqual(
      [...enKeys].filter(allowed).sort()
    );
  });
});
