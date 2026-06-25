#!/usr/bin/env npx tsx
// =========================================
// Local Sync Script — runs on your machine
// Bypasses cloud IP blocking by TAU servers
//
// Usage:
//   npm run sync              # sync 15 courses (default batch)
//   npm run sync -- --all     # sync ALL courses (takes ~4 min)
//   npm run sync -- --batch 5 # custom batch size
// =========================================

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { fetchSyllabus, clearSessionCache } from "@/lib/scraper/fetcher";
import { parseSyllabusHtml } from "@/lib/scraper/parser";
import { computeDiff, type CourseWithSchedule } from "@/lib/scraper/differ";
import { autoApplySafe } from "@/lib/scraper/applier";
import type { ScrapeResult, ScrapedCourse } from "@/lib/scraper/types";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

// =========================================
// Load .env
// =========================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnv() {
  const envFiles = [".env.local", ".env"];
  const root = path.join(__dirname, "..");

  for (const envFile of envFiles) {
    const envPath = path.join(root, envFile);
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
          const eqIdx = trimmed.indexOf("=");
          if (eqIdx > 0) {
            const key = trimmed.substring(0, eqIdx);
            const val = trimmed.substring(eqIdx + 1);
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      }
    }
  }
}

loadEnv();

// =========================================
// Parse CLI args
// =========================================

const args = process.argv.slice(2);
const syncAll = args.includes("--all");
const batchIdx = args.indexOf("--batch");
const batchSize = syncAll
  ? 999
  : batchIdx >= 0
    ? parseInt(args[batchIdx + 1] || "15", 10)
    : 15;

// =========================================
// Academic year helper
// =========================================

function getCurrentAcademicYear(): number {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  return month >= 8 ? year : year - 1;
}

// =========================================
// Color helpers for terminal output
// =========================================

const c = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
};

