// The ידיעון's table pads punctuation on both sides. Before any of its names
// go into the catalog, that typesetting has to come off — without changing a
// single word. These pin the two rules that were actually wrong in drafting.
import { describe, it, expect } from "vitest";
import { tidyYedionName, looksTruncated } from "../../../scripts/fix-code-as-name";

describe("tidyYedionName", () => {
  it("glues gershayim back to the following letter", () => {
    expect(tidyYedionName('סטטיסטיקה לפכ" מ')).toBe('סטטיסטיקה לפכ"מ');
    expect(tidyYedionName('קריאה במורה הנבוכים לרמב" ם')).toBe('קריאה במורה הנבוכים לרמב"ם');
  });

  it("removes the space before punctuation", () => {
    expect(tidyYedionName("מיומנויות יסוד : קריאה מודרכת דקארט")).toBe("מיומנויות יסוד: קריאה מודרכת דקארט");
    expect(tidyYedionName("מהי הלשון ? תשובות")).toBe("מהי הלשון? תשובות");
  });

  it("tightens padded parentheses", () => {
    expect(tidyYedionName("קריאה בכתבים של זיגמונד ( שלמה ) פרויד"))
      .toBe("קריאה בכתבים של זיגמונד (שלמה) פרויד");
  });

  it("glues a hyphen only after a real compounding prefix", () => {
    // The bug this pins: gluing every spaced hyphen turned a clause dash into
    // a compound — "לחשוב מקום-לחשוב שפה" — which is not the course's name.
    expect(tidyYedionName("בעידן הניאו - ליברלי והדיגיטלי")).toBe("בעידן הניאו-ליברלי והדיגיטלי");
    expect(tidyYedionName("לחשוב מקום - לחשוב שפה")).toBe("לחשוב מקום - לחשוב שפה");
    expect(tidyYedionName("שלטון מקומי ועירוניות - סמינר מעשי")).toBe("שלטון מקומי ועירוניות - סמינר מעשי");
  });

  it("glues a hyphen before a number", () => {
    expect(tidyYedionName("במאות ה - 19")).toBe("במאות ה-19");
  });

  it("drops the שנתי column-bleed", () => {
    // Not part of any course's name — it leaks in from the adjacent column,
    // and all four courses that carry it report an ordinary semester of "א".
    expect(tidyYedionName("הלכה כפילוסופיה יהודית שנתי")).toBe("הלכה כפילוסופיה יהודית");
    expect(tidyYedionName('סמינר פכ" מ שנתי')).toBe('סמינר פכ"מ');
    // ...but only at the end, and only as its own word.
    expect(tidyYedionName("הקורס השנתי של המחלקה")).toBe("הקורס השנתי של המחלקה");
  });

  it("adds and removes no words", () => {
    const raw = "מדע, מטפיזיקה וטכנולוגיה : צמיחת עקרון שימור האנרגיה"; // no שנתי
    const words = (s: string) => s.replace(/[^֐-׿\s]/g, " ").split(/\s+/).filter(Boolean);
    expect(words(tidyYedionName(raw))).toEqual(words(raw));
  });
});

describe("looksTruncated", () => {
  it("rejects a cell the ידיעון clipped", () => {
    // The whole cell for 0621-1974 is `וצדק לכל ? ארה"` — our own catalog has
    // the full title, so a clipped name must never overwrite anything.
    expect(looksTruncated('וצדק לכל ? ארה"')).toBe(true);
    expect(looksTruncated("מדיניות הגירה -")).toBe(true);
    expect(looksTruncated("קצר")).toBe(true);
  });

  it("accepts a complete title", () => {
    expect(looksTruncated("תולדות המחשבה הכלכלית")).toBe(false);
    expect(looksTruncated("מהי הלשון? תשובות מן הפילוסופיה ומן הבלשנות")).toBe(false);
  });
});
