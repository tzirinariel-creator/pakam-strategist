// =========================================
// Diff Applier
// Takes a computed CourseDiff and applies
// selected changes to the database
// =========================================

import type { PrismaClient, Semester } from "@prisma/client";
import type { CourseDiff, ApplyResult, ScrapedCourse } from "./types";
import { buildYedionUrl } from "./fetcher";

/**
 * Map scraped semester string to Prisma Semester enum.
 * "ANNUAL" courses run both semesters — we default sessions to "FALL"
 * since the actual scheduling is per-session.
 */
function mapSemester(semester: string): Semester {
  if (semester === "FALL") return "FALL";
  if (semester === "SPRING") return "SPRING";
  if (semester === "SUMMER") return "SUMMER";
  // "ANNUAL" → default to FALL for session records
  return "FALL";
}

/**
 * Apply changes from a diff to the database.
 *
 * @param diff - The computed diff
 * @param courseIds - Which course IDs to apply changes for (allows selective apply)
 * @param scrapeData - Map of course code → ScrapedCourse (for schedule upserts)
 * @param db - Prisma client
 * @param academicYear - Current academic year for yedionUrl generation
 * @returns ApplyResult with count of applied and any failures
 */
export async function applyDiff(
  diff: CourseDiff,
  courseIds: string[],
  scrapeData: Map<string, ScrapedCourse>,
  db: PrismaClient,
  academicYear: number = 2025
): Promise<ApplyResult> {
  const result: ApplyResult = { applied: 0, failed: [] };

  const selectedChanges = diff.updated.filter((u) =>
    courseIds.includes(u.courseId)
  );

  for (const courseChange of selectedChanges) {
    try {
      // Build the update payload for the Course model
      const courseUpdate: Record<string, unknown> = {
        lastSyncedAt: new Date(),
      };

      // Process each field change
      for (const change of courseChange.changes) {
        switch (change.field) {
          case "nameHe":
            courseUpdate.nameHe = change.newValue;
            break;
          case "description":
            courseUpdate.description = change.newValue;
            break;
          case "weeklyHours":
            courseUpdate.weeklyHours = change.newValue;
            break;
          case "credits":
            courseUpdate.credits = change.newValue;
            break;
          case "examDateA":
            courseUpdate.examDateA = change.newValue
              ? new Date(change.newValue as string)
              : null;
            break;
          case "examDateB":
            courseUpdate.examDateB = change.newValue
              ? new Date(change.newValue as string)
              : null;
            break;
          case "semester":
            courseUpdate.semesterOffered = change.newValue;
            break;
          // lecturerName, lecturerEmail, room, building, schedule
          // are handled via ScheduleSession updates below
        }
      }

      // Generate yedionUrl
      const codeNormalized = courseChange.courseCode.replace(/-/g, "");
      const scraped = scrapeData.get(codeNormalized);
      const groupCode = scraped?.groupCode ?? "01";
      courseUpdate.yedionUrl = buildYedionUrl(
        codeNormalized + groupCode,
        academicYear
      );

      // Handle schedule-related changes
      const hasScheduleChange = courseChange.changes.some((c) =>
        ["schedule", "lecturerName", "lecturerEmail", "room", "building"].includes(
          c.field
        )
      );

      // Wrap course update AND schedule changes in a single transaction
      // so if schedule create fails, course update is rolled back too
      await db.$transaction(async (tx) => {
        // Update Course record
        await tx.course.update({
          where: { id: courseChange.courseId },
          data: courseUpdate,
        });

        if (hasScheduleChange && scraped && scraped.schedule.length > 0) {
          // Strategy: delete existing sessions + re-create from scraped data.
          // Guard: only proceed if scraped data has sessions (don't delete all on empty scrape).
          await tx.scheduleSession.deleteMany({
            where: { courseCode: courseChange.courseCode },
          });

          await tx.scheduleSession.createMany({
            data: scraped.schedule.map((session) => ({
              courseCode: courseChange.courseCode,
              dayOfWeek: session.dayOfWeek,
              startTime: session.startTime,
              endTime: session.endTime,
              room: session.room ?? null,
              building: session.building ?? null,
              sessionType: session.sessionType,
              semester: mapSemester(scraped.semester),
              academicYear,
              groupCode: scraped.groupCode,
              lecturerName: scraped.lecturerName ?? null,
              lecturerEmail: scraped.lecturerEmail ?? null,
            })),
          });
        }
      });

      result.applied++;
    } catch (err) {
      result.failed.push({
        courseId: courseChange.courseId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

/**
 * Auto-apply only "safe" changes from a diff.
 * Used by the cron job to apply non-breaking changes automatically.
 */
export async function autoApplySafe(
  diff: CourseDiff,
  scrapeData: Map<string, ScrapedCourse>,
  db: PrismaClient,
  academicYear: number = 2025
): Promise<ApplyResult> {
  // Filter to courses that ONLY have "safe" changes
  const safeCourseIds = diff.updated
    .filter((u) => u.changes.every((c) => c.severity === "safe"))
    .map((u) => u.courseId);

  if (safeCourseIds.length === 0) {
    return { applied: 0, failed: [] };
  }

  return applyDiff(diff, safeCourseIds, scrapeData, db, academicYear);
}
