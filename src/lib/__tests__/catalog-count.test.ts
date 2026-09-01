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
 * And then it happened again, the same way, through a door this file left open.
 *
 * It asserted EQUALITY with scripts/yedion_classified.json — a parse snapshot
 * taken once, not the catalog. The catalog kept moving (304 active courses by
 * 2.9), the snapshot did not, and this test stayed green while the landing page
 * printed 302 to 24 real students. A guard pointed at the wrong source is worse
 * than no guard, because it is believed.
 *
 * A vitest run cannot reach the database, so it cannot check the exact number.
 * What it CAN do honestly is hold the floor — the catalog never shrinks below
 * the snapshot it was seeded from. The exact figure is verified against the
 * live catalog by `npx tsx scripts/verify-catalog-facts.ts`, which now reads
 * this constant instead of repeating it.
 */
describe("CATALOG_COURSE_COUNT is pinned to the real תשפ״ז catalog", () => {
  it("is never below the parsed תשפ״ז yedion", () => {
    const parsed = JSON.parse(
      readFileSync(join(process.cwd(), "scripts/yedion_classified.json"), "utf8"),
    ) as unknown[];
    expect(CATALOG_COURSE_COUNT).toBeGreaterThanOrEqual(parsed.length);
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
