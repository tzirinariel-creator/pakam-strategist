import { describe, it, expect } from "vitest";
import {
  isMandatoryCourse,
  requirementOf,
  requirementLabel,
} from "@/lib/course-requirement";

// אורי כהן גפן, שנה א׳ (2.9): "מה שעדיין לא כל כך ברור לי — מה הם הקורסים
// החובה ומה הבחירה בסמסטר א שנה א". הבדיקה הזאת מקבעת את *התשובה*, לא את
// המימוש — כי לסכימה יש שני שדות לאותה שאלה, וזה בדיוק דפוס הבאג שמשאיר מסך
// אחד שבור אחרי שארבעה תוקנו.

describe("isMandatoryCourse — שדה אחד או השני מספיק", () => {
  it("courseType=MANDATORY בלבד", () => {
    expect(isMandatoryCourse({ courseType: "MANDATORY", isMandatory: false })).toBe(true);
  });

  it("isMandatory=true בלבד", () => {
    expect(isMandatoryCourse({ courseType: "ELECTIVE", isMandatory: true })).toBe(true);
  });

  it("אף אחד מהם", () => {
    expect(isMandatoryCourse({ courseType: "ELECTIVE", isMandatory: false })).toBe(false);
  });

  it("קורס חסר אינו חובה, ולא זורק", () => {
    expect(isMandatoryCourse(null)).toBe(false);
    expect(isMandatoryCourse(undefined)).toBe(false);
  });
});

describe("requirementOf", () => {
  // 0651-3001 סמינר פכ"מ הוא הקורס היחיד במסד ששני השדות חלוקים עליו:
  // courseType=SEMINAR וגם isMandatory=true. "סמינר" אומר לסטודנט יותר,
  // כי ש״ס הסמינרים הם דרישה נפרדת בתקנון.
  it("סמינר שהוא גם חובה מסומן כסמינר, לא כחובה", () => {
    expect(requirementOf({ courseType: "SEMINAR", isMandatory: true })).toBe("SEMINAR");
  });

  it("חובה", () => {
    expect(requirementOf({ courseType: "MANDATORY", isMandatory: true })).toBe("MANDATORY");
  });

  it("בחירה", () => {
    expect(requirementOf({ courseType: "ELECTIVE", isMandatory: false })).toBe("ELECTIVE");
  });

  // קורס שהסטודנט הוסיף בעצמו אינו בקטלוג שלנו. להדביק עליו "בחירה" הוא
  // המצאת נתון — אסור בפרויקט הזה.
  it("קורס בלי courseType מחזיר UNKNOWN ולא ממציא 'בחירה'", () => {
    expect(requirementOf({ isMandatory: false })).toBe("UNKNOWN");
    expect(requirementOf({ courseType: null, isMandatory: null })).toBe("UNKNOWN");
  });

  it("UNKNOWN לא מקבל תווית בכלל", () => {
    expect(requirementLabel("UNKNOWN", true)).toBeNull();
    expect(requirementLabel("UNKNOWN", false)).toBeNull();
  });
});

describe("requirementLabel — עברית ואנגלית", () => {
  it("עברית", () => {
    expect(requirementLabel("MANDATORY", true)).toBe("חובה");
    expect(requirementLabel("ELECTIVE", true)).toBe("בחירה");
    expect(requirementLabel("SEMINAR", true)).toBe("סמינר");
  });

  it("אנגלית", () => {
    expect(requirementLabel("MANDATORY", false)).toBe("Required");
    expect(requirementLabel("ELECTIVE", false)).toBe("Elective");
  });
});
