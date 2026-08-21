#!/usr/bin/env npx tsx
// Names the ten English-taught PPE courses in English, per Ariel's decision
// (21.8) and per the ידיעון. See src/lib/english-taught-courses.ts for why.
// Dry-run unless --apply.
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "node:fs";
import path from "node:path";
import { ENGLISH_TAUGHT_COURSES } from "../src/lib/english-taught-courses";

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
  const apply = process.argv.includes("--apply");
  for (const c of ENGLISH_TAUGHT_COURSES) {
    const cur = await prisma.course.findUnique({ where: { code: c.code }, select: { nameHe: true, nameEn: true } });
    if (!cur) { console.log(`  ?  ${c.code} not in catalog`); continue; }
    if (cur.nameHe === c.nameEn && cur.nameEn === c.nameEn) { console.log(`  =  ${c.code} already correct`); continue; }
    console.log(`  ${apply ? "✓" : "→"}  ${c.code}\n       - ${cur.nameHe}\n       + ${c.nameEn}   (חיפוש בעברית: "${c.hebrewAlias}")`);
    if (apply) await prisma.course.update({ where: { code: c.code }, data: { nameHe: c.nameEn, nameEn: c.nameEn } });
  }
  if (!apply) console.log("\n(dry run — pass --apply to write)");
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
