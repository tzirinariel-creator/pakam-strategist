// =========================================
// Export current DB courses + sessions to JSON fixture
// Run: npx tsx prisma/export-fixture.ts
// =========================================

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "node:fs";
import path from "node:path";

const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!connectionString) {
  throw new Error("DIRECT_URL or DATABASE_URL must be set");
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("📦 Exporting courses and sessions from DB...");

  const courses = await prisma.course.findMany({
    orderBy: [{ discipline: "asc" }, { code: "asc" }],
  });

  const sessions = await prisma.scheduleSession.findMany({
    orderBy: [{ courseCode: "asc" }, { dayOfWeek: "asc" }, { startTime: "asc" }],
  });

  // Transform to serializable format (remove auto-generated fields)
  const coursesData = courses.map((c) => ({
    code: c.code,
    nameHe: c.nameHe,
    nameEn: c.nameEn,
    discipline: c.discipline,
    courseType: c.courseType,
    credits: c.credits,
    yearOffered: c.yearOffered,
    semesterOffered: c.semesterOffered,
    prerequisites: c.prerequisites,
    canCountAs: c.canCountAs,
    description: c.description,
    isMandatory: c.isMandatory,
    attendanceMandatory: c.attendanceMandatory,
    submissionType: c.submissionType,
    weeklyHours: c.weeklyHours,
    examDateA: c.examDateA?.toISOString() ?? null,
    examDateB: c.examDateB?.toISOString() ?? null,
    isActive: c.isActive,
  }));

  const sessionsData = sessions.map((s) => ({
    courseCode: s.courseCode,
    dayOfWeek: s.dayOfWeek,
    startTime: s.startTime,
    endTime: s.endTime,
    room: s.room,
    building: s.building,
    sessionType: s.sessionType,
    semester: s.semester,
    academicYear: s.academicYear,
    groupCode: s.groupCode,
    lecturerName: s.lecturerName,
    lecturerEmail: s.lecturerEmail,
  }));

  const fixture = {
    _meta: {
      exportedAt: new Date().toISOString(),
      courseCount: coursesData.length,
      sessionCount: sessionsData.length,
      academicYear: "2025/2026 (תשפ\"ו)",
    },
    courses: coursesData,
    scheduleSessions: sessionsData,
  };

  const outPath = path.join(__dirname, "fixtures", "ppe-courses-2025.json");
  fs.writeFileSync(outPath, JSON.stringify(fixture, null, 2), "utf-8");

  console.log(`✅ Exported ${coursesData.length} courses and ${sessionsData.length} sessions`);
  console.log(`📁 Saved to: ${outPath}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("❌ Export error:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
