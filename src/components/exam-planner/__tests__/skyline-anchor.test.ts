// =========================================================================
// The skyline must open on a day that exists in it
// =========================================================================
// Caught live, at 375px, on the deployed site — and caused by an earlier fix
// in this same session, which is the point of writing it down.
//
// The grid window used to start at min(today, firstSession) and now starts at
// the plan. That was right: building a January plan in September no longer
// opens on fourteen empty week rows. But the skyline beside it scrolls by
// walking its own strip until it finds `isToday` — and once the window is
// anchored on the plan, today is usually NOT IN THE STRIP AT ALL. The loop
// then falls out of the bottom having added up every cell, and the offset it
// returns is the full width of the strip.
//
// Measured on production before the fix: scrollLeft -809 of a maximum -809.
// The exam planner opened on a phone at the LAST day of the exam period, with
// the "מתחילים כאן" flag 700px behind the student, off-screen, in a container
// most people will not think to scroll sideways.
//
// Two correct changes, each tested, combining into a broken screen. So this
// pins the property that spans them: whatever the offset is, it points at a
// day the strip actually contains.

import { describe, it, expect } from "vitest";

type Item =
  | { kind: "day"; key: string; isToday: boolean; isFirstStudy: boolean }
  | { kind: "rest"; key: string };

const CELL = 34, REST = 52, GAP = 6;

/** Exactly what study-skyline.tsx computes. */
function anchorOffset(items: Item[]) {
  const anchorAt = (pick: (i: Extract<Item, { kind: "day" }>) => boolean) => {
    let off = 0;
    for (const item of items) {
      if (item.kind === "day" && pick(item)) return off;
      off += (item.kind === "rest" ? REST : CELL) + GAP;
    }
    return null;
  };
  const offset = anchorAt((i) => i.isToday) ?? anchorAt((i) => i.isFirstStudy) ?? 0;
  return Math.max(0, offset - 1.5 * (CELL + GAP));
}

/** The version that shipped, kept as the witness. */
function oldOffset(items: Item[]) {
  let off = 0;
  for (const item of items) {
    if (item.kind === "day" && item.isToday) break;
    off += (item.kind === "rest" ? REST : CELL) + GAP;
  }
  return Math.max(0, off - 1.5 * (CELL + GAP));
}

const day = (key: string, o: Partial<Item> = {}): Item =>
  ({ kind: "day", key, isToday: false, isFirstStudy: false, ...o }) as Item;

/** A January plan viewed in September: today is not in the window. */
const JANUARY = [
  ...Array.from({ length: 8 }, (_, i) => day(`d${i}`)),
  day("first", { isFirstStudy: true }),
  ...Array.from({ length: 20 }, (_, i) => day(`e${i}`)),
];
const STRIP_WIDTH = JANUARY.length * (CELL + GAP);

describe("the skyline anchors on a day it contains", () => {
  it("lands on the first study day when today is outside the window", () => {
    const off = anchorOffset(JANUARY);
    const firstStudyAt = 8 * (CELL + GAP);
    expect(off).toBeLessThanOrEqual(firstStudyAt);
    expect(off).toBeGreaterThanOrEqual(firstStudyAt - 1.5 * (CELL + GAP) - 1);
  });

  it("no longer scrolls past the end of the strip", () => {
    // The witness: the old loop returned the whole strip's width, which every
    // browser clamps to "as far right as it goes".
    expect(oldOffset(JANUARY)).toBeGreaterThan(STRIP_WIDTH * 0.8);
    expect(anchorOffset(JANUARY)).toBeLessThan(STRIP_WIDTH * 0.4);
  });

  it("still prefers today when today IS in the window", () => {
    // The behaviour the old code was written for must survive the fix.
    const items = [...Array.from({ length: 5 }, (_, i) => day(`p${i}`)),
      day("first", { isFirstStudy: true }),
      ...Array.from({ length: 4 }, (_, i) => day(`q${i}`)),
      day("today", { isToday: true }),
      ...Array.from({ length: 6 }, (_, i) => day(`r${i}`))];
    const todayAt = 10 * (CELL + GAP);
    expect(anchorOffset(items)).toBeCloseTo(Math.max(0, todayAt - 1.5 * (CELL + GAP)), 5);
  });

  it("counts rest columns at their own width", () => {
    // A rest block is wider than a day. Measuring it as a day would drift the
    // anchor left by 18px per rest, which is how "close enough" becomes wrong.
    const items: Item[] = [day("a"), { kind: "rest", key: "r" }, day("b", { isFirstStudy: true })];
    expect(anchorOffset(items)).toBeCloseTo(Math.max(0, (CELL + GAP) + (REST + GAP) - 1.5 * (CELL + GAP)), 5);
  });

  it("starts at zero when there is no today and no studying yet", () => {
    expect(anchorOffset([day("a"), day("b"), day("c")])).toBe(0);
  });
});
