import { describe, it, expect } from "vitest";
import {
  buildGroupChoices,
  dayNameFor,
  describeGroupImpact,
  formatLocation,
  formatMeetings,
  resolveSelectedGroup,
  sessionTypeNameFor,
  toGroupMeetings,
} from "@/lib/group-options";
import type { SessionInfo } from "@/lib/conflict-detector";
import type { ScheduleSessionLike } from "@/lib/plan-generator";
import type { DayOfWeek } from "@/types/enums";

// ─── Fixtures ────────────────────────────────────────────────────────

function s(
  partial: Partial<ScheduleSessionLike> & Pick<ScheduleSessionLike, "dayOfWeek" | "startTime" | "endTime">,
): ScheduleSessionLike {
  return {
    sessionType: "tutorial",
    semester: "FALL",
    groupCode: "01",
    room: null,
    building: null,
    lecturerName: null,
    ...partial,
  };
}

function other(
  courseName: string,
  dayOfWeek: DayOfWeek,
  startTime: string,
  endTime: string,
): SessionInfo {
  return {
    id: `${courseName}-${dayOfWeek}-${startTime}`,
    courseCode: courseName,
    courseName,
    dayOfWeek,
    startTime,
    endTime,
    sessionType: "lecture",
  };
}

const LECTURE = s({
  sessionType: "lecture",
  groupCode: "ALL",
  dayOfWeek: "SUNDAY",
  startTime: "10:00",
  endTime: "12:00",
});

// ─── Labels & formatters ─────────────────────────────────────────────

describe("labels", () => {
  it("names every sessionType that exists in the real catalog", () => {
    expect(sessionTypeNameFor("lecture", true)).toBe("הרצאה");
    expect(sessionTypeNameFor("tutorial", true)).toBe("תרגול");
    expect(sessionTypeNameFor("seminar", true)).toBe("סמינר");
    expect(sessionTypeNameFor("workshop", true)).toBe("סדנה");
    // `project` used to leak through as raw English inside a Hebrew screen.
    expect(sessionTypeNameFor("project", true)).toBe("פרויקט");
    expect(sessionTypeNameFor("project", false)).toBe("Project");
  });

  it("falls back to the raw value for an unknown type", () => {
    expect(sessionTypeNameFor("colloquium", true)).toBe("colloquium");
  });

  it("names days in both locales and falls back safely", () => {
    expect(dayNameFor("WEDNESDAY", true)).toBe("רביעי");
    expect(dayNameFor("WEDNESDAY", false)).toBe("Wed");
    expect(dayNameFor("FRIDAY", true)).toBe("שישי");
    // No Saturday teaching at TAU — an unmapped day falls back to its raw
    // value rather than rendering `undefined`.
    expect(dayNameFor("SATURDAY", true)).toBe("SATURDAY");
    expect(dayNameFor("NOPE", true)).toBe("NOPE");
  });
});

describe("formatMeetings", () => {
  it("lists EVERY meeting, not just the first", () => {
    const meetings = toGroupMeetings([
      s({ dayOfWeek: "WEDNESDAY", startTime: "14:00", endTime: "15:00" }),
      s({ dayOfWeek: "SUNDAY", startTime: "10:00", endTime: "12:00" }),
    ]);
    expect(formatMeetings(meetings, true)).toBe("ראשון 10:00–12:00 · רביעי 14:00–15:00");
  });

  it("sorts by day then start time", () => {
    const meetings = toGroupMeetings([
      s({ dayOfWeek: "SUNDAY", startTime: "16:00", endTime: "17:00" }),
      s({ dayOfWeek: "SUNDAY", startTime: "08:00", endTime: "09:00" }),
      s({ dayOfWeek: "MONDAY", startTime: "09:00", endTime: "10:00" }),
    ]);
    expect(meetings.map((m) => `${m.dayOfWeek} ${m.startTime}`)).toEqual([
      "SUNDAY 08:00",
      "SUNDAY 16:00",
      "MONDAY 09:00",
    ]);
  });
});

describe("formatLocation", () => {
  it("joins building and room, tolerating either being absent", () => {
    const [a, b, c] = toGroupMeetings([
      s({ dayOfWeek: "SUNDAY", startTime: "10:00", endTime: "11:00", building: "גילמן", room: "144" }),
      s({ dayOfWeek: "MONDAY", startTime: "10:00", endTime: "11:00", room: "220" }),
      s({ dayOfWeek: "TUESDAY", startTime: "10:00", endTime: "11:00" }),
    ]);
    expect(formatLocation(a!)).toBe("גילמן 144");
    expect(formatLocation(b!)).toBe("220");
    expect(formatLocation(c!)).toBe("");
  });
});

// ─── buildGroupChoices ───────────────────────────────────────────────

