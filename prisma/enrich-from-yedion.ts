// =========================================
// Surgical enrichment from the official TAU Yedion (תשפ"ו).
// NON-destructive: updates exam dates on existing courses and REPLACES schedule
// sessions (which have no user foreign keys). Does NOT touch userCourses/plans.
// Run: npx tsx prisma/enrich-from-yedion.ts
// =========================================

import { PrismaClient, DayOfWeek, Semester } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "node:fs";
import path from "node:path";

const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!connectionString) throw new Error("DATABASE_URL or DIRECT_URL must be set");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

interface Fixture {
  courses: Array<{ code: string; examDateA: string | null; examDateB: string | null }>;
  scheduleSessions: Array<{
    courseCode: string; dayOfWeek: string; startTime: string; endTime: string;
    room: string | null; building: string | null; sessionType: string;
    semester: string; academicYear: number; groupCode: string | null;
    lecturerName: string | null;
  }>;
}

async function main() {
  const file = path.join(process.cwd(), "prisma/fixtures/ppe-courses-2025.json");
  const fx = JSON.parse(fs.readFileSync(file, "utf8")) as Fixture;
  const now = new Date();

  // 1) Update exam dates on existing courses (by code). Skip codes not in DB.
  let updated = 0, missing = 0;
  for (const c of fx.courses) {
    try {
      await prisma.course.update({
        where: { code: c.code },
        data: {
          examDateA: c.examDateA ? new Date(c.examDateA) : null,
          examDateB: c.examDateB ? new Date(c.examDateB) : null,
          lastSyncedAt: now,
        },
      });
      updated++;
    } catch {
      missing++;
    }
  }
  console.log(`✅ exam dates updated on ${updated} courses (${missing} fixture codes not in DB)`);

  // 2) Replace schedule sessions (no user FK references these). Only keep ones
  //    whose courseCode exists in the DB, to satisfy the FK.
  const dbCodes = new Set((await prisma.course.findMany({ select: { code: true } })).map((c) => c.code));
  const sessions = fx.scheduleSessions.filter((s) => dbCodes.has(s.courseCode));
  const deleted = await prisma.scheduleSession.deleteMany({});
  const created = await prisma.scheduleSession.createMany({
    data: sessions.map((s) => ({
      courseCode: s.courseCode,
      dayOfWeek: s.dayOfWeek as DayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      room: s.room,
      building: s.building,
      sessionType: s.sessionType,
      semester: s.semester as Semester,
      academicYear: s.academicYear,
      groupCode: s.groupCode,
      lecturerName: s.lecturerName,
    })),
  });
  console.log(`🗑️  removed ${deleted.count} old sessions; ✅ inserted ${created.count} real sessions`);

  // 3) Report
  const withSessions = await prisma.scheduleSession.findMany({ select: { courseCode: true }, distinct: ["courseCode"] });
  const withExam = await prisma.course.count({ where: { examDateA: { not: null } } });
  const withLecturer = await prisma.scheduleSession.count({ where: { lecturerName: { not: null } } });
  console.log(`📊 live now: ${withSessions.length} courses have a timetable, ${withExam} have exam dates, ${withLecturer} sessions name a lecturer`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
