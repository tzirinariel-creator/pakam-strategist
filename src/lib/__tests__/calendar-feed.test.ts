import { describe, it, expect, beforeAll } from "vitest";
import { buildCalendarFeed } from "@/lib/calendar-feed";
import { calendarFeedToken, verifyCalendarFeedToken, calendarFeedSig } from "@/lib/calendar-feed-token";

beforeAll(() => {
  process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "a".repeat(64);
});

const NOW = new Date(2026, 6, 12); // 12.7.2026

describe("calendar feed token (stateless auth)", () => {
  it("round-trips and rejects tampering", () => {
    const tok = calendarFeedToken("user-123");
    expect(verifyCalendarFeedToken(tok)).toBe("user-123");
    expect(verifyCalendarFeedToken(tok + "x")).toBeNull();
    expect(verifyCalendarFeedToken("user-123.deadbeef")).toBeNull();
    expect(verifyCalendarFeedToken("garbage")).toBeNull();
  });
  it("a different user gets a different signature", () => {
    expect(calendarFeedSig("a")).not.toBe(calendarFeedSig("b"));
  });
});

describe("buildCalendarFeed", () => {
  const base = {
    gradesOpenDate: null,
    gradesSemesterLabelHe: null,
    nextTeachingStart: null,
    now: NOW,
  };

  it("emits future exams with a day-before reminder, drops past ones", () => {
    const ics = buildCalendarFeed({
      ...base,
      courses: [
        { nameHe: "מיקרו", code: "1011", examDateA: new Date(2026, 6, 21), examDateB: new Date(2026, 7, 6), status: "IN_PROGRESS", grade: null },
        { nameHe: "עבר", code: "9999", examDateA: new Date(2026, 5, 1), examDateB: null, status: "COMPLETED", grade: 90 },
      ],
    });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("מבחן: מיקרו (מועד א׳)");
    expect(ics).toContain("מבחן: מיקרו (מועד ב׳)");
    expect(ics).toContain("TRIGGER:-P1D"); // reminder present
    expect(ics).not.toContain("9999"); // past exam dropped
    expect(ics).toContain("DTSTART;VALUE=DATE:20260721");
  });

  it("adds an 'enter grades' reminder only when something is ungraded", () => {
    const withUngraded = buildCalendarFeed({
      ...base,
      gradesOpenDate: new Date(2026, 6, 24),
      gradesSemesterLabelHe: "סמסטר ב׳",
      courses: [{ nameHe: "x", code: "1", examDateA: null, examDateB: null, status: "IN_PROGRESS", grade: null }],
    });
    expect(withUngraded).toContain("עדכנו ציונים בפכמון");

    const allGraded = buildCalendarFeed({
      ...base,
      gradesOpenDate: new Date(2026, 6, 24),
      gradesSemesterLabelHe: "סמסטר ב׳",
      courses: [{ nameHe: "x", code: "1", examDateA: null, examDateB: null, status: "COMPLETED", grade: 88 }],
    });
    expect(allGraded).not.toContain("עדכנו ציונים");
  });

  it("adds the next-semester milestone but never invents a bidding date", () => {
    const ics = buildCalendarFeed({
      ...base,
      nextTeachingStart: new Date(2026, 9, 18),
      courses: [],
    });
    expect(ics).toContain("תחילת הסמסטר הבא");
    expect(ics).toContain("הבידינג נפתח לפני כן"); // points at it, no fake date
  });
});
