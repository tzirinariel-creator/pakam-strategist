// Q10 (note 12) — the "יום צפוף" tip must fire ONLY when the computed density
// crosses the threshold, and the number it quotes must be the real computed
// run — never an invented "8 hours".

import { describe, it, expect } from "vitest";
import {
  maxConsecutiveBusyHours,
  findDenseDay,
  DENSE_DAY_THRESHOLD_HOURS,
} from "@/lib/schedule-density";

const busy = (n: number) => Array(n).fill(1);
const free = (n: number) => Array(n).fill(0);

describe("maxConsecutiveBusyHours", () => {
  it("counts the longest run, resetting across gaps", () => {
    // 3 busy, break, 2 busy → longest run is 3, not 5.
    expect(maxConsecutiveBusyHours([...busy(3), 0, ...busy(2)])).toBe(3);
  });
  it("an empty day is 0", () => {
    expect(maxConsecutiveBusyHours(free(12))).toBe(0);
    expect(maxConsecutiveBusyHours([])).toBe(0);
  });
  it("overlapping sessions (slot value 2) still count as one busy hour", () => {
    expect(maxConsecutiveBusyHours([2, 2, 1, 0])).toBe(3);
  });
});

describe("findDenseDay — fires only past the threshold", () => {
  it("3 near-back-to-back hours does NOT fire (below the 4h threshold)", () => {
    const week = [ [...busy(3), ...free(9)], free(12), free(12), free(12), free(12) ];
    expect(findDenseDay(week)).toBeNull();
  });

  it("exactly 4 consecutive hours fires, quoting the REAL computed count", () => {
    const week = [ free(12), [...busy(4), ...free(8)], free(12), free(12), free(12) ];
    expect(findDenseDay(week)).toEqual({ dayIndex: 1, hours: 4 });
  });

  it("a broken-up heavy day (3h + gap + 3h) does not fire — breaks matter", () => {
    const week = [ [...busy(3), 0, ...busy(3), ...free(5)], free(12), free(12), free(12), free(12) ];
    expect(findDenseDay(week)).toBeNull();
  });

  it("an 8-hour marathon quotes 8 — the number IS the data (note 12)", () => {
    const week = [ free(12), free(12), [...busy(8), ...free(4)], free(12), free(12) ];
    expect(findDenseDay(week)).toEqual({ dayIndex: 2, hours: 8 });
  });

  it("threshold constant is what the product promises (4h)", () => {
    expect(DENSE_DAY_THRESHOLD_HOURS).toBe(4);
  });
});
