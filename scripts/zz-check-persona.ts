import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "node:fs"; import path from "node:path";
for (const f of [".env.local", ".env"]) {
  const p = path.join(__dirname, "..", f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!;
  }
  break;
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const email = process.env.NEXT_PUBLIC_TEST_USER_EMAIL!;
async function main() {
const u = await prisma.user.findUnique({
  where: { email },
  include: { miluimSemesters: { orderBy: [{ academicYear: "asc" }, { semester: "asc" }] } },
});
console.log("startYear:", u?.startYear, "· currentYear:", u?.currentYear, "· miluimGroup:", u?.miluimGroup);
console.log("שורות מילואים:");
for (const m of u?.miluimSemesters ?? [])
  console.log(`   ${m.academicYear} ${m.semester}  ${m.daysServed} ימים  לחימה=${m.isCombat}  → ${m.derivedGroup}`);
const courses = await prisma.userCourse.groupBy({ by: ["status"], where: { userId: u!.id }, _count: true });
console.log("קורסים:", courses.map((c) => `${c.status}:${c._count}`).join(" · "));
await prisma.$disconnect();
}
void main();
