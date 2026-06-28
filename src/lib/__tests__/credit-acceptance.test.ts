// =========================================
// ACCEPTANCE TESTS — Credit / Compliance Engine
// =========================================
// Launch-readiness blocker #1: a student who plans a CORRECT, COMPLETE PPE
// degree must NOT see permanent red ERRORs claiming they are short credits they
// actually met. These tests build a DOC-CORRECT COMPLETE degree straight from
// the real fixture (prisma/fixtures/ppe-courses-2025.json) and assert the engine
// reports zero ERROR-severity failures and that every bucket / discipline rule
// reconciles. A second test asserts a MID-degree student sees credit-accumulation
// rules as INFO progress (not red ERRORs) and that PKM-010 is not falsely green.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { runRegulationEngine } from "@/lib/regulations/rule-engine";
import { calculateCredits } from "@/lib/credit-calculator";
import type { UserCourseWithCourse } from "@/types/degree";

// -------------------------------------------------------------------
// Load the real fixture catalog.
// -------------------------------------------------------------------

interface FixtureCourse {
  code: string;
  nameHe: string;
  nameEn: string | null;
  discipline: string;
  courseType: string;
  credits: number;
  canCountAs: string[];
  isMandatory: boolean;
  submissionType: string | null;
}

const FIXTURE_PATH = path.resolve(
  __dirname,
  "../../../prisma/fixtures/ppe-courses-2025.json"
);

const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as {
  courses: FixtureCourse[];
};
const CATALOG = fixture.courses;

// -------------------------------------------------------------------
// Build a UserCourseWithCourse from a fixture catalog entry.
// -------------------------------------------------------------------

let seq = 0;
function toUserCourse(
  c: FixtureCourse,
  over: {
    status?: string;
    grade?: number | null;
    plannedYear?: number;
    submissionType?: string | null;
    submissionGrade?: number | null;
  } = {}
): UserCourseWithCourse {
  seq += 1;
  return {
    id: `uc-${seq}`,
    userId: "u-1",
    courseId: c.code,
    status: over.status ?? "COMPLETED",
    grade: over.grade === undefined ? 90 : over.grade,
    plannedYear: over.plannedYear ?? 2, // default to year 2 so the year-1 gate is not over-triggered
    plannedSemester: "FALL",
    attemptNumber: 1,
    isGradeImproved: false,
    disciplineOverride: null,
    submissionType: over.submissionType ?? null,
    submissionGrade: over.submissionGrade ?? null,
    notes: null,
    course: {
      id: c.code,
      code: c.code,
      nameHe: c.nameHe,
      nameEn: c.nameEn,
      discipline: c.discipline,
      courseType: c.courseType,
      credits: c.credits,
      yearOffered: [],
      semesterOffered: [],
      prerequisites: [],
      canCountAs: c.canCountAs ?? [],
      description: null,
      isMandatory: c.isMandatory,
      submissionType: (c.submissionType ?? null) as never,
      weeklyHours: null,
      examDateA: null,
      examDateB: null,
      averageGrade: null,
      difficultyLevel: null,
      failRate: null,
    },
  } as unknown as UserCourseWithCourse;
}

/** Resolve the discipline the engine will attribute a fixture course to. */
function resolvedDisc(c: FixtureCourse): string {
  if (c.isMandatory && c.discipline !== "LAW" && (c.canCountAs ?? []).includes("LAW")) {
    return "LAW";
  }
  return c.discipline;
}

// -------------------------------------------------------------------
// Build a DOC-CORRECT COMPLETE PPE degree from the fixture.
//   • all isMandatory courses (incl. the PPE seminar)
//   • 8 ש"ז from the LAW_FOUNDATION basket ("pick any two")
//   • 12 ש"ז of (non-mandatory) seminars — 3 papers + 1 referat for the
//     seminar-paper / referat requirements
//   • the 2 English content courses
//   • enough PHILOSOPHY electives to reach the 60-in-focus target, then any
//     electives to reach 150 total and the 35-elective minimum
// -------------------------------------------------------------------

