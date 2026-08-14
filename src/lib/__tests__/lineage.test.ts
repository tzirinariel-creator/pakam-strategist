import { describe, it, expect } from "vitest";
import { generationSpan, hasContributed } from "@/lib/lineage";

describe("generationSpan", () => {
  it("is empty for an empty file — no invented generations", () => {
    expect(generationSpan([], 2025)).toEqual({
      before: 0,
      mine: 0,
      after: 0,
      total: 0,
      earliest: null,
      positionKnown: true,
    });
  });

  it("splits cohorts into before / mine / after", () => {
    const span = generationSpan([2021, 2022, 2024, 2025, 2026], 2024);
    expect(span.before).toBe(2);
    expect(span.mine).toBe(1);
    expect(span.after).toBe(2);
    expect(span.total).toBe(5);
    expect(span.earliest).toBe(2021);
  });

  it("counts DISTINCT cohorts, never rows — a busy year is still one generation", () => {
    const span = generationSpan([2022, 2022, 2022, 2022, 2024], 2024);
    expect(span.before).toBe(1);
    expect(span.total).toBe(2);
  });

  it("reports mine = 0 when my own cohort has contributed nothing", () => {
    const span = generationSpan([2021, 2022], 2024);
    expect(span.mine).toBe(0);
    expect(span.before).toBe(2);
    expect(span.after).toBe(0);
  });

  it("handles a first cohort with nobody before them", () => {
    const span = generationSpan([2026], 2026);
    expect(span).toEqual({
      before: 0,
      mine: 1,
      after: 0,
      total: 1,
      earliest: 2026,
      positionKnown: true,
    });
  });

  it("refuses to claim before/after when my start year is unknown", () => {
    const span = generationSpan([2021, 2022, 2024], null);
    expect(span.before).toBe(0);
    expect(span.mine).toBe(0);
    expect(span.after).toBe(0);
    // Still honest about what IS known.
    expect(span.total).toBe(3);
    expect(span.earliest).toBe(2021);
  });

  // The zeros above are indistinguishable from "nobody came before you", and
  // the page printed exactly that sentence for a student who simply never
  // filled in a start year. positionKnown is what lets the caller tell an
  // absence of cohorts apart from an absence of knowledge about them.
  it("flags that before/mine/after are meaningless without a start year", () => {
    expect(generationSpan([2021, 2022, 2024], null).positionKnown).toBe(false);
    expect(generationSpan([2021, 2022, 2024], undefined).positionKnown).toBe(false);
    // ...and an empty archive with an unknown start year is still unknown.
    expect(generationSpan([], null).positionKnown).toBe(false);
  });

  it("flags the position as known whenever a start year exists", () => {
    expect(generationSpan([2021], 2024).positionKnown).toBe(true);
    expect(generationSpan([], 2024).positionKnown).toBe(true);
    // Year 0 is not a real start year but is falsy — the check must be on
    // null/undefined, not on truthiness.
    expect(generationSpan([2021], 0).positionKnown).toBe(true);
  });

  it("ignores null, undefined and non-finite years", () => {
    const span = generationSpan([2021, null, undefined, Number.NaN, 2023], 2023);
    expect(span.total).toBe(2);
    expect(span.before).toBe(1);
    expect(span.mine).toBe(1);
  });
});

describe("hasContributed", () => {
  it("is false for a student with nothing in the file", () => {
    expect(hasContributed({ reviews: 0, insights: 0, plans: 0 })).toBe(false);
    expect(hasContributed(null)).toBe(false);
    expect(hasContributed(undefined)).toBe(false);
  });

  it("is true from a single contribution of any kind", () => {
    expect(hasContributed({ reviews: 1, insights: 0, plans: 0 })).toBe(true);
    expect(hasContributed({ reviews: 0, insights: 1, plans: 0 })).toBe(true);
    expect(hasContributed({ reviews: 0, insights: 0, plans: 1 })).toBe(true);
  });

  it("tolerates a partial stats object", () => {
    expect(hasContributed({ insights: 2 })).toBe(true);
    expect(hasContributed({})).toBe(false);
  });
});
