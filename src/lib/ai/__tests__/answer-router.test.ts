import { describe, it, expect } from "vitest";
import { routeQuestion, isReasoningQuestion, mentionsCourseCode } from "@/lib/ai/answer-router";
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

// #30 (12.7) — follow-ups must escalate instead of re-serving the canned answer.
import { isFollowUpQuestion } from "@/lib/ai/answer-router";

describe("isFollowUpQuestion (#30)", () => {
  it("catches Ariel's real follow-up", () => {
    expect(isFollowUpQuestion("הבנתי.. יש עוד מגבלות על הבינארי?")).toBe(true);
  });
  it("catches continuation openers and tiny anaphora", () => {
    expect(isFollowUpQuestion("ומה עם אנגלית?")).toBe(true);
    expect(isFollowUpQuestion("וזה?")).toBe(true);
    expect(isFollowUpQuestion("מה עוד חסר לי?")).toBe(true);
  });
  it("does NOT flag a fresh standalone question", () => {
    expect(isFollowUpQuestion("כמה ש״ס נשארו לי לתואר?")).toBe(false);
    expect(isFollowUpQuestion("מה הממוצע שלי?")).toBe(false);
  });
});

// Regression for a real, reproduced bug from the 24.7 live-QA session: asking
// about a SPECIFIC catalog course by code ("ספר לי על 0618-1012 — כמה הוא
// קשה ומה הממוצע וכישלון בו?") got silently hijacked by the bare "ממוצע"
// personal-GPA handler (degree-qa.ts's length-weighted scorer has no signal
// for "whose average" — a lone 5-char keyword still wins when nothing else
// scores higher) and answered "you have no grades yet" — a wrong answer to a
// question that was never about the student's own grades, and the question
// never reached the LLM at all. mentionsCourseCode() + routeQuestion now
// force escalation whenever a Yedion course code appears, regardless of what
// degree-qa's keyword scorer thinks it matched.
describe("mentionsCourseCode + routeQuestion — course-code escalation (24.7 live-QA finding)", () => {
  it("detects a Yedion course code in free text", () => {
    expect(mentionsCourseCode("ספר לי על הקורס מבוא ללוגיקה (0618-1012)")).toBe(true);
    expect(mentionsCourseCode("כמה ש״ס נשארו לי?")).toBe(false);
  });

  it("escalates to the LLM even though the bare 'ממוצע' handler scores > 0, reproducing the exact live bug report", () => {
    const q = "ספר לי על הקורס מבוא ללוגיקה (0618-1012) - כמה הוא קשה ומה הממוצע וכישלון בו?";
    const d = routeQuestion(q, ctx());
    // The keyword scorer still "matches" (this is exactly the false-positive) —
    // but shouldEscalate must be true and the reason must name the course code,
    // so the caller never shows the wrong canned GPA answer as the final word.
    expect(d.shouldEscalate).toBe(true);
    expect(d.reason).toBe("course-code");
  });

  it("does not force escalation for an ordinary personal-average question with no course code", () => {
    const d = routeQuestion("מה הממוצע שלי?", ctx());
    expect(d.reason).toBe("none");
    expect(d.shouldEscalate).toBe(false);
  });
});
