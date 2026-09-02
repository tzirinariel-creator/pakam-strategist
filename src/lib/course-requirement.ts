// =========================================
// "האם הקורס הזה חובה?" — תשובה אחת, לא חמש
// =========================================
// אורי כהן גפן, שנה א׳, אחרי 15 חודשי מילואים (2.9):
//   "מה שעדיין לא כל כך ברור לי — מה הם הקורסים החובה ומה הבחירה בסמסטר א שנה א"
//
// הוא צדק, ומשתי סיבות. הראשונה: המתכנן והקטלוג — שני המסכים שבהם בוחרים
// קורס — לא הציגו את זה בכלל. השנייה, והמסוכנת יותר: לסכימה יש *שני* שדות
// לאותה שאלה, `courseType` ו-`isMandatory`, וחמישה מקומות בקוד חזרו על
// `courseType === "MANDATORY" || isMandatory` כל אחד בנפרד. תיקון שיגיע רק
// לארבעה מהם ייראה עובד ויישאר שבור במסך החמישי — זה בדיוק דפוס הבאגים
// ששרד כאן שלושה דיווחים בעבר.
//
// לכן: פונקציה אחת, וכל הקוראים עוברים דרכה.

import type { CourseType } from "@prisma/client";

/** מה שצריך כדי להכריע — לא יותר. כל צורת קורס באפליקציה מספקת את זה. */
export type RequirementInput = {
  courseType?: CourseType | string | null;
  isMandatory?: boolean | null;
};

/**
 * קורס חובה = כזה שהתקנון מחייב. סמינר הוא דרישה נפרדת (12 ש״ס משלו) ולכן
 * אינו נספר כאן כחובה — הוא מוצג בנפרד, וכך גם בשער הזכאות.
 */
export function isMandatoryCourse(course: RequirementInput | null | undefined): boolean {
  if (!course) return false;
  return course.courseType === "MANDATORY" || course.isMandatory === true;
}

export function isSeminarCourse(course: RequirementInput | null | undefined): boolean {
  return course?.courseType === "SEMINAR";
}

export type Requirement = "MANDATORY" | "SEMINAR" | "ELECTIVE" | "UNKNOWN";

/**
 * `null` לקורס שהסטודנט הוסיף בעצמו ואינו בקטלוג שלנו — שם *אין לנו* תשובה,
 * וכרטיס כזה כבר נושא תווית משלו ("לא בקטלוג שלנו"). להדביק עליו "בחירה"
 * יהיה המצאה, וזה אסור כאן.
 */
export function requirementOf(course: RequirementInput | null | undefined): Requirement {
  if (!course) return "UNKNOWN";
  // סמינר נבדק לפני חובה, ובכוונה. במסד יש בדיוק קורס אחד ששני השדות חלוקים
  // עליו — `0651-3001 סמינר פכ״מ`, שהוא `courseType=SEMINAR` וגם
  // `isMandatory=true`. שניהם נכונים: הוא סמינר, והוא נדרש. "סמינר" אומר
  // לסטודנט יותר, כי ש״ס הסמינרים הם דרישה נפרדת בתקנון.
  if (isSeminarCourse(course)) return "SEMINAR";
  if (isMandatoryCourse(course)) return "MANDATORY";
  if (!course.courseType) return "UNKNOWN";
  return "ELECTIVE";
}

export function requirementLabel(req: Requirement, isHe: boolean): string | null {
  switch (req) {
    case "MANDATORY":
      return isHe ? "חובה" : "Required";
    case "SEMINAR":
      return isHe ? "סמינר" : "Seminar";
    case "ELECTIVE":
      return isHe ? "בחירה" : "Elective";
    default:
      return null;
  }
}
