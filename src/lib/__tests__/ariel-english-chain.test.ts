// The whole chain, with Ariel's real row — because he has now reported
// "the app doesn't know I finished English" four separate times, and each
// previous fix was verified at the wrong layer.
import { describe, it, expect } from "vitest";
import { countPassedEnglishLevelCourses, resolveEnglishStanding } from "../english-standing";
import { getEnglishLevelInfo } from "../constants";

const ROW = {
  nameHe: "מתקדמים ב' חוצה דיצפלינות בין תחומי",
  courseCode: "2171-9201",
  grade: 90,
  status: "COMPLETED",
};

describe("Ariel's English row, end to end", () => {
  it("is counted as a passed level course", () => {
    expect(countPassedEnglishLevelCourses([ROW])).toBe(1);
  });

  it("is counted even when the caller drops the course code", () => {
    // The regulation rule projects rows WITHOUT courseCode, so the name rule
    // has to carry it alone.
    const { courseCode: _omit, ...noCode } = ROW;
    expect(countPassedEnglishLevelCourses([noCode])).toBe(1);
  });

  it("leaves ZERO level courses outstanding for an ADVANCED_B student", () => {
    const info = getEnglishLevelInfo("ADVANCED_B");
    const standing = resolveEnglishStanding(info, [ROW]);
    expect(standing).not.toBeNull();
    expect(standing!.passedLevelCourses).toBe(1);
    expect(standing!.levelCoursesRemaining).toBe(0);
    expect(standing!.completedLevelTrack).toBe(true);
  });
});
