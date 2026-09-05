// =========================================================================
// הענקת/שלילת הרשאת מנהל — כלי מפורש, לא צד־אפקט של משהו אחר
// =========================================================================
// `role` הוא השדה היחיד באפליקציה שפותח נתונים של משתמשים אחרים
// (`adminProcedure`, ו-`admin/layout.tsx` מפנה החוצה בלעדיו). לכן הוא לא
// משתנה בשום מיגרציה, בשום seed ובשום מסך — רק כאן, בפקודה מפורשת עם
// כתובת מייל, ורק אחרי שהסקריפט מדפיס במי הוא נוגע.
//
//   npx tsx scripts/grant-admin.ts <email> [--revoke]
//   npx tsx scripts/grant-admin.ts --list

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
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

const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!connectionString) throw new Error("DATABASE_URL not set");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const args = process.argv.slice(2);
  const revoke = args.includes("--revoke");
  const list = args.includes("--list");
  const email = args.find((a) => !a.startsWith("--"));

  if (list || !email) {
    const admins = await prisma.user.findMany({
      where: { role: "admin" },
      select: { email: true, firstName: true, displayName: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    console.log(`מנהלים כרגע: ${admins.length}`);
    for (const a of admins) {
      console.log(`  ${a.email}  ${a.firstName ?? a.displayName ?? ""}`);
    }
    if (!email) {
      console.log("\nשימוש:  npx tsx scripts/grant-admin.ts <email> [--revoke]");
    }
    if (!email) return;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, role: true, firstName: true, displayName: true, createdAt: true },
  });
  if (!user) {
    console.error(`✗ אין משתמש עם הכתובת ${email}`);
    process.exitCode = 1;
    return;
  }

  const next = revoke ? "user" : "admin";
  console.log(
    `\n${user.email} · ${user.firstName ?? user.displayName ?? "ללא שם"} · נרשם ${user.createdAt.toISOString().slice(0, 10)}`,
  );
  if (user.role === next) {
    console.log(`= כבר ${next}. לא נגעתי.`);
    return;
  }
  await prisma.user.update({ where: { id: user.id }, data: { role: next } });
  console.log(`✅ ${user.role} → ${next}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
