import { describe, it, expect } from "vitest";
import {
  academicYearOfSheetSemester,
  impliedStartYear,
  yearOfStudyFor,
} from "../implied-start-year";

describe("academicYearOfSheetSemester", () => {
  it("reads the academic year off a TAU semester stamp", () => {
    // Both semesters of 2025/26 belong to academic year 2025.
    expect(academicYearOfSheetSemester("2025/1")).toBe(2025);
    expect(academicYearOfSheetSemester("2025/2")).toBe(2025);
    expect(academicYearOfSheetSemester("2024/3")).toBe(2024);
  });

  it("tolerates spacing", () => {
    expect(academicYearOfSheetSemester(" 2025 / 1 ")).toBe(2025);
  });

  it("refuses anything that is not a stamp", () => {
    expect(academicYearOfSheetSemester(null)).toBeNull();
    expect(academicYearOfSheetSemester("")).toBeNull();
    expect(academicYearOfSheetSemester("2025")).toBeNull();
    expect(academicYearOfSheetSemester("סמסטר א׳")).toBeNull();
    expect(academicYearOfSheetSemester("2025/9")).toBeNull();
  });
});

describe("impliedStartYear", () => {
  it("catches Ariel's actual case", () => {
    // He picked "שנה א׳" in August 2026, so the app anchored his degree at
    // 2026 — while the same onboarding imported a sheet stamped 2025/1 and
    // 2025/2. That is what filed his Jan–May 2026 reserve service as
    // "before you were a student".
    const r = impliedStartYear(["2025/1", "2025/2", "2025/1"], 2026);
    expect(r).not.toBeNull();
    expect(r!.earliestAcademicYear).toBe(2025);
    expect(r!.yearsEarlier).toBe(1);
  });

  it("takes the EARLIEST year on the sheet", () => {
    expect(impliedStartYear(["2025/2", "2023/1", "2024/1"], 2026)!.earliestAcademicYear).toBe(2023);
  });

  it("says nothing when the sheet agrees with the declaration", () => {
    expect(impliedStartYear(["2025/1", "2025/2"], 2025)).toBeNull();
  });

  it("never moves the anchor LATER", () => {
    // A sheet can prove a degree had already started; it can never prove one
    // started later than declared. A transfer student, someone resuming after
    // a break, or a mis-scan would all look exactly like this.
    expect(impliedStartYear(["2026/1"], 2024)).toBeNull();
  });

  it("says nothing without usable evidence", () => {
    expect(impliedStartYear([], 2026)).toBeNull();
    expect(impliedStartYear([null, undefined, "לא ידוע"], 2026)).toBeNull();
    expect(impliedStartYear(["2025/1"], null)).toBeNull();
  });

  it("ignores unparseable stamps but still uses the good ones", () => {
    const r = impliedStartYear(["גיליון", "2024/1", null], 2026);
    expect(r!.earliestAcademicYear).toBe(2024);
    expect(r!.yearsEarlier).toBe(2);
  });
});

describe("yearOfStudyFor", () => {
  it("turns an anchor into a year of study", () => {
    expect(yearOfStudyFor(2026, 2026)).toBe(1);
    expect(yearOfStudyFor(2025, 2026)).toBe(2);
    expect(yearOfStudyFor(2024, 2026)).toBe(3);
  });

  it("clamps to the three years PPE actually has", () => {
    expect(yearOfStudyFor(2020, 2026)).toBe(3);
    expect(yearOfStudyFor(2030, 2026)).toBe(1);
  });
});
