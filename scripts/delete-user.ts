// =========================================================================
// מחיקת חשבון מהצד שלנו — נתונים **וגם** זהות ההתחברות
// =========================================================================
// המסלול הרגיל הוא שהסטודנט מוחק את עצמו מההגדרות. הסקריפט הזה קיים לשני
// מקרים שהמסלול ההוא לא מכסה:
//
//   1. **בקשת מחיקה שמגיעה במייל** — מישהו שכבר לא מצליח להיכנס, או שפשוט
//      ביקש. אין לו איך ללחוץ על הכפתור.
//   2. **חשבון של מישהו אחר.** האפליקציה מוחקת רק את החשבון של מי שמחובר,
//      ובצדק — משתמש לא אמור למחוק משתמש. אז מחיקה כזאת נעשית מכאן.
//
// הסקריפט עושה בדיוק את מה ש-`user.deleteAccount` עושה, באותו סדר:
// התרומות האנונימיות (שמפתחן נגזר מ-userId+קוד־קורס, ולכן חייבות להימחק
// **לפני** שהשורות נעלמות), אחר כך שורת המשתמש עם כל מה שנתלה בה, ואחר כך
// זהות ההתחברות ב-Supabase.
//
// ריצה ראשונה תמיד יבשה, ומדפיסה בדיוק מה יימחק.
//
//   npx tsx scripts/delete-user.ts <email>
//   npx tsx scripts/delete-user.ts <email> --apply

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

for (const envFile of [".env.local", ".env"]) {
  const envPath = path.join(__dirname, "..", envFile);
  if (!fs.existsSync(envPath)) continue;
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0 && !process.env[t.slice(0, i)]) process.env[t.slice(0, i)] = t.slice(i + 1);
  }
  break;
}

/** ערכי סביבה נחתכים — ראו lib/env.ts (התו הבלתי-נראה, 6.9). */
const envv = (k: string) => process.env[k]?.trim().replace(/^"|"$/g, "") || undefined;

const connectionString = envv("DATABASE_URL") || envv("DIRECT_URL");
if (!connectionString) throw new Error("DATABASE_URL not set");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/** אותו hash חד-כיווני ש-course-knowledge משתמש בו. */
const dedupeHashFor = (userId: string, courseCode: string) =>
  createHash("sha256").update(`${userId}:${courseCode}`).digest("hex");

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const email = args.find((a) => !a.startsWith("--"));
  if (!email) {
    console.error("שימוש:  npx tsx scripts/delete-user.ts <email> [--apply]");
    process.exitCode = 1;
    return;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true, supabaseId: true, email: true, role: true,
      firstName: true, displayName: true, createdAt: true,
      _count: {
        select: {
          courses: true, chatSessions: true, studyTasks: true, miluimSemesters: true,
          courseReviews: true, cohortInsights: true, sharedPlans: true,
          syllabi: true, synthesisNotes: true, studyMaterials: true, calendarEvents: true,
        },
      },
    },
  });
  if (!user) {
    console.error(`✗ אין משתמש עם הכתובת ${email}`);
    process.exitCode = 1;
    return;
  }

  const c = user._count;
  console.log(`\n${user.email} · ${user.firstName ?? user.displayName ?? "ללא שם"} · role=${user.role}`);
  console.log(`נרשם ${user.createdAt.toISOString().slice(0, 16)} · id=${user.id}`);
  console.log(
    `\nמה יימחק: קורסים ${c.courses} · שיחות ${c.chatSessions} · משימות ${c.studyTasks} · ` +
      `מילואים ${c.miluimSemesters} · דירוגים ${c.courseReviews} · תובנות ${c.cohortInsights} · ` +
      `מסלולים ${c.sharedPlans} · סילבוסים ${c.syllabi} · הערות ${c.synthesisNotes} · ` +
      `חומרים ${c.studyMaterials} · אירועי יומן ${c.calendarEvents}`,
  );

  if (user.role === "admin") {
    const admins = await prisma.user.count({ where: { role: "admin" } });
    console.log(`\n⚠️  זה חשבון מנהל. אחרי המחיקה יישארו ${admins - 1} מנהלים.`);
    if (admins <= 1) {
      console.error("✗ זה המנהל היחיד. מסרב — הענק ניהול למישהו אחר קודם.");
      process.exitCode = 1;
      return;
    }
  }

  if (!apply) {
    console.log("\n🔍 ריצה יבשה בלבד. למחוק באמת: --apply");
    return;
  }

  // 1 · התרומות האנונימיות — לפני שהקורסים נעלמים, כי המפתח נגזר מהם.
  const courses = await prisma.userCourse.findMany({
    where: { userId: user.id },
    select: { course: { select: { code: true } } },
  });
  const hashes = [...new Set(courses.map((x) => x.course.code))].map((code) =>
    dedupeHashFor(user.id, code),
  );
  await prisma.$transaction([
    prisma.courseReview.deleteMany({ where: { userId: user.id } }),
    prisma.reviewReport.deleteMany({ where: { userId: user.id } }),
    ...(hashes.length
      ? [prisma.courseGradePoint.deleteMany({ where: { dedupeHash: { in: hashes } } })]
      : []),
  ]);
  console.log("✅ תרומות אנונימיות הוסרו");

  // 2 · שורת המשתמש — ה-cascade לוקח את כל מה שתלוי בה.
  await prisma.user.delete({ where: { id: user.id } });
  console.log("✅ שורת המשתמש וכל הנתונים נמחקו");

  // 3 · זהות ההתחברות. בלי זה הוא יכול להתחבר שוב ולקבל חשבון ריק חדש
  //     במקום "אין כזה חשבון" — וזה בדיוק מה שקרה עד 6.9.
  const url = envv("NEXT_PUBLIC_SUPABASE_URL");
  const key = envv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    console.log("⚠️  אין מפתח service-role — זהות ההתחברות נשארה. הסר אותה מלוח הבקרה של Supabase.");
    return;
  }
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await admin.auth.admin.deleteUser(user.supabaseId);
  if (error) {
    console.log(`⚠️  זהות ההתחברות לא נמחקה: ${error.message}`);
    console.log("   הנתונים כן נמחקו. הסר את הזהות מלוח הבקרה של Supabase.");
    return;
  }
  console.log("✅ זהות ההתחברות נמחקה — הכתובת הזאת כבר לא מוכרת למערכת");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
