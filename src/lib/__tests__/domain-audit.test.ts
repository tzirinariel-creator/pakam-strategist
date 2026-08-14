// =========================================================================
// DOMAIN AUDIT — adversarial tests for the engines that produce the numbers
// students plan a degree from. Every threshold asserted here is traceable to
// docs/pakam-domain-rules-2026.md (section noted per block). Table-driven where
// the same rule has many shapes.
//
// Written defect-first: each `defect` block below failed before the fix in the
// same change, and pins the scenario in the plain language of the report.
// =========================================================================

import { describe, it, expect } from "vitest";
import { calculateCredits } from "@/lib/credit-calculator";
import { calculateGrades } from "@/lib/grade-calculator";
import { prereqAdvisoryFor } from "@/lib/ai/context-builder";
import { ruleEnglishLevel, ruleEnglishRequirement } from "@/lib/regulations/rules/english";
import { ruleElectiveCredits } from "@/lib/regulations/rules/credits";
import { runRegulationEngine } from "@/lib/regulations/rule-engine";
import { GRADE_WEIGHTS, CREDIT_REQUIREMENTS } from "@/lib/constants";
import type { UserCourseWithCourse } from "@/types/degree";
import type { RuleContext } from "@/types/regulation";
import { getActiveProgram } from "@/lib/programs/registry";

// -------------------------------------------------------------------
// Builders
// -------------------------------------------------------------------

let seq = 0;
interface Over {
  status?: string;
  grade?: number | null;
  credits?: number;
  courseType?: string;
  discipline?: string;
  canCountAs?: string[];
  isMandatory?: boolean;
  submissionType?: string | null;
  submissionGrade?: number | null;
  attemptNumber?: number;
  isBinary?: boolean;
  courseId?: string;
  nameHe?: string;
  plannedYear?: number;
  disciplineOverride?: string | null;
  weeklyHours?: number;
}

function uc(over: Over = {}): UserCourseWithCourse {
  seq += 1;
  const courseId = over.courseId ?? `da-${seq}`;
  return {
    id: `uda-${seq}`,
    courseId,
    status: over.status ?? "COMPLETED",
    grade: over.grade ?? null,
    submissionType: over.submissionType ?? null,
    submissionGrade: over.submissionGrade ?? null,
    attemptNumber: over.attemptNumber ?? 1,
    isBinary: over.isBinary ?? false,
    disciplineOverride: over.disciplineOverride ?? null,
    plannedYear: over.plannedYear ?? 1,
    course: {
      id: courseId,
      code: `C-${seq}`,
      nameHe: over.nameHe ?? `קורס ${seq}`,
      nameEn: `Course ${seq}`,
      courseType: over.courseType ?? "MANDATORY",
      credits: over.credits ?? 3,
      discipline: over.discipline ?? "ECONOMICS",
      canCountAs: over.canCountAs ?? [],
      isMandatory: over.isMandatory ?? false,
      weeklyHours: over.weeklyHours ?? 3,
    },
  } as unknown as UserCourseWithCourse;
}

/** Minimal RuleContext for rules that only read a few fields. */
function ctxOf(over: Partial<RuleContext> = {}): RuleContext {
  const courses = over.userCourses ?? [];
  const calc = calculateCredits(courses, over.focusArea ?? null, 0);
  return {
    userCourses: courses,
    focusArea: null,
    currentYear: 2026,
    creditBreakdown: calc.breakdown,
    gradeBreakdown: calculateGrades(courses),
    seminars: [],
    programDefinition: getActiveProgram(),
    ...over,
  } as RuleContext;
}

// =========================================================================
// 1. CREDIT ENGINE — "משלב עשייה" practice courses (domain rules §1)
// =========================================================================
// §1: "Practice/'משלב עשייה' ELECTIVES: up to 8 credits, but each such course
// grants at most 4 credits regardless of actual hours." The 150 has exactly
// three buckets (103 mandatory + 12 seminars + 35 electives) — there is no
// fourth — so practice credits are elective credits.

