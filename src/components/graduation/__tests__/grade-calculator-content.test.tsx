// @vitest-environment jsdom
// =========================================================================
// Locks the honesty guards of the ReverseCalculator (#44 QA-8). The reverse
// calculator projects a target graduation score onto not-yet-graded courses
// and reports the average still needed. Three guards keep it honest:
//
//   (1) A passed course that's being RETAKEN counts as EARNED exactly once
//       (canonicalAttempts keeps it as completed) and is EXCLUDED from
//       `remaining` via the completedCodes set — so its credits never land in
//       BOTH the divisor (remainingCredits) and the earned sum. Double-counting
//       could flip a borderline target to a false "impossible".
//   (2) `remaining` shares the SAME population as `completed`: only courses
//       whose TYPE counts toward the average (courseTypeCountsTowardAverage —
//       no SEMINAR / ENGLISH / binary). A planned seminar/English/binary course
//       must never inflate the divisor.
//   (3) The status flips honestly off the needed average:
//         neededAvg > 100  → "impossible"
//         neededAvg <= 0    → "already-achieved"
//         0 remaining credits → "no-remaining"
//         else              → "possible"
//
// ReverseCalculator is a file-private component and the reverse-calc math is an
// inline useMemo (no exported pure helper), so we drive it through the exported
// GradeCalculatorContent page and read the rendered neededAvg / status.
// =========================================================================
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import type { UserCourseWithCourse, Course } from "@/types/degree";
import type { CourseType, CourseStatus } from "@/types/enums";

const h = vi.hoisted(() => ({
  courses: [] as UserCourseWithCourse[],
  grade: undefined as unknown,
  profile: undefined as unknown,
}));

vi.mock("next-intl", () => ({
  useLocale: () => "he",
  useTranslations: () => (k: string) => k,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/trpc/react", () => ({
  api: {
    plan: {
      getUserPlan: {
        useQuery: () => ({ data: { courses: h.courses }, isLoading: false }),
      },
      getGraduationScore: {
        useQuery: () => ({ data: h.grade, isLoading: false }),
      },
    },
    user: {
      getProfile: { useQuery: () => ({ data: h.profile }) },
    },
    useUtils: () => ({}),
  },
}));

import { GradeCalculatorContent } from "@/components/graduation/grade-calculator-content";

// -------------------------------------------------------------------
// Fixture factory — a fully-typed UserCourseWithCourse with the few
// fields the reverse calculator actually reads made overridable.
// -------------------------------------------------------------------
let seq = 0;
function uc(opts: {
  code: string;
  credits: number;
  status: CourseStatus;
  grade?: number | null;
  courseType?: CourseType;
  isBinary?: boolean;
  attemptNumber?: number;
  courseId?: string;
  plannedYear?: number;
}): UserCourseWithCourse {
  const courseId = opts.courseId ?? `course-${opts.code}`;
  const course: Course = {
    id: courseId,
    code: opts.code,
    nameHe: opts.code,
    nameEn: null,
    discipline: "PHILOSOPHY",
    courseType: opts.courseType ?? "ELECTIVE",
    credits: opts.credits,
    yearOffered: [],
    semesterOffered: [],
    prerequisites: [],
    canCountAs: [],
    description: null,
    isMandatory: false,
    submissionType: "NONE",
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
  };
  return {
    id: `uc-${seq++}`,
    userId: "user-1",
    courseId,
    status: opts.status,
    grade: opts.grade ?? null,
    plannedYear: opts.plannedYear ?? 1,
    plannedSemester: "FALL",
    attemptNumber: opts.attemptNumber ?? 1,
    isGradeImproved: false,
    isBinary: opts.isBinary ?? false,
    disciplineOverride: null,
    submissionType: null,
    submissionGrade: null,
    notes: null,
    course,
  };
}

// The reverse calculator lives in its own .data-card, headed by the
// t("reverseCalc") key (echoed verbatim by the (k) => k mock). Scope every
// assertion to that card so the ScoreDashboard / honors card can't collide.
function reverseCard(): HTMLElement {
  return screen.getByText("reverseCalc").closest(".data-card") as HTMLElement;
}

function slider(): HTMLElement {
  return within(reverseCard()).getByRole("slider");
}

beforeEach(() => {
  cleanup();
  localStorage.clear();
  h.courses = [];
  h.grade = undefined;
  h.profile = undefined;
});

