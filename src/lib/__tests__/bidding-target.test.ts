import { describe, it, expect } from "vitest";
import { getBiddingTarget } from "@/lib/bidding-target";

// PPE is a 3-YEAR degree — the guard was `> 4`, so a graduating year-3 student
// in July saw a bidding block for a nonexistent "year 4" semester (12.7 #13/#15
// deep-verify, 14.7). These lock the degree-length rule.
describe("getBiddingTarget — degree length", () => {
  const JULY = new Date("2026-07-14T10:00:00");

  it("a year-3 student after spring has NO next bidding round (no year 4)", () => {
    // startYear 2023 → year 3 in 2025-26; next fall would be year 4 → null.
    expect(getBiddingTarget(2023, 3, JULY)).toBeNull();
  });

  it("a year-2 student after spring targets FALL of year 3", () => {
    const t = getBiddingTarget(2024, 2, JULY);
    expect(t).not.toBeNull();
    expect(t!.yearOfStudy).toBe(3);
    expect(t!.semester).toBe("FALL");
  });

  it("a year-1 student mid-fall targets SPRING of the same year", () => {
    const midFall = new Date("2025-11-15T10:00:00");
    const t = getBiddingTarget(2025, 1, midFall);
    expect(t).not.toBeNull();
    expect(t!.yearOfStudy).toBe(1);
    expect(t!.semester).toBe("SPRING");
  });
});
