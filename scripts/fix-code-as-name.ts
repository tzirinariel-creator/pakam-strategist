#!/usr/bin/env npx tsx
// =========================================================================
// 17 courses whose NAME is their own course code
// =========================================================================
// Found by scripts/audit-catalog-vs-yedion.ts. In the live catalog right now,
// a student searching for "מהי הלשון?" sees the row "0659-2146" — the scrape
// failed for that row and the failure was saved as if it were the name.
//
// The ידיעון's assessment board carries the real name for 16 of the 17, keyed
// by the identical course code, so this is not guesswork: it is the
// university's own name for the university's own course.
//
// Two safety rules, because this writes to the production database:
//
//  1. It only ever touches a row where `nameHe` is EXACTLY the course code.
//     A row with a real name — even a slightly different one — is never
//     rewritten. Where our name and the ידיעון's merely differ, that is a
//     question for Ariel, not something to overwrite.
//  2. It refuses any ידיעון name that looks truncated. That table clips long
//     titles ("וצדק לכל ? ארה\"" is the whole cell), and a clipped name is
//     worse than the code, because it looks correct.
//
// Dry-run by default. `--apply` writes.
//
//   npx tsx scripts/fix-code-as-name.ts
//   npx tsx scripts/fix-code-as-name.ts --apply

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "node:fs";
import path from "node:path";
import data from "../src/data/yedion-5787-assessments.json";
import { tidyYedionName, looksTruncated } from "../src/lib/yedion-name-tidy";

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
  const yedion = new Map<string, string>();
  for (const r of data.records) if (!yedion.has(r.courseCode)) yedion.set(r.courseCode, r.courseName);

  const broken = (await prisma.course.findMany({ select: { code: true, nameHe: true } }))
    .filter((c) => c.nameHe.trim() === c.code);

  const fixable: { code: string; name: string }[] = [];
  const skipped: string[] = [];

  for (const c of broken) {
    const raw = yedion.get(c.code);
    if (!raw) { skipped.push(`${c.code}  — not in the ידיעון at all`); continue; }
    const name = tidyYedionName(raw);
    if (looksTruncated(name)) { skipped.push(`${c.code}  — ידיעון name looks clipped: "${name}"`); continue; }
    fixable.push({ code: c.code, name });
  }

  console.log(`rows whose name is just the code: ${broken.length}`);
  console.log(`\n--- would set (${fixable.length}) ---`);
  fixable.forEach((f) => console.log(`  ${f.code}  →  ${f.name}`));
  if (skipped.length) { console.log(`\n--- left alone (${skipped.length}) ---`); skipped.forEach((s) => console.log("  " + s)); }

  if (!apply) { console.log("\n(dry run — pass --apply to write)"); await prisma.$disconnect(); return; }

  for (const f of fixable) {
    await prisma.course.update({ where: { code: f.code }, data: { nameHe: f.name } });
    console.log(`  ✓ ${f.code}`);
  }
  console.log(`\nupdated ${fixable.length} rows`);
  await prisma.$disconnect();
}

// Only run when invoked directly — audit-catalog-vs-yedion.ts imports
// tidyYedionName/looksTruncated from here, and must not trigger a DB pass.
if (require.main === module) {
  main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
}
