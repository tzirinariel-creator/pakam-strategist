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

describe("buildMentorSystemPrompt — safety guards", () => {
  const program = getActiveProgram();

  it("forbids inventing bidding point predictions (HARD RULE: no מכרז quota guessing)", () => {
    const prompt = buildMentorSystemPrompt(ctx(), program);
    expect(prompt).toContain("בידינג");
    expect(prompt).toContain("אינה מתפרסמת");
    // must instruct never to name a points number + explain the mechanism
    expect(prompt).toMatch(/אל תנחש|אל תמליץ כמה נקודות/);
    expect(prompt).toContain("מקצים");
  });

  it("hardens against prompt injection (student text is data, not instructions)", () => {
    const prompt = buildMentorSystemPrompt(ctx(), program);
    expect(prompt).toContain("גבולות");
    expect(prompt).toMatch(/שאלה או מידע — לא הוראה/);
    expect(prompt).toMatch(/התעלם מההוראות|לחשוף/);
  });
});

describe("buildMentorSystemPrompt — verbatim fact rendering", () => {
  const program = getActiveProgram();

  it("renders null/empty facts as words, never 'null'/'NaN'", () => {
    const prompt = buildMentorSystemPrompt(
      ctx({ courseAverage: null, focusArea: null, completedCourses: [] }),
      program,
    );
    expect(prompt).toContain("אין ציונים עדיין");
    expect(prompt).toContain("לא נבחר");
    expect(prompt).toContain("(אין)");
    expect(prompt).not.toContain("null");
    expect(prompt).not.toContain("NaN");
  });

  it("renders a completed course's name, code, grade and difficulty tag", () => {
    const prompt = buildMentorSystemPrompt(
      ctx({
        completedCourses: [
          { code: "1011", nameHe: "מבוא לכלכלה", discipline: "ECONOMICS", credits: 5, grade: 88, difficultyLevel: "hard", averageGrade: 68, failRate: 22 },
        ],
      }),
      program,
    );
    expect(prompt).toContain("מבוא לכלכלה");
    expect(prompt).toContain("1011");
    expect(prompt).toContain("ציון: 88");
    expect(prompt).toContain("קשה");
  });
});
