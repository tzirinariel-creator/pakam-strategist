#!/usr/bin/env npx tsx
// =========================================================================
// Does any mandatory course fall out of the plan?
// =========================================================================
// Ariel, 22.8: "אבל בעיקר מטריד אותי אם יש קורסי חובה שאתה מפספס בתכנון
// סמסטרים… זה מוריד קורס חובה וזה ממש קריטי ואם זה קורה בעוד מקומות זה לא טוב".
//
// The planner auto-includes a mandatory course in the year+semester its catalog
// row names (semester-planner/index.tsx → mandatoryCourses). That logic is
// correct. What it cannot defend against is a WRONG yearOffered or
// semesterOffered on the row itself: a mandatory course stamped with a
// semester it is not given in simply never appears, in any of the six
// semesters, and nothing on screen says a course went missing. That is the
// failure mode worth auditing, because it is silent.
//
// This walks all six teaching semesters exactly as the planner does, and
// reports three things a student would never otherwise learn:
//
//   · UNREACHABLE — a mandatory course that lands in NO semester. It is
//     missing from every plan the app can build.
//   · year/semester gaps — a mandatory row with no year or no semester at all,
//     which is how a course becomes unreachable in the first place.
//   · the credit total per semester, so an obviously impossible load shows up.
//
// Read-only.
//
//   npx tsx scripts/audit-mandatory-coverage.ts

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

const YEARS = [1, 2, 3];
const TERMS = ["FALL", "SPRING"] as const;
const termHe = (t: string) => (t === "FALL" ? "סמסטר א׳" : "סמסטר ב׳");

async function main() {
  const mandatory = await prisma.course.findMany({
    where: { OR: [{ courseType: "MANDATORY" }, { isMandatory: true }] },
    select: {
      code: true, nameHe: true, credits: true,
      yearOffered: true, semesterOffered: true, prerequisites: true,
    },
    orderBy: { code: "asc" },
  });

  // Exactly the planner's predicate.
  const offeredIn = (c: (typeof mandatory)[number], year: number, term: string) => {
    if (c.yearOffered.length > 0 && !c.yearOffered.includes(year)) return false;
    const sems = c.semesterOffered.map(String);
    if (sems.length > 0 && !sems.includes(term)) return false;
    return true;
  };

  const placements = new Map<string, string[]>();
  console.log(`קורסי חובה בקטלוג: ${mandatory.length} · ${mandatory.reduce((s, c) => s + c.credits, 0)} ש״ס\n`);

  for (const year of YEARS) {
    for (const term of TERMS) {
      const here = mandatory.filter((c) => offeredIn(c, year, term));
      const credits = here.reduce((s, c) => s + c.credits, 0);
      console.log(`שנה ${year} · ${termHe(term)} — ${here.length} קורסים · ${credits} ש״ס`);
      for (const c of here) {
        console.log(`    ${c.code}  ${c.credits}ש״ס  ${c.nameHe}`);
        placements.set(c.code, [...(placements.get(c.code) ?? []), `${year}-${term}`]);
      }
      if (here.length === 0) console.log("    (ריק)");
    }
  }

  // The finding that matters: a mandatory course no plan can ever contain.
  const unreachable = mandatory.filter((c) => !placements.has(c.code));
  const noYear = mandatory.filter((c) => c.yearOffered.length === 0);
  const noTerm = mandatory.filter((c) => c.semesterOffered.length === 0);

  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${unreachable.length === 0 ? "✓" : "✗"}  קורסי חובה שלא נכנסים לאף סמסטר: ${unreachable.length}`);
  unreachable.forEach((c) => console.log(`       ${c.code}  ${c.nameHe}  y=[${c.yearOffered}] s=[${c.semesterOffered}]`));

  console.log(`  ${noYear.length === 0 ? "✓" : "!"}  ללא שנה מוגדרת: ${noYear.length}`);
  noYear.forEach((c) => console.log(`       ${c.code}  ${c.nameHe}`));

  console.log(`  ${noTerm.length === 0 ? "✓" : "!"}  ללא סמסטר מוגדר: ${noTerm.length}`);
  noTerm.forEach((c) => console.log(`       ${c.code}  ${c.nameHe}`));

  // A prerequisite the student cannot have met by then is the other way a
  // mandatory course quietly becomes un-takeable.
  const byCode = new Map(mandatory.map((c) => [c.code, c]));
  const badPrereq: string[] = [];
  for (const c of mandatory) {
    const mine = placements.get(c.code)?.[0];
    if (!mine) continue;
    const [my] = mine.split("-");
    for (const p of c.prerequisites) {
      const pre = byCode.get(p);
      if (!pre) continue; // elective prerequisite — outside this audit
      const theirs = placements.get(p)?.[0];
      if (!theirs) continue;
      const [their] = theirs.split("-");
      if (Number(their) > Number(my)) {
        badPrereq.push(`${c.code} (שנה ${my}) דורש את ${p} (שנה ${their}) — מאוחר מדי`);
      }
    }
  }
  console.log(`  ${badPrereq.length === 0 ? "✓" : "✗"}  דרישות קדם שמגיעות מאוחר מדי: ${badPrereq.length}`);
  badPrereq.forEach((s) => console.log(`       ${s}`));

  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
