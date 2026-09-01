// =========================================================================
// A cohort year in the "generations" strip is a disclosure like any other
// =========================================================================
// Found while verifying the one k-anonymity item still marked unchecked.
//
// `getDigest` returned `cohortYearsPresent` as the RAW set of years found on
// reviews and grade points, defended by a comment saying distinct years carry
// no per-year counts and so name nobody.
//
// They do. Membership of that set states that at least one row from cohort X
// exists. With ~24 students in the programme, a year contributed by one
// person points at that person as precisely as a label would — and the app was
// suppressing the label on every individual tip from that cohort (via
// safeCohortYear at COHORT_LABEL_MIN_N) while announcing the year in the strip.
//
// The lineage merges three sources into that strip. Two came back filtered.
// One did not. Merging a filtered list with an unfiltered one gives you an
// unfiltered list — which is what the client-side comment claiming "every year
// here is already painted on the cards" got wrong.
//
// The projection is restated here as the pure function it is, so the property
// can be asserted without a database.

import { describe, it, expect } from "vitest";
import { countByCohortYear, COHORT_LABEL_MIN_N, safeCohortYear } from "@/lib/k-anonymity";

type Row = { cohortYear: number | null };

/** Exactly what course-knowledge.ts now computes. */
function presentYears(reviews: Row[], gradePoints: Row[]): number[] {
  const counts = countByCohortYear([...reviews, ...gradePoints]);
  return [...counts.entries()]
    .filter(([, n]) => n >= COHORT_LABEL_MIN_N)
    .map(([year]) => year)
    .sort((a, b) => a - b);
}

/** The version that shipped, kept as the witness. */
function rawYears(reviews: Row[], gradePoints: Row[]): number[] {
  return [
    ...new Set([...reviews, ...gradePoints].map((r) => r.cohortYear).filter((y): y is number => y != null)),
  ].sort((a, b) => a - b);
}

const rows = (year: number | null, n: number): Row[] =>
  Array.from({ length: n }, () => ({ cohortYear: year }));

describe("the generations strip never announces a thin cohort", () => {
  it("drops a year represented by a single row", () => {
    const reviews = [...rows(2023, COHORT_LABEL_MIN_N), ...rows(2019, 1)];
    expect(rawYears(reviews, [])).toContain(2019); // what shipped
    expect(presentYears(reviews, [])).not.toContain(2019);
    expect(presentYears(reviews, [])).toContain(2023);
  });

  it("agrees with the per-row label — the same year cannot be hidden and shown", () => {
    // The contradiction that made this a bug rather than a preference: the tip
    // wall refused to say "מחזור 2019" and the strip said it anyway.
    const reviews = [...rows(2023, COHORT_LABEL_MIN_N), ...rows(2019, 1)];
    const counts = countByCohortYear(reviews);
    const labelled = reviews.map((r) => safeCohortYear(r.cohortYear, counts));
    expect(labelled).not.toContain(2019); // suppressed on the row…
    expect(presentYears(reviews, [])).not.toContain(2019); // …and in the strip
  });

  it("counts reviews and grade points together toward the bar", () => {
    // A cohort well represented across both kinds is genuinely crowded; the
    // fix must not hide legitimate context by counting only one source.
    const reviews = rows(2022, 2);
    const points = rows(2022, COHORT_LABEL_MIN_N - 2);
    expect(presentYears(reviews, points)).toEqual([2022]);
  });

  it("ignores rows with no cohort year at all", () => {
    expect(presentYears(rows(null, 20), [])).toEqual([]);
  });

  it("is empty rather than guessing when the file is thin", () => {
    // An empty strip is honest. A strip built from four rows is a roster.
    expect(presentYears(rows(2023, 4), [])).toEqual([]);
  });

  it("uses the shared constant, not a local number", () => {
    // If COHORT_LABEL_MIN_N is ever raised, this projection has to move with
    // it — that is the whole reason the threshold lives in one file.
    const justUnder = rows(2021, COHORT_LABEL_MIN_N - 1);
    const exactly = rows(2020, COHORT_LABEL_MIN_N);
    expect(presentYears([...justUnder, ...exactly], [])).toEqual([2020]);
  });
});
