/**
 * Supabase environment configuration.
 *
 * Validates the required NEXT_PUBLIC_SUPABASE_* variables once, at import
 * time, so a misconfigured deploy fails loudly with an actionable message
 * instead of crashing opaquely deep inside the Supabase client. Used by the
 * browser client, the server client, and the middleware.
 *
 * These are NEXT_PUBLIC_ vars (inlined at build time), so a missing value
 * here means the build/deploy environment is misconfigured.
 */
/**
 * 6.9 — `.trim()` כאן הוא הגנה, לא תיקון של תקלה ידועה.
 *
 * שמונה משתני-סביבה בפרודקשן נשמרו עם **תו שורה חדשה בסוף הערך**, ובהם
 * שני אלה. ב-`GOOGLE_REDIRECT_URI` זה הרג תכונה שלמה — גוגל דחתה כל בקשה
 * (ראו lib/env.ts). **כאן זה במקרה לא מזיק:** מדדתי את שני הערכים מול
 * Supabase, עם "\n" ובלעדיו, ושניהם עובדים — מפרש ה-URL מסיר רווח לבן
 * בקצוות, ולקוח supabase-js סלחן לגבי המפתח.
 *
 * החיתוך נשאר בכל זאת, כי "במקרה לא מזיק" אינו תכונה שרוצים להישען עליה,
 * וכי ערך שמגיע מבחוץ הוא קלט. אותו כלל כמו ב-lib/env.ts.
 */
function requireEnv(name: string, raw: string | undefined): string {
  const value = raw?.trim() || undefined;
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY ` +
        `in your environment (e.g. .env.local or your deploy provider) before starting the app.`,
    );
  }
  return value;
}

export const SUPABASE_URL = requireEnv(
  "NEXT_PUBLIC_SUPABASE_URL",
  process.env.NEXT_PUBLIC_SUPABASE_URL,
);

export const SUPABASE_ANON_KEY = requireEnv(
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
