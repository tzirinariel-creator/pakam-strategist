import { describe, it, expect } from "vitest";
import { buildWeekShareText } from "@/lib/week-share";
import type { ScheduleSessionData } from "@/components/calendar/weekly-timetable";

const S = (day: string, start: string, end: string, name: string, type = "lecture"): ScheduleSessionData => ({
  id: `${day}-${start}`,
  courseCode: "0651-1007",
  dayOfWeek: day as ScheduleSessionData["dayOfWeek"],
  startTime: start,
  endTime: end,
  room: null,
  building: null,
  sessionType: type,
  course: { code: "0651-1007", nameHe: "מתמטיקה לפכ\"מ", nameEn: "Math for PPE", discipline: "GENERAL", credits: 5 },
});

describe("buildWeekShareText", () => {
  it("orders days Sun→Fri, sorts by start time, skips empty days, ends with the link", () => {
    const text = buildWeekShareText(
      [S("TUESDAY", "14:00", "16:00", ""), S("SUNDAY", "10:00", "12:00", ""), S("SUNDAY", "08:00", "09:00", "")],
      { semesterLabel: "שנה א׳ · סמסטר ב׳", appUrl: "https://pakamon.app/he", isHe: true },
    );
    const lines = text.split("\n");
    expect(lines[0]).toBe("המערכת שלי — שנה א׳ · סמסטר ב׳");
    const sunday = lines.indexOf("יום א׳:");
    const tuesday = lines.indexOf("יום ג׳:");
    expect(sunday).toBeGreaterThan(0);
    expect(tuesday).toBeGreaterThan(sunday);
    expect(lines[sunday + 1]).toContain("08:00-09:00");
    expect(lines[sunday + 2]).toContain("10:00-12:00");
    expect(text).not.toContain("יום ב׳:"); // empty day absent
    expect(lines[lines.length - 1]).toBe("נבנה עם פכמון: https://pakamon.app/he");
  });

  it("normalizes sessionType casing (DB casing isn't guaranteed)", () => {
    const text = buildWeekShareText([S("MONDAY", "09:00", "11:00", "", "LECTURE")], {
      semesterLabel: "x", appUrl: "y", isHe: true,
    });
    expect(text).toContain("(הרצאה)");
  });

  it("English localization uses English names and day labels", () => {
    const text = buildWeekShareText([S("MONDAY", "09:00", "11:00", "")], {
      semesterLabel: "Year 1", appUrl: "https://pakamon.app/en", isHe: false,
    });
    expect(text).toContain("Monday:");
    expect(text).toContain("Math for PPE");
    expect(text).toContain("Built with Pakamon:");
  });
});
