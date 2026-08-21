// =========================================================================
// Does our catalog agree with the ידיעון? — read-only audit
// =========================================================================
// Ariel: "תוודא שכל קורס, כל שעה וכל שם נכונים". Until now there was nothing
// to check the catalog AGAINST — it was scraped once, and a scraper's mistakes
// look exactly like facts.
//
// Parsing the ידיעון's assessment board gave us a second, independent list of
// the same courses, straight from the university. Where the two agree, the
// name is confirmed by a source we did not write. Where they differ, that is a
// question worth a human answer — never an automatic overwrite: the ידיעון
// truncates long names in that table, so a difference is not automatically OUR
// error.
//
// Read-only. It never writes to the database.
//
//   npx tsx scripts/audit-catalog-vs-yedion.ts

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "node:fs";
import path from "node:path";
import data from "../src/data/yedion-5787-assessments.json";
import { tidyYedionName } from "../src/lib/yedion-name-tidy";

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

/**
 * Compare on meaning, not typography.
 *
 * The ידיעון's own table inserts a space on both sides of most punctuation —
 * it prints "סטטיסטיקה לפכ\" מ", "מיומנויות יסוד :", "הניאו - ליברלי". Those
 * are artefacts of how the page is typeset, not different course names, and
 * left unnormalised they drown the real differences 60-to-1.
 */
const norm = (s: string) =>
  s
    .replace(/[״"׳']/g, "")       // gershayim / quotes — purely typographic
    .replace(/[־\-]/g, "")        // hyphens, incl. the ידיעון's spaced ones
    .replace(/[:,.()?!]/g, "")    // punctuation the ידיעון pads with spaces
    .replace(/\s+/g, "")          // then spacing itself stops mattering
    .toLowerCase()
    .trim();

async function main() {
  const courses = await prisma.course.findMany({
    select: { code: true, nameHe: true, credits: true },
  });
  const byCode = new Map(courses.map((c) => [c.code, c]));

  const yedion = new Map<string, string>();
  // Tidy first, so the ידיעון's own typesetting artefacts — padded
  // punctuation, and the "שנתי" that bleeds in from the next column — do not
  // get reported as disagreements about the name.
  for (const r of data.records) if (!yedion.has(r.courseCode)) yedion.set(r.courseCode, tidyYedionName(r.courseName));

  // A catalog row whose name IS its own course code is a scrape that failed
  // and got saved anyway. The student sees "1221-4326" where a name belongs.
  const codeAsName = courses.filter((c) => c.nameHe.trim() === c.code);

  let exact = 0;
  const differ: string[] = [];
  const oursClipped: string[] = [];
  const notInCatalog: string[] = [];

  for (const [code, yName] of yedion) {
    const ours = byCode.get(code);
    if (!ours) { notInCatalog.push(`${code}  ${yName}`); continue; }
    const a = norm(ours.nameHe), b = norm(yName);
    if (a === b) { exact++; continue; }
    // A ידיעון name that our name STARTS WITH is the ידיעון's own truncation —
    // agreement, not conflict. Ours is the fuller title.
    if (a.startsWith(b)) { exact++; continue; }
    // The reverse is the interesting one: the ידיעון has MORE than we do, so
    // OUR name is the clipped one. That is our bug, not a difference of taste.
    if (b.startsWith(a)) {
      oursClipped.push(`${code}\n     ידיעון (מלא):  ${yName}\n     שלנו (קטוע):  ${ours.nameHe}`);
      continue;
    }
    differ.push(`${code}\n     ידיעון: ${yName}\n     שלנו:   ${ours.nameHe}`);
  }

  console.log(`catalog: ${courses.length} courses · ידיעון: ${yedion.size} courses`);
  console.log(`\n  !! name is just the course code: ${codeAsName.length}`);
  codeAsName.forEach((c) => console.log(`     ${c.code}  → ידיעון says: ${yedion.get(c.code) ?? "(not in ידיעון)"}`));
  console.log(`\n  confirmed by the ידיעון:  ${exact}`);
  console.log(`  OUR name is clipped:      ${oursClipped.length}`);
  console.log(`  names differ (owner call):${differ.length}`);
  console.log(`  in ידיעון, not in catalog: ${notInCatalog.length}`);
  if (oursClipped.length) { console.log("\n--- our name is the shorter one (our bug) ---"); oursClipped.forEach((s) => console.log("  " + s)); }
  if (differ.length) { console.log("\n--- differing (first 30) ---"); differ.slice(0, 30).forEach((s) => console.log("  " + s)); }
  if (notInCatalog.length) { console.log("\n--- in ידיעון only (first 30) ---"); notInCatalog.slice(0, 30).forEach((s) => console.log("  " + s)); }

  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