describe("credit engine — practice (משלב עשייה) courses", () => {
  const cases: {
    name: string;
    courses: UserCourseWithCourse[];
    total: number;
    practice: number;
    elective: number;
  }[] = [
    {
      name: "one 4-credit practice course counts as 4 elective credits",
      courses: [uc({ courseType: "PRACTICE", credits: 4 })],
      total: 4,
      practice: 4,
      elective: 4,
    },
    {
      name: "a 6-credit practice course is capped at 4 per course (§1)",
      courses: [uc({ courseType: "PRACTICE", credits: 6 })],
      total: 4,
      practice: 4,
      elective: 4,
    },
    {
      name: "three 4-credit practice courses are capped at 8 in total (§1)",
      courses: [
        uc({ courseType: "PRACTICE", credits: 4 }),
        uc({ courseType: "PRACTICE", credits: 4 }),
        uc({ courseType: "PRACTICE", credits: 4 }),
      ],
      total: 8,
      practice: 8,
      elective: 8,
    },
    {
      name: "practice stacks with ordinary electives",
      courses: [
        uc({ courseType: "PRACTICE", credits: 4 }),
        uc({ courseType: "ELECTIVE", credits: 5 }),
      ],
      total: 9,
      practice: 4,
      elective: 9,
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const b = calculateCredits(c.courses, null).breakdown;
      expect(b.total).toBe(c.total);
      expect(b.practice).toBe(c.practice);
      expect(b.elective).toBe(c.elective);
    });
  }

  it("defect: practice credits used to vanish from every course-type bucket", () => {
    // A student who takes the full 8-credit practice track and 27 ordinary
    // electives has met the 35-credit elective requirement. Before the fix the
    // practice credits landed in NO bucket, so PKM-020 said "27/35, need 8 more"
    // and the student would take two courses they had already covered.
    const courses = [
      uc({ courseType: "PRACTICE", credits: 4 }),
      uc({ courseType: "PRACTICE", credits: 4 }),
      uc({ courseType: "ELECTIVE", credits: 27 }),
    ];
    const b = calculateCredits(courses, null).breakdown;
    expect(b.elective).toBe(CREDIT_REQUIREMENTS.ELECTIVE_TOTAL); // 35
    const res = ruleElectiveCredits(ctxOf({ userCourses: courses }));
    expect(res.passed).toBe(true);
  });

  it("course-type buckets reconcile to the countable total", () => {
    // mandatory + elective + seminar must equal `total` — practice and English
    // are sub-kinds of elective, not separate buckets.
    const courses = [
      uc({ courseType: "MANDATORY", credits: 4 }),
      uc({ courseType: "PRACTICE", credits: 4 }),
      uc({ courseType: "ELECTIVE", credits: 3 }),
      uc({ courseType: "SEMINAR", credits: 4, isMandatory: false }),
      uc({ courseType: "ENGLISH", credits: 2, grade: 85 }),
      uc({ courseType: "LAW_FOUNDATION", credits: 4 }),
    ];
    const b = calculateCredits(courses, null).breakdown;
    expect(b.mandatory + b.elective + b.seminar).toBe(b.total);
  });
});

// =========================================================================
// 2. GRADE ENGINE — the 78/18/4 graduation score (domain rules §3)
// =========================================================================

