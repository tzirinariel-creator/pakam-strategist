import { describe, it, expect } from "vitest";
import { isAlreadyRegistered } from "@/lib/auth-helpers";

// =========================================
// "בדקו את הדוא״ל" למי שכבר יש לו חשבון
// =========================================
// GoTrue מדכא בכוונה את "User already registered" כדי לא לחשוף מי רשום
// באתר: הוא מחזיר בלי error, בלי session, ועם identities ריק. הטופס בדק
// session בלבד, אז הציג מסך V ירוק "שלחנו קישור אישור" — מייל שלא נשלח.
// הסטודנט חיכה, לחץ "שליחת הקישור מחדש", וגם זה נכשל.

describe("כתובת שכבר רשומה", () => {
  it("identities ריק בלי session = כבר רשום", () => {
    expect(isAlreadyRegistered({ user: { identities: [] }, session: null })).toBe(true);
  });

  it("משתמש חדש מגיע עם identity — לא כבר רשום", () => {
    expect(isAlreadyRegistered({ user: { identities: [{ provider: "email" }] }, session: null })).toBe(false);
  });

  it("יש session — נרשם והתחבר, זה לא המקרה הזה", () => {
    expect(isAlreadyRegistered({ user: { identities: [] }, session: { access_token: "t" } })).toBe(false);
  });

  it("identities חסר לגמרי — לא מניחים כלום", () => {
    expect(isAlreadyRegistered({ user: {}, session: null })).toBe(false);
    expect(isAlreadyRegistered({ user: null, session: null })).toBe(false);
  });

  it("null/undefined לא זורקים", () => {
    expect(isAlreadyRegistered(null)).toBe(false);
    expect(isAlreadyRegistered(undefined)).toBe(false);
  });
});
