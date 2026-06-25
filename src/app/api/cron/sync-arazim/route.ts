// =========================================
// Vercel Cron — Weekly Arazim Grade Sync
// Runs every Sunday at 04:00 UTC
// Fetches grades.json from Arazim Project,
// enriches all courses with grade/difficulty data.
// No proxy needed — Arazim is a public JSON API.
// =========================================

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchGrades, enrichCoursesWithGrades } from "@/lib/arazim";

// grades.json is ~11 MB — give plenty of time to fetch + process
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Verify the request comes from Vercel Cron
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Create sync log (distinguish from IMS sync with a marker in diffJson)
  const syncLog = await prisma.syncLog.create({
    data: { status: "running" },
  });

  try {
    // 1. Load all active courses from DB
    const courses = await prisma.course.findMany({
      where: { isActive: true },
      select: { code: true, averageGrade: true, difficultyLevel: true },
    });
    const courseCodes = courses.map((c) => c.code);

    // 2. Fetch Arazim grades.json
    const gradesData = await fetchGrades();

    // 3. Run enrichment (cross-reference + difficulty computation)
    const result = enrichCoursesWithGrades(courseCodes, gradesData);

    // 4. Compute what actually changed (skip courses with identical grades)
    let updated = 0;
    let unchanged = 0;
    let errors = 0;
    const changes: Array<{
      code: string;
      field: string;
      oldValue: unknown;
      newValue: unknown;
    }> = [];

    for (const summary of result.enriched) {
      const existing = courses.find((c) => c.code === summary.dbCode);
      if (!existing) continue;

      // Check if anything actually changed
      const gradeChanged =
        existing.averageGrade == null ||
        Math.abs((existing.averageGrade ?? 0) - summary.averageGrade) > 0.01;
      const diffChanged = existing.difficultyLevel !== summary.difficultyLevel;

      if (!gradeChanged && !diffChanged) {
        unchanged++;
        continue;
      }

      // Track what changed
      if (gradeChanged) {
        changes.push({
          code: summary.dbCode,
          field: "averageGrade",
          oldValue: existing.averageGrade,
          newValue: summary.averageGrade,
        });
      }
      if (diffChanged) {
        changes.push({
          code: summary.dbCode,
          field: "difficultyLevel",
          oldValue: existing.difficultyLevel,
          newValue: summary.difficultyLevel,
        });
      }

      // Apply update
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
        console.error(
          `[arazim-sync] Failed to update ${summary.dbCode}:`,
          err instanceof Error ? err.message : err
        );
      }
    }

    // 5. Update sync log
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: "success",
        completedAt: new Date(),
        coursesChecked: courseCodes.length,
        changesFound: changes.length,
        changesApplied: updated,
        diffJson: JSON.parse(JSON.stringify({
          source: "arazim",
          enriched: result.enriched.length,
          notFound: result.notFound.length,
          noData: result.noData.length,
          unchanged,
          updated,
          errors,
          changes: changes.slice(0, 50), // cap at 50 for storage
        })),
      },
    });

    return NextResponse.json({
      ok: true,
      source: "arazim",
      coursesChecked: courseCodes.length,
      enriched: result.enriched.length,
      updated,
      unchanged,
      notFound: result.notFound.length,
      noData: result.noData.length,
      errors,
    });
  } catch (err) {
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: "failed",
        completedAt: new Date(),
        errorMessage: err instanceof Error ? err.message : String(err),
        diffJson: { source: "arazim" },
      },
    });

    return NextResponse.json(
      {
        ok: false,
        source: "arazim",
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