function buildCompleteDegree(): {
  courses: UserCourseWithCourse[];
  focusArea: string;
} {
  const out: UserCourseWithCourse[] = [];

  // All mandatory courses (year 2 grade 90 so neither year-1 gate fires falsely).
  for (const c of CATALOG.filter((x) => x.isMandatory)) {
    // The PPE seminar (mandatory SEMINAR) gets a paper submission so it also
    // contributes to the 3-papers requirement (domain §3: PPE seminar is one of
    // the three seminar-paper seminars).
    if (c.courseType === "SEMINAR") {
      out.push(
        toUserCourse(c, { submissionType: "PAPER", submissionGrade: 90 })
      );
    } else {
      out.push(toUserCourse(c));
    }
  }

  // 8 ש"ז law basket: pick the first two 4-credit LAW_FOUNDATION courses.
  const basket = CATALOG.filter((x) => x.courseType === "LAW_FOUNDATION").slice(0, 2);
  for (const c of basket) out.push(toUserCourse(c));

  // 12 ש"ז of non-mandatory seminars: 2 with a PAPER, 1 with a REFERAT, so that
  // together with the PPE seminar's paper we have 3 papers + 1 referat.
  const nonMandSeminars = CATALOG.filter(
    (x) => x.courseType === "SEMINAR" && !x.isMandatory
  ).slice(0, 3);
  nonMandSeminars.forEach((c, i) => {
    out.push(
      toUserCourse(c, {
        submissionType: i < 2 ? "PAPER" : "REFERAT",
        submissionGrade: 90,
      })
    );
  });

  // 2 English content courses (graded 90 ≥ humanities pass 70).
  const english = CATALOG.filter((x) => x.courseType === "ENGLISH").slice(0, 2);
  for (const c of english) out.push(toUserCourse(c, { grade: 90 }));

  // Top up with electives: PHILOSOPHY electives first (drive focus → 60), then
  // any electives until total ≥ 150 and the elective bucket ≥ 35.
  const philElectives = CATALOG.filter(
    (x) => x.courseType === "ELECTIVE" && resolvedDisc(x) === "PHILOSOPHY"
  );
  const otherElectives = CATALOG.filter(
    (x) => x.courseType === "ELECTIVE" && resolvedDisc(x) !== "PHILOSOPHY"
  );

  const focusArea = "PHILOSOPHY";
  const addUntil = (pool: FixtureCourse[], done: () => boolean) => {
    for (const c of pool) {
      if (done()) break;
      out.push(toUserCourse(c));
    }
  };
  const recompute = () => calculateCredits(out, focusArea, 0).breakdown;

  addUntil(philElectives, () => {
    const b = recompute();
    return b.byDiscipline[focusArea]! >= 60 && b.elective >= 35 && b.total >= 150;
  });
  addUntil(otherElectives, () => {
    const b = recompute();
    return b.elective >= 35 && b.total >= 150;
  });

  return { courses: out, focusArea };
}

// -------------------------------------------------------------------
// ACCEPTANCE TEST 1 — a COMPLETE doc-correct degree has NO false failures.
// -------------------------------------------------------------------

describe("ACCEPTANCE — a complete doc-correct PPE degree reconciles with no ERROR", () => {
  const { courses, focusArea } = buildCompleteDegree();
  const summary = runRegulationEngine(courses, focusArea, 0, undefined, {
    amirantScore: 140, // exempt from English level courses; content courses still taken
    academicYear: 3,
    currentSemester: "SPRING",
  });
  const calc = calculateCredits(courses, focusArea, 0);
  const b = calc.breakdown;

  it("the engine reports ZERO ERROR-severity failures", () => {
    const errors = summary.results.filter(
      (r) => !r.passed && r.severity === "ERROR"
    );
    // Surface any offenders in the failure message for fast diagnosis.
    expect(
      errors.map((e) => `${e.ruleId}: ${e.messageEn}`)
    ).toStrictEqual([]);
    expect(summary.failed).toBe(0);
  });

  it("mandatory credits ≥ the program target (101)", () => {
    const pkm018 = summary.results.find((r) => r.ruleId === "PKM-018");
    expect(b.mandatory).toBeGreaterThanOrEqual(101);
    expect(pkm018?.passed).toBe(true);
    expect(pkm018?.details?.required).toBe(101);
  });

  it("total credits reconcile to ≥ 150 (and buckets sum back to the total)", () => {
    expect(b.total).toBeGreaterThanOrEqual(150);
    // No practice courses in this plan, so mandatory+seminar+elective == total.
    expect(b.mandatory + b.seminar + b.elective).toBe(b.total);
    expect(summary.results.find((r) => r.ruleId === "PKM-001")?.passed).toBe(true);
  });

  it("the seminar (12) and elective (35) buckets are met and separate", () => {
    expect(b.seminar).toBeGreaterThanOrEqual(12);
    expect(b.elective).toBeGreaterThanOrEqual(35);
    expect(summary.results.find((r) => r.ruleId === "PKM-019")?.passed).toBe(true);
    expect(summary.results.find((r) => r.ruleId === "PKM-020")?.passed).toBe(true);
  });

  it("every DISC-* discipline rule is satisfied", () => {
    const discRules = summary.results.filter((r) => r.ruleId.startsWith("DISC-"));
    expect(discRules.length).toBeGreaterThan(0);
    for (const r of discRules) {
      expect(r.passed, `${r.ruleId} should be satisfied: ${r.messageEn}`).toBe(true);
    }
    // The specific minima the doc-correct plan must clear.
    expect(b.byDiscipline.PPE_CORE).toBeGreaterThanOrEqual(13);
    expect(b.byDiscipline.PHILOSOPHY).toBeGreaterThanOrEqual(18);
    expect(b.byDiscipline.ECONOMICS).toBeGreaterThanOrEqual(27);
    expect(b.byDiscipline.POLITICAL_SCIENCE).toBeGreaterThanOrEqual(15);
    expect(b.byDiscipline.LAW).toBeGreaterThanOrEqual(14);
  });

  it("the 60-in-focus requirement (PKM-007) is met", () => {
    expect(b.focusArea).toBeGreaterThanOrEqual(60);
    expect(summary.results.find((r) => r.ruleId === "PKM-007")?.passed).toBe(true);
  });

  it("PKM-010 (all mandatory courses) is green for a complete degree", () => {
    const pkm010 = summary.results.find((r) => r.ruleId === "PKM-010");
    expect(pkm010?.passed).toBe(true);
  });

  it("1411-9240 (משפט וכלכלה) buckets toward LAW, lifting DISC-LAW to 14", () => {
    // Sanity: the law-and-economics course is attributed to LAW, not ECONOMICS.
    const law9240 = courses.find((uc) => uc.courseId === "1411-9240");
    expect(law9240).toBeDefined();
    expect(b.byDiscipline.LAW).toBe(14); // 4 (9107) + 2 (9240) + 8 (basket)
  });
});

