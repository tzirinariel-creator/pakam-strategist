#!/usr/bin/env npx tsx
// =========================================
// Replace LAW Placeholder Courses with Real Codes
// =========================================
//
// Maps fake LAW-XXX codes to real 1411-XXXX course codes
// from TAU's law faculty. This enables:
// - Arazim grade data matching
// - IMS syllabus sync
// - Proper Yedion links
//
// Usage: npx tsx scripts/replace-law-placeholders.ts [--dry-run]
//

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "node:fs";
import path from "node:path";

// Load env
for (const envFile of [".env.local", ".env"]) {
  const envPath = path.join(__dirname, "..", envFile);
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
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
    break;
  }
}

const isDryRun = process.argv.includes("--dry-run");
const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!connectionString) throw new Error("DATABASE_URL not set");
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

// Mapping: old placeholder code → real TAU code + verified name
const LAW_CODE_MAP: Record<string, { newCode: string; nameHe: string }> = {
  "LAW-CONTRACT":       { newCode: "1411-9101", nameHe: "דיני חוזים" },
  "LAW-CONSTITUTIONAL": { newCode: "1411-9102", nameHe: "משפט חוקתי" },
  "LAW-ISRAELI":        { newCode: "1411-9103", nameHe: "משפט ישראלי" },
  "LAW-TORT":           { newCode: "1411-9104", nameHe: "דיני נזיקין" },
  "LAW-CRIMINAL":       { newCode: "1411-9109", nameHe: "דיני עונשין" },
  "LAW-THEORY":         { newCode: "1411-9111", nameHe: "תיאוריה משפטית" },
  "LAW-PROPERTY":       { newCode: "1411-9221", nameHe: "דיני קניין" },
  "LAW-INTL":           { newCode: "1411-9223", nameHe: "משפט בינלאומי פומבי" },
  "LAW-ADMIN":          { newCode: "1411-9224", nameHe: "משפט מנהלי" },
  "LAW-LABOR":          { newCode: "1411-9225", nameHe: "דיני עבודה" },
};

async function main() {
  console.log("⚖️  Replace LAW Placeholder Courses");
  console.log("====================================\n");

  if (isDryRun) {
    console.log("⚡ DRY RUN — no database changes will be made\n");
  }

  let replaced = 0;
  let skipped = 0;
  let errors = 0;

  for (const [oldCode, { newCode, nameHe }] of Object.entries(LAW_CODE_MAP)) {
    // Check if old placeholder exists
    const oldCourse = await prisma.course.findUnique({
      where: { code: oldCode },
      select: { code: true, nameHe: true, credits: true, discipline: true },
    });

    if (!oldCourse) {
      console.log(`   ⏭️  ${oldCode} — not found in DB, skipping`);
      skipped++;
      continue;
    }

    // Check if new code already exists (avoid duplicates)
    const existingNew = await prisma.course.findUnique({
      where: { code: newCode },
    });

    if (existingNew) {
      console.log(`   ⚠️  ${oldCode} → ${newCode} — target already exists, skipping`);
      skipped++;
      continue;
    }

    console.log(`   🔄 ${oldCode.padEnd(20)} → ${newCode}  (${nameHe})`);

    if (!isDryRun) {
      try {
        // schedule_sessions has ON UPDATE CASCADE from courseCode → courses.code
        // user_courses references courses.id (UUID), not code — no update needed
        // So we just update courses.code and schedule_sessions cascades automatically.
        //
        // Also update other tables that may reference course codes as plain strings:
        const yedionUrl = `https://ims.tau.ac.il/tal/syllabus/Syllabus_L.aspx?lang=HE&course=${newCode.replace("-", "")}01&year=2025`;

        // Update the course code (cascades to schedule_sessions automatically)
        await prisma.$executeRawUnsafe(
          `UPDATE "courses" SET code = $1, "nameHe" = $2, "yedionUrl" = $3 WHERE code = $4`,
          newCode, nameHe, yedionUrl, oldCode
        );

        // Update optional references in other tables (may have 0 rows — that's fine)
        await prisma.$executeRawUnsafe(
          `UPDATE "study_materials" SET "courseCode" = $1 WHERE "courseCode" = $2`,
          newCode, oldCode
        );
        await prisma.$executeRawUnsafe(
          `UPDATE "calendar_events" SET "courseCode" = $1 WHERE "courseCode" = $2`,
          newCode, oldCode
        );
        await prisma.$executeRawUnsafe(
          `UPDATE "study_tasks" SET "courseCode" = $1 WHERE "courseCode" = $2`,
          newCode, oldCode
        );

        replaced++;
      } catch (err) {
        console.error(`   ❌ Failed to replace ${oldCode}:`, err);
        errors++;
      }
    } else {
      replaced++;
    }
  }

  // Check for remaining PHIL-* placeholder
  const philCourse = await prisma.course.findUnique({
    where: { code: "PHIL-READING" },
  });
  if (philCourse) {
    console.log(`\n   📝 Note: PHIL-READING placeholder still exists — no real code equivalent found`);
  }

  console.log(`\n📊 Results:`);
  console.log(`   ✅ Replaced: ${replaced}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
  if (errors > 0) console.log(`   ❌ Errors: ${errors}`);

  // Now enrich the new courses with Arazim grade data
  if (!isDryRun && replaced > 0) {
    console.log(`\n🎓 Enriching new courses with Arazim grade data...`);

    const { fetchGrades, enrichCoursesWithGrades } = await import("../src/lib/arazim");
    const gradesData = await fetchGrades();

    const newCodes = Object.values(LAW_CODE_MAP).map((v) => v.newCode);
    const result = enrichCoursesWithGrades(newCodes, gradesData);

    console.log(`   ✅ Enriched: ${result.enriched.length}`);
    console.log(`   ❌ Not found: ${result.notFound.length}`);

    for (const summary of result.enriched) {
      try {
        await prisma.course.update({
          where: { code: summary.dbCode },
          data: {
            averageGrade: summary.averageGrade,
            medianGrade: summary.medianGrade,
            gradeStdDev: summary.gradeStdDev,
            failRate: summary.failRate,
            difficultyLevel: summary.difficultyLevel,
            gradeDataSource: "arazim",
            gradeDataYear: summary.gradeDataYear,
          },
        });
        console.log(
          `   📈 ${summary.dbCode} — avg: ${summary.averageGrade}, difficulty: ${summary.difficultyLevel}`
        );
      } catch (err) {
        console.error(`   ❌ Grade update failed for ${summary.dbCode}:`, err);
      }
    }

    if (result.notFound.length > 0) {
      console.log(`   ℹ️  No grade data for: ${result.notFound.join(", ")}`);
    }
  }

  console.log("\n✨ Done!");
}

main()
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
