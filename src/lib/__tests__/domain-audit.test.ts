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
import { calculateGrades, roundScore } from "@/lib/grade-calculator";
import { prereqAdvisoryFor } from "@/lib/ai/context-builder";
import {
  ruleEnglishLevel,
  ruleEnglishRequirement,
  ruleEnglishExemptionDeadline,
} from "@/lib/regulations/rules/english";
import { ruleElectiveCredits, ruleTotalCredits } from "@/lib/regulations/rules/credits";
import { ruleSeminarMandatoryGate } from "@/lib/regulations/rules/seminars";
import { runRegulationEngine } from "@/lib/regulations/rule-engine";
import { degreeProgress, degreeCompletionPct } from "@/lib/degree-progress";
import { degreePct } from "@/lib/degree-delta";
import {
  deriveGroupFromDays,
  computeCreditExemption,
  binaryDegreeCap,
  binaryCapRemaining,
  deriveExemptionEntitlement,
  splitByDegreeStart,
  prefersHigherGrade,
  honorsBinaryStatus,
  type MiluimGroupKey,
} from "@/lib/miluim";
import { GRADE_WEIGHTS, CREDIT_REQUIREMENTS, MILUIM_CONFIG } from "@/lib/constants";
import type { UserCourseWithCourse } from "@/types/degree";
import type { RuleContext } from "@/types/regulation";
import { getActiveProgram } from "@/lib/programs/registry";
import { nearestUpcomingExam, daysUntilLabel } from "@/lib/days-until";
import { getBiddingPhase } from "@/lib/bidding-calendar";
import { civilDaysBetween, storedDateKeyMs } from "@/lib/civil-day";

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
function ctxOf(over: Partial<RuleContext> & { miluimExemption?: number } = {}): RuleContext {
  const courses = over.userCourses ?? [];
  const calc = calculateCredits(courses, over.focusArea ?? null, over.miluimExemption ?? 0);
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

// =========================================================================
// 6. CREDIT ENGINE — the shapes a real transcript actually contains
// =========================================================================
// One table per question the auditor asked: can a course land in two buckets,
// what happens to a FAILED course, which attempt of a retake counts, does a
// binary (pass/fail) course keep its credits, does disciplineOverride move a
// course, how does an off-catalog course behave, how does the miluim exemption
// interact, and what does a 0-credit course do.

describe("credit engine — buckets, statuses and overrides (§1, §4, §6)", () => {
  const table: {
    name: string;
    courses: UserCourseWithCourse[];
    exemption?: number;
    expect: Partial<{
      total: number;
      earned: number;
      planned: number;
      mandatory: number;
      elective: number;
      seminar: number;
      effectiveTotal: number;
    }>;
  }[] = [
    {
      // A course lands in EXACTLY ONE course-type bucket. The discipline map is
      // a second, independent axis — not a second bucket — so the three
      // course-type buckets always sum back to `total`.
      name: "no course is counted in two course-type buckets",
      courses: [
        uc({ courseType: "MANDATORY", credits: 4, isMandatory: true }),
        uc({ courseType: "ELECTIVE", credits: 3 }),
        uc({ courseType: "SEMINAR", credits: 4, isMandatory: false }),
      ],
      expect: { total: 11, mandatory: 4, elective: 3, seminar: 4 },
    },
    {
      // A MANDATORY seminar (the PPE seminar) belongs to the 103 mandatory
      // credits, NOT the 12-credit seminar bucket — still exactly one bucket.
      name: "the mandatory PPE seminar counts as mandatory, not as a seminar credit",
      courses: [uc({ courseType: "SEMINAR", credits: 4, isMandatory: true })],
      expect: { total: 4, mandatory: 4, seminar: 0 },
    },
    {
      name: "a FAILED course contributes nothing to any bucket or total (§4)",
      courses: [
        uc({ status: "FAILED", credits: 4, courseType: "ELECTIVE", grade: 45 }),
        uc({ status: "COMPLETED", credits: 3, courseType: "ELECTIVE", grade: 80 }),
      ],
      expect: { total: 3, earned: 3, elective: 3 },
    },
    {
      // §4: "the last grade counts". Two COMPLETED rows for one course are one
      // course's worth of credits, taken from the determining (last) sitting.
      name: "a retake counts its credits ONCE",
      courses: [
        uc({ courseId: "rt", grade: 60, credits: 4, attemptNumber: 1 }),
        uc({ courseId: "rt", grade: 90, credits: 4, attemptNumber: 2 }),
      ],
      expect: { total: 4, earned: 4 },
    },
    {
      // A failed first attempt followed by a pass is ONE earned course — the
      // failed row must not subtract from or duplicate the credits.
      name: "failed-then-passed earns the credits exactly once",
      courses: [
        uc({ courseId: "fp", status: "FAILED", credits: 4, attemptNumber: 1 }),
        uc({ courseId: "fp", status: "COMPLETED", grade: 75, credits: 4, attemptNumber: 2 }),
      ],
      expect: { total: 4, earned: 4 },
    },
    {
      // Binary (pass/fail) conversion removes the GRADE from the average — it
      // never removes the CREDITS from the degree (domain §6 Layer B).
      name: "a binary / pass-fail course keeps its credits",
      courses: [uc({ isBinary: true, grade: null, credits: 4, courseType: "ELECTIVE" })],
      expect: { total: 4, earned: 4, elective: 4 },
    },
    {
      name: "IN_PROGRESS and PLANNED are on-track, not yet earned",
      courses: [
        uc({ status: "IN_PROGRESS", credits: 4, courseType: "ELECTIVE" }),
        uc({ status: "PLANNED", credits: 3, courseType: "ELECTIVE" }),
        uc({ status: "COMPLETED", grade: 80, credits: 5, courseType: "ELECTIVE" }),
      ],
      expect: { total: 12, earned: 5, planned: 7 },
    },
    {
      // EXEMPT (prior learning, §4) satisfies the requirement, so it is EARNED.
      name: "an EXEMPT (prior-learning) course is earned, not planned",
      courses: [uc({ status: "EXEMPT", grade: null, credits: 4, courseType: "ELECTIVE" })],
      expect: { total: 4, earned: 4, planned: 0 },
    },
    {
      // An off-catalog course the student typed in is stored as a GENERAL
      // ELECTIVE (server: courseType ELECTIVE, discipline GENERAL) — it earns
      // real credit toward the 150 and lands in the elective bucket.
      name: "an off-catalog (student-declared) course earns elective credit",
      courses: [uc({ courseType: "ELECTIVE", discipline: "GENERAL", credits: 3, grade: 88 })],
      expect: { total: 3, earned: 3, elective: 3 },
    },
    {
      name: "a 0-credit course adds nothing but breaks nothing",
      courses: [
        uc({ credits: 0, grade: 90, courseType: "ELECTIVE" }),
        uc({ credits: 4, grade: 90, courseType: "ELECTIVE" }),
      ],
      expect: { total: 4, earned: 4, elective: 4 },
    },
    {
      // The exemption lifts the 150-credit TARGET progress; it is not earned
      // coursework and must never appear inside `earned` (this exact conflation
      // once had the app narrate an exemption as credit the student had earned).
      name: "the miluim exemption lifts effectiveTotal, never earned",
      courses: [uc({ credits: 10, grade: 90, courseType: "ELECTIVE" })],
      exemption: 8,
      expect: { total: 10, earned: 10, effectiveTotal: 18 },
    },
  ];

  for (const t of table) {
    it(t.name, () => {
      const b = calculateCredits(t.courses, null, t.exemption ?? 0).breakdown;
      for (const [key, value] of Object.entries(t.expect)) {
        expect(b[key as keyof typeof b], key).toBe(value);
      }
      // Invariant for every row: the three course-type buckets reconcile to the
      // countable total (practice and English are sub-kinds of elective).
      expect(b.mandatory + b.elective + b.seminar).toBe(b.total);
      // ...and earned + planned is the total, with the exemption strictly outside.
      expect(b.earned + b.planned).toBe(b.total);
      expect(b.effectiveTotal).toBe(b.total + b.miluimExemption);
    });
  }

  it("disciplineOverride moves a course to the declared discipline (§1)", () => {
    // §1: a course tied to one department may count toward another discipline
    // with advisor approval — so the student's declaration wins over the
    // catalog's tag, for the discipline totals AND the focus area.
    const courses = [
      uc({ credits: 6, discipline: "ECONOMICS", disciplineOverride: "PHILOSOPHY", grade: 90 }),
    ];
    const calc = calculateCredits(courses, "PHILOSOPHY" as never, 0);
    expect(calc.breakdown.byDiscipline.PHILOSOPHY).toBe(6);
    expect(calc.breakdown.byDiscipline.ECONOMICS).toBe(0);
    expect(calc.breakdown.focusArea).toBe(6);
  });

  it("a FAILED course cannot be resurrected by a disciplineOverride", () => {
    const courses = [
      uc({ status: "FAILED", credits: 6, disciplineOverride: "PHILOSOPHY" }),
    ];
    const calc = calculateCredits(courses, "PHILOSOPHY" as never, 0);
    expect(calc.breakdown.total).toBe(0);
    expect(calc.breakdown.byDiscipline.PHILOSOPHY).toBe(0);
  });
});

// =========================================================================
// 7. ONE DEFINITION OF DEGREE PROGRESS
// =========================================================================
// The defect the owner has caught three times: "104/150" on one screen and
// "78/150" on another, both labelled degree progress. `earned + exemption` is
// what the student HOLDS; `+ planned` is a projection. One derivation module,
// and the bare label always belongs to the held figure.

describe("degree progress — one definition, one label", () => {
  const planned150 = {
    earned: 0,
    planned: 150,
    miluimExemption: 0,
    effectiveTotal: 150,
  };

  it("defect: a fully-planned, zero-completed degree read as 100% / 150 of 150", () => {
    const p = degreeProgress(planned150);
    expect(p.secured).toBe(0);
    expect(p.pct).toBe(0);
    // The projection survives — under its own name, never as "degree progress".
    expect(p.projected).toBe(150);
    expect(p.projectedPct).toBe(100);
    expect(p.remaining).toBe(150);
  });

  it("the save-banner % and the dashboard hero % are the same arithmetic", () => {
    const b = { earned: 78, planned: 26, miluimExemption: 0, effectiveTotal: 104 };
    // <DegreeStatus> renders round((earned + exemption) / target * 100).
    const heroPct = Math.round(((b.earned + b.miluimExemption) / CREDIT_REQUIREMENTS.TOTAL) * 100);
    expect(degreeCompletionPct(b)).toBe(heroPct);
    expect(degreePct(b)).toBe(heroPct);
  });

  it("PKM-001 judges on credits HELD and labels the planned projection", () => {
    // A student who planned all 150 but finished nothing was told the total
    // credit requirement "מתקיימת". Planned credits graduate nobody.
    const courses = [uc({ status: "PLANNED", credits: 150, courseType: "ELECTIVE" })];
    const r = ruleTotalCredits(ctxOf({ userCourses: courses }));
    expect(r.passed).toBe(false);
    expect(r.details?.current).toBe(0);
    expect(r.details?.projected).toBe(150);
    expect(r.severity).toBe("INFO"); // progress, never a red violation
    // The projection is present but explicitly labelled as including planned.
    expect(r.messageHe).toContain("כולל הקורסים המתוכננים");
  });

  it("PKM-001 counts the miluim exemption as credits held (reservist parity)", () => {
    const courses = [uc({ credits: 142, grade: 90, courseType: "ELECTIVE" })];
    const r = ruleTotalCredits(ctxOf({ userCourses: courses, miluimExemption: 8 }));
    expect(r.details?.current).toBe(150);
    expect(r.passed).toBe(true);
  });

  it("PKM-001 and the dashboard hero never disagree, for any mix", () => {
    const mixes: UserCourseWithCourse[][] = [
      [],
      [uc({ credits: 20, grade: 80, courseType: "ELECTIVE" })],
      [
        uc({ credits: 20, grade: 80, courseType: "ELECTIVE" }),
        uc({ status: "PLANNED", credits: 30, courseType: "ELECTIVE" }),
      ],
      [uc({ status: "IN_PROGRESS", credits: 12, courseType: "ELECTIVE" })],
    ];
    for (const courses of mixes) {
      const calc = calculateCredits(courses, null, 4);
      const r = ruleTotalCredits(ctxOf({ userCourses: courses, miluimExemption: 4 }));
      expect(r.details?.current).toBe(calc.breakdown.earned + calc.breakdown.miluimExemption);
      expect(degreeCompletionPct(calc.breakdown)).toBe(
        Math.round(((calc.breakdown.earned + 4) / CREDIT_REQUIREMENTS.TOTAL) * 100),
      );
    }
  });
});

// =========================================================================
// 8. GRADE ENGINE — weighting, emptiness and rounding (domain rules §3)
// =========================================================================

describe("grade engine — weighting, emptiness, rounding", () => {
  it("an EMPTY category does NOT redistribute its weight — the score stays null", () => {
    // §3 fixes the weights at 78/18/4. If the referat is missing there is no
    // honest final score, and silently re-normalising the other two to 100%
    // would invent a number. Null is the correct answer, everywhere.
    const noReferat = calculateGrades([
      uc({ grade: 100, credits: 4 }),
      uc({ courseId: "s1", courseType: "SEMINAR", submissionType: "PAPER", submissionGrade: 100 }),
    ]);
    expect(noReferat.weightedScore).toBeNull();
    expect(noReferat.courseAverage).toBe(100);
  });

  it("the score is the exact 78/18/4 blend when all three exist", () => {
    const r = calculateGrades([
      uc({ grade: 80, credits: 4 }),
      uc({ courseId: "s1", courseType: "SEMINAR", submissionType: "PAPER", submissionGrade: 90 }),
      uc({ courseId: "s2", courseType: "SEMINAR", submissionType: "REFERAT", submissionGrade: 100 }),
    ]);
    expect(r.weightedScore).toBeCloseTo(80 * 0.78 + 90 * 0.18 + 100 * 0.04, 10);
  });

  it("credit weighting is real: a 6-credit 90 outweighs a 2-credit 60", () => {
    const r = calculateGrades([
      uc({ grade: 90, credits: 6 }),
      uc({ grade: 60, credits: 2 }),
    ]);
    expect(r.courseAverage).toBeCloseTo((90 * 6 + 60 * 2) / 8, 10);
    expect(r.completedCredits).toBe(8);
  });

  it("rounding is 2 decimals and never fabricates precision", () => {
    expect(roundScore(87.6543)).toBe(87.65);
    expect(roundScore(87.005)).toBe(87.01);
    expect(roundScore(null)).toBeNull();
    expect(roundScore(undefined)).toBeNull();
    expect(roundScore(NaN)).toBeNull();
  });

  it("ENGLISH is out of the average even when it is the ONLY graded course", () => {
    // Iron rule (owner-verified): English grades never enter the degree average.
    const r = calculateGrades([uc({ grade: 100, credits: 4, courseType: "ENGLISH" })]);
    expect(r.courseAverage).toBeNull();
    expect(r.totalGradedCourses).toBe(0);
  });

  it("a binary course is out of the average but its credits are in the degree", () => {
    const courses = [
      uc({ grade: 90, credits: 4 }),
      uc({ grade: 50, credits: 4, isBinary: true }),
    ];
    expect(calculateGrades(courses).courseAverage).toBe(90);
    expect(calculateCredits(courses, null).breakdown.total).toBe(8);
  });
});

// =========================================================================
// 9. ENGLISH — the 2-credit floor per content course (domain rules §5)
// =========================================================================

describe("english content courses must each be ≥ 2 credits (§5)", () => {
  it("defect: two 1-credit English courses reported the requirement as met", () => {
    // §5 (double-verified): 2 academic English CONTENT courses, "each ≥ 2
    // credits". The rule passed on the COUNT alone, so a student who recorded
    // two 1-credit English workshops was told they were done — and would reach
    // their final year missing a requirement they cannot graduate without.
    const tiny = [
      uc({ courseType: "ENGLISH", credits: 1, grade: 90 }),
      uc({ courseType: "ENGLISH", credits: 1, grade: 90 }),
    ];
    const b = calculateCredits(tiny, null).breakdown;
    expect(b.englishCourseCount).toBe(0);
    expect(ruleEnglishRequirement(ctxOf({ userCourses: tiny })).passed).toBe(false);
    // The credits themselves are NOT confiscated — they still count to the 150.
    expect(b.total).toBe(2);
    expect(b.elective).toBe(2);
  });

  it("2-credit content courses (the catalog's own shape) still satisfy it", () => {
    const ok = [
      uc({ courseType: "ENGLISH", credits: 2, grade: 90 }),
      uc({ courseType: "ENGLISH", credits: 2, grade: 90 }),
    ];
    expect(calculateCredits(ok, null).breakdown.englishCourseCount).toBe(2);
    expect(ruleEnglishRequirement(ctxOf({ userCourses: ok })).passed).toBe(true);
  });
});

// =========================================================================
// 10. RULES THAT MUST AGREE WITH EACH OTHER
// =========================================================================

describe("no two rules may answer the same question differently", () => {
  it("defect: PKM-022 demanded level courses PKM-021 said were already done", () => {
    // Same student, same page: PKM-021 said "עברתם את קורסי הרמה — לא נותרו",
    // PKM-022 still quoted the raw placement constant ("נדרשים 1 קורסי רמה")
    // and warned that studies stop. One standing helper, one number.
    const courses = [uc({ nameHe: "אנגלית מתקדמים ב׳", grade: 85, courseType: "ENGLISH", credits: 4 })];
    const ctx = ctxOf({ userCourses: courses, englishLevel: "ADVANCED_B", academicYear: 1, currentSemester: "FALL" });
    const level = ruleEnglishLevel(ctx);
    const deadline = ruleEnglishExemptionDeadline(ctx);
    expect(level.details?.levelCourses).toBe(0);
    expect(deadline.details?.levelCoursesRemaining).toBe(0);
    // ...and it stops threatening a student who has done the work.
    expect(deadline.messageHe).not.toContain("הלימודים נפסקים");
    expect(deadline.messageHe).toContain("המזכירות");
    expect(deadline.severity).toBe("WARNING"); // actionable, never a red ERROR
  });

  it("a student with level courses still outstanding is told the honest number", () => {
    const ctx = ctxOf({ englishLevel: "ADVANCED_A", academicYear: 1, currentSemester: "FALL" });
    const deadline = ruleEnglishExemptionDeadline(ctx);
    expect(deadline.details?.levelCoursesRemaining).toBe(2);
    expect(deadline.messageHe).toContain("2");
  });

  it("defect: PKM-025 ignored in-app binary conversions that PKM-024 counted", () => {
    // A Group-C reservist converts 3 of their 4 courses to binary inside the
    // app and never touches the manual counter. PKM-024 said "3/5 נוצלו";
    // PKM-025 said "לא הומרו קורסים לבינארי השנה — אין השפעה על הצטיינות",
    // which is precisely the warning that student needed (75% >> the 25% cap).
    const courses = [
      uc({ isBinary: true, grade: null, credits: 4, weeklyHours: 4, plannedYear: 1 }),
      uc({ isBinary: true, grade: null, credits: 4, weeklyHours: 4, plannedYear: 1 }),
      uc({ isBinary: true, grade: null, credits: 4, weeklyHours: 4, plannedYear: 1 }),
      uc({ grade: 90, credits: 4, weeklyHours: 4, plannedYear: 1 }),
    ];
    const summary = runRegulationEngine(courses, null, 0, undefined, {
      academicYear: 1,
      currentSemester: "FALL",
      miluimGroup: "GROUP_C",
      miluimBinaryUsed: 0,
    });
    const cap = summary.results.find((r) => r.ruleId === "PKM-024");
    const honors = summary.results.find((r) => r.ruleId === "PKM-025");
    expect(cap?.details?.used).toBe(3);
    expect(honors?.details?.binaryUsed).toBe(3);
    expect(honors?.details?.percent).toBe(75);
    expect(honors?.passed).toBe(false);
    expect(honors?.severity).toBe("WARNING"); // honors is not a graduation gate
  });

  it("no binary conversions anywhere → PKM-025 stays neutral", () => {
    const courses = [uc({ grade: 90, credits: 4, weeklyHours: 4, plannedYear: 1 })];
    const summary = runRegulationEngine(courses, null, 0, undefined, {
      academicYear: 1,
      miluimGroup: "GROUP_C",
      miluimBinaryUsed: 0,
    });
    const honors = summary.results.find((r) => r.ruleId === "PKM-025");
    expect(honors?.passed).toBe(true);
    expect(honors?.details?.binaryUsed).toBe(0);
  });

  it("the honors cap itself is the sourced 25% of course hours (§6)", () => {
    expect(MILUIM_CONFIG.BINARY_GRADE.EXCELLENCE_MAX_PERCENT).toBe(25);
    expect(honorsBinaryStatus(3, 12)).toEqual({ percent: 25, cap: 25, over: false });
    expect(honorsBinaryStatus(4, 12).over).toBe(true);
    // A zero-hour year can never be "over" the cap.
    expect(honorsBinaryStatus(5, 0)).toEqual({ percent: 0, cap: 25, over: false });
  });
});

// =========================================================================
// 11. THE SEMINAR GATE — the ONE prerequisite that binds PPE (§9b)
// =========================================================================
// §9b, quoting the ידיעון: "דרישת קדם לכל הסמינרים: ציון עובר בכל קורסי החובה".
// Per-course prerequisites are advisory for PPE (section 4 above); this one is
// a real registration gate, and it was stated NOWHERE in the app.

describe("seminars require a passing grade in all mandatory courses (PKM-027)", () => {
  const mandatoryFull = () =>
    uc({
      courseType: "MANDATORY",
      isMandatory: true,
      credits: CREDIT_REQUIREMENTS.MANDATORY_TOTAL,
      grade: 85,
    });

  it("stays SILENT for a student with no seminar in the plan", () => {
    const r = ruleSeminarMandatoryGate(ctxOf({ userCourses: [uc({ grade: 80 })] }));
    expect(r.passed).toBe(true);
    expect(r.details?.seminars).toBe(0);
  });

  it("defect: a seminar planned before the mandatory load said nothing at all", () => {
    const courses = [
      uc({ courseType: "MANDATORY", isMandatory: true, credits: 20, grade: 85 }),
      uc({ courseType: "SEMINAR", credits: 4, status: "PLANNED", isMandatory: false }),
    ];
    const r = ruleSeminarMandatoryGate(ctxOf({ userCourses: courses }));
    expect(r.passed).toBe(false);
    expect(r.details?.deficit).toBe(CREDIT_REQUIREMENTS.MANDATORY_TOTAL - 20);
    expect(r.messageHe).toContain("ציון עובר בכל קורסי החובה");
    // Never red: this is derived from what the student ENTERED, and a thin
    // course history must not manufacture a blocking violation.
    expect(r.severity).toBe("INFO");
  });

  it("goes green once every mandatory course is passed", () => {
    const courses = [mandatoryFull(), uc({ courseType: "SEMINAR", credits: 4, isMandatory: false })];
    const r = ruleSeminarMandatoryGate(ctxOf({ userCourses: courses }));
    expect(r.passed).toBe(true);
  });

  it("an unfinished mandatory ROW blocks the gate even at full credits", () => {
    const courses = [
      mandatoryFull(),
      uc({ courseType: "MANDATORY", isMandatory: true, credits: 4, status: "IN_PROGRESS" }),
      uc({ courseType: "SEMINAR", credits: 4, isMandatory: false }),
    ];
    const r = ruleSeminarMandatoryGate(ctxOf({ userCourses: courses }));
    expect(r.passed).toBe(false);
    expect(r.details?.openMandatoryCourses).toBe(1);
  });

  it("the gate never produces an ERROR in the full engine", () => {
    const courses = [
      uc({ courseType: "SEMINAR", credits: 4, status: "PLANNED", isMandatory: false }),
    ];
    const summary = runRegulationEngine(courses, null, 0, undefined, {
      academicYear: 1,
      currentSemester: "FALL",
    });
    const gate = summary.results.find((r) => r.ruleId === "PKM-027");
    expect(gate).toBeDefined();
    expect(gate?.severity).toBe("INFO");
    expect(summary.violations).toBe(0);
  });
});

// =========================================================================
// 12. MILUIM — groups, caps and the degree boundary (domain rules §6)
// =========================================================================

describe("miluim — per-semester group derivation (§6 Layer B)", () => {
  const table: { days: number; combat: boolean; group: MiluimGroupKey }[] = [
    // Regular reservist: 35+ → C, 21–34 → B, 1–20 → A, 0 → NONE.
    { days: 0, combat: false, group: "NONE" },
    { days: 1, combat: false, group: "GROUP_A" },
    { days: 20, combat: false, group: "GROUP_A" },
    { days: 21, combat: false, group: "GROUP_B" },
    { days: 34, combat: false, group: "GROUP_B" },
    { days: 35, combat: false, group: "GROUP_C" },
    { days: 200, combat: false, group: "GROUP_C" },
    // Combat (ייעוד קדמי): a better group with fewer days — 21+ → C, 14–20 → B.
    { days: 0, combat: true, group: "NONE" },
    { days: 13, combat: true, group: "GROUP_A" },
    { days: 14, combat: true, group: "GROUP_B" },
    { days: 20, combat: true, group: "GROUP_B" },
    { days: 21, combat: true, group: "GROUP_C" },
    // Nonsense input must not invent an entitlement.
    { days: -5, combat: true, group: "NONE" },
  ];

  for (const t of table) {
    it(`${t.days} days${t.combat ? " (combat)" : ""} → ${t.group}`, () => {
      expect(deriveGroupFromDays(t.days, t.combat)).toBe(t.group);
    });
  }

  it("every threshold traces to MILUIM_CONFIG, not to a literal in the code", () => {
    const [b, c] = MILUIM_CONFIG.REGULAR_RESERVIST.perSemesterRules;
    expect(deriveGroupFromDays(b!.minDays, false)).toBe("GROUP_B");
    expect(deriveGroupFromDays(c!.minDays, false)).toBe("GROUP_C");
    const [cb, cc] = MILUIM_CONFIG.COMBAT_UPGRADE.perSemesterRules;
    expect(deriveGroupFromDays(cb!.minDays, true)).toBe("GROUP_B");
    expect(deriveGroupFromDays(cc!.minDays, true)).toBe("GROUP_C");
  });
});

describe("miluim — the caps (§6, owner-confirmed 12.7)", () => {
  it("the per-group exemption rates are the sourced ones", () => {
    // Owner-confirmed 12.7: C is 8 ש״ס (not 10); 10 is the DEGREE-WIDE cap.
    expect(MILUIM_CONFIG.GROUPS.GROUP_A.creditExemptionPerYear).toBe(2);
    expect(MILUIM_CONFIG.GROUPS.GROUP_B.creditExemptionPerYear).toBe(6);
    expect(MILUIM_CONFIG.GROUPS.GROUP_C.creditExemptionPerYear).toBe(8);
    expect(MILUIM_CONFIG.GROUPS.GROUP_G.creditExemptionPerYear).toBe(3);
    expect(MILUIM_CONFIG.MAX_CREDIT_EXEMPTIONS_DEGREE).toBe(10);
  });

  const exemptionTable: { group: MiluimGroupKey | null; used: number; expected: number }[] = [
    { group: "NONE", used: 0, expected: 0 },
    { group: null, used: 0, expected: 0 },
    { group: "GROUP_C", used: 0, expected: 8 },
    { group: "GROUP_C", used: 4, expected: 6 }, // capped by 10 − 4
    { group: "GROUP_C", used: 10, expected: 0 }, // degree cap exhausted
    { group: "GROUP_C", used: 99, expected: 0 }, // never negative
    { group: "GROUP_B", used: 0, expected: 6 },
    { group: "GROUP_A", used: 0, expected: 2 },
  ];

  for (const t of exemptionTable) {
    it(`${t.group ?? "null"} with ${t.used} used → ${t.expected} ש״ס`, () => {
      expect(computeCreditExemption(t.group, t.used)).toBe(t.expected);
    });
  }

  it("the exemption is NEVER multiplied by the year (§6 'BUG to fix')", () => {
    // The documented failure mode: a per-year rate × currentYear over-grants.
    // A group-C student in year 3 is entitled to 8 now, not 24.
    expect(computeCreditExemption("GROUP_C", 0)).toBeLessThanOrEqual(
      MILUIM_CONFIG.MAX_CREDIT_EXEMPTIONS_DEGREE,
    );
  });

  it("the binary degree cap is 5 courses for a BA, never lowered by a group", () => {
    expect(binaryDegreeCap("NONE")).toBe(MILUIM_CONFIG.BINARY_GRADE.BA_DEGREE_CAP);
    expect(binaryDegreeCap("GROUP_B")).toBe(5);
    expect(binaryDegreeCap("GROUP_G")).toBe(5);
    expect(binaryCapRemaining(2, "GROUP_C")).toBe(3);
    expect(binaryCapRemaining(9, "GROUP_C")).toBe(0); // never negative
  });

  it("B/C/G keep the HIGHER exam grade; A and NONE keep the last (§6 Layer B)", () => {
    expect(prefersHigherGrade("GROUP_B")).toBe(true);
    expect(prefersHigherGrade("GROUP_C")).toBe(true);
    expect(prefersHigherGrade("GROUP_G")).toBe(true);
    expect(prefersHigherGrade("GROUP_A")).toBe(false);
    expect(prefersHigherGrade("NONE")).toBe(false);
    expect(prefersHigherGrade(null)).toBe(false);
  });
});

describe("miluim — service before the degree grants nothing (#7/#37)", () => {
  const row = (academicYear: number, group: string) => ({
    academicYear,
    semester: "FALL",
    daysServed: 40,
    isCombat: false,
    derivedGroup: group,
  });

  it("defect: a 3010 form's whole reserve career inflated the entitlement", () => {
    // The form lists service from years before enrolment. Counting them granted
    // exemption credits for semesters the student never studied in.
    const career = [row(2021, "GROUP_C"), row(2022, "GROUP_C"), row(2025, "GROUP_C")];
    const unfiltered = deriveExemptionEntitlement(career);
    const { degree } = splitByDegreeStart(career, 2025);
    const filtered = deriveExemptionEntitlement(degree);
    expect(degree).toHaveLength(1);
    expect(filtered.total).toBe(8);
    expect(unfiltered.total).toBeGreaterThan(filtered.total);
  });

  it("an unknown degree-start year keeps every row rather than guessing", () => {
    const career = [row(2021, "GROUP_B"), row(2025, "GROUP_B")];
    expect(splitByDegreeStart(career, null).degree).toHaveLength(2);
    expect(splitByDegreeStart(career, undefined).preDegree).toHaveLength(0);
  });

  it("the accrued entitlement is capped at the degree maximum", () => {
    const many = [row(2025, "GROUP_C"), row(2026, "GROUP_C"), row(2027, "GROUP_C")];
    expect(deriveExemptionEntitlement(many).total).toBe(
      MILUIM_CONFIG.MAX_CREDIT_EXEMPTIONS_DEGREE,
    );
  });

  it("the one-time A/G new-student exemption is not granted year after year", () => {
    const threeYears = [row(2025, "GROUP_A"), row(2026, "GROUP_A"), row(2027, "GROUP_A")];
    expect(deriveExemptionEntitlement(threeYears).total).toBe(2);
  });
});

// =========================================================================
// 13. TIMEZONES — the server is UTC, every student is in Israel
// =========================================================================
// Between 00:00 and 03:00 Israel time a UTC-bucketed "today" is YESTERDAY.
// Every countdown the app shows is a civil-day count, so that three-hour window
// shifted them all by one. Each instant below is written with an explicit
// offset, so these tests prove the PRODUCTION (UTC) behaviour even though the
// suite pins TZ=Asia/Jerusalem.

describe("civil days are counted in Israel, not on the server (§timezone)", () => {
  const examCourse = (name: string, dateA: string | null, dateB: string | null = null) => ({
    status: "IN_PROGRESS",
    grade: null,
    course: { nameHe: name, nameEn: name, examDateA: dateA ? new Date(dateA) : null, examDateB: dateB ? new Date(dateB) : null },
  });

  it("defect: at 01:00 on exam morning the app said the exam was TOMORROW", () => {
    // Exam dates are stored as date-only values at UTC midnight.
    const courses = [examCourse("מיקרו א׳", "2026-02-10T00:00:00.000Z")];
    // 01:00 Israel on 10.2.26 = 23:00Z on the 9th. UTC says "9th" → 1 day out.
    const at0100 = new Date("2026-02-10T01:00:00+02:00");
    expect(nearestUpcomingExam(courses, at0100)?.days).toBe(0);
    expect(daysUntilLabel(nearestUpcomingExam(courses, at0100)!.days, true)).toBe("היום");
    // Midday on the same civil day must give the identical answer.
    expect(nearestUpcomingExam(courses, new Date("2026-02-10T14:00:00+02:00"))?.days).toBe(0);
  });

  it("yesterday's exam is not resurrected as 'today' in that same window", () => {
    const courses = [examCourse("מאקרו א׳", "2026-02-09T00:00:00.000Z")];
    expect(nearestUpcomingExam(courses, new Date("2026-02-10T01:00:00+02:00"))).toBeNull();
  });

  it("the day count survives the Israeli DST flip (Oct 2026)", () => {
    // 25.10.26 is the IDT→IST change. A fixed +3h offset gets this wrong; the
    // civil-day helper does not.
    const courses = [examCourse("סטטיסטיקה", "2026-10-27T00:00:00.000Z")];
    expect(nearestUpcomingExam(courses, new Date("2026-10-24T23:30:00+03:00"))?.days).toBe(3);
    expect(nearestUpcomingExam(courses, new Date("2026-10-26T00:30:00+02:00"))?.days).toBe(1);
  });

  it("civilDaysBetween is 0 for two instants on the same Israeli day", () => {
    expect(
      civilDaysBetween(new Date("2026-09-15T00:30:00+03:00"), new Date("2026-09-15T23:30:00+03:00")),
    ).toBe(0);
    expect(
      civilDaysBetween(new Date("2026-09-15T23:30:00+03:00"), new Date("2026-09-16T00:30:00+03:00")),
    ).toBe(1);
  });

  it("defect: bidding said 'closes tomorrow' nine hours before it closed", () => {
    // Official תשפ״ז round 1 closes 15.9.26 at 10:00 Israel. A student checking
    // at 00:30 that morning (= 21:30Z on the 14th) was told "נסגר מחר".
    const phase = getBiddingPhase(new Date("2026-09-15T00:30:00+03:00"));
    expect(phase.kind).toBe("open");
    expect(phase.daysUntil).toBe(0);
  });

  it("the bidding countdown still reads 1 the day before closing", () => {
    const phase = getBiddingPhase(new Date("2026-09-14T00:30:00+03:00"));
    expect(phase.kind).toBe("open");
    expect(phase.daysUntil).toBe(1);
  });

  it("a stored UTC-midnight date keeps its civil day in any host zone", () => {
    // storedDateKeyMs reads the UTC components — the whole point of date-only
    // storage. Reading such a value in a local zone is what shifted every exam
    // by a day for a student on exchange west of Greenwich.
    expect(storedDateKeyMs("2026-02-10T00:00:00.000Z")).toBe(Date.UTC(2026, 1, 10));
    expect(storedDateKeyMs(new Date("2026-02-10T00:00:00.000Z"))).toBe(Date.UTC(2026, 1, 10));
  });
});

// =========================================================================
// §14 — rules must not assert a limit we cannot cite.
//
// Two rules shipped a verdict against an INVENTED threshold:
//   PKM-014 `maxFailureRate: 0.3` — there is NO failure-rate rule anywhere in
//     docs/. It told a student "שיעור כישלון 33%, חורג מהמגבלה של 30%", i.e.
//     asserted a regulation violation that does not exist.
//   PKM-015 `maxExamAttempts: 3` — unsourced, AND the wrong quantity: §4
//     governs FAILURES, not attempts, and §6 speaks of exam SITTINGS.
//
// Nothing is lost by removing the verdicts, because the rule that DOES bind is
// sourced and already implemented: PKM-023 (§4 — a second failure in the same
// course means you cannot continue), which fires as a blocking ERROR.
// =========================================================================
import { ruleFailureRate, ruleMaxAttempts, ruleFailTwice } from "@/lib/regulations/rules/grades";

describe("§14 unsourced thresholds never produce a verdict", () => {
  it("PKM-014 reports a high failure rate as INFO, never as a violation", () => {
    // 2 of 3 failed = 67%, way past the old invented 30% "limit".
    const courses = [
      uc({ status: "FAILED", courseId: "f1" }),
      uc({ status: "FAILED", courseId: "f2" }),
      uc({ status: "COMPLETED", grade: 80, courseId: "p1" }),
    ];
    const r = ruleFailureRate(ctxOf({ userCourses: courses }));
    expect(r.passed).toBe(true);
    expect(r.severity).toBe("INFO");
    expect(r.messageHe).toContain("67%");
    // It must not name a limit it cannot cite.
    expect(r.messageHe).not.toContain("חורג");
    expect(r.messageHe).not.toContain("30%");
  });

  it("PKM-015 reports many attempts as INFO, never as a blocking ERROR", () => {
    const courses = [
      uc({ courseId: "x", status: "FAILED", attemptNumber: 1 }),
      uc({ courseId: "x", status: "FAILED", attemptNumber: 2 }),
      uc({ courseId: "x", status: "FAILED", attemptNumber: 3 }),
      uc({ courseId: "x", status: "COMPLETED", grade: 70, attemptNumber: 4 }),
    ];
    const r = ruleMaxAttempts(ctxOf({ userCourses: courses }));
    expect(r.passed).toBe(true);
    expect(r.severity).toBe("INFO");
    expect(r.severity).not.toBe("ERROR");
  });

  it("but the SOURCED rule still bites: a second failure in the same course blocks", () => {
    // This is the guarantee that makes removing the two verdicts safe.
    const courses = [
      // isMandatory matters: §4 scopes the blocker to MANDATORY courses — a
      // twice-failed elective is replaced, not degree-ending. The migration
      // sets isMandatory from courseType, so this mirrors real catalog rows.
      uc({ courseId: "y", status: "FAILED", attemptNumber: 1, isMandatory: true }),
      uc({ courseId: "y", status: "FAILED", attemptNumber: 2, isMandatory: true }),
    ];
    const r = ruleFailTwice(ctxOf({ userCourses: courses }));
    expect(r.passed).toBe(false);
    expect(r.severity).toBe("ERROR");
  });

  it("and a single failure, or a failure then a pass, does NOT block", () => {
    const once = ruleFailTwice(
      ctxOf({ userCourses: [uc({ courseId: "z", status: "FAILED", isMandatory: true })] }),
    );
    expect(once.passed).toBe(true);

    const recovered = ruleFailTwice(
      ctxOf({
        userCourses: [
          uc({ courseId: "w", status: "FAILED", attemptNumber: 1, isMandatory: true }),
          uc({ courseId: "w", status: "COMPLETED", grade: 75, attemptNumber: 2, isMandatory: true }),
        ],
      }),
    );
    expect(recovered.passed).toBe(true);
  });

  it("a twice-failed ELECTIVE does not block — §4 scopes the blocker to mandatory", () => {
    const r = ruleFailTwice(
      ctxOf({
        userCourses: [
          uc({ courseId: "e", status: "FAILED", attemptNumber: 1, isMandatory: false }),
          uc({ courseId: "e", status: "FAILED", attemptNumber: 2, isMandatory: false }),
        ],
      }),
    );
    expect(r.passed).toBe(true);
  });
});
