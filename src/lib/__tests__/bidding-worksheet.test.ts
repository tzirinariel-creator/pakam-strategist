import { describe, it, expect } from "vitest";
import {
  checkAllocations,
  parseWorksheet,
  buildCheatSheet,
  worksheetStorageKey,
  MIN_BID,
} from "@/lib/bidding-worksheet";

describe("checkAllocations", () => {
  it("sums points and computes the remaining pool", () => {
    const c = checkAllocations(100, [
      { courseCode: "A", points: 40 },
      { courseCode: "B", points: 35 },
    ]);
    expect(c.total).toBe(75);
    expect(c.remaining).toBe(25);
    expect(c.overPool).toBe(false);
    expect(c.issues).toHaveLength(0);
  });

  it("flags a bid below the 5-point floor (TAU rule)", () => {
    const c = checkAllocations(100, [{ courseCode: "A", points: MIN_BID - 1 }]);
    expect(c.issues).toEqual([{ courseCode: "A", kind: "below-min" }]);
  });

  it("flags over-pool allocations", () => {
    const c = checkAllocations(50, [
      { courseCode: "A", points: 30 },
      { courseCode: "B", points: 30 },
    ]);
    expect(c.overPool).toBe(true);
    expect(c.remaining).toBe(-10);
  });

  it("flags non-integers and negatives", () => {
    const c = checkAllocations(100, [
      { courseCode: "A", points: 10.5 },
      { courseCode: "B", points: -3 },
    ]);
    expect(c.issues).toEqual([
      { courseCode: "A", kind: "not-integer" },
      { courseCode: "B", kind: "negative" },
    ]);
  });

  it("without a pool: no over-pool check, but the floor still applies", () => {
    const c = checkAllocations(null, [{ courseCode: "A", points: 3 }]);
    expect(c.remaining).toBeNull();
    expect(c.overPool).toBe(false);
    expect(c.issues).toEqual([{ courseCode: "A", kind: "below-min" }]);
    expect(c.minFloor).toBe(MIN_BID);
  });

  it("empty inputs are simply not bids", () => {
    const c = checkAllocations(100, [
      { courseCode: "A", points: null },
      { courseCode: "B", points: 10 },
    ]);
    expect(c.total).toBe(10);
    expect(c.minFloor).toBe(MIN_BID); // one bid course only
  });
});

describe("worksheet persistence", () => {
  it("round-trips through JSON and survives garbage", () => {
    const s = parseWorksheet(JSON.stringify({ pool: 120, rounds: { "1": { A: 40 } }, priorities: { A: "must" } }));
    expect(s.pool).toBe(120);
    expect(s.rounds["1"].A).toBe(40);
    expect(s.rounds["2"]).toEqual({});
    expect(s.priorities.A).toBe("must");
    expect(parseWorksheet("not-json").pool).toBeNull();
    expect(parseWorksheet(null).rounds["1"]).toEqual({});
  });

  it("storage key is scoped per year+semester", () => {
    expect(worksheetStorageKey(2, "FALL")).not.toBe(worksheetStorageKey(2, "SPRING"));
    expect(worksheetStorageKey(2, "FALL")).not.toBe(worksheetStorageKey(3, "FALL"));
  });
});

describe("buildCheatSheet", () => {
  it("lists only bid courses with codes, groups and the total", () => {
    const out = buildCheatSheet(true, "1", [
      { courseCode: "0651-1001", courseName: "מיקרו", groupLabel: "תרגיל ב׳", points: 40 },
      { courseCode: "0651-2002", courseName: "מאקרו", groupLabel: null, points: 25 },
      { courseCode: "0651-3003", courseName: "פילוסופיה", groupLabel: null, points: null },
    ]);
    expect(out).toContain("0651-1001");
    expect(out).toContain("תרגיל ב׳");
    expect(out).toContain("סה״כ: 65");
    expect(out).not.toContain("פילוסופיה");
  });
});
