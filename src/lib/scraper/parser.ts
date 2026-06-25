// =========================================
// Yedion HTML Parser
// Converts raw HTML from ims.tau.ac.il pages
// into structured ScrapedCourse data
// =========================================

import * as cheerio from "cheerio";
import type { ScrapedCourse, ScrapedSession } from "./types";

// =========================================
// Hebrew day mapping
// =========================================

const DAY_MAP: Record<string, ScrapedSession["dayOfWeek"]> = {
  א: "SUNDAY",
  ב: "MONDAY",
  ג: "TUESDAY",
  ד: "WEDNESDAY",
  ה: "THURSDAY",
  ו: "FRIDAY",
};

// =========================================
// Semester parsing
// =========================================

function parseSemester(semesterText: string): ScrapedCourse["semester"] {
  const text = semesterText.trim();
  if (text.includes("א'") || text.includes("א ")) return "FALL";
  if (text.includes("ב'") || text.includes("ב ")) return "SPRING";
  if (text.includes("שנתי") || text.includes("annual")) return "ANNUAL";
  // Default to FALL if unclear
  return "FALL";
}

// =========================================
// Session type parsing
// =========================================

function parseSessionType(text: string): ScrapedSession["sessionType"] {
  const t = text.trim();
  if (t.includes("תרגיל") || t.includes("תרגול")) return "tutorial";
  if (t.includes("מעבדה") || t.includes("סדנה")) return "lab";
  return "lecture"; // "שיעור" or default
}

// =========================================
// Main Syllabus Parser
// =========================================

/**
 * Parse the HTML from Syllabus_L.aspx into a ScrapedCourse.
 *
 * Page structure (as of 2025):
 * - div.data-table-row.course-name-number → course code + name
 * - div.data-table-row.course-proff-names → academic unit + lecturer
 * - div.data-table-row.contact-hidden → email, office hours
 * - div.data-table-row.course-time-location → teaching method, weekly hours, semester, day, time, building, room
 *   (may appear multiple times for multiple sessions)
 * - #div_dataToc → course description
 * - #div_data_Matalot → assignments/exam info
 * - #no_recfound_or_error hidden field → "1" if no syllabus exists
 *
 * @param html - Raw HTML from Syllabus_L.aspx
 * @param courseCode10 - The 10-digit code used for the request
 * @returns ScrapedCourse or null if the page has no data
 */
