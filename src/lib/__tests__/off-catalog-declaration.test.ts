// =========================================
// #8 — "מי אמר שדוגרי מחוץ לרשימה? זה מאושר לנו"
// =========================================
// A course can be genuinely approved for a student's degree and still have
// never been in OUR catalog. The app must (a) let the student SAY so, and
// (b) actually count it that way. These tests pin down the second half — the
// declaration has to move real numbers, not just paint a badge.

import { describe, it, expect } from "vitest";
import { calculateCredits } from "@/lib/credit-calculator";
import {
  customCourseCode,
  isOffCatalogCourse,
  isStudentAddedCourse,
  isDeclaredApproved,
  isPersistedCourseId,
} from "@/lib/off-catalog";
import type { UserCourseWithCourse } from "@/types/degree";

// -------------------------------------------------------------------
// A student-added, off-catalog elective (what addCustomCourses writes):
// GENERAL discipline, ELECTIVE, isActive:false.
// -------------------------------------------------------------------
function offCatalogCourse(
  over: {
    disciplineOverride?: string | null;
    credits?: number;
    code?: string;
    isActive?: boolean;
    status?: string;
  } = {},
): UserCourseWithCourse {
  const credits = over.credits ?? 4;
  return {
    id: "uc-dugri",
    userId: "u-1",
    courseId: "course-dugri",
    status: (over.status ?? "COMPLETED") as UserCourseWithCourse["status"],
    grade: 90,
    plannedYear: 2,
    plannedSemester: "FALL",
    attemptNumber: 1,
    isGradeImproved: false,
    isBinary: false,
    disciplineOverride: (over.disciplineOverride ??
      null) as UserCourseWithCourse["disciplineOverride"],
    submissionType: null,
    submissionGrade: null,
    notes: null,
    course: {
      id: "course-dugri",
      code: over.code ?? "CUSTOM-דוגרי",
      nameHe: "דוגרי: אמת, אמון ואמנות",
      nameEn: null,
      discipline: "GENERAL" as UserCourseWithCourse["course"]["discipline"],
      courseType: "ELECTIVE" as UserCourseWithCourse["course"]["courseType"],
      credits,
      yearOffered: [1, 2, 3],
      semesterOffered: [],
      prerequisites: [],
      canCountAs: [],
      description: null,
      isMandatory: false,
      submissionType: "EXAM" as UserCourseWithCourse["course"]["submissionType"],
      weeklyHours: null,
      examDateA: null,
      examDateB: null,
      averageGrade: null,
      difficultyLevel: null,
      failRate: null,
      gradeDataYear: null,
      medianGrade: null,
      gradeStdDev: null,
      gradeDataSource: null,
      isActive: over.isActive ?? false,
    },
  };
}

describe("a declared discipline changes the credit calculation (#8)", () => {
  it("WITHOUT a declaration the course counts as a general elective — zero toward the focus area", () => {
    const res = calculateCredits([offCatalogCourse()], "PHILOSOPHY");

    expect(res.breakdown.total).toBe(4); // it still earns credit
    expect(res.breakdown.byDiscipline["GENERAL"]).toBe(4);
    expect(res.breakdown.byDiscipline["PHILOSOPHY"]).toBe(0);
    expect(res.breakdown.focusArea).toBe(0); // the exact complaint in note #8
  });

  it("WITH the declaration the same course counts toward the declared discipline", () => {
    const res = calculateCredits(
      [offCatalogCourse({ disciplineOverride: "PHILOSOPHY" })],
      "PHILOSOPHY",
    );

    expect(res.breakdown.byDiscipline["PHILOSOPHY"]).toBe(4);
    expect(res.breakdown.byDiscipline["GENERAL"]).toBe(0);
    expect(res.breakdown.focusArea).toBe(4);
    // Total is unchanged — a declaration re-files credits, it never invents them.
    expect(res.breakdown.total).toBe(4);
  });

  it("the declaration moves the per-discipline requirement status, not just a label", () => {
    const declared = calculateCredits(
      [offCatalogCourse({ disciplineOverride: "ECONOMICS", credits: 6 })],
      null,
    );
    const notDeclared = calculateCredits([offCatalogCourse({ credits: 6 })], null);

    const econ = (r: ReturnType<typeof calculateCredits>) =>
      r.disciplineStatus.find((d) => d.discipline === "ECONOMICS")?.earned;

    expect(econ(declared)).toBe(6);
    expect(econ(notDeclared)).toBe(0);
  });

  it("a PLANNED (not yet completed) declared course counts as planned focus credits", () => {
    const res = calculateCredits(
      [offCatalogCourse({ disciplineOverride: "PHILOSOPHY", status: "PLANNED" })],
      "PHILOSOPHY",
    );

    expect(res.breakdown.planned).toBe(4);
    expect(res.breakdown.earned).toBe(0);
    expect(res.breakdown.focusArea).toBe(4);
  });
});

describe("off-catalog helpers", () => {
  it("a course code is derived from the NAME, so re-adding upserts the same row", () => {
    expect(customCourseCode("דוגרי")).toBe("CUSTOM-דוגרי");
    expect(customCourseCode("  דוגרי  ")).toBe("CUSTOM-דוגרי");
    // Truncated at 24 chars of the hyphenated name (matches what the server
    // has always written, so codes minted before this refactor still match).
    expect(customCourseCode("Academic Writing Workshop")).toBe(
      "CUSTOM-Academic-Writing-Worksho",
    );
    // Same name → same code, twice in a row (no timestamps).
    expect(customCourseCode("סדנה")).toBe(customCourseCode("סדנה"));
  });

  it("only an explicit isActive:false is 'outside our catalog' — unknown never is", () => {
    expect(isOffCatalogCourse({ isActive: false })).toBe(true);
    expect(isOffCatalogCourse({ isActive: true })).toBe(false);
    expect(isOffCatalogCourse({})).toBe(false); // not selected → don't claim it
  });

  it("distinguishes a student-added course from one that vanished from the ידיעון", () => {
    // Student-typed → never had a yedion code.
    expect(isStudentAddedCourse({ code: "CUSTOM-דוגרי", isActive: false })).toBe(true);
    // A real yedion code that went inactive = de-listed, NOT student-added.
    expect(isStudentAddedCourse({ code: "0618-2033", isActive: false })).toBe(false);
    expect(isStudentAddedCourse({ code: "CUSTOM-x", isActive: true })).toBe(false);
  });

  it("the declaration is the discipline override on an off-catalog course", () => {
    expect(isDeclaredApproved(offCatalogCourse({ disciplineOverride: "LAW" }))).toBe(true);
    expect(isDeclaredApproved(offCatalogCourse())).toBe(false);
    // A catalog course with an override is a re-filing, NOT an approval claim.
    expect(
      isDeclaredApproved(
        offCatalogCourse({ disciplineOverride: "LAW", isActive: true }),
      ),
    ).toBe(false);
  });

  it("a client-only planner id is never mistaken for a persisted course id", () => {
    expect(isPersistedCourseId("11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(isPersistedCourseId("custom-11111111-1111-4111-8111-111111111111")).toBe(false);
    expect(isPersistedCourseId("CUSTOM-דוגרי")).toBe(false);
    expect(isPersistedCourseId("")).toBe(false);
  });
});
