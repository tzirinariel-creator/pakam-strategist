#!/usr/bin/env npx tsx
// The authority is the Yedion, not the course-code prefix. scripts/yedion_classified.json
// carries the Yedion's own section heading for each course, plus the discipline
// the parse derived from it. So: for every course our DB calls GENERAL, what
// does the Yedion actually file it under?
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

interface Y { code: string; name: string; section: string; discipline: string; courseType: string }

async function main() {
  const yed: Y[] = JSON.parse(
    fs.readFileSync(path.join(__dirname, "yedion_classified.json"), "utf8"),
  );
  const byCode = new Map(yed.map((y) => [y.code, y]));

  const db = await prisma.course.findMany({
    where: { isActive: true },
    select: { code: true, nameHe: true, discipline: true, courseType: true },
  });
  const general = db.filter((c) => !c.discipline || c.discipline === "GENERAL");
  console.log(`במסד: ${db.length} פעילים · ${general.length} מהם GENERAL`);
  console.log(`בידיעון: ${yed.length} שורות\n`);

  let agree = 0, disagree = 0, absent = 0;
  const fix: { code: string; name: string; to: string; section: string }[] = [];
  const notInYedion: string[] = [];

  for (const c of general) {
    const y = byCode.get(c.code);
    if (!y) { absent++; notInYedion.push(`${c.code}  ${c.nameHe}`); continue; }
    if (!y.discipline || y.discipline === "GENERAL") { agree++; continue; }
    disagree++;
    fix.push({ code: c.code, name: c.nameHe, to: y.discipline, section: y.section });
  }

  console.log(`הידיעון מסכים שהם כלליים: ${agree}`);
  console.log(`הידיעון נותן להם תחום — ואנחנו לא: ${disagree}`);
  console.log(`לא מופיעים בידיעון בכלל: ${absent}\n`);

  if (fix.length) {
    const by: Record<string, typeof fix> = {};
    for (const f of fix) (by[f.to] ??= []).push(f);
    console.log("── מה שהידיעון קובע ואנחנו מפספסים ──");
    for (const [disc, rows] of Object.entries(by)) {
      console.log(`\n${disc}  (${rows.length})`);
      for (const r of rows.slice(0, 40)) {
        console.log(`   ${r.code}  ${r.name.slice(0, 46).padEnd(48)} ← "${r.section.slice(0, 42)}"`);
      }
      if (rows.length > 40) console.log(`   … ועוד ${rows.length - 40}`);
    }
    fs.writeFileSync(
      path.join(__dirname, "general-vs-yedion.json"),
      JSON.stringify(fix, null, 2),
      "utf8",
    );
    console.log(`\nנכתב scripts/general-vs-yedion.json עם ${fix.length} שורות.`);
  }

  if (notInYedion.length) {
    console.log(`\n── ${notInYedion.length} קורסים שאינם בידיעון (בחירה כללית מפקולטות אחרות) ──`);
    for (const n of notInYedion.slice(0, 10)) console.log(`   ${n}`);
    if (notInYedion.length > 10) console.log(`   … ועוד ${notInYedion.length - 10}`);
  }
  await prisma.$disconnect();
}
void main();