export function parseSyllabusHtml(
  html: string,
  courseCode10: string
): ScrapedCourse | null {
  const $ = cheerio.load(html);

  // Check if the page has data
  const noRecFound = $('input[name="no_recfound_or_error"]').val();
  if (noRecFound === "1") {
    return null;
  }

  // Also check for error div visibility
  const errorDiv = $("#div_error_no_data");
  if (errorDiv.length && !errorDiv.css("display")?.includes("none")) {
    // Double check — if div_data is also hidden, this page has no data
    const dataDiv = $("#div_data");
    if (!dataDiv.length) return null;
  }

  // ── Course code & name ──
  const courseNameRow = $(".course-name-number");
  const cells = courseNameRow.find(".data-table-cell");

  let fullCode = courseCode10;
  let nameHe = "";

  cells.each((_, cell) => {
    const label = $(cell).find(".data-table-cell-label").text().trim();
    const value = $(cell).find("span").text().trim();

    if (label.includes("מספר קורס")) {
      // Format: "0651-1007-01" → normalize to "0651100701"
      fullCode = value.replace(/-/g, "");
    }
    if (label.includes("שם הקורס") || label.includes("שם")) {
      nameHe = value;
    }
  });

  if (!nameHe) {
    // No course name found → page might be malformed
    return null;
  }

  // Derive code (8 digits) and group (2 digits)
  const code = fullCode.slice(0, 8);
  const groupCode = fullCode.slice(8, 10) || "01";

  // ── Lecturer ──
  const profRow = $(".course-proff-names");
  let lecturerName: string | undefined;

  profRow.find(".data-table-cell").each((_, cell) => {
    const label = $(cell).find(".data-table-cell-label").text().trim();
    if (label.includes("מרצה") || label.includes("מתרגל")) {
      const raw = $(cell).find("span").text().trim();
      // Clean up titles: "ד"ר  רן ארז" → "ד\"ר רן ארז"
      lecturerName = raw.replace(/\s{2,}/g, " ");
    }
  });

  // ── Lecturer email ──
  let lecturerEmail: string | undefined;
  const contactRow = $(".contact-hidden");
  contactRow.find(".data-table-cell").each((_, cell) => {
    const text = $(cell).find("span").text().trim();
    // Look for email pattern in contact text
    const emailMatch = text.match(
      /[\w.-]+@[\w.-]+\.[a-zA-Z]{2,}/
    );
    if (emailMatch) {
      lecturerEmail = emailMatch[0];
    }
  });

  // ── Schedule sessions ──
  const schedule: ScrapedSession[] = [];
  let semester: ScrapedCourse["semester"] = "FALL";
  let weeklyHours: number | undefined;
  let isFirstRow = true;

  $(".course-time-location").each((_, row) => {
    const rowCells: Record<string, string> = {};

    $(row)
      .find(".data-table-cell")
      .each((_, cell) => {
        const el = $(cell);
        // Skip hidden cells (second row onwards hides duplicate info)
        if (el.css("visibility") === "hidden" || el.attr("style")?.includes("visibility:hidden")) {
          return;
        }

        const label = el.find(".data-table-cell-label").text().trim();
        const value = el.find("span").text().trim();

        if (label) {
          rowCells[label] = value;
        }
      });

    // Parse semester (from first visible row)
    if (rowCells["סמסטר"] && isFirstRow) {
      semester = parseSemester(rowCells["סמסטר"]);
    }

    // Parse weekly hours (from first visible row)
    if (rowCells["שעות סמסטריאליות"] && isFirstRow) {
      const parsed = parseFloat(rowCells["שעות סמסטריאליות"]);
      if (!isNaN(parsed)) weeklyHours = parsed;
    }

    isFirstRow = false;

    // Parse schedule session
    const dayLetter = rowCells["יום"];
    const timeRange = rowCells["שעות"];
    const teaching = rowCells["אופן ההוראה"] || "שיעור";

    if (dayLetter && timeRange) {
      const dayOfWeek = DAY_MAP[dayLetter];
      if (!dayOfWeek) return; // Unknown day letter

      const [startTime, endTime] = timeRange.split("-").map((t) => t.trim());

      if (startTime && endTime) {
        schedule.push({
          dayOfWeek,
          startTime,
          endTime,
          building: rowCells["בניין"] || undefined,
          room: rowCells["חדר"] || undefined,
          sessionType: parseSessionType(teaching),
        });
      }
    }
  });

  // ── Description ──
  let description: string | undefined;
  const descSection = $("#div_dataToc");
  if (descSection.length) {
    // Get text after h2, before the "לסילבוס המפורט" link
    const descParagraphs = descSection.find("p");
    if (descParagraphs.length) {
      description = descParagraphs
        .map((_, p) => $(p).text().trim())
        .get()
        .filter(Boolean)
        .join("\n");
    }
  }

  return {
    code,
    groupCode,
    fullCode,
    nameHe,
    semester,
    lecturerName,
    lecturerEmail,
    description,
    weeklyHours,
    schedule,
  };
}

// =========================================
// Search Result Parser (credits)
// =========================================

/**
 * Parse the HTML from Search_L.aspx to extract credits (נ"ז).
 * The search results page has a table with course info including credit column.
 *
 * @param html - Raw HTML from Search_L.aspx POST response
 * @param courseCode8 - 8-digit course code to find in results
 * @returns credits value or null if not found
 */