describe("ReverseCalculator honesty guards (#44 QA-8)", () => {
  it("guard 1: a retaken passed course counts as earned once and is EXCLUDED from remaining", () => {
    // course cA: passed (grade 70, 20 ש״ס), and a second IN_PROGRESS retake row
    // for the SAME code. cC is a genuinely new planned course (10 ש״ס).
    h.courses = [
      uc({ code: "0001-0001", courseId: "cA", status: "COMPLETED", grade: 70, credits: 20, attemptNumber: 1 }),
      uc({ code: "0001-0001", courseId: "cA", status: "IN_PROGRESS", grade: null, credits: 20, attemptNumber: 2 }),
      uc({ code: "0002-0002", courseId: "cC", status: "PLANNED", grade: null, credits: 10 }),
    ];
    render(<GradeCalculatorContent />);

    const card = reverseCard();
    // remaining = [cC] only. completed=20 ש״ס (grade 70) → sum 1400, total 30.
    // neededAvg = (80*30 - 1400) / 10 = 100.0  → "possible".
    // If the retake leaked into remaining: count 2, "(30 credits)", neededAvg 86.7.
    expect(within(card).getByText("neededAvg")).toBeInTheDocument();
    expect(within(card).getByText("100.0")).toBeInTheDocument();
    expect(within(card).getByText("1")).toBeInTheDocument(); // remainingCount
    expect(within(card).getByText(/\(10 credits\)/)).toBeInTheDocument();
    expect(within(card).queryByText(/\(30 credits\)/)).toBeNull();
  });

  it("guard 2: remaining shares completed's population — seminar/English/binary never inflate the divisor", () => {
    // completed: normal course grade 90, 20 ש״ס → sum 1800.
    // planned: one countable (10 ש״ס) + a SEMINAR (12), ENGLISH (4), binary (6)
    // that MUST be excluded from the divisor.
    h.courses = [
      uc({ code: "0001", courseId: "cA", status: "COMPLETED", grade: 90, credits: 20 }),
      uc({ code: "0002", courseId: "cC", status: "PLANNED", credits: 10, courseType: "ELECTIVE" }),
      uc({ code: "0003", courseId: "cD", status: "PLANNED", credits: 12, courseType: "SEMINAR" }),
      uc({ code: "0004", courseId: "cE", status: "PLANNED", credits: 4, courseType: "ENGLISH" }),
      uc({ code: "0005", courseId: "cF", status: "PLANNED", credits: 6, isBinary: true }),
    ];
    render(<GradeCalculatorContent />);

    const card = reverseCard();
    // Correct divisor = 10 ש״ס (only cC). total 30.
    // neededAvg = (80*30 - 1800) / 10 = 60.0. count 1.
    // If seminar/English/binary leaked in: count 4, "(32 credits)", neededAvg 73.8.
    expect(within(card).getByText("60.0")).toBeInTheDocument();
    expect(within(card).getByText("1")).toBeInTheDocument();
    expect(within(card).getByText(/\(10 credits\)/)).toBeInTheDocument();
    expect(within(card).queryByText(/\(32 credits\)/)).toBeNull();
    expect(within(card).queryByText("4")).toBeNull();
  });

  it("status flips to 'impossible' when the needed average exceeds 100", () => {
    // completed grade 80, 30 ש״ס → sum 2400; planned 10 ש״ס.
    h.courses = [
      uc({ code: "0001", courseId: "cA", status: "COMPLETED", grade: 80, credits: 30 }),
      uc({ code: "0002", courseId: "cC", status: "PLANNED", credits: 10 }),
    ];
    render(<GradeCalculatorContent />);

    const card = reverseCard();
    // target 80: neededAvg = (80*40 - 2400)/10 = 80.0 → "possible".
    expect(within(card).getByText("neededAvg")).toBeInTheDocument();
    expect(within(card).queryByText("impossible")).toBeNull();

    // Push the target to 100: neededAvg = (100*40 - 2400)/10 = 160 → "impossible".
    fireEvent.change(slider(), { target: { value: "100" } });
    expect(within(reverseCard()).getByText("impossible")).toBeInTheDocument();
    expect(within(reverseCard()).queryByText("neededAvg")).toBeNull();
  });

  it("status flips to 'already-achieved' when the needed average is <= 0", () => {
    // completed grade 100, 30 ש״ס → sum 3000; planned 10 ש״ס.
    h.courses = [
      uc({ code: "0001", courseId: "cA", status: "COMPLETED", grade: 100, credits: 30 }),
      uc({ code: "0002", courseId: "cC", status: "PLANNED", credits: 10 }),
    ];
    render(<GradeCalculatorContent />);

    const card = reverseCard();
    // target 80: neededAvg = (80*40 - 3000)/10 = 20.0 → "possible".
    expect(within(card).getByText("neededAvg")).toBeInTheDocument();

    // Drop the target to 60: neededAvg = (60*40 - 3000)/10 = -60 → already-achieved.
    // (that branch renders the t("possible") reassurance, not a needed number.)
    fireEvent.change(slider(), { target: { value: "60" } });
    const after = reverseCard();
    expect(within(after).getByText("possible")).toBeInTheDocument();
    expect(within(after).queryByText("neededAvg")).toBeNull();
    expect(within(after).queryByText("impossible")).toBeNull();
  });

  it("status is 'no-remaining' when there are zero remaining countable credits", () => {
    // Only completed work + a PLANNED seminar (which is NOT countable, so it
    // creates no remaining credits). remainingCredits === 0 → "no-remaining".
    h.courses = [
      uc({ code: "0001", courseId: "cA", status: "COMPLETED", grade: 80, credits: 20 }),
      uc({ code: "0003", courseId: "cD", status: "PLANNED", credits: 12, courseType: "SEMINAR" }),
    ];
    render(<GradeCalculatorContent />);

    const card = reverseCard();
    expect(within(card).getByText("noCourses")).toBeInTheDocument();
    expect(within(card).queryByText("neededAvg")).toBeNull();
    expect(within(card).queryByText("impossible")).toBeNull();
  });
});
