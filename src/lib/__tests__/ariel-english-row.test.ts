// Ariel's actual row, as it appears in his live record (screenshot, 21.8):
//   2171-9201 · "מתקדמים ב' חוצה דיצפלינות בין תחומי" · 90
import { describe, it, expect } from "vitest";
import { isEnglishLevelCourseName, looksEnglishByName, isEnglishCourse } from "../english-standing";

const NAME = "מתקדמים ב' חוצה דיצפלינות בין תחומי";
const CODE = "2171-9201";

describe("Ariel's real English row", () => {
  it("is recognised by its course code", () => {
    expect(isEnglishLevelCourseName(NAME, CODE)).toBe(true);
  });
  it("is recognised by its name alone, without the code", () => {
    expect(isEnglishLevelCourseName(NAME)).toBe(true);
  });
  it("is an English course to isEnglishCourse", () => {
    expect(isEnglishCourse({ nameHe: NAME, courseType: null })).toBe(true);
  });
  it("does not need the word אנגלית", () => {
    expect(looksEnglishByName(NAME)).toBe(false);
  });
});

// The consequence the recognition bug actually had: his English grade was
// averaged into his degree. Ariel raised this repeatedly ("אנגלית לא נחשב
// בממוצע") while it kept happening, because the average asked a narrower
// question than the record screen did.
import { countsTowardAverage, courseTypeCountsTowardAverage } from "../grade-calculator";

const asUserCourse = (over: Record<string, unknown>) =>
  ({
    id: "uc1",
    status: "COMPLETED",
    grade: 90,
    isBinary: false,
    attemptNumber: 1,
    course: { code: "0000-0000", nameHe: "קורס", courseType: "ELECTIVE", credits: 4 },
    ...over,
  }) as never;

describe("English never counts toward the degree average", () => {
  it("excludes Ariel's scanned English row, which arrives as ELECTIVE", () => {
    // The scanner creates rows as ELECTIVE, so courseType alone never caught it.
    const uc = asUserCourse({
      course: { code: CODE, nameHe: NAME, courseType: "ELECTIVE", credits: 4 },
    });
    expect(courseTypeCountsTowardAverage(uc)).toBe(false);
    expect(countsTowardAverage(uc)).toBe(false);
  });

  it("excludes it on the name alone, with no code", () => {
    const uc = asUserCourse({
      course: { code: "9999-9999", nameHe: NAME, courseType: "ELECTIVE", credits: 4 },
    });
    expect(countsTowardAverage(uc)).toBe(false);
  });

  it("still excludes a properly-typed ENGLISH row", () => {
    const uc = asUserCourse({
      course: { code: "2171-1000", nameHe: "אנגלית", courseType: "ENGLISH", credits: 4 },
    });
    expect(countsTowardAverage(uc)).toBe(false);
  });

  it("does not sweep in an ordinary course that merely says מתקדמים", () => {
    // "נושאים מתקדמים בכלכלה" contains the level word but does not open with
    // it — averaging it out would quietly change real degree averages.
    const uc = asUserCourse({
      course: { code: "1011-3310", nameHe: "נושאים מתקדמים בכלכלה", courseType: "ELECTIVE", credits: 4 },
    });
    expect(countsTowardAverage(uc)).toBe(true);
  });
});
