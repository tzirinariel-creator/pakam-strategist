import { describe, it, expect } from "vitest";
import {
  isEnglishLevelCourseName,
  countPassedEnglishLevelCourses,
  resolveEnglishStanding,
} from "@/lib/english-standing";
import { resolveEnglishLevel } from "@/lib/constants";

describe("isEnglishLevelCourseName", () => {
  it("recognises the preparatory level courses TAU prints", () => {
    for (const n of [
      "אנגלית מתקדמים ב׳",
      "אנגלית מתקדמים ב'",
      "אנגלית מתקדמים א׳",
      "אנגלית בסיסי",
      "אנגלית טרום בסיסי",
    ]) {
      expect(isEnglishLevelCourseName(n), n).toBe(true);
    }
  });

  it("does NOT treat an English CONTENT course as a level course", () => {
    // PKM-012 content courses are a different requirement — folding them in
    // would silently zero out a real level obligation.
    for (const n of ["אנגלית לכלכלנים", "Academic Writing in English", "אנגלית טכנית"]) {
      expect(isEnglishLevelCourseName(n), n).toBe(false);
    }
  });

  it("does not fire on non-English courses that mention a level word", () => {
    expect(isEnglishLevelCourseName("מיקרו כלכלה מתקדמים א׳")).toBe(false);
    expect(isEnglishLevelCourseName("סטטיסטיקה בסיסית")).toBe(false);
  });
});

describe("countPassedEnglishLevelCourses", () => {
  it("counts only PASSED level courses — English passes at 70, not 60", () => {
    expect(
      countPassedEnglishLevelCourses([
        { nameHe: "אנגלית מתקדמים ב׳", grade: 85 },
        { nameHe: "אנגלית מתקדמים א׳", grade: 65 }, // below the 70 English bar
        { nameHe: "מבוא ללוגיקה", grade: 100 },
      ])
    ).toBe(1);
  });

  it("counts a binary/completed row with no numeric grade as a pass", () => {
    expect(
      countPassedEnglishLevelCourses([
        { nameHe: "אנגלית מתקדמים ב׳", grade: null, isBinary: true },
        { nameHe: "אנגלית מתקדמים א׳", grade: null, status: "COMPLETED" },
        { nameHe: "אנגלית בסיסי", grade: null, status: "PLANNED" },
      ])
    ).toBe(2);
  });
});

describe("resolveEnglishStanding — Ariel's case (#6/#18, 13.8)", () => {
  it("closes the level track for a מתקדמים ב׳ student who PASSED מתקדמים ב׳", () => {
    // The exact live report: the sheet placed him at ADVANCED_B (levelCourses:1)
    // and he holds a passing grade in that very course, yet the dashboard told
    // him to "take a level course or retake Amiram".
    const info = resolveEnglishLevel("ADVANCED_B", null);
    expect(info!.levelCourses).toBe(1);

    const standing = resolveEnglishStanding(info, [
      { nameHe: "אנגלית מתקדמים ב׳", grade: 88 },
    ]);
    expect(standing!.levelCoursesRemaining).toBe(0);
    expect(standing!.completedLevelTrack).toBe(true);
    expect(standing!.passedLevelCourses).toBe(1);
  });

  it("leaves a real obligation intact when nothing was passed", () => {
    const standing = resolveEnglishStanding(resolveEnglishLevel("ADVANCED_A", null), [
      { nameHe: "מבוא ללוגיקה", grade: 90 },
    ]);
    expect(standing!.levelCoursesRemaining).toBe(2);
    expect(standing!.completedLevelTrack).toBe(false);
  });

  it("partially credits — two owed, one passed, one left", () => {
    const standing = resolveEnglishStanding(resolveEnglishLevel("ADVANCED_A", null), [
      { nameHe: "אנגלית מתקדמים א׳", grade: 80 },
    ]);
    expect(standing!.levelCoursesRemaining).toBe(1);
    expect(standing!.completedLevelTrack).toBe(false);
  });

  it("never goes negative", () => {
    const standing = resolveEnglishStanding(resolveEnglishLevel("ADVANCED_B", null), [
      { nameHe: "אנגלית מתקדמים ב׳", grade: 88 },
      { nameHe: "אנגלית מתקדמים א׳", grade: 88 },
      { nameHe: "אנגלית בסיסי", grade: 88 },
    ]);
    expect(standing!.levelCoursesRemaining).toBe(0);
  });

  it("stays neutral with no placement at all, exactly as before", () => {
    expect(resolveEnglishStanding(null, [{ nameHe: "אנגלית מתקדמים ב׳", grade: 88 }])).toBeNull();
  });
});
