import { describe, it, expect } from "vitest";
import { moedBOutcome, courseWeightInAverage } from "../moed-b-decision";
import { countsTowardAverage } from "../grade-calculator";
import type { UserCourseWithCourse } from "@/types/degree";

let n = 0;
const course = (grade: number | null, credits = 4, over: Record<string, unknown> = {}) =>
  ({
    id: `uc${++n}`,
    // canonicalAttempts collapses retakes by courseId — omit it and every row
    // in the fixture looks like the same course, so the "average" is one grade.
    // This has now bitten two different test files; the fixture must set it.
    courseId: `c${n}`,
    status: grade == null ? "PLANNED" : "COMPLETED",
    grade,
    isBinary: false,
    attemptNumber: 1,
    plannedYear: 1,
    plannedSemester: "FALL",
    course: {
      id: `c${n}`,
      code: `1000-000${n}`,
      nameHe: `קורס ${n}`,
      courseType: "ELECTIVE",
      credits,
      discipline: "ECONOMICS",
    },
    ...over,
  }) as unknown as UserCourseWithCourse;

describe("moedBOutcome", () => {
  it("shows both halves of the decision, not just the upside", () => {
    const a = course(70);
    const rest = [course(90), course(90), course(90), course(90)];
    const r = moedBOutcome({
      courses: [a, ...rest],
      userCourseId: a.id,
      keepsHigherGrade: false,
      optimisticGrade: 90,
      pessimisticGrade: 60,
    })!;
    expect(r.currentGrade).toBe(70);
    expect(r.currentAverage).toBe(86);
    expect(r.averageIfBetter).toBe(90);
    // The half that usually goes unsaid: a worse sitting REPLACES the better one.
    expect(r.averageIfWorse).toBe(84);
    expect(r.upside).toBe(4);
    expect(r.downside).toBe(2);
    expect(r.canLose).toBe(true);
  });

  it("a B/C/G reservist genuinely has nothing to lose", () => {
    // They keep the HIGHER sitting, so a bad retake cannot cost them anything.
    // Saying that plainly is the most useful thing on the screen for them.
    const a = course(70);
    const rest = [course(90), course(90), course(90), course(90)];
    const r = moedBOutcome({
      courses: [a, ...rest],
      userCourseId: a.id,
      keepsHigherGrade: true,
      optimisticGrade: 90,
      pessimisticGrade: 60,
    })!;
    expect(r.averageIfWorse).toBe(r.currentAverage);
    expect(r.downside).toBe(0);
    expect(r.canLose).toBe(false);
  });

  it("uses the same engine as the rest of the app — English never counts", () => {
    // If this drifted, the decision screen would quote an average that
    // contradicts the dashboard.
    const eng = course(60, 4, {
      course: { id: "ce", code: "2171-9201", nameHe: "מתקדמים ב' חוצה דיצפלינות בין תחומי", courseType: "ELECTIVE", credits: 4, discipline: "GENERAL" },
    });
    const a = course(80);
    const r = moedBOutcome({
      courses: [a, eng],
      userCourseId: a.id,
      keepsHigherGrade: false,
      optimisticGrade: 90,
      pessimisticGrade: 70,
    })!;
    // Only the 80 counts — the English 60 is out, so the average IS the 80.
    expect(r.currentAverage).toBe(80);
  });

  it("returns nothing when there is no result to improve on", () => {
    const planned = course(null);
    expect(
      moedBOutcome({
        courses: [planned],
        userCourseId: planned.id,
        keepsHigherGrade: false,
        optimisticGrade: 90,
        pessimisticGrade: 60,
      }),
    ).toBeNull();
    expect(
      moedBOutcome({
        courses: [course(80)],
        userCourseId: "nope",
        keepsHigherGrade: false,
        optimisticGrade: 90,
        pessimisticGrade: 60,
      }),
    ).toBeNull();
  });
});

describe("courseWeightInAverage", () => {
  it("shows how little one course moves a whole degree", () => {
    // The fact students most consistently over-estimate.
    const a = course(70, 4);
    const rest = Array.from({ length: 29 }, () => course(90, 4));
    expect(courseWeightInAverage([a, ...rest], a.id, countsTowardAverage)).toBeCloseTo(3.3, 1);
  });

  it("is null when nothing counts yet", () => {
    const a = course(null);
    expect(courseWeightInAverage([a], a.id, countsTowardAverage)).toBeNull();
  });
});
