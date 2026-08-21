#!/usr/bin/env npx tsx
// =========================================================================
// Names of ours that the ידיעון shows are cut short
// =========================================================================
// Distinct from fix-code-as-name.ts: these rows DO have a real name, it is
// just missing its second half — "מבוא לפילוסופיה פמיניסטית" where the course
// is "מבוא לפילוסופיה פמיניסטית: מחשבות נשים". The audit finds them by a
// strict test: our name must be an exact leading prefix of the ידיעון's.
//
// Also repairs 0616-6037, which I wrote as "הלכה כפילוסופיה יהודית שנתי" in
// the previous pass before noticing that "שנתי" is a column bleed, not part
// of the title.
//
// Explicit list, not "everything the audit reports". A prefix relation is
// strong evidence but not proof, so each of these was read individually —
// and 0651-3001 was deliberately EXCLUDED for that reason: the ידיעון's
// "סמינר פכ\" מ שנתי" is our "סמינר פכ\"מ" plus the same bleed word, so our
// name was right all along.
//
//   npx tsx scripts/fix-clipped-names.ts          (dry run)
//   npx tsx scripts/fix-clipped-names.ts --apply

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

/** code → the full name, transcribed from the ידיעון and read one by one. */
const FULL: Record<string, string> = {
  "1031-3996": "בין שוק למדינה: שירותים ציבוריים בישראל ובעולם",
  "0608-1110": "מבוא לפילוסופיה פמיניסטית: מחשבות נשים",
  "1662-1158": "Digital Capitalism: From Surveillance Capitalism to Technofeudalism",
  "0616-6037": "הלכה כפילוסופיה יהודית", // repairing my own שנתי bleed
};

async function main() {
  const apply = process.argv.includes("--apply");
  for (const [code, name] of Object.entries(FULL)) {
    const cur = await prisma.course.findUnique({ where: { code }, select: { nameHe: true } });
    if (!cur) { console.log(`  ?  ${code} not in catalog`); continue; }
    if (cur.nameHe === name) { console.log(`  =  ${code} already correct`); continue; }
    console.log(`  ${apply ? "✓" : "→"}  ${code}\n       - ${cur.nameHe}\n       + ${name}`);
    if (apply) await prisma.course.update({ where: { code }, data: { nameHe: name } });
  }
  if (!apply) console.log("\n(dry run — pass --apply to write)");
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
