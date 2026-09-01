import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CATALOG_COURSE_COUNT } from "@/lib/constants";

/**
 * Guard for the stale marketing number (Ariel, 13.8).
 *
 * The landing page advertised "מעל 110 קורסים" and a "110+" stat long after the
 * תשפ״ז migration had taken the catalog to 302. Three copies of the figure, none
 * attached to anything that could tell them they were wrong.
 *
 * This pins the constant to the actual parsed yedion, so the next migration
 * fails a test instead of quietly publishing a false claim.
 */
describe("CATALOG_COURSE_COUNT is pinned to the real תשפ״ז catalog", () => {
  it("matches the parsed yedion exactly", () => {
    const parsed = JSON.parse(
      readFileSync(join(process.cwd(), "scripts/yedion_classified.json"), "utf8"),
    ) as unknown[];
    expect(CATALOG_COURSE_COUNT).toBe(parsed.length);
  });

  it("no landing string states a course count in prose", () => {
    // The reason the previous version of this bug survived: the test read the
    // CONSTANT and the marketing sentence was a separate copy of the number.
    // "כל 302 הקורסים" would have gone stale on the next migration with this
    // file still green. Any three-digit run inside landing.* is now a failure —
    // the count belongs in an ICU {count} placeholder, fed from the constant.
    for (const locale of ["he", "en"]) {
      const messages = JSON.parse(
        readFileSync(join(process.cwd(), `src/messages/${locale}.json`), "utf8"),
      ) as { landing?: Record<string, unknown> };
      const offenders: string[] = [];
      const walk = (node: unknown, path: string) => {
        if (typeof node === "string") {
          if (/(?<!\{)\b\d{3}\b(?!\})/.test(node)) offenders.push(`${path}: ${node.slice(0, 70)}`);
          return;
        }
        if (node && typeof node === "object") {
          for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`);
        }
      };
      walk(messages.landing ?? {}, `${locale}.landing`);
      expect(offenders).toEqual([]);
    }
  });
});