describe("grade engine — seminar paper resubmission", () => {
  const referat = () =>
    uc({
      courseId: "sem-ref",
      courseType: "SEMINAR",
      submissionType: "REFERAT",
      submissionGrade: 100,
    });

  it("defect: a resubmitted seminar paper averaged BOTH grades into the 18%", () => {
    // A student fails/underperforms a seminar paper at 60 and resubmits for 90.
    // TAU counts the determining (last) submission. The app averaged 60 and 90
    // to 75 — dragging the 18% seminar component, and the final degree score,
    // 2.7 points below the truth.
    const courses = [
      uc({ grade: 90, credits: 4 }),
      uc({
        courseId: "sem-1",
        courseType: "SEMINAR",
        submissionType: "PAPER",
        submissionGrade: 60,
        attemptNumber: 1,
      }),
      uc({
        courseId: "sem-1",
        courseType: "SEMINAR",
        submissionType: "PAPER",
        submissionGrade: 90,
        attemptNumber: 2,
      }),
      referat(),
    ];
    const r = calculateGrades(courses);
    expect(r.seminarPaperAverage).toBe(90);
    expect(r.weightedScore).toBeCloseTo(
      90 * GRADE_WEIGHTS.COURSES + 90 * GRADE_WEIGHTS.SEMINAR_PAPERS + 100 * GRADE_WEIGHTS.REFERAT,
      6,
    );
  });

  it("distinct seminars still average together (the 18% is over 3 papers)", () => {
    const r = calculateGrades([
      uc({ courseId: "s1", courseType: "SEMINAR", submissionType: "PAPER", submissionGrade: 80 }),
      uc({ courseId: "s2", courseType: "SEMINAR", submissionType: "PAPER", submissionGrade: 90 }),
      uc({ courseId: "s3", courseType: "SEMINAR", submissionType: "PAPER", submissionGrade: 100 }),
    ]);
    expect(r.seminarPaperAverage).toBe(90);
  });

  it("a reservist's 'higher grade counts' right does NOT reach seminar papers", () => {
    // Domain §6 Layer B grants B/C/G "2 of 3 EXAM dates, the higher counts".
    // It says nothing about seminar papers, so papers keep the last-attempt
    // rule even for a Group-C student. Never widen a sourced right by analogy.
    const courses = [
      uc({
        courseId: "sem-1",
        courseType: "SEMINAR",
        submissionType: "PAPER",
        submissionGrade: 95,
        attemptNumber: 1,
      }),
      uc({
        courseId: "sem-1",
        courseType: "SEMINAR",
        submissionType: "PAPER",
        submissionGrade: 70,
        attemptNumber: 2,
      }),
    ];
    expect(calculateGrades(courses, { preferHigherGrade: true }).seminarPaperAverage).toBe(70);
  });
});

describe("grade engine — empty and degenerate categories", () => {
  const table: {
    name: string;
    courses: UserCourseWithCourse[];
    courseAverage: number | null;
    seminarPaperAverage: number | null;
    referatGrade: number | null;
    weightedScore: number | null;
  }[] = [
    {
      name: "a brand-new student with no grades gets nulls, never a 0",
      courses: [],
      courseAverage: null,
      seminarPaperAverage: null,
      referatGrade: null,
      weightedScore: null,
    },
    {
      name: "only binary (pass/fail) courses → no course average, no final score",
      courses: [
        uc({ grade: 80, credits: 4, isBinary: true }),
        uc({ grade: 90, credits: 4, isBinary: true }),
      ],
      courseAverage: null,
      seminarPaperAverage: null,
      referatGrade: null,
      weightedScore: null,
    },
    {
      name: "a seminar with no submission grade contributes nothing",
      courses: [
        uc({ grade: 80, credits: 4 }),
        uc({ courseType: "SEMINAR", submissionType: "PAPER", submissionGrade: null }),
      ],
      courseAverage: 80,
      seminarPaperAverage: null,
      referatGrade: null,
      weightedScore: null,
    },
    {
      name: "papers but no referat → the 4% component is missing, so no final score",
      courses: [
        uc({ grade: 80, credits: 4 }),
        uc({ courseId: "s1", courseType: "SEMINAR", submissionType: "PAPER", submissionGrade: 90 }),
      ],
      courseAverage: 80,
      seminarPaperAverage: 90,
      referatGrade: null,
      weightedScore: null,
    },
    {
      name: "English grades never enter the degree average (iron rule)",
      courses: [
        uc({ grade: 80, credits: 4 }),
        uc({ grade: 100, credits: 4, courseType: "ENGLISH" }),
      ],
      courseAverage: 80,
      seminarPaperAverage: null,
      referatGrade: null,
      weightedScore: null,
    },
    {
      name: "a 0-credit graded course cannot skew the credit-weighted average",
      courses: [uc({ grade: 100, credits: 0 }), uc({ grade: 60, credits: 4 })],
      courseAverage: 60,
      seminarPaperAverage: null,
      referatGrade: null,
      weightedScore: null,
    },
    {
      name: "ONLY 0-credit graded courses → no average rather than a divide-by-zero",
      courses: [uc({ grade: 100, credits: 0 })],
      courseAverage: null,
      seminarPaperAverage: null,
      referatGrade: null,
      weightedScore: null,
    },
  ];

  for (const t of table) {
    it(t.name, () => {
      const r = calculateGrades(t.courses);
      expect(r.courseAverage).toBe(t.courseAverage);
      expect(r.seminarPaperAverage).toBe(t.seminarPaperAverage);
      expect(r.referatGrade).toBe(t.referatGrade);
      expect(r.weightedScore).toBe(t.weightedScore);
    });
  }

  it("the three weights are exactly the sourced 78 / 18 / 4 (§3)", () => {
    expect(GRADE_WEIGHTS.COURSES).toBe(0.78);
    expect(GRADE_WEIGHTS.SEMINAR_PAPERS).toBe(0.18);
    expect(GRADE_WEIGHTS.REFERAT).toBe(0.04);
    expect(
      GRADE_WEIGHTS.COURSES + GRADE_WEIGHTS.SEMINAR_PAPERS + GRADE_WEIGHTS.REFERAT,
    ).toBeCloseTo(1, 10);
  });
});

