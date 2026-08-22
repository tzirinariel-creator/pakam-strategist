#!/usr/bin/env npx tsx
// =========================================================================
// Every course's semester, against the ידיעון itself
// =========================================================================
// Ariel, 22.8: "אני כמעט בטוח שמיקרו ב חובה בשנה ב סמסטר א... מה קורה כאן?
// לא דיברנו על זה? מה כתוב בידיעון?"
//
// He was right and I was wrong. The ידיעון's own timetable rows say:
//
//   מיקרו א׳ (1011-2103)  →  סמסטר ב׳     the DB had FALL
//   מיקרו ב׳ (1011-2109)  →  סמסטר א׳     the DB had SPRING
//
// which is the natural sequence once the YEAR is included: מיקרו א׳ in year 1
// spring, מיקרו ב׳ in year 2 autumn, back to back. On 21.8 I "corrected" 18
// courses from the ידיעון and reported these two as fixed. They are not fixed
// — and I never re-derived them from the source, I trusted my own summary.
//
// So this stops fixing courses one at a time. It compares EVERY course's
// stored semester against the semesters the ידיעון actually lists sessions in,
// and reports the disagreements. Read-only: it changes nothing, so the list
// can be read before anything is written.
//
//   npx tsx scripts/audit-semesters-vs-yedion.ts

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

interface YedionRow {
  code: string;
  name: string;
  semester: string;
}

/** The ידיעון prints Hebrew term letters; the catalog stores enum names. */
const TERM: Record<string, string> = { "א": "FALL", "ב": "SPRING", "ק": "SUMMER" };

const norm = (code: string) => String(code).replace(/-/g, "");

async function main() {
  const raw: YedionRow[] = JSON.parse(
    fs.readFileSync(path.join(__dirname, "yedion_schedule.json"), "utf-8"),
  );

  // What the ידיעון says: the set of terms a course actually has sessions in.
  const yedion = new Map<string, Set<string>>();
  for (const r of raw) {
    const term = TERM[r.semester];
    if (!term) continue;
    const key = norm(r.code);
    if (!yedion.has(key)) yedion.set(key, new Set());
    yedion.get(key)!.add(term);
  }

  const courses = await prisma.course.findMany({
    select: {
      code: true, nameHe: true, credits: true, courseType: true,
      isMandatory: true, yearOffered: true, semesterOffered: true,
    },
    orderBy: { code: "asc" },
  });

  const disagree: {
    code: string; name: string; mandatory: boolean;
    stored: string[]; source: string[]; year: number[];
  }[] = [];
  let agreed = 0;
  let unlisted = 0;

  for (const c of courses) {
    const src = yedion.get(norm(c.code));
    // A course with no ידיעון timetable rows is not evidence of anything —
    // it simply is not scheduled in the file we hold.
    if (!src || src.size === 0) { unlisted++; continue; }

    const stored = [...c.semesterOffered].map(String).sort();
    const source = [...src].sort();
    if (stored.join(",") === source.join(",")) { agreed++; continue; }

    disagree.push({
      code: c.code,
      name: c.nameHe,
      mandatory: c.courseType === "MANDATORY" || c.isMandatory === true,
      stored,
      source,
      year: c.yearOffered,
    });
  }

  const he = (t: string) => (t === "FALL" ? "א׳" : t === "SPRING" ? "ב׳" : t === "SUMMER" ? "קיץ" : t);

  console.log(`קורסים בקטלוג: ${courses.length}`);
  console.log(`  ✓ תואמים לידיעון:      ${agreed}`);
  console.log(`  ✗ סותרים את הידיעון:   ${disagree.length}`);
  console.log(`  · אין להם שורות בידיעון: ${unlisted}  (לא ראיה לכלום)\n`);

  // Mandatory first — a required course in the wrong term costs a semester.
  disagree.sort((a, b) => Number(b.mandatory) - Number(a.mandatory) || a.code.localeCompare(b.code));

  for (const d of disagree) {
    const tag = d.mandatory ? "חובה  " : "בחירה ";
    console.log(
      `${tag} ${d.code}  ${d.name}\n` +
        `         במסד: ${d.stored.map(he).join("+") || "—"}   ·   בידיעון: ${d.source.map(he).join("+")}   ·   שנה=[${d.year}]`,
    );
  }

  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
