// =========================================================================
// Q9 (notes 21/36) — "המלך מחובר לנתונים": the context sent to the AI must
// carry the SAME numbers plan.getCredits / the dashboard hero compute, for
// the same injected user rows. This guards the DB→context wiring end-to-end
// (course rows → calculateCredits/calculateGrades → MentorContext), the layer
// note 21 caught lying ("צברת 0 ש״ס... חסרות לך 90").
// =========================================================================

import { describe, it, expect } from "vitest";
import type { Db } from "@/lib/db";
import { buildUserContext } from "@/lib/ai/context-builder";
import { buildMentorSystemPrompt } from "@/lib/ai/mentor-prompt";
import { getActiveProgram } from "@/lib/programs/registry";
import { calculateCredits } from "@/lib/credit-calculator";
import { calculateGrades } from "@/lib/grade-calculator";
import type { UserCourseWithCourse } from "@/types/degree";

// Known injected plan: 3 COMPLETED (13 ש״ס, credit-weighted avg 1180/13) +
// 1 IN_PROGRESS (4 ש״ס planned). No miluim rows → exemption 0.
let seq = 0;
function row(status: string, credits: number, grade: number | null, courseType = "MANDATORY"): UserCourseWithCourse {
  seq += 1;
  return {
    id: `uc-${seq}`,
    userId: "u1",
    courseId: `c-${seq}`,
    status,
    grade,
    plannedYear: 1,
    plannedSemester: "FALL",
    attemptNumber: 1,
    isGradeImproved: false,
    isBinary: false,
    disciplineOverride: null,
    submissionType: null,
    submissionGrade: null,
    notes: null,
    selectedGroups: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    course: {
      id: `c-${seq}`,
      code: `060${seq}-100${seq}`,
      nameHe: `קורס ${seq}`,
      nameEn: `Course ${seq}`,
      discipline: "ECONOMICS",
      courseType,
      credits,
      isMandatory: courseType === "MANDATORY",
      canCountAs: [],
      weeklyHours: credits,
      yearOffered: [1],
      semesterOffered: ["FALL"],
      prerequisites: [],
    },
  } as unknown as UserCourseWithCourse;
}

const ROWS = [
  row("COMPLETED", 4, 80),
  row("COMPLETED", 4, 90),
  row("COMPLETED", 5, 100),
  row("IN_PROGRESS", 4, null),
];

// Prisma stand-in: exactly the four reads buildUserContext performs.
const db = {
  userCourse: { findMany: async () => ROWS },
  studyTask: { findMany: async () => [] },
  miluimSemester: { findMany: async () => [] },
  course: { findMany: async () => [] },
} as unknown as Db;

const USER = {
  id: "u1",
  focusArea: "ECONOMICS",
  currentYear: 1,
  currentSemester: "FALL",
  firstName: "אריאל",
  gender: "male",
  amiramScore: 140,
};

describe("Q9 — the mentor context equals plan.getCredits for the same rows", () => {
  it("totalCredits/earned/average in the context match the credit+grade engines exactly", async () => {
    const ctx = await buildUserContext(db, USER);
    const credits = calculateCredits(ROWS, "ECONOMICS", 0);
    const grades = calculateGrades(ROWS);

    // The number the dashboard hero headlines — and the ONLY number the King
    // is allowed to narrate (#19/#21).
    expect(ctx.totalCredits).toBe(credits.breakdown.effectiveTotal); // 17
    expect(ctx.totalCredits).toBe(17);
    expect(ctx.earnedCredits).toBe(credits.earnedCredits); // 13
    expect(ctx.earnedCredits).toBe(13);
    expect(ctx.courseAverage).toBe(grades.courseAverage); // 1180/13
    expect(ctx.courseAverage).toBeCloseTo(1180 / 13, 6);
    expect(ctx.focusAreaCredits).toBe(credits.breakdown.focusArea);
    // The sub-breakdown that keeps the LLM at parity with the free engine:
    expect(ctx.creditDetail?.planned).toBe(credits.breakdown.planned); // 4
    expect(ctx.creditDetail?.mandatory).toBe(credits.breakdown.mandatory); // 17
  });

  it("the system prompt quotes those exact numbers verbatim (no recomputation)", async () => {
    const ctx = await buildUserContext(db, USER);
    const prompt = buildMentorSystemPrompt(ctx, getActiveProgram());
    // earned 13 out of 150, total incl. planned 17, average 90.8:
    expect(prompt).toContain("13 מתוך 150");
    expect(prompt).toContain(`סה"כ ש״ס (כולל מתוכננות): 17`);
    expect(prompt).toContain((1180 / 13).toFixed(1)); // "90.8"
  });

  it("regulation issues in the context come from the live engine (not a canned list)", async () => {
    const ctx = await buildUserContext(db, USER);
    // The injected student has 17/150 ש״ס ⇒ PKM-001 must appear as an open
    // (not-passed) issue with the real numbers in its message.
    const total = ctx.regulationIssues.find((r) => r.ruleId === "PKM-001");
    expect(total).toBeDefined();
    expect(total!.messageHe).toContain("17/150");
  });
});
