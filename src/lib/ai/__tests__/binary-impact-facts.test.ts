// =========================================================================
// המרה בינארית — המספרים נמסרים למלך, ולא מחושבים על ידו
// =========================================================================
// אריאל, 5.9, עם צילום מסך: הכפתור בכרטיס-היועץ שולח למלך את המספר שהאפליקציה
// חישבה ("הממוצע יעלה ל-96.8"), והמלך ענה שההמרה *תוריד* את הממוצע "מ-96.4
// ל-96.2, משום שציון 90 גבוה מהממוצע הנוכחי" — שלושה מספרים שאיש לא חישב,
// ונימוק שסותר את עצמו.
//
// השאלה היא היפותטית, ולכן שום עובדה מוסמכת לא כיסתה אותה. הבדיקה הזאת
// מקבעת שהיא מכוסה עכשיו — ושהכיוון שנמסר הוא הכיוון האמיתי.

import { describe, it, expect } from "vitest";
import { buildMentorSystemPrompt, type MentorContext } from "@/lib/ai/mentor-prompt";
import { TAU_PPE_2025 } from "@/lib/programs/definitions/tau-ppe-2025";

const build = (c: MentorContext) => buildMentorSystemPrompt(c, TAU_PPE_2025);

const base: MentorContext = {
  focusArea: null,
  totalCredits: 60,
  earnedCredits: 40,
  courseAverage: 96.4,
  focusAreaCredits: 10,
  regulationIssues: [],
  currentYear: 2,
  currentSemester: "SPRING",
  completedCourses: [
    { code: "1031-2108", nameHe: "אסטרטגיה בעידן המודרני", discipline: "POLITICAL_SCIENCE", credits: 3, grade: 90 },
  ],
  currentCourses: [],
  plannedCourses: [],
  availableNextSemester: [],
  currentSemesterCredits: 10,
};

describe("בלוק ההמרה הבינארית בפרומפט של המלך", () => {
  it("שותק לגמרי כשאין הטבת המרה — הפרומפט לא משתנה", () => {
    const withNull = build({ ...base, binaryImpact: null });
    const without = build(base);
    expect(withNull).toBe(without);
    expect(withNull).not.toContain("המרה בינארית — הממוצע שיתקבל");
  });

  it("מוסר את הממוצע החדש והדלתא, ואוסר לחשב מחדש", () => {
    const p = build({
      ...base,
      binaryImpact: {
        currentAverage: 96.4,
        quotaLeft: 5,
        candidates: [
          { nameHe: "אסטרטגיה בעידן המודרני", grade: 90, credits: 3, newAverage: 96.8, delta: 0.4 },
        ],
      },
    });
    expect(p).toContain("המרה בינארית — הממוצע שיתקבל");
    expect(p).toContain("מכסה שנותרה: 5");
    expect(p).toContain("ממוצע נוכחי: 96.4");
    expect(p).toContain("אסטרטגיה בעידן המודרני");
    expect(p).toContain("הממוצע יהיה 96.8");
    expect(p).toContain("(+0.4)");
    expect(p).toContain("אל תחשב בעצמך מה יקרה לממוצע");
  });

  it("אומר במפורש כשאין מועמד — במקום להשאיר את המודל להמציא אחד", () => {
    const p = build({
      ...base,
      binaryImpact: { currentAverage: 96.4, quotaLeft: 3, candidates: [] },
    });
    expect(p).toContain("אין כרגע ולו קורס אחד שהמרתו תעלה את הממוצע");
    expect(p).toContain("אל תציע קורס ואל תנקוב במספר");
  });

  it("מזכיר את כיוון החישוב האמיתי — המרה מעלה כשהציון נמוך מהממוצע", () => {
    const p = build({
      ...base,
      binaryImpact: {
        currentAverage: 96.4,
        quotaLeft: 5,
        candidates: [{ nameHe: "קורס", grade: 90, credits: 3, newAverage: 96.8, delta: 0.4 }],
      },
    });
    expect(p).toContain("היא מעלה אותו כשהציון **נמוך** מהממוצע הנוכחי");
  });

  it("האיסור על חישוב היפותטי קיים בפרומפט גם בלי הבלוק", () => {
    const p = build(base);
    expect(p).toContain("האיסור חל גם על שאלות היפותטיות");
    expect(p).toContain("מספר שהסטודנט עצמו ציטט לך מתוך האפליקציה גובר");
  });
});
