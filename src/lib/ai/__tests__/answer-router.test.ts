import { describe, it, expect } from "vitest";
import { routeQuestion, isReasoningQuestion } from "@/lib/ai/answer-router";
import type { QAContext } from "@/lib/degree-qa";

function ctx(over: Partial<QAContext> = {}): QAContext {
  return {
    isHe: true,
    effectiveTotal: 96,
    earned: 75,
    planned: 13,
    miluimExemption: 8,
    mandatory: 80,
    elective: 8,
    seminar: 0,
    focusAreaCredits: 38,
    focusAreaTarget: 60,
    englishCourseCount: 3,
    courseAverage: 84,
    hasFocusArea: true,
    focusAreaNameHe: "כלכלה",
    focusAreaNameEn: "Economics",
    currentYear: 2,
    amiramScore: 133,
    miluimGroupName: "קבוצה C",
    binaryRemaining: 5,
    failedRules: [],
    seminarPlannedCount: 0,
    ...over,
  };
}

describe("isReasoningQuestion", () => {
  it("flags open-ended judgment questions", () => {
    expect(isReasoningQuestion("למה כדאי לי לקחת בינארי?")).toBe(true);
    expect(isReasoningQuestion("מה עדיף — כלכלה או פילוסופיה?")).toBe(true);
    expect(isReasoningQuestion("should I take this course?")).toBe(true);
  });

  it("does not flag a plain lookup", () => {
    expect(isReasoningQuestion("כמה ש״ס נשארו לי?")).toBe(false);
    expect(isReasoningQuestion("מה הממוצע שלי?")).toBe(false);
  });
});

describe("routeQuestion", () => {
  it("answers a plain matched lookup for free — no escalation", () => {
    const d = routeQuestion("כמה ש״ס נשארו לי?", ctx());
    expect(d.matched).toBe(true);
    expect(d.shouldEscalate).toBe(false);
    expect(d.reason).toBe("none");
    expect(d.deterministic.text).toContain("54"); // 150 - 96
  });

  it("escalates a reasoning question even when a keyword matched", () => {
    // "בינארי" matches the binary handler, but "כדאי לי" wants judgment.
    const d = routeQuestion("כדאי לי לקחת בינארי בקורס הכבד הזה?", ctx());
    expect(d.matched).toBe(true);
    expect(d.shouldEscalate).toBe(true);
    expect(d.reason).toBe("reasoning");
    // The deterministic answer is still produced as the graceful fallback.
    expect(d.deterministic.text.length).toBeGreaterThan(0);
  });

  it("escalates an unmatched question and still returns the fallback", () => {
    const d = routeQuestion("תכנן לי את כל התואר מחדש בבקשה", ctx());
    expect(d.matched).toBe(false);
    expect(d.shouldEscalate).toBe(true);
    expect(d.reason).toBe("no-match");
    expect(d.deterministic.text).toContain("אני יכול לעזור"); // capabilities fallback
  });
});
