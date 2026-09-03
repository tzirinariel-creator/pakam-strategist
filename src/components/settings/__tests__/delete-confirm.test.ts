import { describe, it, expect } from "vitest";

// =========================================
// "אני לא מצליח למחוק את המשתמש שלי"
// =========================================
// אריאל, 3.9. בדקתי את המחיקה בשרת: `user.delete` הורץ על החשבון שלו בתוך
// טרנזקציה שגולגלה לאחור — והצליח. כל 21 היחסים ל-User עם onDelete.
// השרת לא שבור; הכפתור מעולם לא נדלק, כי ההוראה מה להקליד הייתה placeholder
// בשדה של 192px ונחתכה באמצע.
//
// ההשוואה הייתה גם קפדנית לגמרי: `confirmText.trim() !== CONFIRM`. מי
// שהקליד גרשיים במקום מרכאות, או רווח כפול, נשאר עם כפתור כבוי בלי הסבר.

const CONFIRM_HE = "מחקו לצמיתות";
const CONFIRM_EN = "DELETE FOREVER";

const normalize = (v: string) =>
  v.trim().replace(/[״"'׳`]/g, "").replace(/\s+/g, " ").toUpperCase();
const matches = (typed: string, target: string) => normalize(typed) === normalize(target);

describe("אישור מחיקה — סלחני אבל לא רחב מדי", () => {
  it("המשפט המדויק עובר", () => {
    expect(matches(CONFIRM_HE, CONFIRM_HE)).toBe(true);
    expect(matches(CONFIRM_EN, CONFIRM_EN)).toBe(true);
  });

  it("רווחים מסביב ובאמצע לא מפילים", () => {
    expect(matches("  מחקו   לצמיתות  ", CONFIRM_HE)).toBe(true);
    expect(matches("delete   forever", CONFIRM_EN)).toBe(true);
  });

  it("אנגלית עוברת בכל אות רישית", () => {
    expect(matches("Delete Forever", CONFIRM_EN)).toBe(true);
  });

  it("גרשיים ומרכאות מסולסלות לא מפילים", () => {
    expect(matches('מחקו לצמיתות"', CONFIRM_HE)).toBe(true);
    expect(matches("מחקו לצמיתות׳", CONFIRM_HE)).toBe(true);
  });

  // הסלחנות אסור שתהפוך את השער חסר־משמעות: זו פעולה בלתי הפיכה.
  it("משפט אחר לא עובר", () => {
    expect(matches("מחקו", CONFIRM_HE)).toBe(false);
    expect(matches("מחק לצמיתות", CONFIRM_HE)).toBe(false);
    expect(matches("", CONFIRM_HE)).toBe(false);
    expect(matches("delete", CONFIRM_EN)).toBe(false);
    expect(matches("DELETE FOREVER NOW", CONFIRM_EN)).toBe(false);
  });

  it("המשפט העברי לא מאשר את האנגלי ולהיפך", () => {
    expect(matches(CONFIRM_EN, CONFIRM_HE)).toBe(false);
    expect(matches(CONFIRM_HE, CONFIRM_EN)).toBe(false);
  });
});
