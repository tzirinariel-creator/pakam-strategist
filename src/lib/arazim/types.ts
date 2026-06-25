// =========================================
// Arazim Project Types — Grade Data Bridge
// =========================================

/**
 * A single moed (exam period) entry from grades.json.
 * Group "00" has distribution + mean only.
 * Group "01" has extended stats (median + std_dev).
 */
export interface ArazimMoedEntry {
  moed: number; // 0=initial, 1=moed A, 2=moed B, 3=moed C
  distribution: number[]; // 10-bucket histogram of grades
  mean: number;
  median?: number; // only in group "01"
  standard_deviation?: number; // only in group "01"
}

/**
 * Grade data for a single course, organized by semester → group → moed entries.
 */
export type ArazimCourseGrades = Record<
  string, // semester key, e.g. "2024a", "2023b", "2016all_year"
  Record<
    string, // group id: "00" (aggregate), "01" (extended), "02"+  (sections)
    ArazimMoedEntry[]
  >
>;

/**
 * The full grades.json structure: course code → grade data.
 */
export type ArazimGradesData = Record<string, ArazimCourseGrades>;

/**
 * Processed grade summary for a single course — ready to write to DB.
 */
export interface CourseGradeSummary {
  /** 8-digit course code from Arazim (no dash) */
  arazimCode: string;
  /** Our DB course code (with dash), e.g. "0618-1012" */
  dbCode: string;
  /** Historical mean grade */
  averageGrade: number;
  /** Historical median grade */
  medianGrade: number | null;
  /** Grade standard deviation */
  gradeStdDev: number | null;
  /** Fail rate as percentage (0-100) */
  failRate: number | null;
  /** Computed difficulty level */
  difficultyLevel: "easy" | "moderate" | "hard" | "very_hard";
  /** Which semester the grade data is from */
  gradeDataYear: string;
}

/**
 * Result of the enrichment process.
 */
export interface EnrichmentResult {
  /** Courses successfully enriched with grade data */
  enriched: CourseGradeSummary[];
  /** DB course codes that had no match in Arazim */
  notFound: string[];
  /** Courses that matched but had no usable grade data */
  noData: string[];
  /** Total courses checked */
  totalChecked: number;
}
