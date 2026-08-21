#!/usr/bin/env npx tsx
// =========================================================================
// Put the תשפ״ז exam dates where every screen already looks
// =========================================================================
// Ariel, 21.8: "איך לעזאזל הוא אומר לי שהמבחנים כבר עברו לקראת סמסטר א של שנה
// ב׳ שלי? אתה מבין איזו נפילה רצינית זאת שאי אפשר להשיק איתה?"
//
// He is right, and my previous fix was too narrow. I changed the EXAM PLANNER
// to prefer the ידיעון over our stale catalog and stopped there. But
// Course.examDateA/B is read directly by at least ten other places — the
// dashboard countdown, the exam gantt, the weekly schedule, the insights bar,
// the semester summary, the course popover, the catalog modal, the .ics export,
// and the context the AI advisor answers from. Every one of those still saw
// תשפ״ו dates that have all already passed, so they each independently
// concluded "all your exams are behind you".
//
// Patching ten components is how this comes back an eleventh time. The columns
// themselves are wrong, so the columns are what gets fixed:
//
//   · a course the ידיעון lists → its real תשפ״ז sittings are written in;
//   · a course the ידיעון does NOT list, whose stored dates have all passed →
//     the dates are CLEARED.
//
// That second half matters as much as the first. A stale date is worse than no
// date: with no date the app says "no sitting published yet" and offers the
// student a place to type one, while a past date makes the course vanish from
// every exam surface with no explanation at all. Silence that looks like an
// answer is the failure mode here.
//
// Re-runnable. Dry-run unless --apply.
//
//   npx tsx scripts/refresh-exam-dates-from-yedion.ts
//   npx tsx scripts/refresh-exam-dates-from-yedion.ts --apply

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "node:fs";
import path from "node:path";
import { yedionExamDates } from "../src/lib/yedion-assessments";

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

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");

async function main() {
  const apply = process.argv.includes("--apply");
  // "Now" is the boundary for calling a stored date stale. Passed in so a run
  // is reproducible and so the meaning of "past" is stated, not implied.
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const courses = await prisma.course.findMany({
    select: { code: true, nameHe: true, examDateA: true, examDateB: true, submissionType: true },
  });

  const toSet: { code: string; name: string; a: Date | null; b: Date | null; wasA: Date | null }[] = [];
  const toClear: { code: string; name: string; wasA: Date | null }[] = [];
  let alreadyCurrent = 0;

  for (const c of courses) {
    const y = yedionExamDates(c.code);
    const hasYedion = y.examDateA != null || y.examDateB != null;

    if (hasYedion) {
      const same =
        c.examDateA?.getTime() === y.examDateA?.getTime() &&
        c.examDateB?.getTime() === y.examDateB?.getTime();
      if (same) { alreadyCurrent++; continue; }
      toSet.push({ code: c.code, name: c.nameHe, a: y.examDateA, b: y.examDateB, wasA: c.examDateA });
      continue;
    }

    // Not in the ידיעון. Clear only dates that have ALL already passed — a
    // future date we hold and the ידיעון does not is still useful.
    const stored = [c.examDateA, c.examDateB].filter((d): d is Date => d != null);
    if (stored.length === 0) continue;
    if (stored.every((d) => d.getTime() < now.getTime())) {
      toClear.push({ code: c.code, name: c.nameHe, wasA: c.examDateA });
    }
  }

  console.log(`catalog: ${courses.length} courses`);
  console.log(`  already current:            ${alreadyCurrent}`);
  console.log(`  → set from the ידיעון:      ${toSet.length}`);
  console.log(`  → clear (stale, not in ידיעון): ${toClear.length}`);

  console.log(`\n--- set (first 15) ---`);
  toSet.slice(0, 15).forEach((t) =>
    console.log(`  ${t.code}  ${t.name.slice(0, 34).padEnd(34)}  ${iso(t.wasA)} → ${iso(t.a)} / ${iso(t.b)}`),
  );
  console.log(`\n--- clear (first 15) ---`);
  toClear.slice(0, 15).forEach((t) =>
    console.log(`  ${t.code}  ${t.name.slice(0, 34).padEnd(34)}  ${iso(t.wasA)} → —`),
  );

  if (!apply) { console.log("\n(dry run — pass --apply to write)"); await prisma.$disconnect(); return; }

  for (const t of toSet) {
    await prisma.course.update({
      where: { code: t.code },
      data: { examDateA: t.a, examDateB: t.b },
    });
  }
  for (const t of toClear) {
    await prisma.course.update({
      where: { code: t.code },
      data: { examDateA: null, examDateB: null },
    });
  }
  console.log(`\nset ${toSet.length} · cleared ${toClear.length}`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
