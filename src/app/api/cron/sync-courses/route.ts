// =========================================
// Vercel Cron — Daily Course Sync
// Runs every day at 03:00 UTC
// Batch sync: 3 courses per run (premium proxy = 10 credits each,
// 1000 free credits/month → 30/day × 30 = 900, leaves 100 for admin)
// Auto-applies "safe" changes, stores "review" changes for admin
// =========================================

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchSyllabus, fetchExamDates, clearSessionCache } from "@/lib/scraper/fetcher";
import { parseSyllabusHtml, parseExamDates } from "@/lib/scraper/parser";
import { computeDiff, type CourseWithSchedule } from "@/lib/scraper/differ";
import { autoApplySafe } from "@/lib/scraper/applier";
import type { ScrapeResult, ScrapedCourse } from "@/lib/scraper/types";

// Vercel Hobby plan: max 60s. Batch of 3 courses × ~10s each (via premium proxy) ≈ 30s.
export const maxDuration = 60;
export const dynamic = "force-dynamic";
// Frankfurt — closest Vercel region to TAU servers in Israel
export const preferredRegion = "fra1";

const BATCH_SIZE = 3;
const TIME_BUDGET_MS = 48_000; // 48s — leave 12s margin for DB ops

/**
 * TAU academic year: lstYear=2025 = תשפ"ו = 2025/2026.
 * Academic year starts in October but lstYear uses start year.
 * Aug onwards → new academic year starts → lstYear = current year
 * Jan-Jul → still same academic year → lstYear = year - 1
 */
function getCurrentAcademicYear(): number {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  const year = now.getFullYear();
  return month >= 8 ? year : year - 1;
}

/**
 * Determine the current TAU semester for exam date lookups.
 * Oct-Feb → Fall (1), Mar-Jul → Spring (2), Aug-Sep → Fall of next year (1)
 */
function getCurrentSemester(): number {
  const month = new Date().getMonth() + 1;
  if (month >= 3 && month <= 7) return 2; // Spring
  return 1; // Fall
}

export async function GET(request: Request) {
  // Verify the request comes from Vercel Cron
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const year = getCurrentAcademicYear();

  // Create sync log
  const syncLog = await prisma.syncLog.create({
    data: { status: "running" },
  });

  try {
    clearSessionCache();

    // Get batch of courses sorted by lastSyncedAt (null first = never synced)
    const existingCourses = await prisma.course.findMany({
      where: { isActive: true },
      include: { scheduleSessions: true },
      orderBy: { lastSyncedAt: { sort: "asc", nulls: "first" } },
      take: BATCH_SIZE,
    });

    const scrapeResults: ScrapeResult[] = [];
    const scrapeDataMap = new Map<string, ScrapedCourse>();
    const cronStartTime = Date.now();
    const semester = getCurrentSemester();
    let examsFetched = 0;

    for (const course of existingCourses) {
      // Check time budget before each fetch
      if (Date.now() - cronStartTime > TIME_BUDGET_MS) {
        console.warn(
          `[cron] Approaching timeout after ${Math.round((Date.now() - cronStartTime) / 1000)}s, stopping early`
        );
        break;
      }
      const codeNormalized = course.code.replace(/-/g, "");
      const code10 =
        codeNormalized.length === 8 ? codeNormalized + "01" : codeNormalized;
      const code8 = codeNormalized.slice(0, 8);

      try {
        // Syllabus GET only (skip credits POST — too slow for cron batch)
        const html = await fetchSyllabus(code10, year);
        const parsed = parseSyllabusHtml(html, code10);

        // Fetch exam dates if time permits (POST request, ~2-3s)
        if (parsed && Date.now() - cronStartTime < TIME_BUDGET_MS - 5000) {
          try {
            const examHtml = await fetchExamDates(code8, year, semester);
            const examData = parseExamDates(examHtml, code8);
            if (examData.examDateA) parsed.examDateA = examData.examDateA;
            if (examData.examDateB) parsed.examDateB = examData.examDateB;
            examsFetched++;
          } catch {
            // Exam fetch failure is non-critical — skip silently
          }
        }

        if (parsed) {
          scrapeDataMap.set(code8, parsed);
        }

        scrapeResults.push({
          course: parsed,
          raw: html.slice(0, 500),
          fetchedAt: new Date(),
          requestedCode: course.code,
        });
      } catch (err) {
        scrapeResults.push({
          course: null,
          raw: "",
          error: err instanceof Error ? err.message : String(err),
          fetchedAt: new Date(),
          requestedCode: course.code,
        });
      }
    }

    // Compute diff
    const diff = computeDiff(
      scrapeResults,
      existingCourses as CourseWithSchedule[]
    );

    // Update lastSyncedAt for ALL successfully scraped courses (not just changed ones).
    // This prevents re-scraping the same unchanged courses every cron run,
    // saving ScrapingBee credits by rotating through all courses evenly.
    const successfulCodes = scrapeResults
      .filter((r) => r.course && !r.error)
      .map((r) => r.requestedCode);

    if (successfulCodes.length > 0) {
      await prisma.course.updateMany({
        where: { code: { in: successfulCodes } },
        data: { lastSyncedAt: new Date() },
      });
    }

    // Auto-apply safe changes only
    const applyResult = await autoApplySafe(diff, scrapeDataMap, prisma, year);

    // Update sync log — save both diff and scrapeData.
    // Surface apply-phase failures: mark "partial" and record the count so they
    // aren't silently dropped on the success path.
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: applyResult.failed.length > 0 ? "partial" : "success",
        completedAt: new Date(),
        coursesChecked: scrapeResults.length,
        changesFound: diff.updated.length,
        changesApplied: applyResult.applied,
        errorMessage: applyResult.failed.length
          ? `${applyResult.failed.length} apply failures`
          : null,
        diffJson: JSON.parse(
          JSON.stringify({
            diff,
            scrapeData: Object.fromEntries(scrapeDataMap),
          })
        ),
      },
    });

    return NextResponse.json({
      ok: true,
      batchSize: existingCourses.length,
      coursesChecked: scrapeResults.length,
      changesFound: diff.updated.length,
      safeApplied: applyResult.applied,
      safeFailed: applyResult.failed.length,
      reviewPending: diff.updated.filter((u) =>
        u.changes.some((c) => c.severity === "review")
      ).length,
      errors: diff.errors.length,
      examsFetched,
      year,
    });
  } catch (err) {
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: "failed",
        completedAt: new Date(),
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    });

    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
