#!/usr/bin/env npx tsx
// Ariel, 2.9: "אני חושב שבקטלוג הקורסים אין את כל הקורסים של תחום המיקוד
// בסימון כוכב - תעמיק בזה. בכללי על כל האמינות שלנו מול הידיעון."
//
// The star lights when course.discipline === the student's focus area. So the
// question is not about the UI at all — it is about how many courses carry a
// discipline in our own catalog, and whether that matches what the Yedion says.
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "node:fs";
import path from "node:path";
for (const f of [".env.local", ".env"]) {
  const p = path.join(__dirname, "..", f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!;
  }
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function main() {

const all = await prisma.course.findMany({
  where: { isActive: true },
  select: { code: true, nameHe: true, discipline: true, courseType: true, credits: true },
});
console.log(`קטלוג פעיל: ${all.length} קורסים\n`);

const byDisc: Record<string, number> = {};
for (const c of all) byDisc[c.discipline ?? "NULL"] = (byDisc[c.discipline ?? "NULL"] ?? 0) + 1;
console.log("לפי תחום:");
for (const [d, n] of Object.entries(byDisc).sort((a, b) => b[1] - a[1])) {
  console.log(`   ${String(d).padEnd(18)} ${String(n).padStart(4)}   ${((n / all.length) * 100).toFixed(1)}%`);
}

// The three focus areas a student can actually pick.
const FOCUS = ["PHILOSOPHY", "ECONOMICS", "POLITICAL_SCIENCE"];
console.log("\nכמה קורסים יקבלו כוכב לכל בחירת תחום מיקוד:");
for (const f of FOCUS) {
  const starred = all.filter((c) => c.discipline === f);
  const cr = starred.reduce((s, c) => s + c.credits, 0);
  console.log(`   ${f.padEnd(18)} ${String(starred.length).padStart(4)} קורסים · ${cr} ש״ס`);
}

// A focus area needs 60 credits. Can it even be reached from starred courses?
console.log("\nהתחום דורש 60 ש״ס. מה הקטלוג מספק בפועל:");
for (const f of FOCUS) {
  const cr = all.filter((c) => c.discipline === f).reduce((s, c) => s + c.credits, 0);
  console.log(`   ${f.padEnd(18)} ${cr} ש״ס  ${cr >= 60 ? "✓" : "✗ מתחת לדרישה"}`);
}

// Seminars are in-field per the Yedion, but what does our catalog say?
const sems = all.filter((c) => c.courseType === "SEMINAR");
const semGeneral = sems.filter((c) => !c.discipline || c.discipline === "GENERAL");
console.log(`\nסמינרים: ${sems.length} בקטלוג · ${semGeneral.length} מהם ללא תחום (GENERAL/ריק)`);
console.log("הידיעון קובע שסמינר נספר בתוך התחום. אצלנו הם לא יקבלו כוכב.");
if (semGeneral.length) {
  console.log("\nדוגמאות:");
  for (const c of semGeneral.slice(0, 8)) console.log(`   ${c.code}  ${c.nameHe}`);
}

  await prisma.$disconnect();
}
void main();
