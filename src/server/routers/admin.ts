// =========================================
// Admin Router — Sync + Course Management
// All procedures require admin role
// =========================================

import { z } from "zod/v4";
import { createTRPCRouter, adminProcedure } from "../trpc/init";
import { TRPCError } from "@trpc/server";
import { fetchSyllabus, clearSessionCache } from "@/lib/scraper/fetcher";
import { parseSyllabusHtml } from "@/lib/scraper/parser";
import { computeDiff, type CourseWithSchedule } from "@/lib/scraper/differ";
import { applyDiff } from "@/lib/scraper/applier";
import type { ScrapeResult, ScrapedCourse, CourseDiff } from "@/lib/scraper/types";
import { fetchGrades, enrichCoursesWithGrades } from "@/lib/arazim";
import { discoverNewCourses } from "@/lib/scraper/discoverer";

// =========================================
// Helpers
// =========================================

/**
 * Calculate current TAU academic year for lstYear parameter.
 * TAU convention: lstYear=2025 = תשפ"ו = academic year 2025/2026.
 * The academic year starts in October, so:
 *   Aug-Dec 2025 → lstYear=2025 (תשפ"ו starting)
 *   Jan-Jul 2026 → lstYear=2025 (still תשפ"ו)
 */
function getCurrentAcademicYear(): number {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  const year = now.getFullYear();
  // Aug onwards = new academic year → lstYear = current year
  // Jan-Jul = still previous academic year → lstYear = year - 1
  return month >= 8 ? year : year - 1;
}

