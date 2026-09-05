// =========================================================================
// `role` הוא השדה היחיד שפותח נתונים של אנשים אחרים — ואי-אפשר לכתוב אותו
// =========================================================================
// אריאל, 6.9: *"תוודא שהוא נגיש רק אליי."*
//
// שלוש שכבות שומרות על לוח הבקרה: ה-layout מפנה החוצה, `adminProcedure`
// מחזיר 403, והסרגל לא מציג את הקישור. אבל כל השלוש נשענות על אותה עובדה
// אחת — `user.role`. אם משתמש יכול לכתוב אותו, כל השאר קישוט.
//
// הבדיקה הזאת מקבעת שהוא **לא ניתן לכתיבה מהאפליקציה**:
//   · סכמת ה-input של updateProfile לא מכילה role, ו-Zod מסנן מפתחות
//     לא-מוכרים — אז גם payload עם "role":"admin" לא מגיע ל-DB.
//   · יצירת משתמש חדש לא מציינת role בכלל; הוא נופל לברירת המחדל "user".
//
// הדרך היחידה להעניק ניהול היא `scripts/grant-admin.ts` — פקודה מפורשת
// עם כתובת מייל, מול המסד, מחוץ לאפליקציה.

import { describe, it, expect } from "vitest";
import { createCallerFactory } from "@/server/trpc/init";
import { userRouter } from "@/server/routers/user";

const USER_ROW = {
  id: "u1",
  supabaseId: "sb-1",
  email: "student@mail.tau.ac.il",
  role: "user",
  startYear: 2025,
  currentYear: 2,
  currentSemester: "FALL",
  displayName: "סטודנט",
};

/** מסד מזויף שרושם כל update כדי שנוכל לבדוק מה באמת נכתב. */
function makeFakeDb() {
  const writes: Record<string, unknown>[] = [];
  const row = { ...USER_ROW };
  return {
    writes,
    db: {
      user: {
        findUnique: async () => ({ ...row }),
        findFirst: async () => ({ ...row }),
        update: async ({ data }: { data: Record<string, unknown> }) => {
          writes.push(data);
          Object.assign(row, data);
          return { ...row };
        },
        create: async ({ data }: { data: Record<string, unknown> }) => {
          writes.push(data);
          return { ...row, ...data };
        },
      },
      userCourse: { findMany: async () => [] },
      miluimSemester: { findMany: async () => [] },
    },
  };
}

function makeCaller(db: unknown) {
  const createCaller = createCallerFactory(userRouter);
  return createCaller({
    db: db as never,
    userId: "sb-1",
    session: { user: { id: "sb-1", email: USER_ROW.email } } as never,
    supabase: {} as never,
    headers: new Headers(),
    loaders: undefined,
  });
}

describe("role אינו ניתן לכתיבה מהאפליקציה", () => {
  it("updateProfile מסנן role גם כשהוא נשלח במפורש", async () => {
    const fake = makeFakeDb();
    const caller = makeCaller(fake.db);

    // בדיוק מה שתוקף היה שולח: שדה חוקי אחד, ו-role מוברח לצידו.
    await caller.updateProfile({
      displayName: "שם חדש",
      role: "admin",
    } as never);

    expect(fake.writes.length).toBeGreaterThan(0);
    for (const w of fake.writes) {
      expect(Object.keys(w)).not.toContain("role");
    }
  });

  it("גם payload שכולו role לא מייצר כתיבה של role", async () => {
    const fake = makeFakeDb();
    const caller = makeCaller(fake.db);
    await caller.updateProfile({ role: "admin" } as never);
    for (const w of fake.writes) {
      expect(Object.keys(w)).not.toContain("role");
    }
  });

  it("סכמת ה-input עצמה לא מכירה role", () => {
    // הגנה בשכבה שמעל: גם אם מישהו יחליף את המימוש, החוזה נשאר.
    const procedures = (userRouter as unknown as {
      _def: { procedures: Record<string, { _def: { inputs: unknown[] } }> };
    })._def.procedures;
    const proc = procedures.updateProfile;
    expect(proc).toBeDefined();
    const schema = proc!._def.inputs[0] as {
      shape?: Record<string, unknown>;
      _def?: { shape?: () => Record<string, unknown> };
    };
    const shape = schema.shape ?? schema._def?.shape?.() ?? {};
    expect(Object.keys(shape)).not.toContain("role");
    // ולוודא שהבדיקה בכלל מסתכלת על הסכמה הנכונה:
    expect(Object.keys(shape)).toContain("startYear");
  });
});
