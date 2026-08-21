#!/usr/bin/env npx tsx
// Ariel, 21.8: "לדעתי לא כל המבחנים שובצו.. אני רואה שאין מבחנים בסמסטר א׳ שנה ב׳"
// Read-only: for every planned year/semester, how many courses can show an
// exam date at all, and where the date would come from.
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "node:fs"; import path from "node:path";
import { yedionExamDates } from "../src/lib/yedion-assessments";

for (const f of [".env.local", ".env"]) {
  const p = path.join(__dirname, "..", f);
  if (!fs.existsSync(p)) continue;
  for (const l of fs.readFileSync(p, "utf-8").split("\n")) {
    const t = l.trim(); if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("="); if (i > 0 && !process.env[t.slice(0, i)]) process.env[t.slice(0, i)] = t.slice(i + 1);
  } break;
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL! }) });

async function main() {
  const email = process.argv[2] ?? process.env.NEXT_PUBLIC_DEMO_USER_EMAIL!;
  const user = await prisma.user.findFirst({ where: { email }, select: { id: true, email: true } });
  if (!user) { console.log("no such user:", email); return; }

  const ucs = await prisma.userCourse.findMany({
    where: { userId: user.id },
    include: { course: { select: { code: true, nameHe: true, submissionType: true, examDateA: true, examDateB: true } } },
    orderBy: [{ plannedYear: "asc" }, { plannedSemester: "asc" }],
  });

  const buckets = new Map<string, { total: number; exams: number; catalog: number; yedion: number; papers: number; names: string[] }>();
  for (const uc of ucs) {
    const key = `שנה ${uc.plannedYear} · ${uc.plannedSemester}`;
    const b = buckets.get(key) ?? { total: 0, exams: 0, catalog: 0, yedion: 0, papers: 0, names: [] };
    b.total++;
    const isExam = uc.course.submissionType === "EXAM";
    if (!isExam) { b.papers++; buckets.set(key, b); continue; }
    b.exams++;
    const y = yedionExamDates(uc.course.code);
    // Mirror the planner's precedence: ידיעון (תשפ״ז) first, catalog second.
    const d = y.examDateA ?? uc.course.examDateA ?? null;
    const future = d ? d.getTime() >= Date.parse(process.env.TODAY ?? "2026-08-21") : false;
    if (y.examDateA) b.yedion++;
    else if (uc.course.examDateA) b.catalog++;
    else b.names.push(`${uc.course.code} ${uc.course.nameHe}`);
    if (d && !future) b.names.push(`PAST ${d.toISOString().slice(0,10)}  ${uc.course.nameHe}`);
    buckets.set(key, b);
  }

  console.log(`${user.email} — ${ucs.length} courses\n`);
  for (const [k, b] of [...buckets].sort()) {
    const missing = b.exams - b.catalog - b.yedion;
    console.log(`${k}: ${b.total} courses · ${b.papers} papers · ${b.exams} exams`);
    console.log(`   date from catalog: ${b.catalog} · from ידיעון: ${b.yedion} · NO DATE: ${missing}`);
    b.names.slice(0, 6).forEach((n) => console.log(`      ✗ ${n}`));
  }
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