// =========================================
// Main
// =========================================

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error(`${c.red}❌ DATABASE_URL not found in .env${c.reset}`);
    process.exit(1);
  }

  console.log(`\n${c.bold}${c.blue}🔄 פכמון — סנכרון מקומי${c.reset}`);
  console.log(`${c.dim}Syncing courses from TAU Yedion...${c.reset}\n`);

  const adapter = new PrismaPg({
    connectionString,
    connectionTimeoutMillis: 15_000,
    idleTimeoutMillis: 30_000,
    max: 3,
  });
  const prisma = new PrismaClient({ adapter });

  const year = getCurrentAcademicYear();
  console.log(`${c.cyan}📅 Academic year: ${year} (${year}/${year + 1})${c.reset}`);
  console.log(`${c.cyan}📦 Batch size: ${syncAll ? "ALL" : batchSize}${c.reset}\n`);

  // Create sync log
  const syncLog = await prisma.syncLog.create({
    data: { status: "running" },
  });

  try {
    clearSessionCache();

    // Get courses sorted by lastSyncedAt (null first = never synced)
    const existingCourses = await prisma.course.findMany({
      where: { isActive: true },
      include: { scheduleSessions: true },
      orderBy: { lastSyncedAt: { sort: "asc", nulls: "first" } },
      ...(syncAll ? {} : { take: batchSize }),
    });

    console.log(
      `${c.bold}Found ${existingCourses.length} courses to sync${c.reset}\n`
    );

    const scrapeResults: ScrapeResult[] = [];
    const scrapeDataMap = new Map<string, ScrapedCourse>();

    let successCount = 0;
    let errorCount = 0;
    let emptyCount = 0;

    for (let i = 0; i < existingCourses.length; i++) {
      const course = existingCourses[i]!;
      const codeNormalized = course.code.replace(/-/g, "");
      const code10 =
        codeNormalized.length === 8 ? codeNormalized + "01" : codeNormalized;

      const progress = `[${(i + 1).toString().padStart(3)}/${existingCourses.length}]`;

      try {
        const html = await fetchSyllabus(code10, year);
        const parsed = parseSyllabusHtml(html, code10);

        if (parsed) {
          scrapeDataMap.set(codeNormalized.slice(0, 8), parsed);
          successCount++;
          console.log(
            `${c.green}✓${c.reset} ${progress} ${course.code} ${c.dim}${parsed.nameHe}${c.reset} ${c.dim}(${parsed.schedule.length} sessions)${c.reset}`
          );
        } else {
          emptyCount++;
          console.log(
            `${c.yellow}○${c.reset} ${progress} ${course.code} ${c.dim}empty/no data${c.reset}`
          );
        }

        scrapeResults.push({
          course: parsed,
          raw: html.slice(0, 500),
          fetchedAt: new Date(),
          requestedCode: course.code,
        });
      } catch (err) {
        errorCount++;
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.log(
          `${c.red}✗${c.reset} ${progress} ${course.code} ${c.dim}${errorMsg.slice(0, 80)}${c.reset}`
        );
        scrapeResults.push({
          course: null,
          raw: "",
          error: errorMsg,
          fetchedAt: new Date(),
          requestedCode: course.code,
        });
      }
    }

    // Compute diff
    console.log(`\n${c.bold}Computing diff...${c.reset}`);
    const diff = computeDiff(
      scrapeResults,
      existingCourses as CourseWithSchedule[]
    );

    // Auto-apply safe changes
    console.log(`${c.bold}Applying safe changes...${c.reset}`);
    const applyResult = await autoApplySafe(diff, scrapeDataMap, prisma, year);

    // Update sync log
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: "success",
        completedAt: new Date(),
        coursesChecked: scrapeResults.length,
        changesFound: diff.updated.length,
        changesApplied: applyResult.applied,
        diffJson: JSON.parse(
          JSON.stringify({
            diff,
            scrapeData: Object.fromEntries(scrapeDataMap),
          })
        ),
      },
    });

    // Summary
    const reviewCount = diff.updated.filter((u) =>
      u.changes.some((c) => c.severity === "review")
    ).length;

    console.log(`\n${c.bold}${c.blue}═══════════════════════════════${c.reset}`);
    console.log(`${c.bold}${c.blue}  סיכום סנכרון${c.reset}`);
    console.log(`${c.bold}${c.blue}═══════════════════════════════${c.reset}`);
    console.log(`  ${c.green}✓ נסרקו בהצלחה:${c.reset}  ${successCount}`);
    console.log(`  ${c.yellow}○ ריקים:${c.reset}          ${emptyCount}`);
    console.log(`  ${c.red}✗ שגיאות:${c.reset}         ${errorCount}`);
    console.log(`  ${c.cyan}↔ שינויים נמצאו:${c.reset}  ${diff.updated.length}`);
    console.log(`  ${c.green}↳ הוחלו (safe):${c.reset}  ${applyResult.applied}`);
    console.log(`  ${c.yellow}↳ דורשים ביקורת:${c.reset} ${reviewCount}`);
    console.log(`  ${c.dim}⊜ ללא שינוי:${c.reset}      ${diff.unchanged.length}`);
    console.log(`${c.bold}${c.blue}═══════════════════════════════${c.reset}`);

    if (reviewCount > 0) {
      console.log(
        `\n${c.yellow}⚠ ${reviewCount} changes need admin review.${c.reset}`
      );
      console.log(
        `${c.dim}  Go to: https://pakam-strategist.vercel.app/he/admin/sync${c.reset}\n`
      );
    }

    if (diff.updated.length > 0) {
      console.log(`\n${c.bold}Changes found:${c.reset}`);
      for (const update of diff.updated) {
        console.log(`\n  ${c.cyan}${update.courseCode}${c.reset} ${c.dim}${update.courseName}${c.reset}`);
        for (const change of update.changes) {
          const sev = change.severity === "safe" ? `${c.green}safe${c.reset}` : `${c.yellow}review${c.reset}`;
          console.log(`    ${sev} ${change.field}: ${JSON.stringify(change.oldValue)} → ${JSON.stringify(change.newValue)}`);
        }
      }
    }

    if (applyResult.failed.length > 0) {
      console.log(`\n${c.red}Failed to apply:${c.reset}`);
      for (const fail of applyResult.failed) {
        console.log(`  ${c.red}✗${c.reset} ${fail.courseId}: ${fail.error}`);
      }
    }

    console.log(`\n${c.green}✅ Sync complete! SyncLog ID: ${syncLog.id}${c.reset}\n`);
  } catch (err) {
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: "failed",
        completedAt: new Date(),
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    });

    console.error(
      `\n${c.red}❌ Sync failed: ${err instanceof Error ? err.message : String(err)}${c.reset}\n`
    );
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
