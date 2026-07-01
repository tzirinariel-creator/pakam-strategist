import { describe, it, expect } from "vitest";
import { buildMentorSystemPrompt, type MentorContext } from "@/lib/ai/mentor-prompt";
import { getActiveProgram } from "@/lib/programs/registry";

function ctx(over: Partial<MentorContext> = {}): MentorContext {
  return {
    focusArea: "ECONOMICS",
    totalCredits: 96,
    earnedCredits: 75,
    courseAverage: 84.3,
    focusAreaCredits: 38,
    regulationIssues: [],
    currentYear: 2,
    currentSemester: "SPRING",
    completedCourses: [],
    currentCourses: [],
    availableNextSemester: [],
    currentSemesterCredits: 22,
    ...over,
  };
}

describe("buildMentorSystemPrompt — grounding (P2 step 4)", () => {
  const program = getActiveProgram();

  it("frames the student data as authoritative facts the model must not recompute", () => {
    const prompt = buildMentorSystemPrompt(ctx(), program);
    expect(prompt).toContain("עובדות מוסמכות");
    expect(prompt).toContain("אל תחשב מחדש");
    // Points the model at the dashboard instead of inventing a missing number.
    expect(prompt).toContain("המצב שלי");
  });

  it("injects the computed numbers verbatim so the model quotes, not recomputes", () => {
    const prompt = buildMentorSystemPrompt(ctx({ earnedCredits: 75, courseAverage: 84.3 }), program);
    expect(prompt).toContain("75");
    expect(prompt).toContain("84.3");
  });
});