describe("buildGroupChoices", () => {
  const twoGroups: ScheduleSessionLike[] = [
    LECTURE,
    s({ groupCode: "01", dayOfWeek: "MONDAY", startTime: "12:00", endTime: "13:00" }),
    // Group 02 meets TWICE — the exact case the old picker described with one line.
    s({ groupCode: "02", dayOfWeek: "TUESDAY", startTime: "09:00", endTime: "10:00" }),
    s({ groupCode: "02", dayOfWeek: "THURSDAY", startTime: "15:00", endTime: "16:00" }),
  ];

  it("only reports session types that offer a real choice", () => {
    const choices = buildGroupChoices({
      sessions: twoGroups,
      courseName: "קורס",
      otherSessions: [],
      semester: "FALL",
    });
    expect(choices).toHaveLength(1);
    expect(choices[0]!.sessionType).toBe("tutorial");
    expect(choices[0]!.options.map((o) => o.groupCode).sort()).toEqual(["01", "02"]);
  });

  it("keeps every meeting of a multi-meeting group", () => {
    const choices = buildGroupChoices({
      sessions: twoGroups,
      courseName: "קורס",
      otherSessions: [],
      semester: "FALL",
    });
    const g2 = choices[0]!.options.find((o) => o.groupCode === "02")!;
    expect(g2.meetings).toHaveLength(2);
    expect(g2.weeklyHours).toBe(2);
  });

  it("filters to the requested semester", () => {
    const both: ScheduleSessionLike[] = [
      s({ groupCode: "01", semester: "FALL", dayOfWeek: "SUNDAY", startTime: "10:00", endTime: "11:00" }),
      s({ groupCode: "02", semester: "FALL", dayOfWeek: "MONDAY", startTime: "10:00", endTime: "11:00" }),
      s({ groupCode: "03", semester: "SPRING", dayOfWeek: "TUESDAY", startTime: "10:00", endTime: "11:00" }),
    ];
    const fall = buildGroupChoices({
      sessions: both,
      courseName: "קורס",
      otherSessions: [],
      semester: "FALL",
    });
    expect(fall[0]!.options.map((o) => o.groupCode)).toEqual(["01", "02"]);
  });

  it("treats ALL sessions as fixed, never as a choice", () => {
    const choices = buildGroupChoices({
      sessions: twoGroups,
      courseName: "קורס",
      otherSessions: [],
      semester: "FALL",
    });
    expect(choices.some((c) => c.sessionType === "lecture")).toBe(false);
  });

  it("names the course a group clashes with, and dedupes per (course, day)", () => {
    const choices = buildGroupChoices({
      sessions: twoGroups,
      courseName: "קורס",
      otherSessions: [
        other("מבוא לכלכלה", "TUESDAY", "09:00", "12:00"),
        other("מבוא לכלכלה", "TUESDAY", "09:30", "10:30"),
      ],
      semester: "FALL",
    });
    const g2 = choices[0]!.options.find((o) => o.groupCode === "02")!;
    expect(g2.clashes).toHaveLength(1);
    expect(g2.clashes[0]!.courseName).toBe("מבוא לכלכלה");
    expect(g2.clashes[0]!.dayOfWeek).toBe("TUESDAY");
    expect(g2.clashes[0]!.overlapStart).toBe("09:00");
    expect(g2.clashes[0]!.overlapEnd).toBe("10:00");
    expect(g2.clashes[0]!.sameCourse).toBe(false);
  });

  it("flags a group that collides with the course's OWN fixed meeting", () => {
    const sessions: ScheduleSessionLike[] = [
      // The lecture runs for everyone.
      s({ sessionType: "lecture", groupCode: "ALL", dayOfWeek: "MONDAY", startTime: "10:00", endTime: "13:00" }),
      s({ groupCode: "01", dayOfWeek: "MONDAY", startTime: "11:00", endTime: "12:00" }),
      s({ groupCode: "02", dayOfWeek: "WEDNESDAY", startTime: "11:00", endTime: "12:00" }),
    ];
    const choices = buildGroupChoices({
      sessions,
      courseName: "מבוא ללוגיקה",
      otherSessions: [],
      semester: "FALL",
    });
    const g1 = choices[0]!.options.find((o) => o.groupCode === "01")!;
    expect(g1.clashes).toHaveLength(1);
    expect(g1.clashes[0]!.sameCourse).toBe(true);
    expect(g1.clashes[0]!.courseName).toBe("מבוא ללוגיקה");
    const g2 = choices[0]!.options.find((o) => o.groupCode === "02")!;
    expect(g2.clashes).toHaveLength(0);
  });

  it("counts the campus days a group adds, against the rest of the week", () => {
    const choices = buildGroupChoices({
      sessions: [
        s({ groupCode: "01", dayOfWeek: "MONDAY", startTime: "12:00", endTime: "13:00" }),
        s({ groupCode: "02", dayOfWeek: "THURSDAY", startTime: "12:00", endTime: "13:00" }),
      ],
      courseName: "קורס",
      // The student is already on campus on Monday, never on Thursday.
      otherSessions: [other("קורס אחר", "MONDAY", "08:00", "10:00")],
      semester: "FALL",
    });
    const byCode = new Map(choices[0]!.options.map((o) => [o.groupCode, o]));
    expect(byCode.get("01")!.addsCampusDays).toBe(0);
    expect(byCode.get("02")!.addsCampusDays).toBe(1);
  });

  it("orders clash-free first, then fewest added campus days, then group code", () => {
    const choices = buildGroupChoices({
      sessions: [
        // 01 clashes.
        s({ groupCode: "01", dayOfWeek: "MONDAY", startTime: "08:30", endTime: "09:30" }),
        // 02 is free but costs a new day.
        s({ groupCode: "02", dayOfWeek: "THURSDAY", startTime: "12:00", endTime: "13:00" }),
        // 03 is free and on a day already spent on campus.
        s({ groupCode: "03", dayOfWeek: "MONDAY", startTime: "14:00", endTime: "15:00" }),
      ],
      courseName: "קורס",
      otherSessions: [other("קורס אחר", "MONDAY", "08:00", "10:00")],
      semester: "FALL",
    });
    expect(choices[0]!.options.map((o) => o.groupCode)).toEqual(["03", "02", "01"]);
    expect(choices[0]!.freeCount).toBe(2);
  });

  it("puts lecture choices before tutorial choices", () => {
    const sessions: ScheduleSessionLike[] = [
      s({ sessionType: "lecture", groupCode: "01", dayOfWeek: "SUNDAY", startTime: "10:00", endTime: "12:00" }),
      s({ sessionType: "lecture", groupCode: "02", dayOfWeek: "MONDAY", startTime: "10:00", endTime: "12:00" }),
      s({ sessionType: "tutorial", groupCode: "11", dayOfWeek: "TUESDAY", startTime: "10:00", endTime: "11:00" }),
      s({ sessionType: "tutorial", groupCode: "12", dayOfWeek: "WEDNESDAY", startTime: "10:00", endTime: "11:00" }),
    ];
    const choices = buildGroupChoices({
      sessions,
      courseName: "קורס",
      otherSessions: [],
      semester: "FALL",
    });
    expect(choices.map((c) => c.sessionType)).toEqual(["lecture", "tutorial"]);
  });

  it("collects distinct lecturers across a group's meetings", () => {
    const choices = buildGroupChoices({
      sessions: [
        s({ groupCode: "01", dayOfWeek: "SUNDAY", startTime: "10:00", endTime: "11:00", lecturerName: "ד״ר כהן" }),
        s({ groupCode: "01", dayOfWeek: "MONDAY", startTime: "10:00", endTime: "11:00", lecturerName: "ד״ר כהן" }),
        s({ groupCode: "01", dayOfWeek: "TUESDAY", startTime: "10:00", endTime: "11:00", lecturerName: "גב׳ לוי" }),
        s({ groupCode: "02", dayOfWeek: "THURSDAY", startTime: "10:00", endTime: "11:00" }),
      ],
      courseName: "קורס",
      otherSessions: [],
      semester: "FALL",
    });
    const g1 = choices[0]!.options.find((o) => o.groupCode === "01")!;
    expect(g1.lecturers).toEqual(["ד״ר כהן", "גב׳ לוי"]);
    const g2 = choices[0]!.options.find((o) => o.groupCode === "02")!;
    expect(g2.lecturers).toEqual([]);
  });

  it("returns nothing when no session type offers a choice", () => {
    const choices = buildGroupChoices({
      sessions: [LECTURE, s({ groupCode: "01", dayOfWeek: "MONDAY", startTime: "12:00", endTime: "13:00" })],
      courseName: "קורס",
      otherSessions: [],
      semester: "FALL",
    });
    expect(choices).toEqual([]);
  });
});