export const adminRouter = createTRPCRouter({
  /**
   * Run a batch sync: fetch a batch of courses from DB, scrape Yedion, compute diff.
   * Uses batch approach to stay within Vercel's 60s function timeout.
   * Courses are sorted by lastSyncedAt ASC (null first) so un-synced courses get priority.
   * Stores the diff + scrapeData in SyncLog for later apply.
   */
  runSync: adminProcedure
    .input(
      z
        .object({
          year: z.number().int().min(2020).max(2030).optional(),
          batchSize: z.number().int().min(1).max(30).default(3),
          skipCredits: z.boolean().default(true),
        })
        .optional()
    )
    .mutation(async ({ ctx, input }) => {
      const year = input?.year ?? getCurrentAcademicYear();
      const batchSize = input?.batchSize ?? 3;
      const skipCredits = input?.skipCredits ?? true;

      // Create a sync log entry
      const syncLog = await ctx.db.syncLog.create({
        data: { status: "running" },
      });

      try {
        // Clear cached sessions for fresh start
        clearSessionCache();

        // Get total course count for progress display
        const totalCourses = await ctx.db.course.count({
          where: { isActive: true },
        });

        // Get batch of courses sorted by lastSyncedAt (null first = never synced)
        const existingCourses = await ctx.db.course.findMany({
          where: { isActive: true },
          include: { scheduleSessions: true },
          orderBy: { lastSyncedAt: { sort: "asc", nulls: "first" } },
          take: batchSize,
        });

        const scrapeResults: ScrapeResult[] = [];
        const scrapeDataMap = new Map<string, ScrapedCourse>();

        // Time budget: stop before hitting Vercel's 60s limit
        const syncStartTime = Date.now();
        const TIME_BUDGET_MS = 48_000; // 48s — leave 12s margin for DB ops

        // Scrape each course in batch
        for (const course of existingCourses) {
          // Check time budget before each fetch
          if (Date.now() - syncStartTime > TIME_BUDGET_MS) {
            console.warn(
              `[sync] Approaching timeout after ${Math.round((Date.now() - syncStartTime) / 1000)}s, stopping early with ${scrapeResults.length}/${existingCourses.length} courses`
            );
            break;
          }
          const codeNormalized = course.code.replace(/-/g, "");
          // Build 10-digit code: 8-digit code + "01" (default group)
          const code10 =
            codeNormalized.length === 8
              ? codeNormalized + "01"
              : codeNormalized;

          try {
            // Step 1: Fetch syllabus (GET — reliable)
            const html = await fetchSyllabus(code10, year);
            const parsed = parseSyllabusHtml(html, code10);

            if (parsed) {
              // Step 2: Credits POST — skip in batch sync (too slow)
              if (!skipCredits) {
                try {
                  const { fetchSearchResult } = await import(
                    "@/lib/scraper/fetcher"
                  );
                  const { parseSearchCredits } = await import(
                    "@/lib/scraper/parser"
                  );
                  const searchHtml = await fetchSearchResult(
                    codeNormalized.slice(0, 8),
                    year
                  );
                  const credits = parseSearchCredits(
                    searchHtml,
                    codeNormalized.slice(0, 8)
                  );
                  if (credits !== null) {
                    parsed.credits = credits;
                  }
                } catch {
                  console.warn(
                    `[sync] Credits fetch failed for ${course.code}, skipping`
                  );
                }
              }

              scrapeDataMap.set(codeNormalized.slice(0, 8), parsed);
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
        // This prevents the same unchanged courses from being re-scraped every batch,
        // ensuring even rotation through all courses.
        const successfulCodes = scrapeResults
          .filter((r) => r.course && !r.error)
          .map((r) => r.requestedCode);

        if (successfulCodes.length > 0) {
          await ctx.db.course.updateMany({
            where: { code: { in: successfulCodes } },
            data: { lastSyncedAt: new Date() },
          });
        }

        // Update sync log — save BOTH diff and scrapeData for later applyChanges
        await ctx.db.syncLog.update({
          where: { id: syncLog.id },
          data: {
            status: "success",
            completedAt: new Date(),
            coursesChecked: scrapeResults.length,
            changesFound:
              diff.updated.length +
              diff.notFound.length +
              diff.errors.length,
            diffJson: JSON.parse(
              JSON.stringify({
                diff,
                scrapeData: Object.fromEntries(scrapeDataMap),
              })
            ),
          },
        });

        // Count how many courses have been synced total
        const syncedCount = await ctx.db.course.count({
          where: { isActive: true, lastSyncedAt: { not: null } },
        });

        return {
          syncLogId: syncLog.id,
          coursesChecked: scrapeResults.length,
          totalCourses,
          syncedCount,
          changesFound: diff.updated.length,
          notFound: diff.notFound.length,
          errors: diff.errors.length,
          unchanged: diff.unchanged.length,
          diff,
        };
      } catch (err) {
        // Mark sync as failed
        await ctx.db.syncLog.update({
          where: { id: syncLog.id },
          data: {
            status: "failed",
            completedAt: new Date(),
            errorMessage: err instanceof Error ? err.message : String(err),
          },
        });

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Sync failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }),

  /**
   * Get the latest sync log with its diff.
   */
  getLatestDiff: adminProcedure.query(async ({ ctx }) => {
    const latest = await ctx.db.syncLog.findFirst({
      orderBy: { startedAt: "desc" },
    });
    return latest;
  }),

  /**
   * Get sync history (recent logs).
   */
  getSyncLogs: adminProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(50).default(10),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const logs = await ctx.db.syncLog.findMany({
        orderBy: { startedAt: "desc" },
        take: input?.limit ?? 10,
      });
      return logs;
    }),

  /**
   * Apply selected changes from a sync diff.
   * Restores scrapeDataMap from the SyncLog's diffJson so schedule changes can be applied.
   */
  applyChanges: adminProcedure
    .input(
      z.object({
        syncLogId: z.string().uuid(),
        courseIds: z.array(z.string().uuid()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Load the sync log
      const syncLog = await ctx.db.syncLog.findUnique({
        where: { id: input.syncLogId },
      });

      if (!syncLog || !syncLog.diffJson) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Sync log not found or has no diff data",
        });
      }

      // Restore diff and scrapeData from the stored JSON
      const stored = syncLog.diffJson as unknown as {
        diff: CourseDiff;
        scrapeData?: Record<string, ScrapedCourse>;
      };

      // Handle both new format { diff, scrapeData } and legacy format (diff only)
      const diff = stored.diff ?? (stored as unknown as CourseDiff);
      const scrapeDataRaw = stored.scrapeData ?? {};
      const scrapeDataMap = new Map<string, ScrapedCourse>(
        Object.entries(scrapeDataRaw)
      );

      const year = getCurrentAcademicYear();
      const result = await applyDiff(
        diff,
        input.courseIds,
        scrapeDataMap,
        ctx.db,
        year
      );

      // Update sync log
      await ctx.db.syncLog.update({
        where: { id: input.syncLogId },
        data: {
          changesApplied: syncLog.changesApplied + result.applied,
        },
      });

      return result;
    }),

  /**
   * Manually update a course (for fields not available from scraping).
   */
  updateCourse: adminProcedure
    .input(
      z.object({
        courseId: z.string().uuid(),
        data: z.object({
          nameHe: z.string().optional(),
          nameEn: z.string().optional(),
          credits: z.number().positive().optional(),
          weeklyHours: z.number().positive().optional(),
          description: z.string().optional(),
          examDateA: z.string().datetime().optional().nullable(),
          examDateB: z.string().datetime().optional().nullable(),
        }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const updateData: Record<string, unknown> = {};

      if (input.data.nameHe !== undefined)
        updateData.nameHe = input.data.nameHe;
      if (input.data.nameEn !== undefined)
        updateData.nameEn = input.data.nameEn;
      if (input.data.credits !== undefined)
        updateData.credits = input.data.credits;
      if (input.data.weeklyHours !== undefined)
        updateData.weeklyHours = input.data.weeklyHours;
      if (input.data.description !== undefined)
        updateData.description = input.data.description;
      if (input.data.examDateA !== undefined) {
        updateData.examDateA = input.data.examDateA
          ? new Date(input.data.examDateA)
          : null;
      }
      if (input.data.examDateB !== undefined) {
        updateData.examDateB = input.data.examDateB
          ? new Date(input.data.examDateB)
          : null;
      }

      const course = await ctx.db.course.update({
        where: { id: input.courseId },
        data: updateData,
      });

      return course;
    }),

  /**
   * Soft-delete (deactivate) a course.
   * Doesn't break FK references — just hides from catalog.
   */
  deactivateCourse: adminProcedure
    .input(z.object({ courseId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const course = await ctx.db.course.update({
        where: { id: input.courseId },
        data: { isActive: false },
      });
      return course;
    }),

  /**
   * Reactivate a soft-deleted course.
   */
  reactivateCourse: adminProcedure
    .input(z.object({ courseId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const course = await ctx.db.course.update({
        where: { id: input.courseId },
        data: { isActive: true },
      });
      return course;
    }),

  /**
   * Get all courses (including inactive) for admin management.
   */
  getAllCourses: adminProcedure.query(async ({ ctx }) => {
    const courses = await ctx.db.course.findMany({
      include: {
        scheduleSessions: true,
        _count: { select: { userCourses: true } },
      },
      orderBy: [{ isActive: "desc" }, { code: "asc" }],
    });
    return courses;
  }),

  /**
   * Run Arazim grade sync: fetch grades.json, enrich all courses with
   * grade/difficulty data. No proxy needed — Arazim is a free JSON API.
   */
  runArazimSync: adminProcedure.mutation(async ({ ctx }) => {
    const syncLog = await ctx.db.syncLog.create({
      data: { status: "running" },
    });

    try {
      // 1. Load all active courses from DB
      const courses = await ctx.db.course.findMany({
        where: { isActive: true },
        select: { code: true, averageGrade: true, difficultyLevel: true },
      });
      const courseCodes = courses.map((c) => c.code);

      // 2. Fetch Arazim grades.json (~11 MB)
      const gradesData = await fetchGrades();

      // 3. Run enrichment
      const result = enrichCoursesWithGrades(courseCodes, gradesData);

      // 4. Apply changes — only update courses where grade data actually changed
      let updated = 0;
      let unchanged = 0;
      let errors = 0;

      for (const summary of result.enriched) {
        const existing = courses.find((c) => c.code === summary.dbCode);
        if (!existing) continue;

        const gradeChanged =
          existing.averageGrade == null ||
          Math.abs((existing.averageGrade ?? 0) - summary.averageGrade) > 0.01;
        const diffChanged = existing.difficultyLevel !== summary.difficultyLevel;

        if (!gradeChanged && !diffChanged) {
          unchanged++;
          continue;
        }

        try {
          await ctx.db.course.update({
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
        } catch {
          errors++;
        }
      }

      // 5. Update sync log
      await ctx.db.syncLog.update({
        where: { id: syncLog.id },
        data: {
          status: "success",
          completedAt: new Date(),
          coursesChecked: courseCodes.length,
          changesFound: updated + unchanged,
          changesApplied: updated,
          diffJson: {
            source: "arazim",
            enriched: result.enriched.length,
            notFound: result.notFound.length,
            noData: result.noData.length,
            unchanged,
            updated,
            errors,
          },
        },
      });

      return {
        source: "arazim",
        coursesChecked: courseCodes.length,
        enriched: result.enriched.length,
        updated,
        unchanged,
        notFound: result.notFound.length,
        noData: result.noData.length,
        errors,
      };
    } catch (err) {
      await ctx.db.syncLog.update({
        where: { id: syncLog.id },
        data: {
          status: "failed",
          completedAt: new Date(),
          errorMessage: err instanceof Error ? err.message : String(err),
          diffJson: { source: "arazim" },
        },
      });

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Arazim sync failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }),

  // ─── Review Moderation (OPS3) ──────────────────────────────────
  // Reviews auto-hide after 3 reports (course-knowledge router) — this is
  // the queue where the admin actually SEES them. Reviewer identity is
  // deliberately not exposed: cohort wisdom is anonymous end-to-end, and
  // moderation judges the content, not the author.

  /**
   * Everything that needs a human eye: hidden reviews + visible ones that
   * accumulated reports but haven't crossed the auto-hide threshold yet.
   */
  getModerationQueue: adminProcedure.query(async ({ ctx }) => {
    const reviews = await ctx.db.courseReview.findMany({
      where: {
        OR: [{ status: "HIDDEN" }, { reportCount: { gt: 0 } }],
      },
      select: {
        id: true,
        courseCode: true,
        cohortYear: true,
        workload: true,
        difficulty: true,
        verdict: true,
        tip: true,
        tags: true,
        status: true,
        reportCount: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ status: "asc" }, { reportCount: "desc" }, { updatedAt: "desc" }],
    });

    // Resolve course names so the admin sees "מבוא לכלכלה" and not a bare code.
    const codes = [...new Set(reviews.map((r) => r.courseCode))];
    const courses = await ctx.db.course.findMany({
      where: { code: { in: codes } },
      select: { code: true, nameHe: true },
    });
    const nameByCode = new Map(courses.map((c) => [c.code, c.nameHe]));

    return reviews.map((r) => ({
      ...r,
      courseName: nameByCode.get(r.courseCode) ?? null,
    }));
  }),

  /**
   * Approve: the review is fine — make it visible again and wipe the report
   * slate (otherwise the same stale reports would re-hide it on the next one).
   */
  approveReview: adminProcedure
    .input(z.object({ reviewId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const review = await ctx.db.courseReview.findUnique({
        where: { id: input.reviewId },
        select: { id: true },
      });
      if (!review) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Review not found" });
      }

      await ctx.db.reviewReport.deleteMany({ where: { reviewId: input.reviewId } });
      return ctx.db.courseReview.update({
        where: { id: input.reviewId },
        data: { status: "VISIBLE", reportCount: 0 },
      });
    }),

  /**
   * Delete: the review violates the rules — remove it permanently
   * (reports cascade via the FK).
   */
  deleteReview: adminProcedure
    .input(z.object({ reviewId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const review = await ctx.db.courseReview.findUnique({
        where: { id: input.reviewId },
        select: { id: true },
      });
      if (!review) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Review not found" });
      }

      await ctx.db.courseReview.delete({ where: { id: input.reviewId } });
      return { deleted: true };
    }),

  // ─── Cohort content moderation (insights + shared plans) ───────────
  // The stage-ב social models auto-hide at 3 reports too — they need the same
  // human queue, or hidden content would vanish with no review (audit).

  getCohortModerationQueue: adminProcedure.query(async ({ ctx }) => {
    const [insights, plans] = await Promise.all([
      ctx.db.cohortInsight.findMany({
        where: { OR: [{ status: "HIDDEN" }, { reportCount: { gt: 0 } }] },
        select: { id: true, stage: true, text: true, cohortYear: true, status: true, reportCount: true, createdAt: true },
        orderBy: [{ status: "asc" }, { reportCount: "desc" }],
      }),
      ctx.db.sharedPlanEntry.findMany({
        where: { OR: [{ status: "HIDDEN" }, { reportCount: { gt: 0 } }] },
        select: { id: true, title: true, cohortYear: true, status: true, reportCount: true, createdAt: true },
        orderBy: [{ status: "asc" }, { reportCount: "desc" }],
      }),
    ]);
    return { insights, plans };
  }),

  moderateCohortInsight: adminProcedure
    .input(z.object({ id: z.string().uuid(), action: z.enum(["approve", "delete"]) }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.cohortInsight.findUnique({ where: { id: input.id }, select: { id: true } });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      if (input.action === "delete") {
        await ctx.db.cohortInsight.delete({ where: { id: input.id } });
        return { deleted: true };
      }
      return ctx.db.cohortInsight.update({ where: { id: input.id }, data: { status: "VISIBLE", reportCount: 0 } });
    }),

  moderateCohortPlan: adminProcedure
    .input(z.object({ id: z.string().uuid(), action: z.enum(["approve", "delete"]) }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.sharedPlanEntry.findUnique({ where: { id: input.id }, select: { id: true } });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      if (input.action === "delete") {
        await ctx.db.sharedPlanEntry.delete({ where: { id: input.id } });
        return { deleted: true };
      }
      return ctx.db.sharedPlanEntry.update({ where: { id: input.id }, data: { status: "VISIBLE", reportCount: 0 } });
    }),

  // ─── Course Discovery ──────────────────────────────────────────
  // Search Yedion by department codes to find courses not yet in DB

  discoverCourses: adminProcedure
    .input(
      z.object({
        timeBudgetMs: z.number().int().min(5000).max(50000).default(30000),
      }).optional()
    )
    .mutation(async ({ ctx, input }) => {
      const year = getCurrentAcademicYear();

      // Get all existing course codes
      const existingCourses = await ctx.db.course.findMany({
        where: { isActive: true },
        select: { code: true },
      });
      const existingCodes = new Set(existingCourses.map((c) => c.code));

      const result = await discoverNewCourses(
        existingCodes,
        year,
        undefined, // use default PPE department codes
        input?.timeBudgetMs ?? 30_000
      );

      // Log discovery results
      await ctx.db.syncLog.create({
        data: {
          status: "success",
          completedAt: new Date(),
          coursesChecked: result.totalScanned,
          changesFound: result.newCourses.length,
          changesApplied: 0,
          diffJson: JSON.parse(JSON.stringify({
            type: "discovery",
            newCourses: result.newCourses,
            departmentsSearched: result.departmentsSearched,
            errors: result.errors,
          })),
        },
      });

      return {
        newCourses: result.newCourses,
        totalScanned: result.totalScanned,
        departmentsSearched: result.departmentsSearched,
        errors: result.errors,
        year,
      };
    }),
});