// =========================================================================
// 3. ENGLISH — level ladder, the 70 humanities bar, declared-level precedence
// (domain rules §5)
// =========================================================================

describe("english — level courses already passed are credited (PKM-021)", () => {
  const levelCourse = (nameHe: string, grade: number | null, over: Over = {}) =>
    uc({ nameHe, grade, courseType: "ENGLISH", credits: 4, ...over });

  it("defect: a student who PASSED מתקדמים ב׳ was still told to take one", () => {
    // Ariel's own case (#6/#18): placement ADVANCED_B implies 1 level course.
    // He holds a passing grade in אנגלית מתקדמים ב׳ and the rule still said
    // "נדרשים עוד 1 קורסי רמה" — advice to do the thing he had already done.
    const courses = [levelCourse("אנגלית מתקדמים ב׳", 85)];
    const r = ruleEnglishLevel(ctxOf({ userCourses: courses, englishLevel: "ADVANCED_B" }));
    expect(r.details?.levelCourses).toBe(0);
    expect(r.details?.passedLevelCourses).toBe(1);
    expect(r.details?.levelTrackDone).toBe(true);
    // ...and it must NOT claim פטור — that is the מזכירות's call, not ours.
    expect(r.messageHe).not.toContain("פטור מקורסי רמה");
    expect(r.messageHe).toContain("המזכירות");
  });

  it("a level course FAILED against the humanities 70 bar still counts as outstanding", () => {
    // §5: "Passing grade in an English course in humanities = 70" (not 60).
    const courses = [levelCourse("אנגלית מתקדמים ב׳", 65)];
    const r = ruleEnglishLevel(ctxOf({ userCourses: courses, englishLevel: "ADVANCED_B" }));
    expect(r.details?.levelCourses).toBe(1);
    expect(r.details?.levelTrackDone).toBe(false);
  });

  it("an English CONTENT course is not a LEVEL course and never reduces the ladder", () => {
    const courses = [levelCourse("אנגלית לכלכלנים", 90)];
    const r = ruleEnglishLevel(ctxOf({ userCourses: courses, englishLevel: "ADVANCED_A" }));
    expect(r.details?.levelCourses).toBe(2);
  });

  it("stays neutral with neither a score nor a declared level", () => {
    const r = ruleEnglishLevel(ctxOf({}));
    expect(r.passed).toBe(true);
    expect(r.severity).toBe("INFO");
    expect(r.details?.amirantScore).toBeNull();
  });

  it("the declared level beats the Amiram score (iron rule, #23)", () => {
    // Score 100 alone → ADVANCED_A (2 courses). A sheet that says פטור wins.
    const r = ruleEnglishLevel(ctxOf({ amirantScore: 100, englishLevel: "EXEMPT" }));
    expect(r.details?.level).toBe("EXEMPT");
    expect(r.details?.isExempt).toBe(true);
  });
});

