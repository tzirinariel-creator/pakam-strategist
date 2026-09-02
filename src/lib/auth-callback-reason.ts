// =========================================
// מה באמת קרה בחזרה מהאימות — פונקציה אחת
// =========================================
// הסיווג הזה חי קודם כתנאי משורשר בתוך ה-route, ובדיקה **שכפלה** אותו כדי
// לבדוק אותו. השכפול הוא שאיפשר לבאג לשרוד: הבדיקה הסכימה עם הקוד, לא עם
// הסטודנט, ולכן היא הייתה ירוקה בזמן שהמסלול היה שבור.
//
// הבאג עצמו: GoTrue ממפה כל כישלון שאינו 500 בנתיב האימות לאותו
// `error=access_denied`, ושם את הסיבה האמיתית ב-`error_code` בלבד. כלומר
// קישור אישור שפג תוקפו — או שסורק הדואר של המוסד כבר "לחץ" עליו, מה שקורה
// הרבה — סווג כ"ביטול", ו"ביטול" מציג בכוונה כלום. הסטודנט לחץ על הקישור
// מהמייל ונחת על מסך התחברות שותק לגמרי.
//
// עכשיו יש מקור אחד, וה-route והבדיקה שניהם קוראים לו.

export type CallbackParams = {
  code?: string | null;
  token_hash?: string | null;
  type?: string | null;
  error?: string | null;
  error_code?: string | null;
  error_description?: string | null;
};

export type CallbackOutcome =
  /** יש קרדנציאל תקף — פותחים סשן. */
  | "session"
  /** היה קרדנציאל, וההחלפה שלו לסשן נכשלה. זה אצלנו. */
  | "exchange"
  /** הסטודנט לחץ "ביטול" במסך ההסכמה. לא תקלה, ולא אומרים עליה כלום. */
  | "cancelled"
  /** הקישור מהמייל פג תוקף או כבר נוצל. צריך קישור חדש. */
  | "expired"
  /** הספק נכשל מסיבה משלו. */
  | "provider"
  /** חזרה ריקה לגמרי — אין קרדנציאל ואין שגיאה. */
  | "auth";

export function classifyCallback(
  p: CallbackParams,
  exchangeFailed = false,
): CallbackOutcome {
  const hasCredential = Boolean(p.code || (p.token_hash && p.type));
  if (hasCredential) return exchangeFailed ? "exchange" : "session";
  if (!p.error) return "auth";

  // `error_code` הוא המקום היחיד שבו הסיבה האמיתית מגיעה. הבדיקה על התיאור
  // היא רשת ביטחון לגרסאות GoTrue שלא שולחות `error_code`.
  if (p.error_code === "otp_expired" || /expired|invalid/i.test(p.error_description ?? "")) {
    return "expired";
  }
  return p.error === "access_denied" ? "cancelled" : "provider";
}