export function parseSearchCredits(
  html: string,
  courseCode8: string
): number | null {
  const $ = cheerio.load(html);

  // Search results are typically in a table
  // Look for the credits column (נ"ז or "נקודות זכות")
  let credits: number | null = null;

  // Strategy 1: Look for table rows with our course code
  $("table tr, .data-table-row").each((_, row) => {
    const rowText = $(row).text();
    // Check if this row contains our course code
    const codeNormalized = `${courseCode8.slice(0, 4)}-${courseCode8.slice(4)}`;
    if (
      rowText.includes(courseCode8) ||
      rowText.includes(codeNormalized)
    ) {
      // Look for a cell that could contain credits
      $(row)
        .find("td, .data-table-cell")
        .each((_, cell) => {
          const label = $(cell).find("small, .data-table-cell-label").text().trim();
          const value = $(cell).find("span").text().trim() || $(cell).text().trim();

          if (label.includes("נ\"ז") || label.includes("נקודות") || label.includes("credits")) {
            const parsed = parseFloat(value);
            if (!isNaN(parsed) && parsed > 0 && parsed < 30) {
              credits = parsed;
            }
          }
        });

      // Strategy 2: If no labeled cell, try to find a number in context
      if (credits === null) {
        const nzMatch = rowText.match(/(\d+(?:\.\d+)?)\s*נ"ז/);
        if (nzMatch?.[1]) {
          const parsed = parseFloat(nzMatch[1]);
          if (!isNaN(parsed) && parsed > 0 && parsed < 30) {
            credits = parsed;
          }
        }
      }
    }
  });

  return credits;
}

// =========================================
// Exam Dates Parser
// =========================================

/**
 * Parse the HTML from Bhina_L.aspx to extract exam dates.
 *
 * @param html - Raw HTML from Bhina_L.aspx POST response
 * @param courseCode - Course code to find in results
 * @returns Object with examDateA and examDateB as ISO date strings, or nulls
 */
export function parseExamDates(
  html: string,
  courseCode: string
): { examDateA: string | null; examDateB: string | null } {
  const $ = cheerio.load(html);

  let examDateA: string | null = null;
  let examDateB: string | null = null;

  // Look for date patterns in exam page
  // Hebrew date format: DD/MM/YYYY or DD.MM.YYYY
  const dateRegex = /(\d{1,2})[./](\d{1,2})[./](\d{4})/g;

  // Strategy: find rows/cells mentioning מועד א' and מועד ב'
  const pageText = $("body").text();

  // Find all dates on the page
  const allDates: string[] = [];
  let dateMatch;
  while ((dateMatch = dateRegex.exec(pageText)) !== null) {
    const day = dateMatch[1]!;
    const month = dateMatch[2]!;
    const year = dateMatch[3]!;
    // Convert DD/MM/YYYY to ISO: YYYY-MM-DD
    const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    allDates.push(iso);
  }

  // Look for labeled dates
  $("table tr, .data-table-row").each((_, row) => {
    const rowText = $(row).text();
    const codeNormalized = `${courseCode.slice(0, 4)}-${courseCode.slice(4)}`;

    if (rowText.includes(courseCode) || rowText.includes(codeNormalized)) {
      // Find dates within this row
      const rowDates: string[] = [];
      const rowDateRegex = /(\d{1,2})[./](\d{1,2})[./](\d{4})/g;
      let m;
      while ((m = rowDateRegex.exec(rowText)) !== null) {
        rowDates.push(`${m[3]!}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`);
      }

      // Check for מועד א' / מועד ב' labels
      if (rowText.includes("מועד א") && rowDates.length > 0) {
        examDateA = rowDates[0] ?? null;
      }
      if (rowText.includes("מועד ב") && rowDates.length > 0) {
        examDateB = rowDates[rowDates.length > 1 ? 1 : 0] ?? null;
      }

      // Fallback: first two dates = A and B
      if (!examDateA && !examDateB && rowDates.length >= 2) {
        examDateA = rowDates[0] ?? null;
        examDateB = rowDates[1] ?? null;
      } else if (!examDateA && rowDates.length === 1) {
        examDateA = rowDates[0] ?? null;
      }
    }
  });

  // Fallback: if no row-level match, try page-level dates
  if (!examDateA && allDates.length >= 1) {
    // Only use page-level dates if they look like exam dates (future dates)
    const today = new Date().toISOString().slice(0, 10);
    const futureDates = allDates.filter((d) => d >= today);
    if (futureDates.length >= 1) examDateA = futureDates[0] ?? null;
    if (futureDates.length >= 2) examDateB = futureDates[1] ?? null;
  }

  return { examDateA, examDateB };
}
