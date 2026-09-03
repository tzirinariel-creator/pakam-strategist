import { describe, it, expect } from "vitest";
import { miluimYearOptions } from "@/lib/miluim";

// 4.9 — נמצא במעבר כמשתמש על החשבון החי, לא בקוד.
// ההערה של אריאל: *"הסורק נכשל ואין מילוי ידני של תקופות מילואים לסטודנט
// שנה ג׳ עם 3-4 סמסטרי מילואים."* המילוי הידני היה קיים; מה שלא היה זה
// שנים לבחור בהן — הרשימה החיה הכילה **ערך אחד**.
describe("אילו שנים אפשר לרשום בהן מילואים", () => {
  const breakDay = new Date("2026-09-04T09:00:00+03:00"); // בין הסמסטרים
  const teachingDay = new Date("2026-11-20T09:00:00+02:00");

  it("הסימפטום שנמדד חי: שנה ב׳ בחופשה קיבל ערך אחד — עכשיו גם השנה שמתכננים", () => {
    const opts = miluimYearOptions(2025, breakDay);
    expect(opts).toContain(2025); // תשפ״ו — השנה שהתחיל בה
    expect(opts).toContain(2026); // תשפ״ז — זו שהבידינג עוסק בה
    expect(opts.length).toBeGreaterThan(1);
  });

  it("שנה ג׳ עם מילואים ארוכים — כל שנות התואר, לא חלון של שלוש", () => {
    const opts = miluimYearOptions(2023, breakDay);
    expect(opts).toEqual([2023, 2024, 2025, 2026]);
  });

  it("לא מציעים שנים שלפני ההרשמה (#7/#37)", () => {
    expect(miluimYearOptions(2025, breakDay).every((y) => y >= 2025)).toBe(true);
  });

  it("שנת הרשמה לא ידועה — חלון של ארבע, בלי לנחש תאריך", () => {
    const opts = miluimYearOptions(null, breakDay);
    expect(opts).toHaveLength(4);
    expect(opts.at(-1)).toBe(2026);
  });

  it("בזמן לימודים העוגן והשנה הנוכחית זהים — הרשימה לא מתנפחת", () => {
    expect(miluimYearOptions(2024, teachingDay)).toEqual([2024, 2025, 2026]);
  });
});
