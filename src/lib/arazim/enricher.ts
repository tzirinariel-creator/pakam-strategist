// =========================================
// Arazim Grade Enricher — Matches DB courses
// to Arazim grade data + computes difficulty
// =========================================

import type {
  ArazimGradesData,
  ArazimCourseGrades,
  ArazimMoedEntry,
  CourseGradeSummary,
  EnrichmentResult,
} from "./types";

// ---------------------------------------------------------------------------
// Code conversion helpers
// ---------------------------------------------------------------------------

/**
 * Convert DB code "XXXX-XXXX" → Arazim 8-digit code "XXXXXXXX".
 * Returns null for non-numeric codes (e.g. "LAW-CONTRACT", "PHIL-READING").
 */
export function dbCodeToArazim(dbCode: string): string | null {
  const stripped = dbCode.replace("-", "");
  if (!/^\d{8}$/.test(stripped)) return null;
  return stripped;
}

/**
 * Convert Arazim 8-digit code → DB code "XXXX-XXXX".
 */
export function arazimCodeToDb(arazimCode: string): string {
  return `${arazimCode.slice(0, 4)}-${arazimCode.slice(4)}`;
}

// ---------------------------------------------------------------------------
// Grade data extraction
// ---------------------------------------------------------------------------

/**
 * Semester sort key for ordering (newer = higher).
 * "2024b" → 20242, "2024a" → 20241, "2023summer" → 20230
 */
function semesterSortKey(sem: string): number {
  const match = sem.match(/^(\d{4})(a|b|summer|all_year)?$/);
  if (!match) return 0;
  const year = parseInt(match[1]!, 10);
  const suffix = match[2] ?? "a";
  const suffixOrder = suffix === "b" ? 2 : suffix === "a" ? 1 : 0;
  return year * 10 + suffixOrder;
}

/**
 * Extract the best available grade stats from a single course's grade data.
 * Strategy:
 *   1. Pick the most recent semester
 *   2. Prefer group "01" (has median + std_dev), fall back to "00"
 *   3. Prefer moed 1 (actual exam results), fall back to moed 0
 */
function extractBestGradeEntry(
  courseGrades: ArazimCourseGrades
): { entry: ArazimMoedEntry; semester: string } | null {
  // Sort semesters newest first
  const semesters = Object.keys(courseGrades).sort(
    (a, b) => semesterSortKey(b) - semesterSortKey(a)
  );

  for (const sem of semesters) {
    const groups = courseGrades[sem];
    if (!groups) continue;

    // Prefer group "01" (extended stats with median/std_dev)
    const group = groups["01"] ?? groups["00"];
    if (!group || group.length === 0) continue;

    // Prefer moed 1 (actual exam results), then moed 0 (initial)
    const entry = group.find((e) => e.moed === 1) ?? group.find((e) => e.moed === 0) ?? group[0];
    if (!entry || !entry.mean || entry.mean <= 0) continue;

    return { entry, semester: sem };
  }

  return null;
}

/**
 * Compute fail rate from distribution histogram.
 * Distribution is 10 buckets: [0-54, 55-59, 60-64, 65-69, 70-74, 75-79, 80-84, 85-89, 90-94, 95-100]
 * Fail = bucket 0 (grades 0-54).
 */
function computeFailRate(distribution: number[]): number | null {
  if (!distribution || distribution.length < 2) return null;
  const total = distribution.reduce((sum, n) => sum + n, 0);
  if (total === 0) return null;
  const failCount = distribution[0] ?? 0;
  return Math.round((failCount / total) * 1000) / 10; // one decimal place
}

// ---------------------------------------------------------------------------
// Difficulty algorithm
// ---------------------------------------------------------------------------

/**
 * Compute difficulty level from grade statistics.
 *
 * Scoring (0-100, higher = harder):
 *   - Mean grade: 40% weight (lower mean = harder)
 *   - Fail rate: 30% weight (higher fail = harder)
 *   - Std deviation: 15% weight (higher spread = less predictable = harder)
 *   - Median grade: 15% weight (lower median = harder)
 *
 * Thresholds:
 *   - 0-25:  "easy"
 *   - 26-50: "moderate"
 *   - 51-75: "hard"
 *   - 76+:   "very_hard"
 */
export function computeDifficulty(
  mean: number,
  median: number | null,
  stdDev: number | null,
  failRate: number | null
): "easy" | "moderate" | "hard" | "very_hard" {
  // Normalize mean to difficulty score (0-100, inverted — 55 mean = 100, 95 mean = 0)
  const meanScore = Math.max(0, Math.min(100, ((95 - mean) / 40) * 100));

  // Fail rate score (0% fail = 0, 50%+ fail = 100)
  const failScore = failRate != null ? Math.min(100, (failRate / 50) * 100) : meanScore;

  // Std deviation score (5 = low/easy, 25+ = high/unpredictable)
  const stdScore =
    stdDev != null ? Math.max(0, Math.min(100, ((stdDev - 5) / 20) * 100)) : meanScore * 0.5;

  // Median score (inverted, same logic as mean)
  const medianScore =
    median != null ? Math.max(0, Math.min(100, ((95 - median) / 40) * 100)) : meanScore;

  const totalScore = meanScore * 0.4 + failScore * 0.3 + stdScore * 0.15 + medianScore * 0.15;

  if (totalScore <= 25) return "easy";
  if (totalScore <= 50) return "moderate";
  if (totalScore <= 75) return "hard";
  return "very_hard";
}

// ---------------------------------------------------------------------------
// Main enrichment function
// ---------------------------------------------------------------------------

/**
 * Enrich a list of DB course codes with Arazim grade data.
 *
 * @param courseCodes Array of DB course codes (e.g. ["0618-1012", "1011-2103"])
 * @param gradesData  The full grades.json data
 * @returns EnrichmentResult with enriched courses and stats
 */
export function enrichCoursesWithGrades(
  courseCodes: string[],
  gradesData: ArazimGradesData
): EnrichmentResult {
  const enriched: CourseGradeSummary[] = [];
  const notFound: string[] = [];
  const noData: string[] = [];

  for (const dbCode of courseCodes) {
    const arazimCode = dbCodeToArazim(dbCode);
    if (!arazimCode) {
      // Non-numeric code (e.g. "LAW-CONTRACT") — skip silently
      notFound.push(dbCode);
      continue;
    }

    const courseGrades = gradesData[arazimCode];
    if (!courseGrades) {
      notFound.push(dbCode);
      continue;
    }

    const best = extractBestGradeEntry(courseGrades);
    if (!best) {
      noData.push(dbCode);
      continue;
    }

    const { entry, semester } = best;
    const failRate = computeFailRate(entry.distribution);
    const difficulty = computeDifficulty(
      entry.mean,
      entry.median ?? null,
      entry.standard_deviation ?? null,
      failRate
    );

    enriched.push({
      arazimCode,
      dbCode,
      averageGrade: Math.round(entry.mean * 100) / 100,
      medianGrade: entry.median != null ? Math.round(entry.median * 100) / 100 : null,
      gradeStdDev:
        entry.standard_deviation != null
          ? Math.round(entry.standard_deviation * 100) / 100
          : null,
      failRate,
      difficultyLevel: difficulty,
      gradeDataYear: semester,
    });
  }

  return {
    enriched,
    notFound,
    noData,
    totalChecked: courseCodes.length,
  };
}