// ─── The verdict line ────────────────────────────────────────────────

describe("describeGroupImpact", () => {
  function optionsFor(otherSessions: SessionInfo[]) {
    const [choice] = buildGroupChoices({
      sessions: [
        s({ groupCode: "01", dayOfWeek: "MONDAY", startTime: "08:30", endTime: "09:30" }),
        s({ groupCode: "02", dayOfWeek: "THURSDAY", startTime: "12:00", endTime: "13:00" }),
        s({ groupCode: "03", dayOfWeek: "MONDAY", startTime: "14:00", endTime: "15:00" }),
      ],
      courseName: "קורס",
      otherSessions,
      semester: "FALL",
    });
    return new Map(choice!.options.map((o) => [o.groupCode, o]));
  }

  const busyMonday = [other("מבוא לכלכלה", "MONDAY", "08:00", "10:00")];

  it("names the clashing course, the day and the exact overlap", () => {
    const impact = describeGroupImpact(optionsFor(busyMonday).get("01")!, true);
    expect(impact.tone).toBe("clash");
    expect(impact.text).toBe("חופפת למבוא לכלכלה ביום שני 08:30–09:30");
  });

  it("counts the remaining clashes when a group collides more than once", () => {
    const impact = describeGroupImpact(
      optionsFor([
        other("מבוא לכלכלה", "MONDAY", "08:00", "10:00"),
        other("מבוא ללוגיקה", "MONDAY", "09:00", "11:00"),
      ]).get("01")!,
      true,
    );
    expect(impact.text).toContain("(ועוד 1)");
  });

  it("words a self-clash without naming the course twice", () => {
    const [choice] = buildGroupChoices({
      sessions: [
        s({ sessionType: "lecture", groupCode: "ALL", dayOfWeek: "MONDAY", startTime: "10:00", endTime: "13:00" }),
        s({ groupCode: "01", dayOfWeek: "MONDAY", startTime: "11:00", endTime: "12:00" }),
        s({ groupCode: "02", dayOfWeek: "WEDNESDAY", startTime: "11:00", endTime: "12:00" }),
      ],
      courseName: "מבוא ללוגיקה",
      otherSessions: [],
      semester: "FALL",
    });
    const g1 = choice!.options.find((o) => o.groupCode === "01")!;
    expect(describeGroupImpact(g1, true).text).toBe(
      "חופפת למפגש אחר של הקורס ביום שני 11:00–12:00",
    );
  });

  it("flags a group that costs an extra trip to campus", () => {
    const impact = describeGroupImpact(optionsFor(busyMonday).get("02")!, true);
    expect(impact.tone).toBe("newDay");
    expect(impact.text).toBe("מוסיפה יום נוסף בקמפוס");
  });

  it("stays neutral when the group sits on a day already spent on campus", () => {
    const impact = describeGroupImpact(optionsFor(busyMonday).get("03")!, true);
    expect(impact.tone).toBe("neutral");
    expect(impact.text).toBe("בימים שכבר יש לכם בקמפוס");
  });

  it("has an English wording for every tone", () => {
    const opts = optionsFor(busyMonday);
    expect(describeGroupImpact(opts.get("01")!, false).text).toBe(
      "Overlaps מבוא לכלכלה on Mon 08:30–09:30",
    );
    expect(describeGroupImpact(opts.get("02")!, false).text).toBe("Adds another day on campus");
    expect(describeGroupImpact(opts.get("03")!, false).text).toBe(
      "On days you're already on campus",
    );
  });

  it("never mentions bidding points", () => {
    const opts = optionsFor(busyMonday);
    for (const opt of opts.values()) {
      for (const isHe of [true, false]) {
        const { text } = describeGroupImpact(opt, isHe);
        expect(text).not.toMatch(/נקוד|נקודות|points|bid/i);
      }
    }
  });
});

