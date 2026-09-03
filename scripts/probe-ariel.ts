#!/usr/bin/env npx tsx
// קריאה בלבד. שתי שאלות של אריאל: למה האפליקציה חושבת שהוא שנה א׳,
// ולמה מחיקת החשבון לא עובדת.
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "node:fs";
import path from "node:path";
for (const f of [".env.local", ".env"]) {
  const p = path.join(__dirname, "..", f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf-8").split("\n")) {
    const t = line.trim(); if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("="); if (i > 0 && !process.env[t.slice(0, i)]) process.env[t.slice(0, i)] = t.slice(i + 1);
  }
  break;
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  const u = await prisma.user.findFirst({
    where: { email: "tzirin.ariel@gmail.com" },
    select: { id: true, email: true, startYear: true, currentYear: true, currentSemester: true, createdAt: true },
  });
  if (!u) { console.log("לא נמצא משתמש עם המייל הזה"); return; }
  console.log("המשתמש:", JSON.stringify(u, null, 2));

  const courses = await prisma.userCourse.findMany({
    where: { userId: u.id },
    select: { plannedYear: true, plannedSemester: true, status: true, grade: true, course: { select: { code: true, nameHe: true } } },
    orderBy: [{ plannedYear: "asc" }, { plannedSemester: "asc" }],
  });
  const byYear = new Map<string, { n: number; completed: number }>();
  for (const c of courses) {
    const k = `שנה ${c.plannedYear} · ${c.plannedSemester}`;
    const e = byYear.get(k) ?? { n: 0, completed: 0 };
    e.n++; if (c.status === "COMPLETED") e.completed++;
    byYear.set(k, e);
  }
  console.log(`\n${courses.length} קורסים:`);
  for (const [k, v] of byYear) console.log(`  ${k}: ${v.n} קורסים, ${v.completed} הושלמו`);

  // כמה שנים כבר הושלמו בפועל?
  const completedYears = [...new Set(courses.filter(c => c.status === "COMPLETED").map(c => c.plannedYear))].sort();
  console.log(`\nשנים עם קורסים שהושלמו: ${completedYears.join(", ") || "אין"}`);
  console.log(`startYear=${u.startYear} → האפליקציה תגזור שנה ${u.startYear ? Math.min(3, Math.max(1, 2026 - u.startYear + 1)) : "?"}`);
}
main().finally(() => prisma.$disconnect());