// -------------------------------------------------------------------
// ACCEPTANCE TEST 2 — a MID-degree student sees progress, not red failures.
// -------------------------------------------------------------------

describe("ACCEPTANCE — a mid-degree student: credit targets are INFO, PKM-010 not falsely green", () => {
  // A handful of completed courses: a few mandatory + one elective. Far from
  // the 101 mandatory / 150 total / 60-focus targets.
  function midDegreePlan(): UserCourseWithCourse[] {
    const someMandatory = CATALOG.filter((x) => x.isMandatory).slice(0, 4);
    const oneElective = CATALOG.filter((x) => x.courseType === "ELECTIVE").slice(0, 1);
    return [...someMandatory, ...oneElective].map((c) =>
      toUserCourse(c, { status: "COMPLETED", grade: 88, plannedYear: 1 })
    );
  }

  const courses = midDegreePlan();
  const summary = runRegulationEngine(courses, "PHILOSOPHY", 0, undefined, {
    amirantScore: 140, // exempt → English deadline/level rules stay neutral
    academicYear: 1,
    currentSemester: "FALL",
  });

  const ACCUMULATION_RULES = [
    "PKM-001", // total
    "PKM-018", // mandatory
    "PKM-019", // seminars
    "PKM-020", // electives
    "PKM-007", // focus area
  ];

  it("credit-accumulation rules are unmet but reported as INFO (progress, not ERROR)", () => {
    for (const id of ACCUMULATION_RULES) {
      const r = summary.results.find((x) => x.ruleId === id);
      expect(r, `${id} should exist`).toBeDefined();
      expect(r!.passed, `${id} should not yet be met mid-degree`).toBe(false);
      expect(r!.severity, `${id} must be INFO progress, not a red ERROR`).toBe(
        "INFO"
      );
    }
  });

  it("the DISC-* discipline rules are unmet but reported as INFO", () => {
    const discRules = summary.results.filter((r) => r.ruleId.startsWith("DISC-"));
    expect(discRules.length).toBeGreaterThan(0);
    for (const r of discRules) {
      if (!r.passed) {
        expect(r.severity, `${r.ruleId} must be INFO mid-degree`).toBe("INFO");
      }
    }
  });

  it("there are NO ERROR-severity failures for a clean mid-degree student", () => {
    const errors = summary.results.filter(
      (r) => !r.passed && r.severity === "ERROR"
    );
    expect(errors.map((e) => `${e.ruleId}: ${e.messageEn}`)).toStrictEqual([]);
  });

  it("PKM-010 is NOT falsely green while mandatory courses are missing", () => {
    const pkm010 = summary.results.find((r) => r.ruleId === "PKM-010");
    expect(pkm010).toBeDefined();
    // All 4 added mandatory rows are COMPLETED, but the mandatory-credit total is
    // far below 101 — so PKM-010 must NOT report satisfied/green.
    expect(pkm010?.passed).toBe(false);
    expect(pkm010?.details?.creditsMet).toBe(false);
  });
});
