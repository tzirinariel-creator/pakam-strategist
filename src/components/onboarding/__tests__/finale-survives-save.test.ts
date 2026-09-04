// =========================================================================
// L3 — הפינאלה לא נעקרת, ודף הבית לא מכריז "לא נשמר" על תוכנית שנשמרה
// =========================================================================
// אריאל, 4.9: *"כשסיימתי ושמרתי זה כתב לי שלא נשמרו קורסים — עד שעשיתי
// רענן וזה כן הראה ששמר"*.
//
// שוחזר ונמדד בפרודקשן בנתיב הכבד (גיליון עם 11 קורסים), בלי אף לחיצה
// אחרי "סיום ושמירה":
//
//   14.0s  getCredits + getGraduationScore + getProfile מתבטלים ונטענים
//   14.2s  "הכול מוכן" מופיע
//   17.8s  הפינאלה נעלמת מעצמה, ודף הבית מכריז "אין קורסים בתוכנית שלכם"
//          בזמן שהמד שלידו מראה 39 ש״ס ו-21 מתוכננים
//   plan.getUserPlan נטען מחדש **0 פעמים** בכל הרצף
//
// שני שערים נפרדים נכשלו, ולכן שתי הבדיקות כאן:
//   1. `step-ready` ביטל את קאש הפרופיל בזמן שהפינאלה על המסך. דף הבית גוזר
//      מ-`startYear` את `isGenuinelyNew`, אז הפרופיל השמור שחזר סגר את שער
//      האשף ועקר את הפינאלה — עם קאש תוכנית ריק שאיש לא ריענן.
//   2. כרטיס מצב-הריק בדף הבית נשען על `hasPlanData` בלבד, ולכן יכול היה
//      לסתור את המד שמעליו על אותו מסך.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = (p: string) => readFileSync(join(process.cwd(), p), "utf-8");

describe("שער 1 — ביטול קאש הפרופיל לא קורה בזמן שהפינאלה על המסך", () => {
  const file = src("src/components/onboarding/step-ready.tsx");

  it("בלוק השמירה לא מבטל את getProfile", () => {
    // הבלוק מתחיל ב-setSaveStage(3) ונגמר ב-setHasSaved(true) — בדיוק
    // הקטע שרץ בזמן שהמסך מציג את הפינאלה.
    const start = file.indexOf("setSaveStage(3)");
    const end = file.indexOf("setHasSaved(true)");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const saveBlock = file.slice(start, end);
    expect(saveBlock).not.toContain("getProfile.invalidate");
  });

  it("ביטול הקאש עבר ל-leave(), שרץ רק כשעוזבים את הפינאלה", () => {
    expect(file).toMatch(/const leave = \(href: string\) => \{[\s\S]*?getProfile\.invalidate\(\)/);
    expect(file).toMatch(/const leave = \(href: string\) => \{[\s\S]*?getUserPlan\.invalidate\(\)/);
  });

  it("כל יציאה מהפינאלה עוברת דרך leave — אין router.push עירום", () => {
    // router.push ישיר מדלג על ריענון הקאש, וזה בדיוק איך דף הבית קיבל
    // תוכנית ריקה ומיושנת. הקריאה היחידה המותרת היא זו שבתוך leave עצמו.
    const pushes = [...file.matchAll(/router\.push\(/g)];
    expect(pushes.length, "router.push מותר רק בתוך leave()").toBe(1);
    const inLeave = file.slice(file.indexOf("const leave = (href: string)"));
    expect(inLeave.slice(0, 300)).toContain("router.push(href)");
  });
});

describe("שער 2 — כרטיס מצב-הריק לא יכול לסתור את המד שלידו", () => {
  const file = src("src/app/[locale]/(protected)/dashboard/dashboard-content.tsx");

  it("הכרטיס מותנה גם ב-hasAnyCourses, לא רק ב-hasPlanData", () => {
    const at = file.indexOf('אין קורסים בתוכנית שלכם');
    expect(at).toBeGreaterThan(-1);
    // התנאי יושב מעל הטקסט; חלון של 900 תווים אחורה מכסה אותו במלואו.
    const condition = file.slice(Math.max(0, at - 900), at);
    expect(condition).toContain("!hasPlanData");
    expect(condition).toContain("!hasAnyCourses");
  });

  it("hasAnyCourses סופר גם ש״ס שנצברו ומתוכננים", () => {
    expect(file).toMatch(/hasAnyCourses\s*=\s*courseCount > 0 \|\| earnedCredits \+ plannedCredits > 0/);
  });
});
