#!/usr/bin/env npx tsx
// =========================================================================
// Do the "facts" we print still match the catalog?
// =========================================================================
// Ariel, 1.9: "דחוף דחוף דחוף תעבוד על דף העובדות ותחקור לעומק. יש שם שטויות
// וטעויות. איזה משרד עורכי דין? על מה אתה מדבר?"
//
// The offending card claimed things about graduate careers that nobody had
// ever measured. It was replaced with facts drawn from our own catalog, which
// a student can go and count for themselves.
//
// But a number written into a string is a number that goes stale in silence.
// The catalog gains courses; "344 קורסים" quietly becomes false; and a page
// whose whole job is to be trustworthy starts lying again — slower this time,
// and harder to notice.
//
// So every numeric claim on that surface is listed here against the query that
// produced it. Run it whenever the catalog is touched.
//
//   npx tsx scripts/verify-catalog-facts.ts

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
  const all = await prisma.course.findMany({
    select: {
      code: true, nameHe: true, credits: true, discipline: true,
      courseType: true, isMandatory: true, prerequisites: true,
    },
  });

  const mandatory = all.filter((c) => c.courseType === "MANDATORY" || c.isMandatory);
  const seminars = all.filter((c) => c.courseType === "SEMINAR");
  const withPrereq = all.filter((c) => c.prerequisites.length > 0);
  const disciplines = new Set(all.map((c) => c.discipline).filter(Boolean));
  const maxCredits = Math.max(...all.map((c) => c.credits));

  /** Each claim, the value it asserts, and the value the catalog gives now. */
  const claims: { where: string; claim: string; asserted: number; actual: number }[] = [
    { where: "tips-engine ff-11 / ff-12 / m-1", claim: "קורסים בקטלוג", asserted: 344, actual: all.length },
    { where: "tips-engine m-1", claim: "קורסי חובה", asserted: 27, actual: mandatory.length },
    { where: "tips-engine m-1", claim: "ש״ס חובה", asserted: 93, actual: mandatory.reduce((s, c) => s + c.credits, 0) },
    { where: "tips-engine ff-11", claim: "קורסים עם דרישת קדם", asserted: 10, actual: withPrereq.length },
    { where: "tips-engine ff-12", claim: "סמינרים בקטלוג", asserted: 72, actual: seminars.length },
    { where: "tips-engine ff-13", claim: "ש״ס בקורס הכבד ביותר", asserted: 6, actual: maxCredits },
    { where: "tips-engine ff-14", claim: "תחומים בקטלוג", asserted: 6, actual: disciplines.size },
  ];

  let drifted = 0;
  for (const c of claims) {
    const ok = c.asserted === c.actual;
    if (!ok) drifted++;
    console.log(
      `${ok ? "✓" : "✗"}  ${c.claim}: כתוב ${c.asserted} · בקטלוג ${c.actual}   (${c.where})`,
    );
  }

  // The 6-credit courses are named on screen, so the NAMES have to hold too.
  const heaviest = all.filter((c) => c.credits === maxCredits).map((c) => c.nameHe).sort();
  console.log(`\nקורסים של ${maxCredits} ש״ס בקטלוג (${heaviest.length}):`);
  heaviest.forEach((n) => console.log(`    ${n}`));
  console.log("ff-13 מונה שלושה: מאקרו כלכלה · מבוא לאקונומטריקה · יסודות המימון");

  console.log(`\n${drifted === 0 ? "כל המספרים על המסך תואמים לקטלוג." : `${drifted} מספרים התיישנו — לתקן ב-tips-engine.ts.`}`);
  await prisma.$disconnect();
  if (drifted > 0) process.exit(1);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
