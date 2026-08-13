// =========================================================================
// Q9 (notes 21/36) — "המלך מחובר לנתונים": the context sent to the AI must
// carry the SAME numbers plan.getCredits / the dashboard hero compute, for
// the same injected user rows. This guards the DB→context wiring end-to-end
// (course rows → calculateCredits/calculateGrades → MentorContext), the layer
// note 21 caught lying ("צברת 0 ש״ס... חסרות לך 90").
// =========================================================================

import { describe, it, expect } from "vitest";
import type { Db } from "@/lib/db";
import { buildUserContext, isForeignLawCourseCode } from "@/lib/ai/context-builder";
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
    // Label corrected 13.8: this field is `effectiveTotal`, which folds in the
    // miluim exemption as well as planned credits. Calling it "כולל מתוכננות"
    // hid that, and a group-C student with nothing saved read as "8 ש״ס".
    expect(prompt).toContain(`סה"כ ש״ס (כולל פטור מילואים ומתוכננות): 17`);
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

// =========================================================================
// Foreign-course scoping (data-correctness) — the King must never recommend a
// non-PPE course. The TAU law catalog (0910-xxxx) was co-seeded into the shared
// Course table under the "GENERAL" discipline, so the discipline scope alone
// doesn't catch it. Guarded in code (not only the manual prod cleanup), and
// 0910-1000 ("דיני איכות סביבה") — a REAL PPE law-foundation course — is kept.
// =========================================================================
describe("foreign-course scoping — the King never surfaces a non-PPE course", () => {
  it("flags the foreign 0910 set but keeps the real PPE 0910-1000 and PPE codes", () => {
    expect(isForeignLawCourseCode("0910-4601")).toBe(true);
    expect(isForeignLawCourseCode("0910-7002")).toBe(true);
    expect(isForeignLawCourseCode("0910-1000")).toBe(false); // real PPE course
    expect(isForeignLawCourseCode("0618-1085")).toBe(false);
    expect(isForeignLawCourseCode("1411-9001")).toBe(false); // PPE law-division
  });

  it("availableNextSemester drops foreign 0910 courses but keeps 0910-1000 + PPE courses", async () => {
    const courseRow = (code: string, discipline = "GENERAL") => ({
      code,
      nameHe: `קורס ${code}`,
      discipline,
      credits: 4,
      averageGrade: null,
      difficultyLevel: null,
      failRate: null,
      prerequisites: [],
      courseType: "ELECTIVE",
      isMandatory: false,
    });
    const dbWithCourses = {
      userCourse: { findMany: async () => ROWS },
      studyTask: { findMany: async () => [] },
      miluimSemester: { findMany: async () => [] },
      course: {
        findMany: async () => [
          courseRow("0910-4601"), // foreign law — must be dropped
          courseRow("0910-1000"), // real PPE law-foundation — must stay
          courseRow("0618-2000", "ECONOMICS"), // ordinary PPE — must stay
        ],
      },
    } as unknown as Db;

    const ctx = await buildUserContext(dbWithCourses, USER);
    const codes = ctx.availableNextSemester.map((c) => c.code);
    expect(codes).not.toContain("0910-4601");
    expect(codes).toContain("0910-1000");
    expect(codes).toContain("0618-2000");
  });
});

// =========================================================================
// #13/#14 (13.8) — the empty-DB guard on the SERVER prompt.
//
// The advisor is mounted on the protected layout, so it is LIVE while the
// onboarding wizard runs — and the wizard keeps the student's answers in
// browser memory until the final save. Every number the prompt carries is then
// computed over an empty database. Ariel asked "כמה ש״ס נשארו לי?" mid-wizard
// and was told "150 מתוך 150 … 0 הושלמו"; he said "אבל כבר עשיתי שנה
// באוניברסיטה" and was told "כרגע יש לכם 8 ש״ס בלבד" — the 8 being his miluim
// EXEMPTION narrated as earned credit, seconds after he had entered thirteen
// completed courses.
// =========================================================================
describe("empty plan — the prompt must forbid arithmetic over nothing", () => {
  // A group-C reservist mid-onboarding: nothing saved, but an 8-credit
  // exemption — the exact shape that produced the "8 ש״ס" sentence.
  const emptyDb = {
    userCourse: { findMany: async () => [] },
    studyTask: { findMany: async () => [] },
    miluimSemester: { findMany: async () => [] },
    course: { findMany: async () => [] },
  } as unknown as Db;

  it("warns the model when the student has no saved courses at all", async () => {
    const ctx = await buildUserContext(emptyDb, USER);
    expect(ctx.completedCourses).toHaveLength(0);
    expect(ctx.currentCourses).toHaveLength(0);

    const prompt = buildMentorSystemPrompt(ctx, getActiveProgram());
    expect(prompt).toContain("אין עדיין ולו קורס אחד שמור");
    expect(prompt).toContain("אל תציין ש״ס שנצברו");
    // General questions must still be answerable — silencing those would be a
    // worse product than the bug.
    expect(prompt).toContain("על שאלות כלליות");
  });

  it("does NOT warn once the student has courses", async () => {
    const ctx = await buildUserContext(db, USER);
    const prompt = buildMentorSystemPrompt(ctx, getActiveProgram());
    expect(prompt).not.toContain("אין עדיין ולו קורס אחד שמור");
  });
});
