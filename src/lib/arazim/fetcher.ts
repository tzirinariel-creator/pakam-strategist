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
  const MAX_ATTEMPTS = 3;

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(30_000), // 30s timeout for large file (per attempt)
      });

      // Retry transient server-side failures (5xx) and rate limiting (429),
      // but not other 4xx (deterministic — retrying won't help).
      if (response.status >= 500 || response.status === 429) {
        if (attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
          continue;
        }
      }

      if (!response.ok) {
        throw new Error(`Arazim grades fetch failed: ${response.status} ${response.statusText}`);
      }

      // Advisory size guard: only reject when Content-Length is present and clearly
      // oversized. Arazim may omit it; ~11 MB is legitimate.
      const contentLength = response.headers.get("content-length");
      if (contentLength && Number(contentLength) > 50 * 1024 * 1024) {
        throw new Error(`Arazim grades fetch too large: ${contentLength} bytes`);
      }

      return response.json() as Promise<ArazimGradesData>;
    } catch (err) {
      lastError = err;
      // Retry thrown network/abort errors; rethrow on the final attempt.
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
        continue;
      }
      throw err;
    }
  }

  // Unreachable, but satisfies the type checker.
  throw lastError instanceof Error ? lastError : new Error("Arazim grades fetch failed");
}
