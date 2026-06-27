import { describe, it, expect } from "vitest";
import { runRegulationEngine } from "@/lib/regulations/rule-engine";
import type { UserCourseWithCourse } from "@/types/degree";

/**
 * Minimal completed course fixture for the fields the engine + credit
 * calculator read. Cast through `unknown` to avoid filling every column.
 */
let seq = 0;
function course(over: {
  credits?: number;
  discipline?: string;
  courseType?: string;
  status?: string;
  grade?: number | null;
  courseId?: string;
  attemptNumber?: number;
}): UserCourseWithCourse {
  seq += 1;
  const courseId = over.courseId ?? `c-${seq}`;
  return {
    id: `uc-${seq}`,
    courseId,
    status: over.status ?? "COMPLETED",
    grade: over.grade ?? 85,
    submissionType: null,
    submissionGrade: null,
    attemptNumber: over.attemptNumber ?? 1,
    plannedYear: 1,
    disciplineOverride: null,
    course: {
      id: courseId,
      code: `000${seq}`,
      nameHe: "קורס",
      nameEn: "Course",
      discipline: over.discipline ?? "ECONOMICS",
      courseType: over.courseType ?? "ELECTIVE",
      credits: over.credits ?? 3,
    },
  } as unknown as UserCourseWithCourse;
}

describe("runRegulationEngine — aggregation invariants", () => {
  const summary = runRegulationEngine([], null);

  it("produces one result per rule", () => {
    expect(summary.totalRules).toBe(summary.results.length);
    expect(summary.totalRules).toBeGreaterThan(0);
  });

  it("counts every result exactly once across passed/failed/warnings/info", () => {
    expect(summary.passed + summary.failed + summary.warnings + summary.info).toBe(
      summary.totalRules
    );
  });

  it("computes complianceScore as round(passed / total * 100), within 0–100", () => {
    expect(summary.complianceScore).toBe(
      Math.round((summary.passed / summary.totalRules) * 100)
    );
    expect(summary.complianceScore).toBeGreaterThanOrEqual(0);
    expect(summary.complianceScore).toBeLessThanOrEqual(100);
  });

  it("gives every rule a unique id and the required fields", () => {
    const ids = summary.results.map((r) => r.ruleId);
    expect(new Set(ids).size).toBe(ids.length); // no duplicate rules
    for (const r of summary.results) {
      expect(typeof r.ruleId).toBe("string");
      expect(typeof r.passed).toBe("boolean");
      expect(["ERROR", "WARNING", "INFO"]).toContain(r.severity);
      expect(r.messageHe.length).toBeGreaterThan(0);
      expect(r.messageEn.length).toBeGreaterThan(0);
    }
  });

  it("is deterministic for the same input", () => {
    const a = runRegulationEngine([], null);
    const b = runRegulationEngine([], null);
    expect(b.complianceScore).toBe(a.complianceScore);
    expect(b.passed).toBe(a.passed);
    expect(b.totalRules).toBe(a.totalRules);
  });
});

describe("runRegulationEngine — responds to course data", () => {
  it("flips the total-credits rule from failing to passing once 150 credits are completed", () => {
    const empty = runRegulationEngine([], null);
    const totalRuleEmpty = empty.results.find((r) => r.ruleId === "PKM-001");
    expect(totalRuleEmpty).toBeDefined();
    expect(totalRuleEmpty?.passed).toBe(false);

    // 10 completed courses × 15 credits = 150 total credits.
    const fullCredits = Array.from({ length: 10 }, () =>
      course({ credits: 15 })
    );
    const withCredits = runRegulationEngine(fullCredits, "ECONOMICS");
    const totalRuleFull = withCredits.results.find((r) => r.ruleId === "PKM-001");

    expect(totalRuleFull?.passed).toBe(true);
    // Satisfying a hard requirement cannot lower the compliance score.
    expect(withCredits.complianceScore).toBeGreaterThanOrEqual(
      empty.complianceScore
    );
  });
});

