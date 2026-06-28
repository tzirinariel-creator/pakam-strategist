// =========================================
// Pakam Strategist — Cleanup of non-PPE (Law-school) courses
//
// LAUNCH BLOCKER FIX: the production Course table was seeded with BOTH the real
// PPE catalog (prisma/fixtures/ppe-courses-2025.json, ~117 courses) AND a
// separate, NOT-YET-LAUNCHED Law-school catalog
// (prisma/fixtures/law-courses-2025.json, ~59 courses). Because Course has no
// `program` column, every PPE student sees the law courses in the catalog and
// gets phantom LAW mandatory courses auto-added to their plan.
//
// This script DELETES exactly the law-school-EXCLUSIVE courses — codes that
// appear in law-courses-2025.json but NOT in ppe-courses-2025.json — together
// with their dependent FK rows. The delete-set is COMPUTED from the two
// fixtures at runtime (never hardcoded), so it stays correct if a fixture
// changes. PPE's own law-DIVISION courses (e.g. 1411-9xxx, LAW_FOUNDATION) live
// in ppe-courses-2025.json and are therefore NEVER in the delete-set — they are
// kept untouched.
//
// Idempotent: re-running after a successful cleanup deletes 0 rows.
//
// DRY RUN (prints what it WOULD delete, makes no changes):
//   DRY_RUN=1 npx tsx prisma/cleanup-nonppe-courses.ts
//   npx tsx prisma/cleanup-nonppe-courses.ts --dry-run
//
// REAL RUN (the coordinator runs this against prod — do NOT run it yourself):
//   npx tsx prisma/cleanup-nonppe-courses.ts
// =========================================

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "node:fs";
import path from "node:path";

// Load .env.local manually (same loader prisma.config.ts / backfill-c3.ts use),
// so the script works whether or not DATABASE_URL is already exported.
const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.substring(0, eqIdx);
        const val = trimmed.substring(eqIdx + 1);
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}

// Same PrismaClient + PrismaPg + DATABASE_URL pattern as prisma/enrich-from-yedion.ts
const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!connectionString) throw new Error("DATABASE_URL or DIRECT_URL must be set");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const DRY_RUN =
  process.env.DRY_RUN === "1" ||
  process.env.DRY_RUN === "true" ||
  process.argv.includes("--dry-run") ||
  process.argv.includes("--dryRun");

interface MinimalFixture {
  courses: Array<{ code: string; nameHe?: string }>;
}

function loadFixture(file: string): MinimalFixture {
  const p = path.join(__dirname, "fixtures", file);
  return JSON.parse(fs.readFileSync(p, "utf8")) as MinimalFixture;
}

/**
 * Compute the set of course codes that are law-school-EXCLUSIVE:
 * present in law-courses-2025.json but absent from ppe-courses-2025.json.
 * These are the only codes this script ever touches.
 */
function computeDeleteSet(): { codes: string[]; sample: string[] } {
  const ppe = loadFixture("ppe-courses-2025.json");
  const law = loadFixture("law-courses-2025.json");

  const ppeCodes = new Set(ppe.courses.map((c) => c.code));
  const lawExclusive = law.courses
    .map((c) => c.code)
    .filter((code) => !ppeCodes.has(code));

  // De-dup defensively in case a fixture lists a code twice.
  const codes = [...new Set(lawExclusive)];
  return { codes, sample: codes.slice(0, 10) };
}

async function main() {
  const { codes, sample } = computeDeleteSet();

  console.log(
    `${DRY_RUN ? "🧪 DRY RUN — no writes will be made" : "🗑️  LIVE RUN"}\n`
  );
  console.log(`📐 Delete-set: ${codes.length} law-exclusive course codes`);
  console.log(`   Sample: ${sample.join(", ")}${codes.length > sample.length ? ", …" : ""}\n`);

  if (codes.length === 0) {
    console.log("✅ Nothing to delete — delete-set is empty. (Already clean?)");
    return;
  }

  // --- BEFORE counts (scoped strictly to the computed codes) ---
  const totalCoursesBefore = await prisma.course.count();
  const targetCourses = await prisma.course.findMany({
    where: { code: { in: codes } },
    select: { id: true, code: true },
  });
  const targetIds = targetCourses.map((c) => c.id);
  const targetCodes = targetCourses.map((c) => c.code);

  // Dependent FK rows that reference the target courses. Three true FK relations
  // point at Course: UserCourse.courseId, Syllabus.courseId (→ Course.id) and
  // ScheduleSession.courseCode (→ Course.code). All three must go first.
  const userCoursesToClean = await prisma.userCourse.count({
    where: { courseId: { in: targetIds } },
  });
  const syllabiToClean = await prisma.syllabus.count({
    where: { courseId: { in: targetIds } },
  });
  const sessionsToClean = await prisma.scheduleSession.count({
    where: { courseCode: { in: targetCodes } },
  });

  console.log("📊 Before:");
  console.log(`   Total courses in DB:           ${totalCoursesBefore}`);
  console.log(`   Law-exclusive courses present: ${targetCourses.length}`);
  console.log(`   ↳ userCourses to clean:        ${userCoursesToClean}`);
  console.log(`   ↳ syllabi to clean:            ${syllabiToClean}`);
  console.log(`   ↳ scheduleSessions to clean:   ${sessionsToClean}\n`);

  if (DRY_RUN) {
    console.log("🧪 DRY RUN — would delete the above dependent rows, then the");
    console.log(`   ${targetCourses.length} law-exclusive courses. No changes made.`);
    const projectedAfter = totalCoursesBefore - targetCourses.length;
    console.log(`   Projected total courses after: ${projectedAfter}`);
    return;
  }

  // --- LIVE delete in one transaction, FK order: children → parents ---
  const result = await prisma.$transaction(async (tx) => {
    const ucDel = await tx.userCourse.deleteMany({
      where: { courseId: { in: targetIds } },
    });
    const syDel = await tx.syllabus.deleteMany({
      where: { courseId: { in: targetIds } },
    });
    const ssDel = await tx.scheduleSession.deleteMany({
      where: { courseCode: { in: targetCodes } },
    });
    const cDel = await tx.course.deleteMany({
      where: { code: { in: codes } }, // scoped strictly to computed codes
    });
    return {
      userCourses: ucDel.count,
      syllabi: syDel.count,
      sessions: ssDel.count,
      courses: cDel.count,
    };
  });

  const totalCoursesAfter = await prisma.course.count();

  console.log("✅ Deleted (FK-safe order):");
  console.log(`   userCourses cleaned:    ${result.userCourses}`);
  console.log(`   syllabi cleaned:        ${result.syllabi}`);
  console.log(`   scheduleSessions cleaned: ${result.sessions}`);
  console.log(`   courses deleted:        ${result.courses}\n`);

  console.log("📊 After:");
  console.log(`   Total courses in DB: ${totalCoursesBefore} → ${totalCoursesAfter}`);
  console.log("\n🎓 Cleanup complete — PPE catalog only.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("❌ Cleanup error:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
