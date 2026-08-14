// =========================================================================
// planner-conflicts — the clash detector behind the planner's warning
// =========================================================================
// This module had NO test file, while being the thing that tells a student
// whether their week actually works. It got one the day a shared "HH:MM"
// parser replaced its local one and quietly changed what an unreadable time
// means here.
//
// The change was right in principle: the old parser turned "10:ab" into 10 and
// then reported a clash against an end time nobody printed — inventing a fact,
// which this app is not allowed to do. But dropping the meeting instead is only
// honest if the student is TOLD, and they weren't: `coursesWithoutTimes` counted
// "has any session row", so a course with one unreadable row was counted among
// the courses we supposedly had times for.
//
// These tests pin both halves: never invent a clash, and never hide the fact
// that we couldn't check something. The times arrive as raw strings off the
// ידיעון with no validation, and 75 of ~302 catalog courses already carry no
// hours at all, so unreadable input is the normal case, not the exotic one.
import { describe, it, expect } from "vitest";
import {
  detectPlannerConflicts,
  coursesWithoutTimes,
  conflictDayLabel,
} from "@/lib/planner-conflicts";
import type { CourseWithSchedule } from "@/lib/plan-generator";

/** A course with the few fields the detector actually reads. */
function course(
  code: string,
  nameHe: string,
  sessions: {
    dayOfWeek: string;
    startTime: string | null;
    endTime: string | null;
    sessionType?: string;
    groupCode?: string;
  }[],
): CourseWithSchedule {
  return {
    id: code,
    code,
    nameHe,
    nameEn: nameHe,
    scheduleSessions: sessions.map((s) => ({
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      sessionType: s.sessionType ?? "lecture",
      groupCode: s.groupCode ?? "01",
      room: null,
      building: null,
      lecturerName: null,
    })),
  } as unknown as CourseWithSchedule;
}

describe("detectPlannerConflicts — the ordinary cases", () => {
  it("reports two courses that overlap on the same day", () => {
    const conflicts = detectPlannerConflicts(
      [
        course("A", "מיקרו", [{ dayOfWeek: "TUESDAY", startTime: "10:00", endTime: "12:00" }]),
        course("B", "לוגיקה", [{ dayOfWeek: "TUESDAY", startTime: "11:00", endTime: "13:00" }]),
      ],
      true,
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.day).toBe("TUESDAY");
    expect([conflicts[0]!.aName, conflicts[0]!.bName].sort()).toEqual(["לוגיקה", "מיקרו"]);
  });

  it("reports the OVERLAP window, not either course's full span", () => {
    const [c] = detectPlannerConflicts(
      [
        course("A", "מיקרו", [{ dayOfWeek: "TUESDAY", startTime: "10:00", endTime: "12:00" }]),
        course("B", "לוגיקה", [{ dayOfWeek: "TUESDAY", startTime: "11:00", endTime: "13:00" }]),
      ],
      true,
    );
    expect(c!.time).toContain("11:00");
    expect(c!.time).toContain("12:00");
  });

  it("back-to-back is not a clash — 12:00 end meets 12:00 start", () => {
    expect(
      detectPlannerConflicts(
        [
          course("A", "מיקרו", [{ dayOfWeek: "TUESDAY", startTime: "10:00", endTime: "12:00" }]),
          course("B", "לוגיקה", [{ dayOfWeek: "TUESDAY", startTime: "12:00", endTime: "14:00" }]),
        ],
        true,
      ),
    ).toEqual([]);
  });

  it("the same hours on DIFFERENT days are not a clash", () => {
    expect(
      detectPlannerConflicts(
        [
          course("A", "מיקרו", [{ dayOfWeek: "TUESDAY", startTime: "10:00", endTime: "12:00" }]),
          course("B", "לוגיקה", [{ dayOfWeek: "WEDNESDAY", startTime: "10:00", endTime: "12:00" }]),
        ],
        true,
      ),
    ).toEqual([]);
  });

  it("ignores a day it cannot place on the grid (Saturday / garbage)", () => {
    expect(
      detectPlannerConflicts(
        [
          course("A", "מיקרו", [{ dayOfWeek: "SATURDAY", startTime: "10:00", endTime: "12:00" }]),
          course("B", "לוגיקה", [{ dayOfWeek: "SATURDAY", startTime: "10:00", endTime: "12:00" }]),
        ],
        true,
      ),
    ).toEqual([]);
  });
});