describe("AMIRANT English wiring (Task 1)", () => {
  it("score 90 → BASIC, needs 3 level courses; content-course requirement (PKM-012) still applies", () => {
    const summary = runRegulationEngine([], null, 0, undefined, {
      amirantScore: 90,
      academicYear: 1,
      currentSemester: "FALL",
    });
    const level = summary.results.find((r) => r.ruleId === "PKM-021");
    expect(level?.details?.level).toBe("BASIC");
    expect(level?.details?.levelCourses).toBe(3);
    // The 2 English CONTENT courses (PKM-012) are separate and still required.
    const content = summary.results.find((r) => r.ruleId === "PKM-012");
    expect(content?.passed).toBe(false); // no content courses taken yet
  });

  it("score 134 → EXEMPT, 0 level courses, no exemption deadline", () => {
    const summary = runRegulationEngine([], null, 0, undefined, {
      amirantScore: 134,
      academicYear: 1,
      currentSemester: "FALL",
    });
    const level = summary.results.find((r) => r.ruleId === "PKM-021");
    expect(level?.details?.level).toBe("EXEMPT");
    expect(level?.details?.levelCourses).toBe(0);
    const deadline = summary.results.find((r) => r.ruleId === "PKM-022");
    expect(deadline?.passed).toBe(true); // exempt → satisfied
  });

  it("year-1 semester-2, score 110, no exemption → deadline WARNING (still in window)", () => {
    const summary = runRegulationEngine([], null, 0, undefined, {
      amirantScore: 110,
      academicYear: 1,
      currentSemester: "SPRING",
    });
    const deadline = summary.results.find((r) => r.ruleId === "PKM-022");
    expect(deadline?.passed).toBe(false);
    expect(deadline?.severity).toBe("WARNING");
  });

  it("year-2, score 110, no exemption → deadline ERROR (past the window, blocking)", () => {
    const summary = runRegulationEngine([], null, 0, undefined, {
      amirantScore: 110,
      academicYear: 2,
      currentSemester: "FALL",
    });
    const deadline = summary.results.find((r) => r.ruleId === "PKM-022");
    expect(deadline?.passed).toBe(false);
    expect(deadline?.severity).toBe("ERROR");
  });

  it("score ≤84 → PRE_BASIC auto-rejection (ERROR)", () => {
    const summary = runRegulationEngine([], null, 0, undefined, {
      amirantScore: 70,
      academicYear: 1,
      currentSemester: "FALL",
    });
    const level = summary.results.find((r) => r.ruleId === "PKM-021");
    expect(level?.passed).toBe(false);
    expect(level?.severity).toBe("ERROR");
  });

  it("null score → English-level + deadline rules stay neutral (passing INFO, no error)", () => {
    const summary = runRegulationEngine([], null, 0, undefined, {
      amirantScore: null,
    });
    const level = summary.results.find((r) => r.ruleId === "PKM-021");
    const deadline = summary.results.find((r) => r.ruleId === "PKM-022");
    expect(level?.passed).toBe(true);
    expect(level?.severity).toBe("INFO");
    expect(deadline?.passed).toBe(true);
    expect(deadline?.severity).toBe("INFO");
  });
});

describe("Credit structure 103/12/35 + seminar bucket (Task 2)", () => {
  it("seminar credits go to the SEMINAR bucket, NOT electives", () => {
    const courses = [
      course({ courseType: "SEMINAR", credits: 4 }),
      course({ courseType: "ELECTIVE", credits: 3 }),
    ];
    // Reach into the engine via the elective/seminar rules.
    const summary = runRegulationEngine(courses, null);
    const seminarRule = summary.results.find((r) => r.ruleId === "PKM-019");
    const electiveRule = summary.results.find((r) => r.ruleId === "PKM-020");
    expect(seminarRule?.details?.current).toBe(4);   // seminar credits counted here
    expect(electiveRule?.details?.current).toBe(3);  // electives exclude the seminar
  });

  it("PKM-018/019/020 enforce 103 / 12 / 35 minima", () => {
    const summary = runRegulationEngine([], null);
    expect(summary.results.find((r) => r.ruleId === "PKM-018")?.details?.required).toBe(103);
    expect(summary.results.find((r) => r.ruleId === "PKM-019")?.details?.required).toBe(12);
    expect(summary.results.find((r) => r.ruleId === "PKM-020")?.details?.required).toBe(35);
  });
});

describe("Fail-twice blocking rule (Task 3)", () => {
  it("two FAILED attempts of the same course → PKM-023 blocks (ERROR)", () => {
    const courses = [
      course({ courseId: "X", status: "FAILED", attemptNumber: 1 }),
      course({ courseId: "X", status: "FAILED", attemptNumber: 2 }),
    ];
    const summary = runRegulationEngine(courses, null);
    const failTwice = summary.results.find((r) => r.ruleId === "PKM-023");
    expect(failTwice?.passed).toBe(false);
    expect(failTwice?.severity).toBe("ERROR");
  });

  it("one failure (then retake) does NOT trigger PKM-023", () => {
    const courses = [
      course({ courseId: "Y", status: "FAILED", attemptNumber: 1 }),
      course({ courseId: "Y", status: "COMPLETED", attemptNumber: 2 }),
    ];
    const summary = runRegulationEngine(courses, null);
    const failTwice = summary.results.find((r) => r.ruleId === "PKM-023");
    expect(failTwice?.passed).toBe(true);
  });
});

describe("runRegulationEngine — regression: verified review fixes", () => {
  it("PKM-001 counts the miluim/reserve exemption toward the total (reservist parity with dashboard)", () => {
    // 142 completed credits + 8 reserve-duty exemption = 150 → requirement met.
    const courses = [course({ credits: 100 }), course({ credits: 42 })];
    const summary = runRegulationEngine(courses, null, 8);
    const pkm001 = summary.results.find((r) => r.ruleId === "PKM-001");
    expect(pkm001?.passed).toBe(true);

    // Without the exemption the same plan must fall short.
    const noExemption = runRegulationEngine(courses, null, 0);
    expect(noExemption.results.find((r) => r.ruleId === "PKM-001")?.passed).toBe(
      false
    );
  });

  it("PKM-014 counts a failed-then-passed course as 0 failures, not 50%", () => {
    const courses = [
      course({ courseId: "RETAKE", status: "FAILED", attemptNumber: 1 }),
      course({ courseId: "RETAKE", status: "COMPLETED", attemptNumber: 2 }),
      course({ courseId: "OTHER", status: "COMPLETED" }),
    ];
    const summary = runRegulationEngine(courses, null);
    const pkm014 = summary.results.find((r) => r.ruleId === "PKM-014");
    expect(pkm014?.passed).toBe(true); // 0 distinct failed courses
    expect(pkm014?.details?.failedCount).toBe(0);
    expect(pkm014?.details?.totalAttempted).toBe(2); // RETAKE + OTHER, deduped by course
  });
});
