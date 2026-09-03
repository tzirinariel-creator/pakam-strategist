/**
 * מה מותר לשמור בקאש משותף, ומה לעולם לא. (4.9)
 *
 * ברירת המחדל של האפליקציה היא `private, no-store` על כל תשובת tRPC, ויש
 * לזה סיבה מתועדת: `httpBatchLink` שולח כל שאילתה כ-GET, והדרך מסטודנט
 * בת״א ל-Vercel עוברת דרך פרוקסי קמפוס שאיננו שולטים בהם. תשובה שמסומנת
 * `public` בלי `Vary: Cookie` היא גיליון ציונים שנשמר בקאש ציבורי.
 *
 * יוצא דופן אחד: קטלוג הקורסים. `course.list` הוא publicProcedure שקורא
 * את טבלת Course בלבד, מסונן אך ורק לפי ה-input, ומתעדכן פעם ביום בקרון.
 * מדדתי אותו בפרודקשן בלי עוגייה: 400,632 בתים ו-1.45–2.79 שניות לביט
 * הראשון, בכל קריאה. הוא נטען בגיליון הבידינג, בהתראת החפיפות, במערכת
 * השעות, במודל הוספת קורס ובאשף.
 *
 * **התנאי הקריטי הוא ש*כל* נתיב באצווה ציבורי.** אצווה שמאחדת את
 * course.list עם user.getProfile חייבת להישאר private — אחרת החזרנו
 * בדיוק את הבאג שברירת המחדל נכתבה כדי למנוע.
 */
const PUBLIC_CACHEABLE_PATHS = new Set(["course.list"]);

export function trpcCacheControl(input: {
  paths?: readonly string[];
  type: "query" | "mutation" | "subscription" | "unknown";
  errorCount: number;
}): string {
  const { paths, type, errorCount } = input;
  const cacheable =
    type === "query" &&
    errorCount === 0 &&
    paths != null &&
    paths.length > 0 &&
    paths.every((p) => PUBLIC_CACHEABLE_PATHS.has(p));

  // max-age=0 לדפדפן (שיאמת מקומית), s-maxage ל-CDN, ו-stale-while-revalidate
  // כדי שהסטודנט הבא יקבל תשובה מיידית בזמן שהקצה מרענן ברקע.
  return cacheable
    ? "public, max-age=0, s-maxage=600, stale-while-revalidate=86400"
    : "private, no-store";
}
