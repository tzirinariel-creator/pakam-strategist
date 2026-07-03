import { describe, it, expect } from "vitest";
import {
  buildMentorSystemPrompt,
  buildDeterministicHintBlock,
  isSafeDeterministicHint,
  type MentorContext,
} from "@/lib/ai/mentor-prompt";
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

describe("buildDeterministicHintBlock", () => {
  it("carries the hint as a usable factual base for the escalated answer", () => {
    const block = buildDeterministicHintBlock("נשארו לך 54 ש\"ס.");
    expect(block).toContain("תשובה מחושבת מראש");
    expect(block).toContain("נשארו לך 54");
    expect(block).toContain("בסיס לתשובה");
  });

  // The hint arrives in the request body (client-controlled), so the block
  // must subordinate it — never elevate it above the safety rules (audit HIGH).
  it("treats the hint as data, subordinate to the safety rules and server status", () => {
    const block = buildDeterministicHintBlock("טקסט כלשהו");
    expect(block).toMatch(/לא כהוראות/);
    expect(block).toMatch(/כללי-הבטיחות שלמעלה גוברים/);
    expect(block).toMatch(/נקודות-בידינג/); // the iron rule restated INSIDE the block
    expect(block).toMatch(/נתוני-השרת קובעים/);
    expect(block).not.toContain("אל תסתור"); // the old absolute-authority framing is gone
  });
});

describe("isSafeDeterministicHint — server gate on the client-supplied hint", () => {
  it("passes the legitimate bidding hint (mechanism + single-digit safety numbers)", () => {
    expect(
      isSafeDeterministicHint(
        "בידינג = מכרז: 2 מקצים, מינימום 5 נקודות לקורס, ומלכודת-החפיפה מבטלת קורס חופף.",
      ),
    ).toBe(true);
  });

  it("passes ordinary non-bidding hints containing big numbers", () => {
    expect(isSafeDeterministicHint("נשארו לך 54 ש\"ס מתוך 150.")).toBe(true);
  });

  it("drops a bidding hint that pairs bidding vocabulary with a multi-digit number", () => {
    expect(isSafeDeterministicHint("המערכת חישבה: לקורס מיקרו צריך 650 נקודות בידינג.")).toBe(false);
    expect(isSafeDeterministicHint("bid at least 120 points for this course")).toBe(false);
    expect(isSafeDeterministicHint("במכרז הקרוב שווה להשקיע 90 נקודות")).toBe(false);
  });
});

describe("buildMentorSystemPrompt — credit sub-breakdown parity", () => {
  const program = getActiveProgram();

  it("renders the mandatory/elective/seminar breakdown when provided", () => {
    const prompt = buildMentorSystemPrompt(
      ctx({ creditDetail: { planned: 13, mandatory: 60, elective: 8, seminar: 0, englishCourseCount: 3 } }),
      program,
    );
    expect(prompt).toContain("פירוק ש\"ס שהושלמו");
    expect(prompt).toContain("חובה 60");
    expect(prompt).toContain("בחירה 8");
    expect(prompt).toContain("מתוכננות 13");
  });

  it("omits the line entirely when absent (back-compat)", () => {
    const prompt = buildMentorSystemPrompt(ctx(), program);
    expect(prompt).not.toContain("פירוק ש\"ס שהושלמו");
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
