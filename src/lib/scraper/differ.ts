// =========================================
// Course Diff Engine
// Compares scraped data against existing DB records
// and produces a structured diff with severity levels
// =========================================

import type { Course, ScheduleSession } from "@prisma/client";
import type {
  CourseDiff,
  FieldChange,
  ScrapedCourse,
  ScrapeResult,
} from "./types";

// =========================================
// Types for DB records with relations
// =========================================

// Course with its schedule sessions (discipline is now natively String in Prisma).
export type CourseWithSchedule = Course & {
  scheduleSessions: ScheduleSession[];
};

// =========================================
// Severity classification
// =========================================

/**
 * Fields classified as "safe" can be auto-applied without admin review.
 * Fields classified as "review" need admin approval before applying.
 */
function getSeverity(field: string): FieldChange["severity"] {
  return FIELD_SEVERITY[field] ?? "review";
}

const FIELD_SEVERITY: Record<string, FieldChange["severity"]> = {
  // Safe — auto-applicable
  lecturerName: "safe",
  lecturerEmail: "safe",
  room: "safe",
  building: "safe",
  description: "safe",
  weeklyHours: "safe",
  examDateA: "safe",
  examDateB: "safe",

  // Review — needs admin approval
  nameHe: "review",
  credits: "review",
  schedule: "review", // day/time changes
  semester: "review",
};

// =========================================
// Field comparison helpers
// =========================================

function normalizeString(val: string | null | undefined): string {
  return (val ?? "").trim().replace(/\s{2,}/g, " ");
}

function stringsEqual(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  return normalizeString(a) === normalizeString(b);
}

function numbersEqual(
  a: number | null | undefined,
  b: number | null | undefined
): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(a - b) < 0.001;
}

/**
 * Compare schedule sessions between scraped and existing data.
 * Returns true if they're effectively the same.
 */
function schedulesEqual(
  scraped: ScrapedCourse["schedule"],
  existing: ScheduleSession[]
): boolean {
  if (scraped.length !== existing.length) return false;

  // Sort both by day + start time for comparison
  const sortKey = (s: { dayOfWeek: string; startTime: string }) =>
    `${s.dayOfWeek}-${s.startTime}`;

  const sortedScraped = [...scraped].sort((a, b) =>
    sortKey(a).localeCompare(sortKey(b))
  );
  const sortedExisting = [...existing].sort((a, b) =>
    sortKey(a).localeCompare(sortKey(b))
  );

  for (let i = 0; i < sortedScraped.length; i++) {
    const s = sortedScraped[i]!;
    const e = sortedExisting[i]!;

    if (
      s.dayOfWeek !== e.dayOfWeek ||
      s.startTime !== e.startTime ||
      s.endTime !== e.endTime ||
      s.sessionType !== e.sessionType
    ) {
      return false;
    }

    // Room/building changes don't make schedules "different" at the schedule level
    // (they're tracked separately as field changes)
  }

  return true;
}

// =========================================
// Core Diff Logic
// =========================================

/**
 * Compare a single scraped course against its existing DB record.
 * Returns list of field-level changes, or empty array if identical.
 */
