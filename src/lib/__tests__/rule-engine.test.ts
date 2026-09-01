import { describe, it, expect } from "vitest";
import { CREDIT_REQUIREMENTS } from "@/lib/constants";
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
  isMandatory?: boolean;
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
      isMandatory: over.isMandatory ?? (over.courseType === "MANDATORY"),
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

  it("year-2, score 110, no exemption → deadline WARNING (past the window, non-blocking)", () => {
    // Past-deadline fires off a SELF-REPORTED AMIRANT score + current year, so an
    // already-exempt student who never updated their score would otherwise see a
    // false red block. The rule still fires (passed:false) but is a non-blocking
    // WARNING that prompts updating the score in Settings — never a hard ERROR.
    const summary = runRegulationEngine([], null, 0, undefined, {
      amirantScore: 110,
      academicYear: 2,
      currentSemester: "FALL",
    });
    const deadline = summary.results.find((r) => r.ruleId === "PKM-022");
    expect(deadline?.passed).toBe(false);
    expect(deadline?.severity).toBe("WARNING");
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

describe("Declared English level overrides the score (#23)", () => {
  it("declared ADVANCED_B with NO score → level rule fires (1 level course), not neutral", () => {
    const summary = runRegulationEngine([], null, 0, undefined, {
      amirantScore: null,
      englishLevel: "ADVANCED_B",
      academicYear: 1,
      currentSemester: "FALL",
    });
    const level = summary.results.find((r) => r.ruleId === "PKM-021");
    expect(level?.details?.level).toBe("ADVANCED_B");
    expect(level?.details?.levelCourses).toBe(1);
  });

  it("declared EXEMPT wins over a low score (deadline satisfied)", () => {
    const summary = runRegulationEngine([], null, 0, undefined, {
      amirantScore: 90, // would be BASIC/not-exempt on its own
      englishLevel: "EXEMPT",
      academicYear: 1,
      currentSemester: "FALL",
    });
    const level = summary.results.find((r) => r.ruleId === "PKM-021");
    const deadline = summary.results.find((r) => r.ruleId === "PKM-022");
    expect(level?.details?.level).toBe("EXEMPT");
    expect(deadline?.passed).toBe(true); // exempt → no deadline block
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

  it("PKM-018/019/020 enforce the PROGRAM's minima, whatever they currently are", () => {
    // This used to hardcode 101 and restate the arithmetic behind it — "89
    // (MANDATORY) + 4 (PPE seminar) + 8 (LAW_FOUNDATION) = 101". That was true
    // when written, and then the catalog moved underneath it: the תשפ״ז
    // migration deactivated two MANDATORY courses and the reachable supply fell
    // to 97 (85 + 4 + 8), while the gate stayed at 101.
    //
    // A green test held that gap in place. It asserted a NUMBER, so it agreed
    // with the constant no matter whether any student could reach it — and the
    // real defect was invisible to it: a third-year who had completed every
    // published mandatory course being told they were 4 ש״ס short and ineligible
    // for a seminar.
    //
    // So it now asserts the WIRING — that each rule enforces the program's own
    // figure — which is what this test is actually for. Whether that figure is
    // reachable is checked where it can be measured, against the live catalog,
    // by scripts/verify-catalog-facts.ts.
    const summary = runRegulationEngine([], null);
    expect(summary.results.find((r) => r.ruleId === "PKM-018")?.details?.required).toBe(
      CREDIT_REQUIREMENTS.MANDATORY_TOTAL,
    );
    expect(summary.results.find((r) => r.ruleId === "PKM-019")?.details?.required).toBe(
      CREDIT_REQUIREMENTS.SEMINAR_TOTAL,
    );
    expect(summary.results.find((r) => r.ruleId === "PKM-020")?.details?.required).toBe(
      CREDIT_REQUIREMENTS.ELECTIVE_TOTAL,
    );
  });

  it("the mandatory gate never exceeds the official published figure", () => {
    // The direction that would silently harm a student: asking for more than
    // the ידיעון itself requires.
    expect(CREDIT_REQUIREMENTS.MANDATORY_TOTAL).toBeLessThanOrEqual(
      CREDIT_REQUIREMENTS.MANDATORY_OFFICIAL,
    );
  });
});

describe("Fail-twice blocking rule (Task 3)", () => {
  it("two FAILED attempts of a MANDATORY course → PKM-023 blocks (ERROR)", () => {
    const courses = [
      course({ courseId: "X", status: "FAILED", attemptNumber: 1, isMandatory: true }),
      course({ courseId: "X", status: "FAILED", attemptNumber: 2, isMandatory: true }),
    ];
    const summary = runRegulationEngine(courses, null);
    const failTwice = summary.results.find((r) => r.ruleId === "PKM-023");
    expect(failTwice?.passed).toBe(false);
    expect(failTwice?.severity).toBe("ERROR");
  });

  it("twice-failed ELECTIVE does NOT block — electives are replaceable (launch audit 24.7)", () => {
    const courses = [
      course({ courseId: "E", status: "FAILED", attemptNumber: 1, isMandatory: false }),
      course({ courseId: "E", status: "FAILED", attemptNumber: 2, isMandatory: false }),
    ];
    const summary = runRegulationEngine(courses, null);
    const failTwice = summary.results.find((r) => r.ruleId === "PKM-023");
    expect(failTwice?.passed).toBe(true);
    expect(failTwice?.severity).toBe("INFO");
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

describe("PKM-026 retake advisory — note #30's conversational layers", () => {
  it("layer 2: a PLANNED retake of a once-failed MANDATORY course → WARNING (second-and-last attempt)", () => {
    const courses = [
      course({ courseId: "Z", status: "FAILED", attemptNumber: 1, isMandatory: true }),
      course({ courseId: "Z", status: "PLANNED", attemptNumber: 2, isMandatory: true }),
    ];
    const summary = runRegulationEngine(courses, null);
    const r = summary.results.find((x) => x.ruleId === "PKM-026");
    expect(r?.passed).toBe(false);
    expect(r?.severity).toBe("WARNING");
    expect(r?.messageHe).toContain("ועדת-הוראה");
    expect(r?.messageHe).toContain("הניסיון האחרון");
  });

  it("layer 1: a MANDATORY failure with NO retake yet → passing INFO with the committee note", () => {
    const courses = [course({ courseId: "W", status: "FAILED", attemptNumber: 1, isMandatory: true })];
    const summary = runRegulationEngine(courses, null);
    const r = summary.results.find((x) => x.ruleId === "PKM-026");
    expect(r?.passed).toBe(true);
    expect(r?.severity).toBe("INFO");
    expect(r?.messageHe).toContain("אישור ועדת-הוראה");
  });

  it("a successfully completed retake clears the advisory", () => {
    const courses = [
      course({ courseId: "V", status: "FAILED", attemptNumber: 1 }),
      course({ courseId: "V", status: "COMPLETED", attemptNumber: 2, grade: 80 }),
    ];
    const summary = runRegulationEngine(courses, null);
    const r = summary.results.find((x) => x.ruleId === "PKM-026");
    expect(r?.passed).toBe(true);
    expect(r?.messageHe).toContain("אין קורסים");
  });

  it("never blocks: two failures belong to PKM-023, not the advisory", () => {
    const courses = [
      course({ courseId: "U", status: "FAILED", attemptNumber: 1 }),
      course({ courseId: "U", status: "FAILED", attemptNumber: 2 }),
    ];
    const summary = runRegulationEngine(courses, null);
    const advisory = summary.results.find((x) => x.ruleId === "PKM-026");
    expect(advisory?.severity).not.toBe("ERROR");
  });
});

describe("PKM-012 English content courses are grade-aware (humanities pass = 70)", () => {
  it("two COMPLETED ENGLISH courses graded 70+ → requirement satisfied", () => {
    const courses = [
      course({ courseType: "ENGLISH", status: "COMPLETED", grade: 70, credits: 3 }),
      course({ courseType: "ENGLISH", status: "COMPLETED", grade: 88, credits: 3 }),
    ];
    const summary = runRegulationEngine(courses, null);
    const pkm012 = summary.results.find((r) => r.ruleId === "PKM-012");
    expect(pkm012?.passed).toBe(true);
    expect(pkm012?.details?.currentCourses).toBe(2);
  });

  it("one of the two graded 65 (below 70) → NOT satisfied; failed course does not count", () => {
    const courses = [
      course({ courseType: "ENGLISH", status: "COMPLETED", grade: 88, credits: 3 }),
      course({ courseType: "ENGLISH", status: "COMPLETED", grade: 65, credits: 3 }),
    ];
    const summary = runRegulationEngine(courses, null);
    const pkm012 = summary.results.find((r) => r.ruleId === "PKM-012");
    expect(pkm012?.passed).toBe(false);
    // Only the 88 course counts; the sub-70 course is excluded from the count.
    expect(pkm012?.details?.currentCourses).toBe(1);
  });

  it("two PLANNED / ungraded ENGLISH courses → still on-track (satisfied, not penalized)", () => {
    const courses = [
      course({ courseType: "ENGLISH", status: "PLANNED", grade: null, credits: 3 }),
      course({ courseType: "ENGLISH", status: "PLANNED", grade: null, credits: 3 }),
    ];
    const summary = runRegulationEngine(courses, null);
    const pkm012 = summary.results.find((r) => r.ruleId === "PKM-012");
    expect(pkm012?.passed).toBe(true);
    expect(pkm012?.details?.currentCourses).toBe(2);
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

describe("PKM-016 year-1→2 BLOCKING gate — English excluded + retakes collapsed (data-audit 22.7)", () => {
  const pkm016 = (courses: UserCourseWithCourse[]) =>
    runRegulationEngine(courses, "ECONOMICS" as never).results.find((r) => r.ruleId === "PKM-016");

  it("does NOT let a year-1 English grade pollute the blocking average", () => {
    // Philosophy 78 (3 ש״ס) + English 60 (3 ש״ס). English is out of EVERY degree
    // average (iron rule) → the gate must read 78 (pass), not (78·3+60·3)/6 = 69 (block).
    const r = pkm016([
      course({ grade: 78, credits: 3, courseType: "MANDATORY" }),
      course({ grade: 60, credits: 3, courseType: "ENGLISH" }),
    ]);
    expect((r?.details as { courseAverage: number }).courseAverage).toBe(78);
    expect(r?.passed).toBe(true);
  });

  it("collapses a grade-improvement retake to the DETERMINING sitting in the gate", () => {
    // MICRO retaken 50→85 (both year-1, 4 ש״ס). Must read 85 (last sitting), not
    // (50·4+85·4)/8 = 67.5 which would falsely block continuation.
    const r = pkm016([
      course({ courseId: "MICRO", grade: 50, credits: 4, attemptNumber: 1, courseType: "MANDATORY" }),
      course({ courseId: "MICRO", grade: 85, credits: 4, attemptNumber: 2, courseType: "MANDATORY" }),
    ]);
    expect((r?.details as { courseAverage: number }).courseAverage).toBe(85);
    expect(r?.passed).toBe(true);
  });

  it("year-2+ → retrospective INFO; still-year-1 → early WARNING, never a present-tense ERROR block (audit 22.7 + launch 24.7)", () => {
    // Year-1 average 68 (below 75). Someone in year 2 has already advanced — the
    // gate is non-blocking INFO (retrospective). A student STILL in year 1 hasn't
    // finished it, so it's an early WARNING (improvable), NOT a red "continuation
    // blocked" ERROR on a mid-year student.
    const weak = [course({ grade: 68, credits: 4, courseType: "MANDATORY" })];
    const y2 = runRegulationEngine(weak, "ECONOMICS" as never, 0, undefined, {
      academicYear: 2,
    } as never).results.find((r) => r.ruleId === "PKM-016");
    expect(y2?.severity).toBe("INFO");
    expect(y2?.passed).toBe(true);

    const y1 = runRegulationEngine(weak, "ECONOMICS" as never, 0, undefined, {
      academicYear: 1,
    } as never).results.find((r) => r.ruleId === "PKM-016");
    expect(y1?.severity).toBe("WARNING");
    expect(y1?.passed).toBe(false);
  });
});
