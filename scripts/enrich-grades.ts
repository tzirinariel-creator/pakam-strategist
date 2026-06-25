#!/usr/bin/env npx tsx
// =========================================
// Enrich Courses with Arazim Grade Data
// =========================================
//
// Usage: npx tsx scripts/enrich-grades.ts [--dry-run]
//
// Fetches grade histograms from Arazim Project,
// matches them to courses in the DB, computes
// difficulty levels, and updates the database.
//

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "node:fs";
import path from "node:path";
import { fetchGrades, enrichCoursesWithGrades } from "../src/lib/arazim";

// Load .env / .env.local manually (no dotenv dependency)
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
    break; // first found wins
  }
}

const isDryRun = process.argv.includes("--dry-run");

const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!connectionString) {
  throw new Error("DIRECT_URL or DATABASE_URL must be set. Check .env or .env.local");
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🎓 Arazim Grade Enrichment");
  console.log("========================\n");

  if (isDryRun) {
    console.log("⚡ DRY RUN — no database changes will be made\n");
  }

  // 1. Fetch all active courses from DB
  console.log("📦 Loading courses from database...");
  const courses = await prisma.course.findMany({
    where: { isActive: true },
    select: { code: true, nameHe: true, credits: true, discipline: true },
  });
  console.log(`   Found ${courses.length} active courses\n`);

  // 2. Fetch Arazim grades.json
  console.log("🌐 Fetching Arazim grades data (~11 MB)...");
  const gradesData = await fetchGrades();
  const totalArazimCourses = Object.keys(gradesData).length;
  console.log(`   Loaded grade data for ${totalArazimCourses} TAU courses\n`);

  // 3. Run enrichment
  console.log("🔬 Cross-referencing and computing difficulty...");
  const courseCodes = courses.map((c) => c.code);
  const result = enrichCoursesWithGrades(courseCodes, gradesData);

  // 4. Report results
  console.log(`\n📊 Results:`);
  console.log(`   ✅ Enriched: ${result.enriched.length} courses`);
  console.log(`   ❌ Not found in Arazim: ${result.notFound.length} courses`);
  console.log(`   ⚠️  Found but no usable data: ${result.noData.length} courses`);
  console.log(`   📋 Total checked: ${result.totalChecked}\n`);

  // 5. Show enriched courses table
  if (result.enriched.length > 0) {
    console.log("📈 Enriched Courses:");
    console.log("─".repeat(100));
    console.log(
      `${"Code".padEnd(12)} ${"Name".padEnd(35)} ${"Mean".padEnd(7)} ${"Med".padEnd(7)} ${"StdD".padEnd(7)} ${"Fail%".padEnd(7)} ${"Difficulty".padEnd(12)} ${"Data From"}`
    );
    console.log("─".repeat(100));

    // Sort by difficulty (hardest first)
    const sorted = [...result.enriched].sort((a, b) => a.averageGrade - b.averageGrade);

    for (const c of sorted) {
      const course = courses.find((x) => x.code === c.dbCode);
      const name = (course?.nameHe ?? "").slice(0, 33).padEnd(35);
      console.log(
        `${c.dbCode.padEnd(12)} ${name} ${String(c.averageGrade).padEnd(7)} ${String(c.medianGrade ?? "-").padEnd(7)} ${String(c.gradeStdDev ?? "-").padEnd(7)} ${String(c.failRate ?? "-").padEnd(7)} ${c.difficultyLevel.padEnd(12)} ${c.gradeDataYear}`
      );
    }
    console.log("─".repeat(100));

    // Difficulty distribution
    const diffCounts = { easy: 0, moderate: 0, hard: 0, very_hard: 0 };
    for (const c of result.enriched) {
      diffCounts[c.difficultyLevel]++;
    }
    console.log(`\n📊 Difficulty Distribution:`);
    console.log(`   🟢 Easy:      ${diffCounts.easy}`);
    console.log(`   🟡 Moderate:  ${diffCounts.moderate}`);
    console.log(`   🟠 Hard:      ${diffCounts.hard}`);
    console.log(`   🔴 Very Hard: ${diffCounts.very_hard}`);
  }

  // 6. Show not-found courses
  if (result.notFound.length > 0) {
    console.log(`\n❌ Not found in Arazim (${result.notFound.length}):`);
    for (const code of result.notFound) {
      const course = courses.find((x) => x.code === code);
      console.log(`   ${code} — ${course?.nameHe ?? "?"}`);
    }
  }

  // 7. Apply to DB (unless dry run)
  if (!isDryRun && result.enriched.length > 0) {
    console.log(`\n💾 Writing ${result.enriched.length} grade records to database...`);

    let updated = 0;
    let errors = 0;

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
        updated++;
      } catch (err) {
        errors++;
        console.error(`   ❌ Failed to update ${summary.dbCode}:`, err);
      }
    }

    console.log(`   ✅ Updated: ${updated}`);
    if (errors > 0) console.log(`   ❌ Errors: ${errors}`);
  }

  console.log("\n✨ Done!");
}

main()
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
