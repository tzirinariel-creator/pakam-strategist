import { describe, it, expect } from "vitest";
import {
  dedupeMeetings,
  findConflictPairs,
  conflictIds,
  conflictPartners,
  formatHour,
  formatHourRange,
  describeConflictPair,
  describeConflictPartner,
  type ConflictCandidate,
  type MeetingLike,
} from "@/lib/timetable-conflicts";

const M = (over: Partial<MeetingLike> & { id?: string } = {}) => ({
  id: over.id ?? "row",
  courseCode: "1011-3310",
  dayOfWeek: "TUESDAY",
  startTime: "12:00",
  endTime: "14:00",
  sessionType: "tutorial",
  groupCode: "01",
  room: null as string | null,
  building: null as string | null,
  lecturerName: null as string | null,
  ...over,
});

describe("dedupeMeetings", () => {
  it("collapses two rows describing the same meeting (the real 1011-3310 dupe)", () => {
    const out = dedupeMeetings([
      M({ id: "a", room: "012", lecturerName: "ד\"ר סילבה קסורלה" }),
      M({ id: "b", room: "012", lecturerName: "ד\"ר סילבה קסורלה" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("a"); // a tie keeps the first row
  });

  it("keeps the richer row when the duplicate is a stub (the real 0651-3001 dupe)", () => {
    const out = dedupeMeetings([
      M({ id: "stub", courseCode: "0651-3001", sessionType: "seminar", lecturerName: "ב" }),
      M({
        id: "full",
        courseCode: "0651-3001",
        sessionType: "seminar",
        room: "455",
        building: "גילמן",
        lecturerName: "ד\"ר יוסף מזור",
      }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("full");
    expect(out[0]!.room).toBe("455");
  });

  it("keeps a lecture and a tutorial at the same hour — different meetings", () => {
    expect(
      dedupeMeetings([M({ id: "lec", sessionType: "lecture" }), M({ id: "tut" })]),
    ).toHaveLength(2);
  });

  it("keeps two groups of the same type at the same hour", () => {
    expect(
      dedupeMeetings([M({ id: "g1", groupCode: "01" }), M({ id: "g2", groupCode: "02" })]),
    ).toHaveLength(2);
  });

  it("keeps the same group on different days and at different hours", () => {
    expect(
      dedupeMeetings([
        M({ id: "tue" }),
        M({ id: "wed", dayOfWeek: "WEDNESDAY" }),
        M({ id: "later", startTime: "16:00", endTime: "18:00" }),
      ]),
    ).toHaveLength(3);
  });

  it("treats a missing group code as its own key, and preserves input order", () => {
    const out = dedupeMeetings([
      M({ id: "x", groupCode: null }),
      M({ id: "y", groupCode: "01" }),
      M({ id: "z", groupCode: null }),
    ]);
    expect(out.map((r) => r.id)).toEqual(["x", "y"]);
  });

  it("is a no-op on an empty list", () => {
    expect(dedupeMeetings([])).toEqual([]);
  });

  it("stops a duplicated meeting from clashing with itself", () => {
    const rows = dedupeMeetings([M({ id: "a", room: "012" }), M({ id: "b", room: "012" })]);
    const pairs = findConflictPairs(
      rows.map((r) => ({
        id: r.id,
        day: 2,
        startHour: 12,
        endHour: 14,
        courseCode: r.courseCode,
        courseName: "כלכלה בינלאומית",
      })),
    );
    expect(pairs).toEqual([]);
  });
});

const S = (
  id: string,
  day: number,
  startHour: number,
  endHour: number,
  courseName = id,
  courseCode = `code-${id}`,
): ConflictCandidate => ({ id, day, startHour, endHour, courseName, courseCode });

describe("findConflictPairs", () => {
  it("finds an overlap on the same day and reports only the overlapping window", () => {
    const pairs = findConflictPairs([
      S("a", 2, 10, 13, "מבוא לכלכלה"),
      S("b", 2, 12, 14, "סטטיסטיקה"),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({
      aId: "a",
      bId: "b",
      aName: "מבוא לכלכלה",
      bName: "סטטיסטיקה",
      day: 2,
      overlapStart: 12,
      overlapEnd: 13,
    });
  });

  it("does not flag the same hours on a different day", () => {
    expect(findConflictPairs([S("a", 1, 10, 12), S("b", 3, 10, 12)])).toEqual([]);
  });

  it("does not flag back-to-back meetings that merely touch", () => {
    expect(findConflictPairs([S("a", 0, 10, 12), S("b", 0, 12, 14)])).toEqual([]);
  });

  it("flags two meetings of the SAME course — you still cannot attend both", () => {
    const pairs = findConflictPairs([
      S("lec", 4, 9, 11, "מבוא להסתברות", "0509-2801"),
      S("tut", 4, 10, 11, "מבוא להסתברות", "0509-2801"),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.overlapStart).toBe(10);
  });

  it("handles half-hour boundaries", () => {
    const pairs = findConflictPairs([S("a", 1, 10, 11.5), S("b", 1, 11, 12)]);
    expect(pairs[0]).toMatchObject({ overlapStart: 11, overlapEnd: 11.5 });
  });

  it("never flags a zero-length block", () => {
    expect(findConflictPairs([S("a", 1, 10, 10), S("b", 1, 9, 12)])).toEqual([]);
  });

  it("returns one pair per clashing couple in a three-way pile-up", () => {
    const pairs = findConflictPairs([
      S("a", 3, 10, 12),
      S("b", 3, 10, 12),
      S("c", 3, 11, 13),
    ]);
    expect(pairs).toHaveLength(3);
  });
});

describe("conflictIds", () => {
  it("collects every block involved, without duplicates", () => {
    const pairs = findConflictPairs([S("a", 3, 10, 12), S("b", 3, 10, 12), S("c", 3, 11, 13)]);
    expect([...conflictIds(pairs)].sort()).toEqual(["a", "b", "c"]);
  });

  it("is empty for a clean week", () => {
    expect(conflictIds(findConflictPairs([S("a", 0, 8, 10), S("b", 1, 8, 10)])).size).toBe(0);
  });
});

describe("conflictPartners", () => {
  it("lets each block name its counterpart, symmetrically", () => {
    const pairs = findConflictPairs([
      S("a", 2, 10, 13, "מבוא לכלכלה"),
      S("b", 2, 12, 14, "סטטיסטיקה"),
    ]);
    const map = conflictPartners(pairs);
    expect(map.get("a")).toEqual([
      { otherId: "b", otherName: "סטטיסטיקה", day: 2, overlapStart: 12, overlapEnd: 13 },
    ]);
    expect(map.get("b")![0]!.otherName).toBe("מבוא לכלכלה");
  });

  it("lists several partners when one block sits under two others", () => {
    const pairs = findConflictPairs([
      S("a", 3, 10, 14, "לוגיקה"),
      S("b", 3, 10, 11, "כלכלה"),
      S("c", 3, 13, 14, "פילוסופיה"),
    ]);
    expect(conflictPartners(pairs).get("a")!.map((p) => p.otherName).sort()).toEqual([
      "כלכלה",
      "פילוסופיה",
    ]);
  });
});

describe("formatHour / formatHourRange", () => {
  it("pads to two digits and renders 24h", () => {
    expect(formatHour(8)).toBe("08:00");
    expect(formatHour(12.5)).toBe("12:30");
    expect(formatHour(20)).toBe("20:00");
  });

  it("rounds to the nearest minute rather than leaking a float", () => {
    expect(formatHour(9 + 1 / 3)).toBe("09:20");
  });

  it("joins a range with an en dash", () => {
    expect(formatHourRange(12, 13.5)).toBe("12:00–13:30");
  });
});

describe("describeConflictPair / describeConflictPartner", () => {
  const pair = findConflictPairs([
    S("a", 2, 10, 13, "מבוא לכלכלה"),
    S("b", 2, 12, 14, "סטטיסטיקה"),
  ])[0]!;

  it("names BOTH courses, the day and the exact overlapping hours in Hebrew", () => {
    const { lead, range } = describeConflictPair(pair, "שלישי", true);
    expect(lead).toBe("מבוא לכלכלה חופף עם סטטיסטיקה · שלישי");
    expect(range).toBe("12:00–13:00");
  });

  it("keeps the numeric range OUT of the Hebrew lead so it can be wrapped in <bdi>", () => {
    const { lead } = describeConflictPair(pair, "שלישי", true);
    expect(lead).not.toMatch(/\d/);
  });

  it("has an English form", () => {
    expect(describeConflictPair(pair, "Tuesday", false).lead).toBe(
      "מבוא לכלכלה clashes with סטטיסטיקה · Tuesday",
    );
  });

  it("describes a single block's counterpart for the detail card", () => {
    const partner = conflictPartners([pair]).get("a")![0]!;
    expect(describeConflictPartner(partner, "שלישי", true)).toEqual({
      lead: "חופף עם סטטיסטיקה · שלישי",
      range: "12:00–13:00",
    });
    expect(describeConflictPartner(partner, "Tuesday", false).lead).toBe(
      "Clashes with סטטיסטיקה · Tuesday",
    );
  });
});
