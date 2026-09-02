#!/usr/bin/env npx tsx
// Does the course-code prefix predict the discipline? If it does, the 123
// GENERAL courses are not "no discipline" — they are "nobody filled it in".
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
    select: { code: true, nameHe: true, discipline: true, courseType: true },
  });
  const pref = (c: string) => c.split("-")[0] ?? "?";
  const table: Record<string, Record<string, number>> = {};
  for (const c of all) {
    const p = pref(c.code);
    (table[p] ??= {})[c.discipline ?? "NULL"] = ((table[p] ??= {})[c.discipline ?? "NULL"] ?? 0) + 1;
  }
  console.log("קידומת → תחומים שהמסד מייחס לה (כמה קורסים בכל אחד)\n");
  const rows = Object.entries(table).sort((a, b) => {
    const n = (t: Record<string, number>) => Object.values(t).reduce((s, x) => s + x, 0);
    return n(b[1]) - n(a[1]);
  });
  for (const [p, counts] of rows) {
    const total = Object.values(counts).reduce((s, x) => s + x, 0);
    const parts = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    // The prefix is "decisive" when exactly one NON-GENERAL discipline appears.
    const named = parts.filter(([d]) => d !== "GENERAL" && d !== "NULL");
    const verdict =
      named.length === 1 ? `→ חד-משמעי: ${named[0]![0]}` : named.length === 0 ? "→ אין אף שיוך" : "→ מעורב";
    console.log(
      `${p.padEnd(6)} ${String(total).padStart(3)}  ${parts.map(([d, n]) => `${d}:${n}`).join("  ").padEnd(46)} ${verdict}`,
    );
  }

  console.log("\n\nכמה קורסי GENERAL היו מקבלים תחום אילו סמכנו על הקידומת:");
  let fixable = 0;
  const gains: Record<string, number> = {};
  for (const [p, counts] of rows) {
    const named = Object.entries(counts).filter(([d]) => d !== "GENERAL" && d !== "NULL");
    if (named.length !== 1) continue;
    const g = counts["GENERAL"] ?? 0;
    if (!g) continue;
    fixable += g;
    gains[named[0]![0]] = (gains[named[0]![0]] ?? 0) + g;
    console.log(`   ${p}: ${g} קורסים → ${named[0]![0]}`);
  }
  console.log(`\nסה״כ ${fixable} קורסים מתוך 123 ה-GENERAL היו מקבלים תחום.`);
  console.log("תוספת לכל תחום:", JSON.stringify(gains));
  await prisma.$disconnect();
}
void main();
