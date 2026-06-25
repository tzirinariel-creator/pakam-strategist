// =========================================
// Arazim Project Fetcher — JSON API Client
// =========================================

import type { ArazimGradesData } from "./types";

const ARAZIM_BASE = "https://arazim-project.com";

/**
 * Fetch grade histogram data from Arazim Project.
 * ~11 MB JSON file covering 13,500+ TAU courses.
 */
export async function fetchGrades(): Promise<ArazimGradesData> {
  const url = `${ARAZIM_BASE}/courses/grades.json`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30_000), // 30s timeout for large file
  });

  if (!response.ok) {
    throw new Error(`Arazim grades fetch failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<ArazimGradesData>;
}
