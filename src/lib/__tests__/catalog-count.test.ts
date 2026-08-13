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
});
