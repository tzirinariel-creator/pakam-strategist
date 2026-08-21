#!/usr/bin/env npx tsx
// =========================================================================
// Two fields the bidding round actually depends on
// =========================================================================
// Ariel: "ביצעת גם את האימות המלא על הכול כדי לוודא שאין אף טעות בקורס
// לקראת הבידינג?"
//
// verify-courses-for-bidding.ts found two classes of error that are not
// cosmetic, because a student acts on them:
//
//  · submissionType — we marked 71 paper courses as having a final EXAM.
//    That field drives the exam planner and the course popover, so we were
//    telling students to revise for exams that do not exist, and inflating
//    their exam-period load with phantom sittings.
//
//  · semesterOffered — 18 courses placed in the wrong term. Bidding happens
//    per term, so this sends a student to spend points in the wrong round.
//
// EVIDENCE RULE, deliberately strict. A course is only reclassified as PAPER
// when EVERY ידיעון record for it is a paper-type assessment AND not one of
// them carries a single exam sitting. A course with a real final exam always
// carries sittings (0651-1005 has two), so "no sittings anywhere" is not an
// absence of data — it is a positive statement that there is no exam.
//
// Semesters are only changed when the ידיעון gives exactly one term and we
// give exactly one different term. A course we list in both terms is left
// alone: our list may legitimately be wider than one term's assessment rows.
//
//   npx tsx scripts/fix-assessment-and-semester.ts
//   npx tsx scripts/fix-assessment-and-semester.ts --apply

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "node:fs";
import path from "node:path";
import data from "../src/data/yedion-5787-assessments.json";

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

const SEM: Record<string, "FALL" | "SPRING"> = { "א": "FALL", "ב": "SPRING" };

interface YedionView { records: number; allPaper: boolean; anySitting: boolean; semesters: Set<string> }

function buildYedion(): Map<string, YedionView> {
  const m = new Map<string, YedionView>();
  for (const r of data.records) {
    const v = m.get(r.courseCode) ?? { records: 0, allPaper: true, anySitting: false, semesters: new Set<string>() };
    v.records++;
    const type = r.assessmentType ?? "";
    // Anything that is not explicitly a paper breaks the "all paper" claim —
    // including the null/partial rows, so a parse gap can never look like
    // evidence that a course has no exam.
    if (!/עבוד/.test(type)) v.allPaper = false;
    if ((r.sittings?.length ?? 0) > 0) v.anySitting = true;
    if (r.semester) v.semesters.add(r.semester);
    m.set(r.courseCode, v);
  }
  return m;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const yedion = buildYedion();
  const courses = await prisma.course.findMany({
    select: { code: true, nameHe: true, submissionType: true, semesterOffered: true },
  });

  const toPaper: { code: string; name: string }[] = [];
  const toSemester: { code: string; name: string; from: string; to: string }[] = [];

  for (const c of courses) {
    const y = yedion.get(c.code);
    if (!y || y.records === 0) continue;

    if (c.submissionType === "EXAM" && y.allPaper && !y.anySitting) {
      toPaper.push({ code: c.code, name: c.nameHe });
    }

    const terms = [...y.semesters].map((s) => SEM[s]).filter((s): s is "FALL" | "SPRING" => !!s);
    const unique = [...new Set(terms)];
    const ours = c.semesterOffered.map(String);
    if (unique.length === 1 && ours.length === 1 && ours[0] !== unique[0]) {
      toSemester.push({ code: c.code, name: c.nameHe, from: ours[0]!, to: unique[0]! });
    }
  }

  console.log(`בחינה → עבודה: ${toPaper.length}`);
  toPaper.forEach((t) => console.log(`   ${t.code}  ${t.name}`));
  console.log(`\nתיקון סמסטר: ${toSemester.length}`);
  toSemester.forEach((t) => console.log(`   ${t.code}  ${t.name}   ${t.from} → ${t.to}`));

  if (!apply) { console.log("\n(dry run — pass --apply to write)"); await prisma.$disconnect(); return; }

  for (const t of toPaper) await prisma.course.update({ where: { code: t.code }, data: { submissionType: "PAPER" } });
  for (const t of toSemester) {
    await prisma.course.update({
      where: { code: t.code },
      data: { semesterOffered: [t.to as "FALL" | "SPRING"] },
    });
  }
  console.log(`\nעודכנו ${toPaper.length} סוגי הערכה ו-${toSemester.length} סמסטרים`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
