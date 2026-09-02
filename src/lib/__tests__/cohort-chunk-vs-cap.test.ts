// =========================================================================
// The catalog asked for 304 and the server allows 200
// =========================================================================
// Found by reading the network panel on /catalog, not from a report — because
// there was nothing to report. `courseKnowledge.getForCourses` is capped at 200
// course codes on the server, a sensible guard on an endpoint that reads the
// whole cohort archive. The catalog sent all 304 of them, so the request came
// back 400 EVERY TIME, and the cohort chips have never once appeared for anyone
// on that screen.
//
// Nothing said so. The query failed, the component rendered its no-data branch,
// and a missing chip is indistinguishable from a course nobody has reviewed.
// The only visible traces were a 207 on the batch and a line in the server log.
//
// Two numbers in two files have to agree, and neither knows about the other.
// That is what this test is: the client's chunk must never exceed the server's
// cap. Grow the catalog, tighten the guard — one of them will trip this.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const router = readFileSync(join(process.cwd(), "src/server/routers/course-knowledge.ts"), "utf8");
const table = readFileSync(join(process.cwd(), "src/components/catalog/course-table.tsx"), "utf8");

/** The `.max(N)` the server puts on the courseCodes ARRAY.
 *  The line nests parens — `z.array(z.string().min(1).max(30)).min(1).max(200)` —
 *  so take the whole line and read its LAST .max(), which is the array's. */
function serverCap(): number {
  const line = router.split("\n").find((l) => /courseCodes:\s*z\.array\(/.test(l));
  if (!line) return NaN;
  const all = [...line.matchAll(/\.max\((\d+)\)/g)];
  return all.length ? Number(all[all.length - 1]![1]) : NaN;
}
/** The chunk size the catalog slices with. */
function clientChunk(): number {
  const m = /const CHUNK\s*=\s*(\d+)/.exec(table);
  return m ? Number(m[1]) : NaN;
}

describe("the catalog never asks for more than the server allows", () => {
  it("finds both numbers", () => {
    expect(Number.isFinite(serverCap()), "server cap not found").toBe(true);
    expect(Number.isFinite(clientChunk()), "client chunk not found").toBe(true);
  });

  it("keeps the chunk at or under the cap", () => {
    // The bug: 304 > 200. Every catalog load, a silent 400.
    expect(clientChunk()).toBeLessThanOrEqual(serverCap());
  });

  it("still chunks at all — one request for the whole catalog is the bug", () => {
    expect(table).toMatch(/slice\(0,\s*CHUNK\)/);
    expect(table).toMatch(/slice\(CHUNK,\s*CHUNK\s*\*\s*2\)/);
  });

  it("covers a catalog of at least the size we ship", () => {
    // Two chunks of 200 cover 400. CATALOG_COURSE_COUNT is 304 today and only
    // grows; if it ever passes 2×CHUNK the third chunk is silently dropped and
    // those courses lose their cohort data with no error. Catch it here.
    const constants = readFileSync(join(process.cwd(), "src/lib/constants.ts"), "utf8");
    const count = Number(/CATALOG_COURSE_COUNT\s*=\s*(\d+)/.exec(constants)?.[1]);
    expect(Number.isFinite(count)).toBe(true);
    expect(count, `catalog has ${count} courses; two chunks cover ${clientChunk() * 2}`)
      .toBeLessThanOrEqual(clientChunk() * 2);
  });
});
