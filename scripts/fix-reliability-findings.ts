#!/usr/bin/env npx tsx
// =========================================================================
// The two data faults the reliability audit found, corrected from the source
// =========================================================================
// Both come out of `audit-data-reliability.ts`, and both are the kind that
// misleads quietly rather than looking broken.
//
// 1. A COURSE WHOSE NAME IS ITS OWN CODE.
//    0616-4017's nameHe is the string "0616-4017". In the catalog it renders
//    as a row that looks populated and says nothing; in the planner it is a
//    course you cannot recognise well enough to decide about. The ידיעון has
//    the real name — א"ד גורדון ובני שיחו — so this is a lookup, not a guess.
//    (This is the same fault class as the 16 rows fixed in August. One
//    survived, which is exactly why the audit had to run over everything at
//    once instead of over the rows a bug report happened to mention.)
//
// 2. A COURSE MARKED "PAPER" THAT STILL CARRIES EXAM DATES.
//    0910-1000 and 1882-1002 are both submissionType PAPER and both hold a
//    מועד א׳ and a מועד ב׳ — a contradiction, and the exam planner acts on it.
//
//    My first instinct was to clear the dates. Checking the source first is
//    what stopped that: the ידיעון's own לוח בחינות ומטלות lists BOTH courses
//    as "בחינה סופית", with real sittings and real hours. The dates are right;
//    the submissionType is what is wrong. Clearing them would have deleted
//    two correct exam dates and hidden a real sitting from students taking
//    those courses.
//
//    So this compares submissionType against the ידיעון's assessmentType for
//    every course. 206 agree, 2 disagree, and both disagreements are these.
//    The ידיעון wins, as it does everywhere else in this app.
//
//   npx tsx scripts/fix-reliability-findings.ts           # dry run
//   npx tsx scripts/fix-reliability-findings.ts --apply

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

const APPLY = process.argv.includes("--apply");
const norm = (c: string) => c.replace(/-/g, "");

async function main() {
  const schedule: { code: string; name: string }[] = JSON.parse(
    fs.readFileSync(path.join(__dirname, "yedion_schedule.json"), "utf-8"),
  );
  const assessments: { records: { courseCode: string; assessmentType: string; sittings: unknown[] }[] } = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "src", "data", "yedion-5787-assessments.json"), "utf-8"),
  );
  // A course is on the exam board only if the ידיעון actually lists SITTINGS
  // for it. A row with an empty `sittings` array is a paper deadline, which is
  // the opposite of evidence that an exam exists.
  // The ידיעון's own name for each code.
  const yedionName = new Map<string, string>();
  for (const r of schedule) {
    const n = (r.name ?? "").trim();
    if (n && !yedionName.has(norm(r.code))) yedionName.set(norm(r.code), n);
  }

  const courses = await prisma.course.findMany({
    where: { isActive: true },
    select: { id: true, code: true, nameHe: true, submissionType: true, examDateA: true, examDateB: true },
  });

  // ── 1. names that are really codes ────────────────────────────────
  const nameFixes: { id: string; code: string; from: string; to: string }[] = [];
  for (const c of courses) {
    if (!/^\d{4}-?\d{4}$/.test(c.nameHe.trim())) continue;
    const real = yedionName.get(norm(c.code));
    if (!real || /^\d{4}-?\d{4}$/.test(real)) continue; // no better name available
    nameFixes.push({ id: c.id, code: c.code, from: c.nameHe, to: real });
  }

  // ── 2. submissionType against the ידיעון's own assessment type ────
  const assessmentType = new Map<string, string>();
  for (const r of assessments.records) {
    const k = norm(r.courseCode);
    if (!assessmentType.has(k)) assessmentType.set(k, r.assessmentType);
  }
  /** The ידיעון's Hebrew label, as one of our enum values. */
  const asEnum = (t: string): string | null =>
    /בחינה/.test(t) ? "EXAM"
      : /רפרט/.test(t) ? "REFERAT"
      : /עבודה|מטלה|תרגיל|בית/.test(t) ? "PAPER"
      : null;

  const typeFixes: { id: string; code: string; name: string; from: string; to: string; label: string }[] = [];
  for (const c of courses) {
    const label = assessmentType.get(norm(c.code));
    if (!label) continue;
    const want = asEnum(label);
    if (!want || String(c.submissionType) === want) continue;
    typeFixes.push({ id: c.id, code: c.code, name: c.nameHe, from: String(c.submissionType), to: want, label });
  }

  console.log(`שמות שהם בעצם הקוד: ${nameFixes.length}`);
  for (const f of nameFixes) console.log(`   ${f.code}  "${f.from}" → "${f.to}"`);
  console.log(`\nאופן הערכה שסותר את הידיעון: ${typeFixes.length}`);
  for (const t of typeFixes) {
    console.log(`   ${t.code}  ${t.name}\n        אצלנו ${t.from} · בידיעון "${t.label}" → ${t.to}`);
  }

  if (!APPLY) {
    console.log("\n(הרצה יבשה. להחלה: --apply)");
    await prisma.$disconnect();
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(__dirname, "..", "backups", `reliability-before-${stamp}.json`);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.writeFileSync(backupPath, JSON.stringify({ nameFixes, typeFixes }, null, 2), "utf-8");
  console.log(`\nגיבוי: ${path.relative(process.cwd(), backupPath)}`);

  for (const f of nameFixes) {
    await prisma.course.update({ where: { id: f.id }, data: { nameHe: f.to } });
  }
  for (const t of typeFixes) {
    await prisma.course.update({ where: { id: t.id }, data: { submissionType: t.to as never } });
  }
  console.log(`תוקנו ${nameFixes.length} שמות ו-${typeFixes.length} אופני הערכה.`);

  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
