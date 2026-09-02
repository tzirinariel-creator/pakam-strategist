// קריאה בלבד. שואל שאלה אחת: האם `courseType` ו-`isMandatory` מסכימים?
// אם לא — הקטלוג והמתכנן יכולים לומר לסטודנט שני דברים סותרים על אותו קורס.
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
  const courses = await prisma.course.findMany({
    where: { isActive: true },
    select: { code: true, nameHe: true, courseType: true, isMandatory: true, credits: true, yearOffered: true, semesterOffered: true },
    orderBy: { code: "asc" },
  });

  const disagree = courses.filter(
    (c) => (c.courseType === "MANDATORY") !== (c.isMandatory === true),
  );

  const byType = new Map<string, number>();
  for (const c of courses) byType.set(c.courseType, (byType.get(c.courseType) ?? 0) + 1);

  const creditsByType = new Map<string, number>();
  for (const c of courses) creditsByType.set(c.courseType, (creditsByType.get(c.courseType) ?? 0) + c.credits);

  console.log(`קורסים פעילים: ${courses.length}`);
  console.log("לפי courseType:", Object.fromEntries(byType));
  console.log("ש״ס לפי courseType:", Object.fromEntries(creditsByType));
  console.log(`\nשני השדות חלוקים על: ${disagree.length} קורסים`);
  for (const c of disagree.slice(0, 40)) {
    console.log(`  ${c.code}  courseType=${c.courseType}  isMandatory=${c.isMandatory}  ${c.nameHe}`);
  }

  // שנה א׳ סמסטר א׳ — בדיוק המסך של אורי
  const y1fall = courses.filter((c) => c.yearOffered.includes(1) && c.semesterOffered.includes("FALL"));
  const y1m = y1fall.filter((c) => c.courseType === "MANDATORY" || c.isMandatory);
  console.log(`\nשנה א׳ · סמסטר א׳: ${y1fall.length} קורסים בקטלוג, מהם ${y1m.length} חובה`);
  for (const c of y1m) console.log(`  חובה  ${c.code}  ${c.credits} ש״ס  ${c.nameHe}`);
}

main().finally(() => prisma.$disconnect());
