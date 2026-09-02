import { describe, it, expect } from "vitest";
import { ltr, sessionMetaParts } from "@/lib/week-image";

// =========================================
// "14:00–12:00" בתמונה ששולחים בוואטסאפ
// =========================================
// `ctx.direction = "rtl"` בקנבס מריץ את אלגוריתם ה-bidi על כל מחרוזת. המקף
// בין שתי שעות הוא תו נייטרלי, ולכן שני צדי הטווח מתהפכים. ציירתי את זה על
// קנבס אמיתי ובדקתי בעיניים: הקלט "12:00–14:00" יצא "14:00–12:00", והתמונה
// הזאת היא מה שסטודנט שולח לחבר.
//
// אין <bdi> על קנבס, אז הבידוד נעשה בתווי בקרה של יוניקוד. הבדיקה מקבעת את
// זה ברמת המחרוזת, כי שם היה הבאג — לא בציור.

const LRI = "⁦";
const PDI = "⁩";

describe("טווח שעות מבודד ולכן לא מתהפך", () => {
  it("הטווח נעטף בבידוד שמאל־לימין", () => {
    const [range] = sessionMetaParts({ startTime: "12:00", endTime: "14:00" });
    expect(range).toBe(`${LRI}12:00–14:00${PDI}`);
    // הסדר עצמו נשמר במחרוזת — הבידוד רק מונע מה-bidi להפוך אותו בציור.
    expect(range!.indexOf("12:00")).toBeLessThan(range!.indexOf("14:00"));
  });

  it("מספר חדר מבודד גם הוא", () => {
    const parts = sessionMetaParts({ startTime: "10:00", endTime: "12:00", room: "279" });
    expect(parts).toContain(`${LRI}279${PDI}`);
  });

  it("טקסט עברי לא מבודד — אין סיבה, וזה היה מוסיף תווים לחינם", () => {
    const parts = sessionMetaParts({
      startTime: "10:00",
      endTime: "12:00",
      sessionTypeLabel: "הרצאה",
    });
    expect(parts).toContain("הרצאה");
    expect(parts.some((p) => p === `${LRI}הרצאה${PDI}`)).toBe(false);
  });

  it("חלק ריק לא מגיע לשורה", () => {
    const parts = sessionMetaParts({ startTime: "09:00", endTime: "10:00", room: null, sessionTypeLabel: null });
    expect(parts).toHaveLength(1);
  });

  it("ltr מוסיף בדיוק שני תווים", () => {
    expect(ltr("x")).toHaveLength(3);
  });
});
