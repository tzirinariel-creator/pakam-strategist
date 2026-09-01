// =========================================================================
// The King is told WHICH term he is talking about (#22, #55)
// =========================================================================
// Ariel: "למה המלך ממליץ לי על קורסים לא מהסמסטר שלי? ולמה הוא אומר שלא
// שמרתי נתונים? תחקור לעומק בבקשה את המלך."
//
// Two separate erasures, both in the hand-off to the model:
//
// 1. THE PROMPT NAMED TWO DIFFERENT YEARS AND LABELLED NEITHER. The context
//    computed the planning anchor (year 2, FALL תשפ״ז) to filter the available
//    list, then threw it away — so the prompt printed the student's CURRENT
//    term from the live calendar ("שנה 1, סמסטר ב׳") a few lines above a
//    static heading "קורסים זמינים לסמסטר הבא" holding the year-2 list. A
//    working rule then told the King to answer according to the year he was
//    given. He resolved the contradiction by guessing.
//
// 2. THE SAVED PLAN ARRIVED WITH NO TERM AT ALL. savePlan writes PLANNED rows
//    across the whole degree; the context selected all of them with no term
//    filter and mapToCourseInfo dropped plannedYear/plannedSemester. So the
//    only honest answer to "מה יש לי בסמסטר הבא?" was to read the entire
//    multi-year plan back — which is exactly the screenshot.
//
// This is not an edge case: from mid-July to 18.10 the current term and the
// planning term always differ. That window is the launch.

import { describe, it, expect } from "vitest";
import { buildMentorSystemPrompt, type MentorContext } from "@/lib/ai/mentor-prompt";
import { TAU_PPE_2025 } from "@/lib/programs/definitions/tau-ppe-2025";

const base: MentorContext = {
  firstName: "אריאל",
  gender: "male",
  focusArea: "ECONOMICS",
  totalCredits: 73,
  earnedCredits: 73,
  courseAverage: 87.4,
  focusAreaCredits: 20,
  currentYear: 1,
  currentSemester: "SPRING",
  completedCourses: [],
  currentCourses: [],
  plannedCourses: [
    { code: "1011-2109", nameHe: "מיקרו כלכלה ב׳", discipline: "ECONOMICS", credits: 5, plannedYear: 2, plannedSemester: "FALL" },
    { code: "0651-1010", nameHe: "קריאה מודרכת", discipline: "PHILOSOPHY", credits: 2, plannedYear: 1, plannedSemester: "SPRING" },
  ],
  availableNextSemester: [
    { code: "1011-2116", nameHe: "אקונומטריקה יישומית", discipline: "ECONOMICS", credits: 4 },
  ],
  regulationIssues: [],
  nextSemester: { year: 2, semester: "FALL" },
} as unknown as MentorContext;

const prompt = () => buildMentorSystemPrompt(base, TAU_PPE_2025);

describe("the available-courses list says which term it is for", () => {
  it("names the planning term in the heading", () => {
    const p = prompt();
    expect(p).toMatch(/קורסים זמינים לסמסטר א׳ של שנה 2/);
  });

  it("no longer uses the unanchored heading", () => {
    // The witness: this exact string sat above a list for a different year.
    expect(prompt()).not.toMatch(/## קורסים זמינים לסמסטר הבא \(/);
  });

  it("states the planning term next to the current one, so they cannot be confused", () => {
    const p = prompt();
    expect(p).toMatch(/שנה נוכחית: שנה 1/);
    expect(p).toMatch(/התכנון הבא הוא ל/);
  });

  it("says out loud that the list is NOT the current semester", () => {
    // The contradiction was silent. Now it is explained.
    expect(prompt()).toMatch(/ולא לסמסטר הנוכחי/);
  });
});

describe("every planned course carries the term the student filed it under", () => {
  it("prints year and semester on each line", () => {
    const p = prompt();
    expect(p).toMatch(/מיקרו כלכלה ב׳ \(1011-2109\).*שנה 2, סמסטר א׳/);
    expect(p).toMatch(/קריאה מודרכת \(0651-1010\).*שנה 1, סמסטר ב׳/);
  });

  it("keeps courses from different terms distinguishable", () => {
    // The defect was that these two lines were indistinguishable, so the model
    // could only answer about the whole degree at once.
    const lines = prompt().split("\n").filter((l) => l.includes("1011-2109") || l.includes("0651-1010"));
    expect(lines).toHaveLength(2);
    expect(lines[0]).not.toBe(lines[1]);
  });

  it("omits the term when a course genuinely has none", () => {
    // Catalog suggestions are not filed anywhere; inventing a term for them
    // would be worse than leaving it off.
    const p = buildMentorSystemPrompt({
      ...base,
      plannedCourses: [{ code: "X", nameHe: "בלי טרם", discipline: "ECONOMICS", credits: 2 }],
    } as unknown as MentorContext, TAU_PPE_2025);
    const line = p.split("\n").find((l) => l.includes("בלי טרם"))!;
    expect(line).not.toMatch(/שנה \d/);
  });
});

describe("it degrades honestly when the anchor is missing", () => {
  it("falls back to the old wording rather than inventing a term", () => {
    const p = buildMentorSystemPrompt({ ...base, nextSemester: null } as unknown as MentorContext, TAU_PPE_2025);
    expect(p).toMatch(/קורסים זמינים לסמסטר הבא/);
    expect(p).not.toMatch(/התכנון הבא הוא ל/);
  });
});
