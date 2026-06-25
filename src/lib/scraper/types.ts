// =========================================
// Scraper Types — Yedion ↔ Pakam bridge
// =========================================

/**
 * A single schedule session scraped from the Yedion syllabus page.
 */
export interface ScrapedSession {
  dayOfWeek: "SUNDAY" | "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY";
  startTime: string; // "HH:MM", e.g. "10:00"
  endTime: string; // "HH:MM", e.g. "12:00"
  building?: string;
  room?: string;
  sessionType: "lecture" | "tutorial" | "lab";
}

/**
 * A course as scraped from the Yedion pages.
 * Not every field will be available from every source:
 *   - Syllabus GET → name, semester, lecturer, schedule, description, weeklyHours
 *   - Search POST → credits (נ"ז)
 *   - Exam POST  → examDateA, examDateB
 */
export interface ScrapedCourse {
  /** 8-digit course code, e.g. "06511007" */
  code: string;
  /** 2-digit group code, e.g. "01" */
  groupCode: string;
  /** Full 10-digit code (code + group), e.g. "0651100701" */
  fullCode: string;
  /** Course name in Hebrew */
  nameHe: string;
  /** Semester derived from Yedion page */
  semester: "FALL" | "SPRING" | "ANNUAL";
  /** Lecturer name */
  lecturerName?: string;
  /** Lecturer email (if shown) */
  lecturerEmail?: string;
  /** Course description from syllabus */
  description?: string;
  /** Weekly contact hours (שעות סמסטריאליות) */
  weeklyHours?: number;
  /** Academic credits (נ"ז) — from Search POST, may be null */
  credits?: number;
  /** Exam date A (מועד א') — from Exam POST, ISO date string */
  examDateA?: string;
  /** Exam date B (מועד ב') — from Exam POST, ISO date string */
  examDateB?: string;
  /** Schedule sessions */
  schedule: ScrapedSession[];
}

/**
 * Result of a single course scrape attempt.
 */
export interface ScrapeResult {
  /** Parsed course data, null if scrape/parse failed */
  course: ScrapedCourse | null;
  /** Raw HTML snapshot for debugging */
  raw: string;
  /** Error message if something went wrong */
  error?: string;
  /** When the fetch happened */
  fetchedAt: Date;
  /** The course code that was requested (for tracking notFound) */
  requestedCode: string;
}

// =========================================
// Diff Types — used by differ.ts
// =========================================

/**
 * A single field-level change detected by the diff engine.
 */
export interface FieldChange {
  /** Which field changed: "lecturerName", "schedule", "credits", etc. */
  field: string;
  /** Previous value */
  oldValue: unknown;
  /** New value from scrape */
  newValue: unknown;
  /**
   * "safe" = can be auto-applied (room, building, lecturer, description, etc.)
   * "review" = needs admin approval (name, credits, schedule time changes, semester)
   */
  severity: "safe" | "review";
}

/**
 * All changes for a single course.
 */
export interface CourseChange {
  courseId: string;
  courseCode: string;
  courseName: string;
  changes: FieldChange[];
}

/**
 * Full diff computed by the differ across all scraped courses.
 */
export interface CourseDiff {
  /** Courses with detected changes */
  updated: CourseChange[];
  /** Course codes that returned 404/empty from Yedion */
  notFound: string[];
  /** Course codes with no diff */
  unchanged: string[];
  /** Course codes where scrape or parse errored */
  errors: { code: string; error: string }[];
}

/**
 * Result after applying changes to the DB.
 */
export interface ApplyResult {
  applied: number;
  failed: { courseId: string; error: string }[];
}
