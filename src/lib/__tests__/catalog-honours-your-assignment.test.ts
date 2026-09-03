import { describe, it, expect } from "vitest";
import { effectiveDiscipline, isFocusCourse } from "@/lib/focus-star";

// =========================================
// שיוך אישי גובר — בכוכב, בסינון ובמיון
// =========================================
// הידיעון מסדר סמינרים לפי ש״ס ולא לפי תחום, ולכן 123 מ-304 הקורסים
// הפעילים חסרי תחום ו-61 מ-67 הסמינרים ביניהם. התחום הוא עובדה על **איפה
// הסטודנט מגיש את העבודה**, ולכן הוא נשמר כ-disciplineOverride אישי.
//
// הכוכב בשורה כיבד את זה. הסינון לפי תחום נשלח לשרת, שמשווה מול העמודה
// בקטלוג ולא מכיר את השיוך — אז סטודנט שסינן לפילוסופיה ראה את הסמינרים
// שלו נעלמים. והמיון "הציגו את קורסי המיקוד שלי קודם" השווה גם הוא את
// העמודה הגולמית, אז אותה שורה קיבלה כוכב וצנחה לתחתית הטבלה.
//
// שלושתם קוראים עכשיו לאותה פונקציה. הבדיקה מקבעת את *ההסכמה* ביניהם.

const SEMINAR = { code: "0651-3001", discipline: null };
const ECON = { code: "1011-2101", discipline: "ECONOMICS" };
const MINE = { "0651-3001": "PHILOSOPHY" };

describe("סמינר שהסטודנט שייך לפילוסופיה", () => {
  it("התחום האפקטיבי שלו הוא פילוסופיה, לא ריק", () => {
    expect(effectiveDiscipline(SEMINAR.code, SEMINAR.discipline, MINE)).toBe("PHILOSOPHY");
  });

  it("מקבל כוכב כשתחום המיקוד הוא פילוסופיה", () => {
    expect(isFocusCourse(SEMINAR.code, SEMINAR.discipline, "PHILOSOPHY", MINE)).toBe(true);
  });

  it("עובר את סינון 'פילוסופיה' — זה מה שנשבר", () => {
    const passesFilter = effectiveDiscipline(SEMINAR.code, SEMINAR.discipline, MINE) === "PHILOSOPHY";
    expect(passesFilter).toBe(true);
    // מה שהיה קודם: השוואה מול העמודה הגולמית.
    expect(SEMINAR.discipline === "PHILOSOPHY").toBe(false);
  });

  it("הכוכב והסינון מסכימים — זו כל הנקודה", () => {
    const starred = isFocusCourse(SEMINAR.code, SEMINAR.discipline, "PHILOSOPHY", MINE);
    const inFilter = effectiveDiscipline(SEMINAR.code, SEMINAR.discipline, MINE) === "PHILOSOPHY";
    expect(starred).toBe(inFilter);
  });
});

describe("בלי שיוך אישי — הקטלוג הוא התשובה", () => {
  it("קורס עם תחום משלו לא מושפע", () => {
    expect(effectiveDiscipline(ECON.code, ECON.discipline, MINE)).toBe("ECONOMICS");
    expect(isFocusCourse(ECON.code, ECON.discipline, "ECONOMICS", MINE)).toBe(true);
    expect(isFocusCourse(ECON.code, ECON.discipline, "PHILOSOPHY", MINE)).toBe(false);
  });

  it("סמינר בלי שיוך נשאר בלי תחום — לא ממציאים לו אחד", () => {
    expect(effectiveDiscipline(SEMINAR.code, SEMINAR.discipline, {})).toBeNull();
    expect(isFocusCourse(SEMINAR.code, SEMINAR.discipline, "PHILOSOPHY", {})).toBe(false);
  });

  it("שיוך אישי גובר גם כשלקטלוג יש דעה אחרת", () => {
    const reassigned = { "1011-2101": "PHILOSOPHY" };
    expect(effectiveDiscipline(ECON.code, ECON.discipline, reassigned)).toBe("PHILOSOPHY");
    expect(isFocusCourse(ECON.code, ECON.discipline, "ECONOMICS", reassigned)).toBe(false);
  });
});
