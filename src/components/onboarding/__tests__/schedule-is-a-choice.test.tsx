/** @vitest-environment jsdom */
// =========================================================================
// Three screens, one answer to "what does this course cost me?" (22-6)
// =========================================================================
// Ariel, 22-5, on the catalog: "מה זה החלון לוז המטורף הזה שקופץ כשלחצתי על
// אקונומטריקה?" — a course with three lecture groups and eight tutorial groups
// rendered as twenty near-identical rows and read as "this course eats my
// whole week". Fixed there with `courseScheduleOutline`.
//
// Then 22-6: "מה שאין: תת-תפריט של רצועות-זמן בהוספת קורס." The SAME defect
// was still sitting in the planner's course popover — the one a student
// actually opens while deciding what to bid on — because the fix landed on the
// screen the report came from and not on the screen beside it.
//
// And the pool bubble printed the union of every row's day: three lecture
// groups on three days came out as "א׳ ב׳ ג׳", which reads as three days a
// week when the truth is one of the three. During bidding that is the
// difference between a course that fits and one that does not.
//
// So this pins the shared property rather than either screen's markup: the
// grouping helper is the single answer, and a multi-group course is described
// as a CHOICE.

import { describe, it, expect } from "vitest";
import { courseScheduleOutline, isChoice } from "@/lib/course-schedule-outline";

const s = (dayOfWeek: string, groupCode: string | null, sessionType = "lecture") => ({
  dayOfWeek, groupCode, sessionType,
  startTime: "08:00", endTime: "11:00",
  semester: null, room: null, building: null,
});

describe("a multi-group course is a choice, not a schedule", () => {
  it("collapses three lecture groups into one section of three options", () => {
    const outline = courseScheduleOutline([
      s("MONDAY", "01"), s("TUESDAY", "02"), s("THURSDAY", "03"),
    ]);
    expect(outline).toHaveLength(1);
    expect(outline[0]!.groups).toHaveLength(3);
    expect(isChoice(outline[0]!)).toBe(true);
  });

  it("does NOT call a single-group course a choice", () => {
    // The guard on the other side: a course that really does meet twice a week
    // must not be described as "pick one".
    const outline = courseScheduleOutline([s("MONDAY", "01"), s("WEDNESDAY", "01")]);
    expect(outline[0]!.groups).toHaveLength(1);
    expect(isChoice(outline[0]!)).toBe(false);
    expect(outline[0]!.groups[0]!.meetings).toHaveLength(2);
  });

  it("keeps a lecture and a tutorial as separate sections", () => {
    // Both are owed; only the groups WITHIN a section are alternatives.
    const outline = courseScheduleOutline([
      s("MONDAY", "01", "lecture"), s("SUNDAY", "01", "tutorial"), s("SUNDAY", "02", "tutorial"),
    ]);
    expect(outline).toHaveLength(2);
    const tutorial = outline.find((o) => o.sessionType === "tutorial")!;
    expect(isChoice(tutorial)).toBe(true);
    expect(isChoice(outline.find((o) => o.sessionType === "lecture")!)).toBe(false);
  });

  it("the bubble's day chip counts OPTIONS, not commitments", () => {
    // The exact case that overstated the week: three groups, three days.
    const sessions = [s("SUNDAY", "01"), s("MONDAY", "02"), s("TUESDAY", "03")];
    const outline = courseScheduleOutline(sessions);
    const uniqueDays = [...new Set(sessions.map((x) => x.dayOfWeek))];
    expect(uniqueDays).toHaveLength(3);
    // …but the student attends ONE of them, which is what `isChoice` reports
    // and what the chip now says out loud.
    expect(outline.some(isChoice)).toBe(true);
  });

  it("a course with no group codes is one group, not one per row", () => {
    // Otherwise every un-coded course would claim to offer a choice.
    const outline = courseScheduleOutline([s("MONDAY", null), s("MONDAY", "")]);
    expect(outline[0]!.groups).toHaveLength(1);
    expect(isChoice(outline[0]!)).toBe(false);
  });
});