describe("english — the 2 content courses (PKM-012, §5)", () => {
  const eng = (grade: number | null, status = "COMPLETED") =>
    uc({ courseType: "ENGLISH", credits: 2, grade, status, nameHe: "אנגלית לכלכלנים" });

  const table: { name: string; courses: UserCourseWithCourse[]; passed: boolean; count: number }[] = [
    { name: "two passed content courses meet the requirement", courses: [eng(75), eng(90)], passed: true, count: 2 },
    {
      name: "a content course below the humanities 70 bar does not count",
      courses: [eng(75), eng(65)],
      passed: false,
      count: 1,
    },
    {
      name: "planned / in-progress content courses count as on-track",
      courses: [eng(null, "PLANNED"), eng(null, "IN_PROGRESS")],
      passed: true,
      count: 2,
    },
    {
      name: "one 4-credit course is not two courses",
      courses: [uc({ courseType: "ENGLISH", credits: 4, grade: 90 })],
      passed: false,
      count: 1,
    },
  ];

  for (const t of table) {
    it(t.name, () => {
      const r = ruleEnglishRequirement(ctxOf({ userCourses: t.courses }));
      expect(r.details?.currentCourses).toBe(t.count);
      expect(r.passed).toBe(t.passed);
      // Never an ERROR: the 2 content courses are a graduation progress target.
      expect(r.severity).toBe("INFO");
    });
  }

  it("a failed English course leaks no credits into any bucket", () => {
    const b = calculateCredits([eng(65)], null).breakdown;
    expect(b.total).toBe(0);
    expect(b.earned).toBe(0);
    expect(b.elective).toBe(0);
    expect(b.englishCourseCount).toBe(0);
  });
});

// =========================================================================
// 4. PREREQUISITES — advisory only for PPE (domain rules §9b, ידיעון note 19)
// =========================================================================

describe("prerequisites are advisory, never a gate (§9b)", () => {
  it("defect: the AI advisor hid every course with an unmet prerequisite", () => {
    // §9b quotes the ידיעון: "תלמידי פכ״ם אינם מחוייבים בדרישות הקדם", and calls a
    // hard prereq gate a BUG for this program. The King's course list was
    // `.filter(prereqs.every(completed))`, so a first-year asking "what should I
    // take next semester?" was never shown מיקרו א׳ / מאקרו / אקונומטריקה —
    // the whole economics mandatory chain — because they hadn't finished
    // math-for-PPE yet. prereqAdvisoryFor returns a HINT, never a verdict.
    const completed = new Set<string>(["0651-1007"]);
    expect(prereqAdvisoryFor(["0651-1007"], completed)).toBeUndefined();
    expect(prereqAdvisoryFor(["1011-2103"], completed)).toEqual(["1011-2103"]);
    expect(prereqAdvisoryFor(["0651-1007", "1011-2103"], completed)).toEqual(["1011-2103"]);
  });

  it("no prerequisites, or none recorded, produce no hint at all", () => {
    const completed = new Set<string>();
    expect(prereqAdvisoryFor([], completed)).toBeUndefined();
    expect(prereqAdvisoryFor(null, completed)).toBeUndefined();
    expect(prereqAdvisoryFor(undefined, completed)).toBeUndefined();
  });
});

// =========================================================================
// 5. FULL ENGINE — a legitimate student must never see a false violation
// =========================================================================

