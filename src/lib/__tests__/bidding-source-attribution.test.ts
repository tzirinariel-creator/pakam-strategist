// =========================================================================
// האפליקציה מייחסת את מקור הבידינג לפקולטה אחת — הנכונה
// =========================================================================
// נמצא 5.9 באימות ההערות מול המסך: `bidding-explainer` אמר "הפקולטה
// למדעי החברה" ו-`bidding-timeline`, שיושב לצידו, אמר "הפקולטה למדעי
// הרוח". שני מסכים, אותו מידע, שתי פקולטות.
//
// מי צודק — לפי המקורות:
//   · ההערה ב-bidding-calendar.ts שמונה את הקבצים שאריאל ייצא:
//     "הנחיות לרישום בבידינג תשפז.doc — Faculty of Humanities"
//   · תמונת הידיעון: "הפקולטה למדעי הרוח … תכנית בפכ״מ"
//   · גיליונות הציונים: "חד-חוגי בפקולטה למדעי הרוח"
//
// עיקרון 1 של הפרויקט: מקור מתויג, ולא מומצא. ייחוס שקרי הוא באג.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf-8");

describe("ייחוס מקור הבידינג", () => {
  it("שני המסכים מייחסים לאותה פקולטה", () => {
    const explainer = read("src/components/planner/bidding-explainer.tsx");
    const timeline = read("src/components/planner/bidding-timeline.tsx");
    // שורות הקופי בלבד — לא ההערות, שמצטטות בכוונה את שתי הגרסאות
    const copyOf = (src: string) =>
      src.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.includes("/*")).join("\n");
    const e = copyOf(explainer), t = copyOf(timeline);
    expect(e, "המסביר מייחס למדעי הרוח").toMatch(/הפקולטה למדעי הרוח/);
    expect(t, "הציר מייחס למדעי הרוח").toMatch(/הפקולטה למדעי הרוח/);
    expect(e, "המסביר לא מייחס למדעי החברה").not.toMatch(/עמודי הבידינג של הפקולטה למדעי החברה/);
  });

  it("המקור נשאר מתויג — לא הוסר במקום לתקן", () => {
    const explainer = read("src/components/planner/bidding-explainer.tsx");
    expect(explainer).toMatch(/מקור:/);
  });
});
