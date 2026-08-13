import { describe, it, expect } from "vitest";
import {
  GRADE_MIN_N,
  RATING_MIN_N,
  TIP_MIN_N,
  COHORT_LABEL_MIN_N,
  REPORT_HIDE_THRESHOLD,
  countByCohortYear,
  safeCohortYear,
} from "@/lib/k-anonymity";

/**
 * Guard test. The thresholds are a product promise, not a tuning knob: honest
 * course reviews exist only because nobody can trace one back to its author.
 * If a future change lowers a number, this test fails loudly and whoever
 * changes it has to state why here.
 */
describe("k-anonymity thresholds are pinned", () => {
  it("reveals a grade average only from 5 contributors", () => {
    expect(GRADE_MIN_N).toBe(5);
  });

  it("reveals workload/difficulty/recommend only from 3 raters", () => {
    expect(RATING_MIN_N).toBe(3);
  });

  it("labels a cohort year only from 5 rows of that cohort", () => {
    expect(COHORT_LABEL_MIN_N).toBe(5);
  });

  it("auto-hides content at 3 distinct reporters", () => {
    expect(REPORT_HIDE_THRESHOLD).toBe(3);
  });

  it("never lets a rating threshold sit above the grade threshold", () => {
    // Ratings are softer data than grades, so their bar may be lower — but a
    // grade bar BELOW the rating bar would mean numbers leak before opinions.
    expect(GRADE_MIN_N).toBeGreaterThanOrEqual(RATING_MIN_N);
  });
});

describe("countByCohortYear", () => {
  it("counts rows per year and ignores rows with no year", () => {
    const counts = countByCohortYear([
      { cohortYear: 2023 },
      { cohortYear: 2023 },
      { cohortYear: null },
      { cohortYear: 2024 },
      {},
    ]);
    expect(counts.get(2023)).toBe(2);
    expect(counts.get(2024)).toBe(1);
    expect(counts.size).toBe(2);
  });

  it("returns an empty map for no rows", () => {
    expect(countByCohortYear([]).size).toBe(0);
  });
});

describe("safeCohortYear", () => {
  const counts = new Map([
    [2022, 7],
    [2023, 5],
    [2024, 4],
    [2025, 1],
  ]);

  it("labels a crowded cohort", () => {
    expect(safeCohortYear(2022, counts)).toBe(2022);
  });

  it("labels a cohort sitting exactly on the bar", () => {
    expect(safeCohortYear(2023, counts)).toBe(2023);
  });

  it("suppresses a cohort one row below the bar", () => {
    expect(safeCohortYear(2024, counts)).toBeNull();
  });

  it("suppresses a lone contributor — the case the bar exists for", () => {
    expect(safeCohortYear(2025, counts)).toBeNull();
  });

  it("suppresses a year that is absent from the counts entirely", () => {
    expect(safeCohortYear(2019, counts)).toBeNull();
  });

  it("passes through a missing year as no label rather than guessing", () => {
    expect(safeCohortYear(null, counts)).toBeNull();
    expect(safeCohortYear(undefined, counts)).toBeNull();
  });

  it("honours an explicit stricter bar", () => {
    expect(safeCohortYear(2023, counts, 6)).toBeNull();
    expect(safeCohortYear(2022, counts, 6)).toBe(2022);
  });
});

// ── 13.8 audit: free-text tips were the one field with no bar at all ──
describe("TIP_MIN_N — prose never reveals on a weaker bar than a number", () => {
  it("is at least the rating bar", () => {
    // getForCourse returned the `reviews` array at N=1 to anonymous visitors
    // while ratings needed 3 and grades 5. Phrasing and specifics identify a
    // person at least as well as a workload score does, so this must never
    // drop below RATING_MIN_N.
    expect(TIP_MIN_N).toBeGreaterThanOrEqual(RATING_MIN_N);
    expect(TIP_MIN_N).toBeGreaterThanOrEqual(2);
  });
});
