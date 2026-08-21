// The Hebrew gloss for an English-taught course must stay findable even though
// it is no longer the course's name — otherwise renaming them to English
// quietly removes ten courses from Hebrew search.
import { describe, it, expect } from "vitest";
import {
  ENGLISH_TAUGHT_COURSES,
  codesMatchingHebrewAlias,
  isEnglishTaught,
} from "../english-taught-courses";

describe("English-taught courses", () => {
  it("finds a course by the Hebrew a student would type", () => {
    expect(codesMatchingHebrewAlias("כלכלה בינלאומית")).toContain("1011-3310");
    expect(codesMatchingHebrewAlias("כלכלת פיתוח")).toContain("1011-3450");
    expect(codesMatchingHebrewAlias("אופציות")).toContain("1011-3509");
  });

  it("matches on a partial word, the way typing works", () => {
    expect(codesMatchingHebrewAlias("נגזר")).toContain("1411-6604");
  });

  it("ignores a term too short to mean anything", () => {
    // Without this, one keystroke drags all ten into every result list.
    expect(codesMatchingHebrewAlias("")).toEqual([]);
    expect(codesMatchingHebrewAlias(" ")).toEqual([]);
    expect(codesMatchingHebrewAlias("כ")).toEqual([]);
  });

  it("returns nothing for an unrelated term", () => {
    expect(codesMatchingHebrewAlias("מבוא ללוגיקה")).toEqual([]);
  });

  it("has a unique, well-formed code and a real English name for each", () => {
    const codes = ENGLISH_TAUGHT_COURSES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of ENGLISH_TAUGHT_COURSES) {
      expect(c.code).toMatch(/^\d{4}-\d{4}$/);
      // The displayed name must be Latin script — that is the whole point.
      expect(c.nameEn).toMatch(/^[A-Za-z]/);
      expect(c.nameEn).not.toMatch(/[֐-׿]/);
      // ...and the alias must be Hebrew, or it is not serving its purpose.
      expect(c.hebrewAlias).toMatch(/[֐-׿]/);
    }
  });

  it("knows which courses it covers", () => {
    expect(isEnglishTaught("1011-3310")).toBe(true);
    expect(isEnglishTaught("0618-1059")).toBe(false);
  });
});
