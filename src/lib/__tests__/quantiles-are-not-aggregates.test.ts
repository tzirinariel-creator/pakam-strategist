// =========================================================================
// A median of five numbers is one person's grade
// =========================================================================
// Found while researching Gil's request — "כשהיא מקבלת ממוצע, לדעת איפה היא
// ביחס לשאר. מה הדירוג, מה הממוצע מה החציון". Before building anything on top
// of the cohort machinery, the machinery had to be right.
//
// `percentile()` returns a RAW ARRAY ELEMENT — it does not interpolate. At the
// reveal bar (GRADE_MIN_N = 5) the indices land on 1, 2 and 3 of 5, so the
// published "median", "p25" and "p75" were the 2nd, 3rd and 4th contributors'
// verbatim grades — on a publicProcedure, reachable without logging in. The
// mean shipped beside them lets a reader solve for the sum of the remaining
// two.
//
// The rest of k-anonymity.ts reasons carefully about prose and cohort labels
// and never separated an ORDER STATISTIC from an AGGREGATE. A mean of five
// numbers is nobody's grade; a median of five numbers is exactly one person's.
//
// No existing threshold was lowered. Quantiles get their own, higher bar and
// are bucketed on top of it.

import { describe, it, expect } from "vitest";
import { GRADE_MIN_N, QUANTILE_MIN_N, bucketGrade } from "@/lib/k-anonymity";

/** The published percentile, exactly as the router computes it. */
function percentile(sortedAsc: number[], p: number): number | null {
  if (sortedAsc.length === 0) return null;
  const idx = Math.min(
    sortedAsc.length - 1,
    Math.max(0, Math.round((p / 100) * (sortedAsc.length - 1))),
  );
  return sortedAsc[idx] ?? null;
}

const FIVE = [62, 74, 81, 88, 95];

describe("the defect, stated plainly", () => {
  it("at the grade bar, all three quantiles are real students' grades", () => {
    // The witness. Every one of these is a row someone submitted.
    for (const p of [25, 50, 75]) {
      expect(FIVE).toContain(percentile(FIVE, p));
    }
  });

  it("and the mean shipped beside them narrows the other two", () => {
    // 62 + 95 = sum − (74 + 81). Publishing three of five plus the mean leaves
    // almost nothing unknown.
    const mean = FIVE.reduce((a, b) => a + b, 0) / FIVE.length;
    const known = [74, 81, 88];
    const restSum = mean * FIVE.length - known.reduce((a, b) => a + b, 0);
    expect(restSum).toBe(62 + 95);
  });
});

describe("quantiles are held to a higher bar than the average", () => {
  it("needs meaningfully more contributors than a mean does", () => {
    expect(QUANTILE_MIN_N).toBeGreaterThan(GRADE_MIN_N);
  });

  it("does not lower the grade bar to get there", () => {
    // Weakening a threshold does not "show more data" — it empties the archive.
    expect(GRADE_MIN_N).toBe(5);
  });
});

describe("what ships is a band, not a lookup", () => {
  it("rounds a quantile to the nearest 5", () => {
    expect(bucketGrade(81)).toBe(80);
    expect(bucketGrade(88)).toBe(90);
    expect(bucketGrade(74)).toBe(75);
  });

  it("a bucketed quantile is usually NOT any contributor's exact grade", () => {
    // The property that matters: the number on screen stops being a row.
    const ten = [61, 63, 68, 72, 77, 81, 84, 88, 91, 96];
    const shipped = [25, 50, 75].map((p) => bucketGrade(percentile(ten, p)));
    expect(shipped.filter((v) => ten.includes(v as number)).length).toBeLessThanOrEqual(1);
  });

  it("passes null through rather than inventing a zero", () => {
    expect(bucketGrade(null)).toBeNull();
  });
});
