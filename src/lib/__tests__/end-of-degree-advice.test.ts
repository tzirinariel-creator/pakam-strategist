// The timing rules טל gave Ariel, which the app previously had no concept of.
import { describe, it, expect } from "vitest";
import {
  isNearEndOfDegree, miluimExemptionReminder, binaryTimingAdvice,
} from "@/lib/end-of-degree-advice";

const at = (currentYear: number, creditsEarned: number) =>
  ({ currentYear, creditsEarned, creditsRequired: 150 });

describe("when 'near the end of the degree' begins", () => {
  it("year 3 counts, whatever the credits say", () => {
    expect(isNearEndOfDegree(at(3, 0))).toBe(true);
  });

  it("75% of credits counts, even for a student still labelled year 2", () => {
    // Repeaters and returning students don't track the nominal year.
    expect(isNearEndOfDegree(at(2, 113))).toBe(true);
    expect(isNearEndOfDegree(at(2, 112))).toBe(false);
  });

  it("a first-year student is never 'near the end'", () => {
    expect(isNearEndOfDegree(at(1, 40))).toBe(false);
  });

  it("does not divide by zero on a program with no credit total", () => {
    expect(isNearEndOfDegree({ currentYear: 1, creditsEarned: 10, creditsRequired: 0 })).toBe(false);
  });
});

describe("the miluim exemption reminder — טל: 'צריך להזכיר לקראת סוף התואר'", () => {
  it("fires near the end when credits are still unclaimed", () => {
    const r = miluimExemptionReminder(at(3, 120), { eligibleCredits: 10, usedCredits: 2 });
    expect(r.show).toBe(true);
    expect(r.unusedCredits).toBe(8);
  });

  it("stays quiet in year 1 — a two-year-long nag is furniture", () => {
    expect(miluimExemptionReminder(at(1, 30), { eligibleCredits: 10, usedCredits: 0 }).show).toBe(false);
  });

  it("stays quiet when everything is already claimed", () => {
    expect(miluimExemptionReminder(at(3, 130), { eligibleCredits: 8, usedCredits: 8 }).show).toBe(false);
  });

  it("never reports a negative remainder if more was used than we think is due", () => {
    const r = miluimExemptionReminder(at(3, 130), { eligibleCredits: 8, usedCredits: 10 });
    expect(r.unusedCredits).toBe(0);
    expect(r.show).toBe(false);
  });
});

describe("binary timing — טל: 'עדיף לשים בינאריים רק בסוף התואר'", () => {
  it("says hold early in the degree", () => {
    expect(binaryTimingAdvice(at(1, 30), { remaining: 5 })).toBe("hold");
  });

  it("says it is reasonable near the end", () => {
    expect(binaryTimingAdvice(at(3, 120), { remaining: 3 })).toBe("reasonable");
  });

  it("reports an exhausted quota regardless of when you ask", () => {
    expect(binaryTimingAdvice(at(1, 30), { remaining: 0 })).toBe("no-quota-left");
    expect(binaryTimingAdvice(at(3, 140), { remaining: 0 })).toBe("no-quota-left");
  });
});
