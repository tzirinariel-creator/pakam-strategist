import { describe, it, expect } from "vitest";
import { getWrapTarget, wrapStorageKey, isCurrentlyStudying } from "@/lib/semester-clock";

const at = (y: number, m: number, dd: number) => new Date(y, m - 1, dd, 12, 0, 0);

// Calendar (Theme II): FALL teaching ends 25.1.26, SPRING teaching ends 10.7.26.
describe("getWrapTarget", () => {
  it("null while classes are still running", () => {
    expect(getWrapTarget(at(2026, 1, 15))).toBeNull(); // fall teaching
    expect(getWrapTarget(at(2026, 7, 7))).toBeNull(); // spring teaching (last week)
  });

  it("null in the first days after teaching ends — no grades yet (<14d)", () => {
    expect(getWrapTarget(at(2026, 1, 30))).toBeNull(); // 5 days after fall end
    expect(getWrapTarget(at(2026, 7, 20))).toBeNull(); // 10 days after spring end
  });

  it("FALL wrap once grades open (teachingEnd + 14d)", () => {
    const w = getWrapTarget(at(2026, 2, 12)); // ~18 days after 25.1
    expect(w).toEqual({ semester: "FALL", key: "2025-FALL" });
  });

  it("SPRING wrap in the summer grade window", () => {
    const w = getWrapTarget(at(2026, 7, 28)); // 18 days after 10.7
    expect(w).toEqual({ semester: "SPRING", key: "2025-SPRING" });
  });

  it("does not linger into the next academic year (bounded by the calendar)", () => {
    // 18.10.26 = תשפ"ז FALL teaching begins → we're teaching again, no wrap.
    expect(getWrapTarget(at(2026, 10, 20))).toBeNull();
  });

  it("null when the date is outside every known calendar (stale)", () => {
    expect(getWrapTarget(at(2027, 12, 1))).toBeNull();
  });

  it("storage key is stable per semester", () => {
    expect(wrapStorageKey("2025-SPRING")).toBe("pakamon-wrap-2025-SPRING");
  });
});

describe("isCurrentlyStudying", () => {
  const fallTeaching = at(2026, 1, 15); // inside FALL teaching
  const springTeaching = at(2026, 7, 7); // inside SPRING teaching
  const stale = at(2027, 12, 1); // outside every known calendar

  const c = (over: Partial<{ plannedYear: number; plannedSemester: string; status: string }> = {}) => ({
    plannedYear: 2,
    plannedSemester: "FALL",
    status: "PLANNED",
    ...over,
  });

  it("true for a PLANNED course of the current year+semester during teaching", () => {
    expect(isCurrentlyStudying(c(), 2, fallTeaching)).toBe(true);
  });

  it("false for a different semester than the calendar's current one", () => {
    expect(isCurrentlyStudying(c({ plannedSemester: "SPRING" }), 2, fallTeaching)).toBe(false);
    expect(isCurrentlyStudying(c({ plannedSemester: "SPRING" }), 2, springTeaching)).toBe(true);
  });

  it("false for a different planned year", () => {
    expect(isCurrentlyStudying(c({ plannedYear: 1 }), 2, fallTeaching)).toBe(false);
  });

  it("false for a non-PLANNED status (already completed / failed)", () => {
    expect(isCurrentlyStudying(c({ status: "COMPLETED" }), 2, fallTeaching)).toBe(false);
  });

  it("false when the calendar is stale (dates can't be trusted)", () => {
    expect(isCurrentlyStudying(c(), 2, stale)).toBe(false);
  });
});
