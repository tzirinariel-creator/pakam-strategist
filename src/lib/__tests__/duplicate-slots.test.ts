// =========================================================================
// One block per time slot, however many rows the ידיעון publishes
// =========================================================================
// Found by the reliability audit Ariel asked for ("מתי פעם אחרונה עשית לעצמך
// בדיקת מהימנות של כל הקורסים, כל השעות, כל המבחנים").
//
// The audit was looking for a group that clashes with ITSELF — the one clash a
// student cannot solve by choosing a different group. It reported 126, and
// every one of them read "16:00–18:00 מול 16:00–18:00". Not a clash: the same
// meeting, stored more than once.
//
// Comparing every column but the primary key: 190 of 556 schedule rows were
// exact duplicates, across 106 courses, one of them stored six times. Those
// were deleted from the database. What remains, and always will, is the source
// itself repeating: the ידיעון lists 0616-6037 in rooms 102 AND 106 at Monday
// 16:00, and 0651-2030 in rooms 305 AND 317. One class, two rows.
//
// A duplicated row is not cosmetic. Everything downstream counts rows: the
// grid draws one block each, the clash detector compares them to each other,
// the campus-day count adds them up. So the collapse belongs at the single
// point they all pass through.

import { describe, it, expect } from "vitest";
import { filterSessionsByGroups } from "@/lib/session-groups";

const s = (
  over: Partial<{
    dayOfWeek: string; startTime: string; endTime: string;
    sessionType: string; groupCode: string | null; room: string | null;
  }> = {},
) => ({
  dayOfWeek: "MONDAY",
  startTime: "16:00",
  endTime: "18:00",
  sessionType: "lecture",
  groupCode: "01",
  room: null,
  ...over,
});

describe("duplicate meetings collapse to one", () => {
  it("keeps ONE block when the ידיעון lists the same class in two rooms", () => {
    // 0616-6037, exactly as published: rooms 102 and 106, same hour.
    const out = filterSessionsByGroups([s({ room: "102" }), s({ room: "106" })], null);
    expect(out).toHaveLength(1);
  });

  it("keeps one block for an outright duplicate row", () => {
    expect(filterSessionsByGroups([s(), s(), s()], null)).toHaveLength(1);
  });

  it("does NOT collapse two real meetings of the same group", () => {
    // A group that genuinely meets twice a week must keep both — collapsing
    // those would hide half of a student's commitment.
    const out = filterSessionsByGroups(
      [s({ dayOfWeek: "MONDAY" }), s({ dayOfWeek: "WEDNESDAY" })],
      null,
    );
    expect(out).toHaveLength(2);
  });

  it("does NOT collapse two different hours on the same day", () => {
    const out = filterSessionsByGroups(
      [s({ startTime: "16:00", endTime: "18:00" }), s({ startTime: "18:00", endTime: "20:00" })],
      null,
    );
    expect(out).toHaveLength(2);
  });

  it("does NOT collapse a lecture and a tutorial that share an hour", () => {
    // Different session types at the same time are a real clash, and the
    // detector downstream must still be able to see both.
    const out = filterSessionsByGroups(
      [s({ sessionType: "lecture" }), s({ sessionType: "tutorial" })],
      null,
    );
    expect(out).toHaveLength(2);
  });

  it("still filters by the chosen group before collapsing", () => {
    // The collapse must not resurrect a group the student did not pick.
    const out = filterSessionsByGroups(
      [
        s({ sessionType: "tutorial", groupCode: "01" }),
        s({ sessionType: "tutorial", groupCode: "01", room: "x" }),
        s({ sessionType: "tutorial", groupCode: "02", startTime: "10:00", endTime: "12:00" }),
      ],
      { tutorial: "02" },
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.groupCode).toBe("02");
  });
});
