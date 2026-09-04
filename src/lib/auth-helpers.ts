// =========================================
// Auth helpers — error mapping
// =========================================
// Shared by signup-form.tsx and login-form.tsx so that raw English Supabase
// error strings never reach the user; they are mapped to actionable
// Hebrew/English i18n keys under the `auth` namespace.

// ─── Supabase error → i18n key mapping ────────────────────────────

/**
 * Maps a known Supabase English error message to an i18n key under the
 * `auth` namespace. Returns `null` when the message isn't recognized, so
 * callers can fall back to a generic key rather than surfacing raw English.
 */
export function authErrorKey(message: string | undefined | null): string | null {
  if (!message) return null;
  const m = message.toLowerCase();

  if (m.includes("invalid login credentials")) return "errInvalidCredentials";
  if (m.includes("email not confirmed")) return "errEmailNotConfirmed";
  if (m.includes("user already registered")) return "errUserAlreadyRegistered";
  // Supabase phrasing varies: "Password should be at least 6 characters"
  if (m.includes("password should be at least")) return "errWeakPassword";
  if (m.includes("email rate limit exceeded") || m.includes("rate limit"))
    return "errRateLimit";

  // כשל רשת — ולא סיסמה שגויה. 5.9: חסימת־קצב של Supabase חוזרת **בלי
  // כותרות CORS**, הדפדפן מדווח על חסימה, ו-supabase-js מחזיר "Failed to
  // fetch". ההודעה לא זוהתה, המסך נפל ל-loginFailed — "בדקו את הפרטים" —
  // כלומר האפליקציה האשימה סטודנט שהפרטים שלו נכונים. באוניברסיטה, עם
  // רשת עמוסה ביום רישום, זה בדיוק הרגע שבו אסור לשלוח מישהו לבדוק את
  // הסיסמה שלו.
  if (
    m.includes("failed to fetch") ||
    m.includes("networkerror") ||
    m.includes("load failed") ||
    m.includes("network request failed") ||
    m.includes("fetch failed")
  )
    return "errNetwork";

  return null;
}

/**
 * האם ה-signup הזה נענה על כתובת שכבר רשומה?
 *
 * כדי לא לחשוף מי רשום באתר, GoTrue **מדכא** את השגיאה "User already
 * registered": הוא מחזיר בלי error, בלי session, ועם `identities` ריק על
 * המשתמש. טופס ההרשמה בדק `data.session` בלבד, ולכן הראה את מסך ה-V הירוק
 * "בדקו את הדוא״ל — שלחנו קישור אישור" למי שכבר יש לו חשבון. מייל כזה לא
 * נשלח, כי אין מה לאשר; הסטודנט חיכה, לחץ "שליחת הקישור מחדש", וגם זה נכשל.
 *
 * `identities` ריק הוא הסימן היחיד, ולכן הוא כאן — ליד שאר מיפויי השגיאות —
 * ולא כתנאי אנונימי בתוך ה-handler.
 */
export function isAlreadyRegistered(
  data: { user?: { identities?: unknown } | null; session?: unknown } | null | undefined,
): boolean {
  if (!data || data.session) return false;
  const identities = data.user?.identities;
  return Array.isArray(identities) && identities.length === 0;
}
