// =========================================
// Pakam Strategist — Prisma Seed File
// Reads course data from JSON fixture instead of hardcoded arrays
// Run: npx prisma db seed
// =========================================

import {
  PrismaClient,
  CourseType,
  Semester,
  SubmissionType,
  DayOfWeek,
} from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "node:fs";
import path from "node:path";

const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!connectionString) {
  throw new Error("DIRECT_URL or DATABASE_URL must be set");
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

// ------------------------------------
// Load JSON fixture
// ------------------------------------

interface FixtureData {
  _meta: {
    exportedAt: string;
    courseCount: number;
    sessionCount: number;
    academicYear: string;
    program?: string;
  };
  courses: Array<{
    code: string;
    nameHe: string;
    nameEn: string | null;
    discipline: string;
    courseType: string;
    credits: number;
    yearOffered: number[];
    semesterOffered: string[];
    prerequisites: string[];
    canCountAs: string[];
    description: string | null;
    isMandatory: boolean;
    attendanceMandatory: boolean;
    submissionType: string;
    weeklyHours: number | null;
    examDateA: string | null;
    examDateB: string | null;
    isActive: boolean;
  }>;
  scheduleSessions: Array<{
    courseCode: string;
    dayOfWeek: string;
    startTime: string;
    endTime: string;
    room: string | null;
    building: string | null;
    sessionType: string;
    semester: string;
    academicYear: number;
    groupCode: string | null;
    lecturerName: string | null;
    lecturerEmail: string | null;
  }>;
}

/** All fixture files to load — order doesn't matter (skipDuplicates handles overlap) */
const FIXTURE_FILES = [
  "ppe-courses-2025.json",
  "law-courses-2025.json",
];

function loadFixtures(): FixtureData[] {
  const fixtures: FixtureData[] = [];
  for (const file of FIXTURE_FILES) {
    const fixturePath = path.join(__dirname, "fixtures", file);
    if (!fs.existsSync(fixturePath)) {
      console.warn(`⚠️  Fixture file not found, skipping: ${file}`);
      continue;
    }
    fixtures.push(JSON.parse(fs.readFileSync(fixturePath, "utf-8")));
  }
  if (fixtures.length === 0) {
    throw new Error("No fixture files found. Run: npx tsx prisma/export-fixture.ts");
  }
  return fixtures;
}

// ------------------------------------
// Main seed function
// ------------------------------------

async function main() {
  const fixtures = loadFixtures();

  // Merge all fixtures into combined arrays
  const allCourses = fixtures.flatMap((f) => f.courses);
  const allSessions = fixtures.flatMap((f) => f.scheduleSessions);

  console.log(`📦 Loading ${fixtures.length} fixture(s):`);
  for (const f of fixtures) {
    const program = f._meta.program ?? "PPE";
    console.log(`   ${program}: ${f._meta.courseCount} courses, ${f._meta.sessionCount} sessions (${f._meta.academicYear})`);
  }
  console.log(`   Total: ${allCourses.length} courses, ${allSessions.length} sessions\n`);

  // Step 1: Delete existing data (respecting FK constraints)
  console.log("🗑️  Clearing existing data...");

  const deletedSessions = await prisma.scheduleSession.deleteMany({});
  console.log(`   Cleared ${deletedSessions.count} existing schedule sessions.`);

  const deletedUserCourses = await prisma.userCourse.deleteMany({});
  console.log(`   Cleared ${deletedUserCourses.count} existing user courses.`);

  const deletedSyllabi = await prisma.syllabus.deleteMany({});
  console.log(`   Cleared ${deletedSyllabi.count} existing syllabi.`);

  const deletedCourses = await prisma.course.deleteMany({});
  console.log(`   Cleared ${deletedCourses.count} existing courses.`);

  // Step 2: Create all courses
  console.log("\n📚 Seeding courses...");

  const result = await prisma.course.createMany({
    data: allCourses.map((c) => ({
      code: c.code,
      nameHe: c.nameHe,
      nameEn: c.nameEn,
      discipline: c.discipline,
      courseType: c.courseType as CourseType,
      credits: c.credits,
      yearOffered: c.yearOffered,
      semesterOffered: c.semesterOffered as Semester[],
      prerequisites: c.prerequisites,
      canCountAs: c.canCountAs,
      isMandatory: c.isMandatory,
      attendanceMandatory: c.attendanceMandatory,
      submissionType: c.submissionType as SubmissionType,
      weeklyHours: c.weeklyHours,
      examDateA: c.examDateA ? new Date(c.examDateA) : null,
      examDateB: c.examDateB ? new Date(c.examDateB) : null,
      description: c.description,
      isActive: c.isActive ?? true,
    })),
    skipDuplicates: true,
  });

  console.log(`✅ Successfully seeded ${result.count} courses.`);

  // Step 3: Seed schedule sessions
  console.log("\n📅 Seeding schedule sessions...");

  // Validate course codes
  const dbCourses = await prisma.course.findMany({ select: { code: true } });
  const validCodes = new Set(dbCourses.map((c) => c.code));

  const validSessions = allSessions.filter((s) => {
    if (!validCodes.has(s.courseCode)) {
      console.warn(`   ⚠️ Skipping session for unknown course code: ${s.courseCode}`);
      return false;
    }
    return true;
  });

  const sessionsResult = await prisma.scheduleSession.createMany({
    data: validSessions.map((s) => ({
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
      lecturerEmail: s.lecturerEmail,
    })),
    skipDuplicates: true,
  });

  console.log(`✅ Successfully seeded ${sessionsResult.count} schedule sessions.`);
  console.log("\n🎓 Seed complete!");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("❌ Seed error:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