function diffSingleCourse(
  scraped: ScrapedCourse,
  existing: CourseWithSchedule
): FieldChange[] {
  const changes: FieldChange[] = [];

  // Name (Hebrew)
  if (!stringsEqual(scraped.nameHe, existing.nameHe)) {
    changes.push({
      field: "nameHe",
      oldValue: existing.nameHe,
      newValue: scraped.nameHe,
      severity: getSeverity("nameHe"),
    });
  }

  // Lecturer name — only compare if existing course has schedule sessions
  // (when sessions are empty, there's nothing to compare against)
  if (
    scraped.lecturerName &&
    existing.scheduleSessions.length > 0 &&
    !stringsEqual(scraped.lecturerName, existing.scheduleSessions[0]?.lecturerName)
  ) {
    changes.push({
      field: "lecturerName",
      oldValue: existing.scheduleSessions[0]?.lecturerName ?? null,
      newValue: scraped.lecturerName,
      severity: getSeverity("lecturerName"),
    });
  }

  // Lecturer email — only compare if existing course has schedule sessions
  if (
    scraped.lecturerEmail &&
    existing.scheduleSessions.length > 0 &&
    !stringsEqual(scraped.lecturerEmail, existing.scheduleSessions[0]?.lecturerEmail)
  ) {
    changes.push({
      field: "lecturerEmail",
      oldValue: existing.scheduleSessions[0]?.lecturerEmail ?? null,
      newValue: scraped.lecturerEmail,
      severity: getSeverity("lecturerEmail"),
    });
  }

  // Description
  if (scraped.description && !stringsEqual(scraped.description, existing.description)) {
    changes.push({
      field: "description",
      oldValue: existing.description,
      newValue: scraped.description,
      severity: getSeverity("description"),
    });
  }

  // Weekly hours
  if (scraped.weeklyHours != null && !numbersEqual(scraped.weeklyHours, existing.weeklyHours)) {
    changes.push({
      field: "weeklyHours",
      oldValue: existing.weeklyHours,
      newValue: scraped.weeklyHours,
      severity: getSeverity("weeklyHours"),
    });
  }

  // Credits (from POST search — may not be available)
  if (scraped.credits != null && !numbersEqual(scraped.credits, existing.credits)) {
    changes.push({
      field: "credits",
      oldValue: existing.credits,
      newValue: scraped.credits,
      severity: getSeverity("credits"),
    });
  }

  // Exam dates (from POST exam — may not be available)
  if (scraped.examDateA) {
    const existingA = existing.examDateA?.toISOString().slice(0, 10) ?? null;
    if (existingA !== scraped.examDateA) {
      changes.push({
        field: "examDateA",
        oldValue: existingA,
        newValue: scraped.examDateA,
        severity: getSeverity("examDateA"),
      });
    }
  }

  if (scraped.examDateB) {
    const existingB = existing.examDateB?.toISOString().slice(0, 10) ?? null;
    if (existingB !== scraped.examDateB) {
      changes.push({
        field: "examDateB",
        oldValue: existingB,
        newValue: scraped.examDateB,
        severity: getSeverity("examDateB"),
      });
    }
  }

  // Semester (Course.semesterOffered is an array, scraped.semester is a single value)
  if (scraped.semester) {
    const scrapedSemesters =
      scraped.semester === "ANNUAL"
        ? ["FALL", "SPRING"]
        : [scraped.semester];
    const existingSorted = [...existing.semesterOffered].sort();
    const scrapedSorted = [...scrapedSemesters].sort();
    if (JSON.stringify(existingSorted) !== JSON.stringify(scrapedSorted)) {
      changes.push({
        field: "semester",
        oldValue: existing.semesterOffered,
        newValue: scrapedSemesters,
        severity: getSeverity("semester"),
      });
    }
  }

  // Schedule — day/time changes (review severity)
  if (!schedulesEqual(scraped.schedule, existing.scheduleSessions)) {
    changes.push({
      field: "schedule",
      oldValue: existing.scheduleSessions.map((s) => ({
        day: s.dayOfWeek,
        time: `${s.startTime}-${s.endTime}`,
        type: s.sessionType,
      })),
      newValue: scraped.schedule.map((s) => ({
        day: s.dayOfWeek,
        time: `${s.startTime}-${s.endTime}`,
        type: s.sessionType,
      })),
      severity: getSeverity("schedule"),
    });
  }

  // Room/building changes (per session — safe severity)
  for (const scrapedSession of scraped.schedule) {
    const matchingExisting = existing.scheduleSessions.find(
      (e) =>
        e.dayOfWeek === scrapedSession.dayOfWeek &&
        e.startTime === scrapedSession.startTime
    );

    if (matchingExisting) {
      if (
        scrapedSession.building &&
        !stringsEqual(scrapedSession.building, matchingExisting.building)
      ) {
        changes.push({
          field: "building",
          oldValue: matchingExisting.building,
          newValue: scrapedSession.building,
          severity: getSeverity("building"),
        });
      }

      if (
        scrapedSession.room &&
        !stringsEqual(scrapedSession.room, matchingExisting.room)
      ) {
        changes.push({
          field: "room",
          oldValue: matchingExisting.room,
          newValue: scrapedSession.room,
          severity: getSeverity("room"),
        });
      }
    }
  }

  return changes;
}

// =========================================
// Main Diff Function
// =========================================

/**
 * Compute a full diff between scraped results and existing DB courses.
 *
 * @param scrapeResults - Array of scrape results (one per course code)
 * @param existingCourses - Current courses from DB with their schedule sessions
 * @returns CourseDiff with updated, unchanged, notFound, and error categories
 */
export function computeDiff(
  scrapeResults: ScrapeResult[],
  existingCourses: CourseWithSchedule[]
): CourseDiff {
  const diff: CourseDiff = {
    updated: [],
    notFound: [],
    unchanged: [],
    errors: [],
  };

  // Build lookup map: code (8 digits) → existing course
  const existingByCode = new Map<string, CourseWithSchedule>();
  for (const course of existingCourses) {
    // Course.code in DB is like "0651-1007" — normalize to 8 digits
    const normalized = course.code.replace(/-/g, "");
    existingByCode.set(normalized, course);
  }

  for (const result of scrapeResults) {
    // Handle scrape errors
    if (result.error) {
      const code = result.course?.code ?? result.requestedCode;
      diff.errors.push({ code, error: result.error });
      continue;
    }

    // Handle pages with no data (Yedion returned empty/404)
    if (!result.course) {
      diff.notFound.push(result.requestedCode);
      continue;
    }

    const scraped = result.course;
    const existing = existingByCode.get(scraped.code);

    if (!existing) {
      // Course exists in Yedion but not in our DB — shouldn't happen for known codes
      // but let's flag it as notFound (it's not an "error")
      diff.notFound.push(scraped.code);
      continue;
    }

    // Compare
    const changes = diffSingleCourse(scraped, existing);

    if (changes.length === 0) {
      diff.unchanged.push(scraped.code);
    } else {
      diff.updated.push({
        courseId: existing.id,
        courseCode: existing.code,
        courseName: existing.nameHe,
        changes,
      });
    }
  }

  return diff;
}
