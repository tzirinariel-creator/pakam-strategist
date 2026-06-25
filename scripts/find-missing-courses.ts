#!/usr/bin/env npx tsx
// =========================================
// Find Missing PPE Courses
// =========================================
//
// Cross-references Arazim grades.json with our DB
// to find courses in PPE-relevant faculties that
// we might be missing.
//
// Usage: npx tsx scripts/find-missing-courses.ts
//

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "node:fs";
import path from "node:path";
import { fetchGrades, arazimCodeToDb } from "../src/lib/arazim";

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

const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!connectionString) throw new Error("DATABASE_URL not set");
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

// PPE-relevant 4-digit faculty prefixes (based on existing courses in DB)
const PPE_PREFIXES = [
  "0608", // Feminist philosophy
  "0616", // Philosophy (English)
  "0618", // Philosophy
  "0621", // History
  "0651", // PPE program
  "0662", // Glocal/Sagol
  "0910", // Environmental law
  "1011", // Economics
  "1031", // Political Science
  "1082", // Environmental policy
  "1099", // European Studies
  "1221", // Management
  "1411", // Law (foundation courses for PPE)
  "1662", // Sagol School
  "1880", // Sustainability
  "1882", // Interdisciplinary
];

async function main() {
  console.log("🔍 Finding Missing PPE Courses");
  console.log("===============================\n");

  // 1. Get existing courses from DB
  const existingCourses = await prisma.course.findMany({
    select: { code: true, nameHe: true, discipline: true },
  });
  const existingCodes = new Set(existingCourses.map((c) => c.code.replace("-", "")));
  console.log(`📦 Existing courses in DB: ${existingCourses.length}`);

  // 2. Get prefix distribution of existing courses
  const prefixCounts = new Map<string, number>();
  for (const c of existingCourses) {
    const prefix = c.code.replace("-", "").slice(0, 4);
    prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1);
  }
  console.log("\n📊 Existing course prefixes:");
  for (const [prefix, count] of [...prefixCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${prefix}: ${count} courses`);
  }

  // 3. Fetch Arazim grades
  console.log("\n🌐 Fetching Arazim grades data...");
  const gradesData = await fetchGrades();
  const allArazimCodes = Object.keys(gradesData);
  console.log(`   Total Arazim courses: ${allArazimCodes.length}`);

  // 4. Filter Arazim courses by PPE prefixes
  const ppeArazimCodes = allArazimCodes.filter((code) =>
    PPE_PREFIXES.some((prefix) => code.startsWith(prefix))
  );
  console.log(`   PPE-prefix courses in Arazim: ${ppeArazimCodes.length}`);

  // 5. Find courses in Arazim but NOT in our DB
  const missingCodes = ppeArazimCodes.filter((code) => !existingCodes.has(code));
  console.log(`\n🆕 Courses in Arazim but NOT in DB: ${missingCodes.length}`);

  // 6. For each missing course, get the best grade data
  console.log("\n" + "─".repeat(110));
  console.log(
    `${"Prefix".padEnd(7)} ${"Code".padEnd(12)} ${"Mean".padEnd(7)} ${"Med".padEnd(7)} ${"Latest".padEnd(9)} ${"Notes"}`
  );
  console.log("─".repeat(110));

  // Group by prefix
  const byPrefix = new Map<string, string[]>();
  for (const code of missingCodes) {
    const prefix = code.slice(0, 4);
    if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
    byPrefix.get(prefix)!.push(code);
  }

  for (const [prefix, codes] of [...byPrefix.entries()].sort()) {
    // Show count header
    console.log(`\n  === ${prefix} (${codes.length} missing) ===`);

    // Only show courses with recent data (2020+)
    const recentCourses: { code: string; mean: number; median: string; latest: string }[] = [];

    for (const code of codes) {
      const courseGrades = gradesData[code];
      if (!courseGrades) continue;

      // Find most recent semester
      const semesters = Object.keys(courseGrades).sort((a, b) => {
        const ya = parseInt(a.match(/\d+/)?.[0] ?? "0");
        const yb = parseInt(b.match(/\d+/)?.[0] ?? "0");
        if (ya !== yb) return yb - ya;
        return b.localeCompare(a);
      });

      const latest = semesters[0];
      if (!latest) continue;

      const year = parseInt(latest.match(/\d+/)?.[0] ?? "0");
      if (year < 2020) continue; // skip very old courses

      const groups = courseGrades[latest];
      if (!groups) continue;
      const group = groups["01"] ?? groups["00"];
      if (!group || group.length === 0) continue;
      const entry = group.find((e) => e.moed === 1) ?? group[0];
      if (!entry?.mean) continue;

      recentCourses.push({
        code,
        mean: entry.mean,
        median: entry.median != null ? String(entry.median) : "-",
        latest,
      });
    }

    // Sort by mean ascending (hardest first)
    recentCourses.sort((a, b) => a.mean - b.mean);

    for (const c of recentCourses.slice(0, 15)) {
      // only show top 15 per prefix
      const dbCode = arazimCodeToDb(c.code);
      console.log(
        `  ${prefix.padEnd(7)} ${dbCode.padEnd(12)} ${String(Math.round(c.mean * 10) / 10).padEnd(7)} ${c.median.padEnd(7)} ${c.latest}`
      );
    }

    if (recentCourses.length > 15) {
      console.log(`  ... and ${recentCourses.length - 15} more`);
    }
    if (recentCourses.length === 0) {
      console.log("  (no courses with recent data 2020+)");
    }
  }

  // 7. Summary
  console.log("\n" + "─".repeat(110));
  console.log("\n📊 Summary by prefix:");
  for (const [prefix, codes] of [...byPrefix.entries()].sort()) {
    console.log(`   ${prefix}: ${codes.length} courses in Arazim but not in DB`);
  }

  console.log("\n✨ Done!");
}

main()
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