describe("regulation engine — no false alarms for legitimate profiles", () => {
  const profiles: { name: string; courses: UserCourseWithCourse[] }[] = [
    { name: "a brand-new student with nothing entered", courses: [] },
    {
      name: "a first-year mid-semester, everything in progress",
      courses: [
        uc({ status: "IN_PROGRESS", credits: 4, isMandatory: true, courseType: "MANDATORY" }),
        uc({ status: "IN_PROGRESS", credits: 4, courseType: "ELECTIVE" }),
      ],
    },
    {
      name: "a reservist with binary conversions and a credit exemption",
      courses: [
        uc({ grade: 90, credits: 4, isMandatory: true, courseType: "MANDATORY" }),
        uc({ grade: null, credits: 4, isBinary: true, courseType: "ELECTIVE" }),
      ],
    },
    {
      name: "a student on the practice (משלב עשייה) track",
      courses: [
        uc({ courseType: "PRACTICE", credits: 4, discipline: "GENERAL" }),
        uc({ courseType: "PRACTICE", credits: 4, discipline: "GENERAL" }),
      ],
    },
    {
      name: "a student who failed one ELECTIVE twice (never degree-ending)",
      courses: [
        uc({ courseId: "e1", status: "FAILED", courseType: "ELECTIVE", attemptNumber: 1 }),
        uc({ courseId: "e1", status: "FAILED", courseType: "ELECTIVE", attemptNumber: 2 }),
      ],
    },
    {
      name: "a student with an EXEMPT (prior-learning) row",
      courses: [uc({ status: "EXEMPT", credits: 4, courseType: "ELECTIVE" })],
    },
  ];

  for (const p of profiles) {
    it(`${p.name} → zero ERROR-severity violations`, () => {
      const summary = runRegulationEngine(p.courses, null, 0, undefined, {
        academicYear: 1,
        currentSemester: "FALL",
      });
      const errors = summary.results.filter((r) => !r.passed && r.severity === "ERROR");
      expect(errors.map((e) => `${e.ruleId}: ${e.messageEn}`)).toEqual([]);
      expect(summary.compliant).toBe(true);
    });
  }

  it("a MANDATORY course failed twice IS a blocking violation (§4)", () => {
    // The one place a red block is correct: "a second failure in the same
    // course = cannot continue in PPE".
    const courses = [
      uc({ courseId: "m1", status: "FAILED", isMandatory: true, attemptNumber: 1 }),
      uc({ courseId: "m1", status: "FAILED", isMandatory: true, attemptNumber: 2 }),
    ];
    const summary = runRegulationEngine(courses, null, 0);
    const failTwice = summary.results.find((r) => r.ruleId === "PKM-023");
    expect(failTwice?.passed).toBe(false);
    expect(failTwice?.severity).toBe("ERROR");
  });

  it("a failed-then-passed course is not counted as a failure (PKM-014)", () => {
    const courses = [
      uc({ courseId: "r1", status: "FAILED", attemptNumber: 1 }),
      uc({ courseId: "r1", status: "COMPLETED", grade: 80, attemptNumber: 2 }),
    ];
    const summary = runRegulationEngine(courses, null, 0);
    const rate = summary.results.find((r) => r.ruleId === "PKM-014");
    expect(rate?.details?.failedCount).toBe(0);
    expect(rate?.passed).toBe(true);
  });

  it("a grade-improvement retake counts ONCE, at the determining attempt", () => {
    // Two COMPLETED rows for one course: credits must not double, and the
    // average must use the last sitting only (§4 "the last grade counts").
    const courses = [
      uc({ courseId: "g1", grade: 60, credits: 4, attemptNumber: 1 }),
      uc({ courseId: "g1", grade: 90, credits: 4, attemptNumber: 2 }),
    ];
    expect(calculateCredits(courses, null).breakdown.total).toBe(4);
    expect(calculateGrades(courses).courseAverage).toBe(90);
    // A B/C/G reservist keeps the HIGHER sitting instead (§6 Layer B).
    const reversed = [
      uc({ courseId: "g2", grade: 90, credits: 4, attemptNumber: 1 }),
      uc({ courseId: "g2", grade: 60, credits: 4, attemptNumber: 2 }),
    ];
    expect(calculateGrades(reversed).courseAverage).toBe(60);
    expect(calculateGrades(reversed, { preferHigherGrade: true }).courseAverage).toBe(90);
  });
});