describe("detectPlannerConflicts — unreadable times are never guessed", () => {
  // The load-bearing case. "10:ab" used to be read as 10:00 and could produce a
  // clash against an end time that appears nowhere on the ידיעון. A warning we
  // invented is worse than no warning: the student reshuffles a real week
  // around a fake collision.
  it("never invents a clash from a malformed end time", () => {
    expect(
      detectPlannerConflicts(
        [
          course("A", "מיקרו", [{ dayOfWeek: "TUESDAY", startTime: "08:00", endTime: "10:ab" }]),
          course("B", "לוגיקה", [{ dayOfWeek: "TUESDAY", startTime: "09:00", endTime: "11:00" }]),
        ],
        true,
      ),
    ).toEqual([]);
  });

  it("does not throw on a null time (the old parser did)", () => {
    expect(() =>
      detectPlannerConflicts(
        [course("A", "מיקרו", [{ dayOfWeek: "TUESDAY", startTime: null, endTime: null }])],
        true,
      ),
    ).not.toThrow();
  });

  it("an empty string is unreadable, NOT midnight", () => {
    // "" used to become 0, placing a phantom meeting at 00:00 that could clash
    // with any other broken row parked there.
    expect(
      detectPlannerConflicts(
        [
          course("A", "מיקרו", [{ dayOfWeek: "TUESDAY", startTime: "", endTime: "" }]),
          course("B", "לוגיקה", [{ dayOfWeek: "TUESDAY", startTime: "", endTime: "" }]),
        ],
        true,
      ),
    ).toEqual([]);
  });

  it("a course's READABLE meeting still clashes even if another of its rows is broken", () => {
    // Dropping one bad row must not disarm the whole course.
    const conflicts = detectPlannerConflicts(
      [
        course("A", "מיקרו", [
          { dayOfWeek: "TUESDAY", startTime: "bad", endTime: "worse" },
          { dayOfWeek: "TUESDAY", startTime: "10:00", endTime: "12:00", sessionType: "tutorial" },
        ]),
        course("B", "לוגיקה", [{ dayOfWeek: "TUESDAY", startTime: "11:00", endTime: "13:00" }]),
      ],
      true,
    );
    expect(conflicts).toHaveLength(1);
  });
});

describe("coursesWithoutTimes — the number the student is shown", () => {
  // The planner prints "נבדק רק מול הקורסים שיש להם שעות (N בלי שעות ידועות)".
  // Every course the detector could not check has to be inside N, or that
  // sentence is false.
  it("counts a course with no session rows at all", () => {
    expect(coursesWithoutTimes([course("A", "מיקרו", [])])).toBe(1);
  });

  it("counts a course whose only session has an UNREADABLE time", () => {
    // This is the case that used to slip through: it has a row, so it was
    // counted as "we have times for it", while contributing nothing.
    expect(
      coursesWithoutTimes([
        course("A", "מיקרו", [{ dayOfWeek: "TUESDAY", startTime: "10:ab", endTime: "12:00" }]),
      ]),
    ).toBe(1);
  });

  it("does NOT count a course with at least one fully readable meeting", () => {
    expect(
      coursesWithoutTimes([
        course("A", "מיקרו", [
          { dayOfWeek: "TUESDAY", startTime: "bad", endTime: "12:00" },
          { dayOfWeek: "WEDNESDAY", startTime: "10:00", endTime: "12:00" },
        ]),
      ]),
    ).toBe(0);
  });

  it("counts null times too", () => {
    expect(
      coursesWithoutTimes([
        course("A", "מיקרו", [{ dayOfWeek: "TUESDAY", startTime: null, endTime: null }]),
      ]),
    ).toBe(1);
  });

  it("the count and the detector always agree about a broken course", () => {
    // The invariant the sentence depends on: a course that produces no slots is
    // a course the student is told about.
    const broken = course("A", "מיקרו", [
      { dayOfWeek: "TUESDAY", startTime: "10:ab", endTime: "12:00" },
    ]);
    const fine = course("B", "לוגיקה", [
      { dayOfWeek: "TUESDAY", startTime: "10:00", endTime: "12:00" },
    ]);
    expect(detectPlannerConflicts([broken, fine], true)).toEqual([]);
    expect(coursesWithoutTimes([broken, fine])).toBe(1);
  });
});

describe("conflictDayLabel", () => {
  it("names the day in Hebrew and English", () => {
    expect(conflictDayLabel("TUESDAY", true)).toBe("שלישי");
    expect(conflictDayLabel("TUESDAY", false)).toBe("Tuesday");
  });
});
