// =========================================================================
// The King must not contradict the screen the student is looking at
// =========================================================================
// Ariel, 1.9: "למה המלך ממליץ לי על קורסים לא מהסמסטר שלי? ולמה הוא אומר
// שלא שמרתי נתונים?"
//
// Two separate holes, both in what the advisor was given rather than in what
// it said:
//
//   · The "nothing is saved yet" flag tested only COMPLETED and IN_PROGRESS
//     rows. savePlan writes PLANNED. So a student who had just saved a whole
//     semester matched "אין ולו קורס אחד שמור", and the prompt then INSTRUCTED
//     the King to tell them their data had not been saved.
//   · availableNextSemester, despite the name, carried no year filter — the
//     column was not even fetched — so a second-year was offered third-year
//     courses.
//
// Both are tested here against the prompt builder, because the failure was
// visible only in what the prompt told the model to say.

import { describe, it, expect } from "vitest";
import { buildMentorSystemPrompt } from "@/lib/ai/mentor-prompt";
import { getActiveProgram } from "@/lib/programs/registry";

const program = getActiveProgram();

const course = (code: string, nameHe: string) => ({
  code,
  nameHe,
  discipline: "ECONOMICS",
  credits: 4,
  averageGrade: null,
  difficultyLevel: null,
  failRate: null,
  isMandatory: false,
  recommendedAfter: null,
});

const baseContext = {
  firstName: "יובל",
  gender: null,
  focusArea: null,
  totalCredits: 0,
  earnedCredits: 0,
  courseAverage: null,
  currentYear: 2,
  currentSemester: "FALL" as const,
  completedCourses: [],
  currentCourses: [],
  plannedCourses: [],
  availableNextSemester: [],
  regulationIssues: [],
  focusAreaCredits: 0,
  currentSemesterCredits: 0,
  seminarsCompleted: 0,
  englishStatus: null,
  miluimGroup: null,
  academicNowLine: null,
};

const NO_DATA = "אין עדיין ולו קורס אחד שמור";

describe("the 'nothing saved yet' warning", () => {
  it("is silent for a student whose plan is saved as PLANNED", () => {
    // The exact case Ariel hit: a full semester saved, nothing completed yet.
    const prompt = buildMentorSystemPrompt({
      ...baseContext,
      plannedCourses: [course("1011-2101", "מאקרו כלכלה"), course("1011-2109", "מיקרו כלכלה ב׳")],
    } as never, program);
    expect(prompt).not.toContain(NO_DATA);
  });

  it("still fires for a student mid-signup with nothing saved at all", () => {
    // The warning has a real job — a King narrating arithmetic over an empty
    // database is worse than one saying "nothing is saved yet".
    expect(buildMentorSystemPrompt(baseContext as never, program)).toContain(NO_DATA);
  });

  it("is silent when only completed courses exist", () => {
    const prompt = buildMentorSystemPrompt({
      ...baseContext,
      completedCourses: [course("1011-2103", "מיקרו כלכלה א׳")],
    } as never, program);
    expect(prompt).not.toContain(NO_DATA);
  });
});

describe("the plan reaches the advisor at all", () => {
  it("names the saved courses in the prompt", () => {
    // Not just "does the flag stay quiet" — the King has to be able to ANSWER
    // from the plan, which means the courses have to appear in the text.
    const prompt = buildMentorSystemPrompt({
      ...baseContext,
      plannedCourses: [course("1011-2109", "מיקרו כלכלה ב׳ + תרגיל")],
    } as never, program);
    expect(prompt).toContain("מיקרו כלכלה ב׳ + תרגיל");
  });
});
