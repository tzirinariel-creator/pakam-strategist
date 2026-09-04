import { describe, it, expect } from "vitest";
import { authErrorKey } from "@/lib/auth-helpers";

// 5.9 — חסימת־קצב של Supabase חוזרת בלי כותרות CORS, והדפדפן מתרגם אותה
// לכשל רשת. supabase-js מחזיר "Failed to fetch", ההודעה לא זוהתה, והמסך
// אמר "בדקו את הפרטים" למי שהפרטים שלו נכונים.
describe("שגיאת רשת אינה סיסמה שגויה", () => {
  it.each([
    "Failed to fetch",
    "TypeError: Failed to fetch",
    "NetworkError when attempting to fetch resource.",
    "Load failed",
    "Network request failed",
    "fetch failed",
  ])("מזהה %s ככשל רשת", (msg) => {
    expect(authErrorKey(msg)).toBe("errNetwork");
  });

  it("לא בולע פרטים שגויים אמיתיים", () => {
    expect(authErrorKey("Invalid login credentials")).toBe("errInvalidCredentials");
  });

  it("לא בולע חסימת־קצב מפורשת", () => {
    expect(authErrorKey("Email rate limit exceeded")).toBe("errRateLimit");
  });
});
