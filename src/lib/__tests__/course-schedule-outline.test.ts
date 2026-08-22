import { describe, it, expect } from "vitest";
import { courseScheduleOutline, isChoice } from "@/lib/course-schedule-outline";

const s = (
  dayOfWeek: string,
  startTime: string,
  endTime: string,
  sessionType: string,
  groupCode: string | null = null,
  semester: string | null = null,
) => ({ dayOfWeek, startTime, endTime, sessionType, groupCode, semester });

describe("courseScheduleOutline", () => {
  it("turns אקונומטריקה's twenty flat rows into two choices", () => {
    // The shape Ariel opened: three lecture groups at the SAME hour on
    // different days, plus tutorials. Flat, the three lectures read as one
    // repeated line; grouped, they read as what they are — alternatives.
    const out = courseScheduleOutline([
      s("MONDAY", "08:00", "11:00", "LECTURE", "01"),
      s("TUESDAY", "08:00", "11:00", "LECTURE", "02"),
      s("THURSDAY", "08:00", "11:00", "LECTURE", "03"),
      s("SUNDAY", "14:00", "16:00", "TUTORIAL", "11"),
      s("SUNDAY", "16:00", "18:00", "TUTORIAL", "12"),
    ]);

    expect(out.map((x) => x.sessionType)).toEqual(["LECTURE", "TUTORIAL"]);
    expect(out[0]!.groups.map((g) => g.groupCode)).toEqual(["01", "02", "03"]);
    expect(out.every(isChoice)).toBe(true);
  });

  it("keeps a group's several weekly meetings together", () => {
    // One group that meets twice is NOT two groups. Flattening lost this.
    const out = courseScheduleOutline([
      s("MONDAY", "08:00", "10:00", "LECTURE", "01"),
      s("WEDNESDAY", "10:00", "12:00", "LECTURE", "01"),
    ]);
    expect(out[0]!.groups).toHaveLength(1);
    expect(out[0]!.groups[0]!.meetings).toHaveLength(2);
    expect(isChoice(out[0]!)).toBe(false);
  });

  it("does not call a single group a choice", () => {
    // "1 קבוצות — בוחרים אחת" over a course with no alternative is noise, and
    // it is also untrue: there is nothing to pick.
    const out = courseScheduleOutline([s("MONDAY", "08:00", "10:00", "LECTURE", "01")]);
    expect(isChoice(out[0]!)).toBe(false);
  });

  it("collapses rows that carry no group code into one group", () => {
    // Part of the catalog has no group codes. One group per row would have
    // rendered the same wall, just with the wrong explanation over it.
    const out = courseScheduleOutline([
      s("MONDAY", "08:00", "10:00", "LECTURE", null),
      s("WEDNESDAY", "08:00", "10:00", "LECTURE", ""),
    ]);
    expect(out[0]!.groups).toHaveLength(1);
    expect(out[0]!.groups[0]!.groupCode).toBeNull();
    expect(out[0]!.groups[0]!.meetings).toHaveLength(2);
  });

  it("drops a duplicated row rather than showing the slot twice", () => {
    const out = courseScheduleOutline([
      s("MONDAY", "08:00", "11:00", "LECTURE", "01"),
      s("MONDAY", "08:00", "11:00", "LECTURE", "01"),
    ]);
    expect(out[0]!.groups[0]!.meetings).toHaveLength(1);
  });

  it("filters to one semester when asked, keeping un-stamped rows", () => {
    // A course given in both terms carries sessions for each; showing both in
    // one list is how a phantom week gets drawn.
    const out = courseScheduleOutline(
      [
        s("MONDAY", "08:00", "10:00", "LECTURE", "01", "FALL"),
        s("TUESDAY", "08:00", "10:00", "LECTURE", "02", "SPRING"),
        s("WEDNESDAY", "08:00", "10:00", "LECTURE", "03", null),
      ],
      "FALL",
    );
    expect(out[0]!.groups.map((g) => g.groupCode)).toEqual(["01", "03"]);
  });

  it("puts lectures before tutorials whatever order they arrive in", () => {
    const out = courseScheduleOutline([
      s("SUNDAY", "14:00", "16:00", "TUTORIAL", "11"),
      s("MONDAY", "08:00", "11:00", "LECTURE", "01"),
    ]);
    expect(out.map((x) => x.sessionType)).toEqual(["LECTURE", "TUTORIAL"]);
  });

  it("returns nothing for a course with no sessions", () => {
    expect(courseScheduleOutline([])).toEqual([]);
  });
});
