#!/usr/bin/env npx tsx
// =========================================================================
// Pre-bidding verification: is anything about a course wrong?
// =========================================================================
// Ariel: "ביצעת גם את האימות המלא על הכול כדי לוודא שאין אף טעות בקורס
// לקראת הבידינג?"
//
// Bidding is the moment our data stops being informational. A student picks
// courses off our screen and commits registration points to them. A wrong
// SEMESTER sends them to bid in the wrong round; a wrong ASSESSMENT TYPE makes
// them plan an exam that is really a paper; a missing course simply is not
// considered.
//
// The ידיעון gives us an independent value for exactly those three fields, so
// each one can be checked rather than trusted. This reports; it never writes.
//
//   npx tsx scripts/verify-courses-for-bidding.ts

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "node:fs";
import path from "node:path";
import data from "../src/data/yedion-5787-assessments.json";
import { tidyYedionName } from "./fix-code-as-name";

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

const norm = (s: string) =>
  s.replace(/[״"׳']/g, "").replace(/[־\-]/g, "").replace(/[:,.()?!]/g, "")
   .replace(/\s+/g, "").toLowerCase().trim();

async function main() {
  const courses = await prisma.course.findMany({
    select: {
      code: true, nameHe: true, credits: true, semesterOffered: true,
      submissionType: true, yearOffered: true, isActive: true,
    },
  });
  const byCode = new Map(courses.map((c) => [c.code, c]));

  // One ידיעון view per course: its semesters, and whether it is examined.
  const yedion = new Map<string, { name: string; semesters: Set<string>; exam: boolean; paper: boolean }>();
  for (const r of data.records) {
    const e = yedion.get(r.courseCode) ?? { name: tidyYedionName(r.courseName), semesters: new Set<string>(), exam: false, paper: false };
    if (r.semester) e.semesters.add(r.semester);
    if (r.assessmentType?.includes("בחינה")) e.exam = true;
    if (r.assessmentType?.includes("עבודה") || r.assessmentType?.includes("עבודת")) e.paper = true;
    yedion.set(r.courseCode, e);
  }

  const issues: Record<string, string[]> = {
    "שם שגוי": [], "סמסטר שגוי": [], "סוג הערכה שגוי": [],
    "ש״ס חסר או חשוד": [], "לא פעיל אך מופיע בידיעון": [],
  };

  // The ידיעון writes semesters as א/ב; our enum is FALL/SPRING. Getting this
  // mapping wrong reports every course as broken — which is what a first run
  // of this script did, and is the reason it prints the mapping it used.
  const SEM: Record<string, string> = { "א": "FALL", "ב": "SPRING" };

  for (const c of courses) {
    // Credits are not in the ידיעון, so this is an internal sanity check only:
    // a PPE course is 2–8 ש״ס. Zero or absurd means the scrape lost the cell.
    if (!(c.credits > 0) || c.credits > 12) {
      issues["ש״ס חסר או חשוד"]!.push(`${c.code}  ${c.nameHe}  →  ${c.credits}`);
    }

    const y = yedion.get(c.code);
    if (!y) continue;

    if (!c.isActive) issues["לא פעיל אך מופיע בידיעון"]!.push(`${c.code}  ${c.nameHe}`);

    if (norm(c.nameHe) !== norm(y.name) && !norm(c.nameHe).startsWith(norm(y.name))) {
      issues["שם שגוי"]!.push(`${c.code}\n     ידיעון: ${y.name}\n     שלנו:   ${c.nameHe}`);
    }

    // Semester: only flag a course the ידיעון places somewhere we do NOT offer
    // it. Our list may legitimately be wider (a course given in both terms).
    const ours = new Set(c.semesterOffered.map(String));
    const missing = [...y.semesters].map((s) => SEM[s]).filter((s): s is string => !!s && !ours.has(s));
    if (missing.length > 0 && ours.size > 0) {
      issues["סמסטר שגוי"]!.push(`${c.code}  ${c.nameHe}  →  ידיעון: ${[...y.semesters].join("+")} · שלנו: ${[...ours].join("+")}`);
    }

    // Assessment: the ידיעון is explicit when a course has a final exam.
    if (y.exam && !y.paper && c.submissionType !== "EXAM") {
      issues["סוג הערכה שגוי"]!.push(`${c.code}  ${c.nameHe}  →  ידיעון: בחינה · שלנו: ${c.submissionType}`);
    }
    if (y.paper && !y.exam && c.submissionType === "EXAM") {
      issues["סוג הערכה שגוי"]!.push(`${c.code}  ${c.nameHe}  →  ידיעון: עבודה · שלנו: בחינה`);
    }
  }

  console.log(`נבדקו ${courses.length} קורסים מול ${yedion.size} רשומות בידיעון`);
  console.log(`מיפוי סמסטרים: ${Object.entries(SEM).map(([k, v]) => `${k}→${v}`).join(" · ")}\n`);
  let total = 0;
  for (const [label, list] of Object.entries(issues)) {
    console.log(`  ${list.length === 0 ? "✓" : "✗"}  ${label}: ${list.length}`);
    total += list.length;
  }
  for (const [label, list] of Object.entries(issues)) {
    if (list.length === 0) continue;
    console.log(`\n--- ${label} (${list.length}) ---`);
    list.slice(0, 40).forEach((s) => console.log("  " + s));
    if (list.length > 40) console.log(`  …ועוד ${list.length - 40}`);
  }
  console.log(`\nסה״כ ממצאים: ${total}`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
