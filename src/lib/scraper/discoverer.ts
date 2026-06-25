// =========================================
// Course Discoverer
// Searches TAU Yedion by department code to find courses
// not yet in our database (addresses Tsachi's feedback
// about missing courses in the catalog).
// =========================================

import * as cheerio from "cheerio";
import { fetchDepartmentCourses } from "./fetcher";

// PPE-related department codes on Yedion
// These are the 4-digit prefixes that contain PPE courses
const PPE_DEPARTMENT_CODES = [
  "0651", // Philosophy (PPE primary)
  "0618", // Philosophy (additional)
  "0616", // Philosophy (additional)
  "0608", // Humanities general
  "1031", // Political Science
  "1011", // Economics
  "1411", // Economics / Law cross-listed
  "1099", // Law / Political Science cross-listed
  "0910", // Law Faculty
] as const;

export interface DiscoveredCourse {
  /** 8-digit code, e.g. "06511007" */
  code8: string;
  /** Formatted code, e.g. "0651-1007" */
  codeFormatted: string;
  /** Hebrew name from search results */
  nameHe: string;
  /** Credits if found in search results */
  credits: number | null;
  /** Which department code search found it */
  sourceDept: string;
}

export interface DiscoveryResult {
  /** Courses found in Yedion that aren't in our DB */
  newCourses: DiscoveredCourse[];
  /** Total courses found across all departments */
  totalScanned: number;
  /** How many departments were searched */
  departmentsSearched: number;
  /** Errors encountered during search */
  errors: { dept: string; error: string }[];
}

/**
 * Parse search results HTML to extract course codes and names.
 * Yedion search results are in a table with course code and name columns.
 */
function parseSearchResultCourses(
  html: string
): { code8: string; nameHe: string; credits: number | null }[] {
  const $ = cheerio.load(html);
  const courses: { code8: string; nameHe: string; credits: number | null }[] = [];

  // Yedion search results use table rows
  $("table tr, .data-table-row").each((_, row) => {
    const rowText = $(row).text();

    // Match course code pattern: XXXX-XXXX or XXXXXXXX (8 digits)
    const codeMatch = rowText.match(/(\d{4})[- ]?(\d{4})/);
    if (!codeMatch) return;

    const code8 = codeMatch[1]! + codeMatch[2]!;

    // Extract course name — typically in a cell near the code
    let nameHe = "";
    const cells = $(row).find("td, .data-table-cell");
    cells.each((_, cell) => {
      const text = $(cell).text().trim();
      // Course names are Hebrew text, typically > 4 chars and not a number
      if (
        text.length > 4 &&
        /[\u0590-\u05FF]/.test(text) &&
        !/^\d+$/.test(text)
      ) {
        if (!nameHe || text.length > nameHe.length) {
          nameHe = text;
        }
      }
    });

    // Try to extract credits
    let credits: number | null = null;
    const nzMatch = rowText.match(/(\d+(?:\.\d+)?)\s*נ"ז/);
    if (nzMatch?.[1]) {
      const parsed = parseFloat(nzMatch[1]);
      if (!isNaN(parsed) && parsed > 0 && parsed < 30) {
        credits = parsed;
      }
    }

    if (nameHe) {
      courses.push({ code8, nameHe, credits });
    }
  });

  return courses;
}

/**
 * Discover courses in Yedion that aren't in our database.
 *
 * @param existingCodes - Set of course codes already in DB (format: "0651-1007")
 * @param year - Academic year to search
 * @param departmentCodes - Optional specific departments to search (defaults to PPE departments)
 * @param timeBudgetMs - Maximum time to spend on discovery (default: 30s)
 */
export async function discoverNewCourses(
  existingCodes: Set<string>,
  year: number,
  departmentCodes: readonly string[] = PPE_DEPARTMENT_CODES,
  timeBudgetMs: number = 30_000
): Promise<DiscoveryResult> {
  const startTime = Date.now();
  const allNew: DiscoveredCourse[] = [];
  const seenCodes = new Set<string>();
  let totalScanned = 0;
  let departmentsSearched = 0;
  const errors: { dept: string; error: string }[] = [];

  // Normalize existing codes to 8-digit format for comparison
  const existingNormalized = new Set<string>();
  for (const code of existingCodes) {
    existingNormalized.add(code.replace(/-/g, ""));
  }

  for (const dept of departmentCodes) {
    // Check time budget
    if (Date.now() - startTime > timeBudgetMs) {
      break;
    }

    try {
      const html = await fetchDepartmentCourses(dept, year);
      const found = parseSearchResultCourses(html);
      departmentsSearched++;
      totalScanned += found.length;

      for (const course of found) {
        // Skip if already in DB or already discovered
        if (existingNormalized.has(course.code8) || seenCodes.has(course.code8)) {
          continue;
        }
        seenCodes.add(course.code8);

        allNew.push({
          code8: course.code8,
          codeFormatted: `${course.code8.slice(0, 4)}-${course.code8.slice(4)}`,
          nameHe: course.nameHe,
          credits: course.credits,
          sourceDept: dept,
        });
      }
    } catch (err) {
      errors.push({
        dept,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    newCourses: allNew,
    totalScanned,
    departmentsSearched,
    errors,
  };
}

export { PPE_DEPARTMENT_CODES };