// ─── The default must match what the grid actually draws ─────────────

describe("resolveSelectedGroup", () => {
  const sessions: ScheduleSessionLike[] = [
    // 03 sorts first lexicographically only if we DON'T reorder; the options
    // list is reordered by clash, so the fallback must not be options[0].
    s({ groupCode: "01", dayOfWeek: "MONDAY", startTime: "08:30", endTime: "09:30" }),
    s({ groupCode: "02", dayOfWeek: "THURSDAY", startTime: "12:00", endTime: "13:00" }),
  ];

  it("falls back to the lexicographically-first group, mirroring the grid filter", () => {
    const [choice] = buildGroupChoices({
      sessions,
      courseName: "קורס",
      otherSessions: [other("קורס אחר", "MONDAY", "08:00", "10:00")],
      semester: "FALL",
    });
    // 01 clashes so it is rendered LAST — but the grid still draws it until a
    // pick is saved, so the tick has to land on 01.
    expect(choice!.options[0]!.groupCode).toBe("02");
    expect(choice!.defaultGroupCode).toBe("01");
    expect(resolveSelectedGroup(choice!, undefined)).toBe("01");
    expect(resolveSelectedGroup(choice!, {})).toBe("01");
  });

  it("honours a saved pick", () => {
    const [choice] = buildGroupChoices({
      sessions,
      courseName: "קורס",
      otherSessions: [],
      semester: "FALL",
    });
    expect(resolveSelectedGroup(choice!, { tutorial: "02" })).toBe("02");
  });

  it("ignores a saved pick that no longer exists", () => {
    const [choice] = buildGroupChoices({
      sessions,
      courseName: "קורס",
      otherSessions: [],
      semester: "FALL",
    });
    expect(resolveSelectedGroup(choice!, { tutorial: "99" })).toBe("01");
  });
});
