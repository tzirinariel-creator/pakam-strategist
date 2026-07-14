import { describe, it, expect } from "vitest";
import {
  deriveGroupFromDays,
  deriveCurrentGroup,
  computeCreditExemption,
  binaryDegreeCap,
  binaryCapRemaining,
  hasMiluimBinaryBenefit,
  honorsBinaryPercent,
  honorsBinaryStatus,
  getCurrentAcademicYear,
  type MiluimSemesterLike,
} from "@/lib/miluim";
import { calculateCredits } from "@/lib/credit-calculator";
import { runRegulationEngine } from "@/lib/regulations/rule-engine";
import { MILUIM_CONFIG } from "@/lib/constants";
import type { UserCourseWithCourse } from "@/types/degree";

// ───────────────────────────────────────────────────────────────────
// Minimal course fixture (same approach as rule-engine.test.ts)
// ───────────────────────────────────────────────────────────────────
let seq = 0;
function course(over: {
  credits?: number;
  discipline?: string;
  courseType?: string;
  status?: string;
  grade?: number | null;
  weeklyHours?: number | null;
  plannedYear?: number;
}): UserCourseWithCourse {
  seq += 1;
  const courseId = `c-${seq}`;
  return {
    id: `uc-${seq}`,
    courseId,
    status: over.status ?? "COMPLETED",
    grade: over.grade ?? 85,
    submissionType: null,
    submissionGrade: null,
    attemptNumber: 1,
    plannedYear: over.plannedYear ?? 1,
    disciplineOverride: null,
    course: {
      id: courseId,
      code: `000${seq}`,
      nameHe: "קורס",
      nameEn: "Course",
      discipline: over.discipline ?? "ECONOMICS",
      courseType: over.courseType ?? "ELECTIVE",
      credits: over.credits ?? 3,
      weeklyHours: over.weeklyHours ?? null,
    },
  } as unknown as UserCourseWithCourse;
}

// ───────────────────────────────────────────────────────────────────
// deriveGroupFromDays — mirrors the onboarding thresholds
// ───────────────────────────────────────────────────────────────────
describe("deriveGroupFromDays", () => {
  it("regular reservist: 0 → NONE, 1–20 → A, 21–34 → B, 35+ → C", () => {
    expect(deriveGroupFromDays(0, false)).toBe("NONE");
    expect(deriveGroupFromDays(10, false)).toBe("GROUP_A");
    expect(deriveGroupFromDays(20, false)).toBe("GROUP_A");
    expect(deriveGroupFromDays(21, false)).toBe("GROUP_B");
    expect(deriveGroupFromDays(34, false)).toBe("GROUP_B");
    expect(deriveGroupFromDays(35, false)).toBe("GROUP_C");
  });

  it("combat (ייעוד קדמי): enhanced mapping — 14–20 → B, 21+ → C", () => {
    expect(deriveGroupFromDays(0, true)).toBe("NONE");
    expect(deriveGroupFromDays(10, true)).toBe("GROUP_A");
    expect(deriveGroupFromDays(14, true)).toBe("GROUP_B");
    expect(deriveGroupFromDays(21, true)).toBe("GROUP_C");
  });
});

// ───────────────────────────────────────────────────────────────────
// deriveCurrentGroup — current-semester row else fallback
// ───────────────────────────────────────────────────────────────────
describe("deriveCurrentGroup", () => {
  const rows: MiluimSemesterLike[] = [
    { academicYear: 2025, semester: "FALL", daysServed: 25, isCombat: false, derivedGroup: "GROUP_B" },
    { academicYear: 2025, semester: "SPRING", daysServed: 40, isCombat: false, derivedGroup: "GROUP_C" },
  ];

  it("returns the current academic-year+semester row's derivedGroup", () => {
    expect(
      deriveCurrentGroup(rows, "NONE", { academicYear: 2025, semester: "SPRING" })
    ).toBe("GROUP_C");
  });

  it("falls back to user.miluimGroup when no rows exist (preserves old behavior)", () => {
    expect(deriveCurrentGroup([], "GROUP_A", { academicYear: 2025, semester: "FALL" })).toBe(
      "GROUP_A"
    );
  });

  it("falls back to user.miluimGroup when no row matches the current semester", () => {
    expect(
      deriveCurrentGroup(rows, "GROUP_A", { academicYear: 2099, semester: "FALL" })
    ).toBe("GROUP_A");
  });

  it("folds a SUMMER currentSemester onto SPRING so it still resolves (fix E)", () => {
    // Student flagged SUMMER, but only a SPRING row exists for that year.
    expect(
      deriveCurrentGroup(rows, "NONE", { academicYear: 2025, semester: "SUMMER" })
    ).toBe("GROUP_C"); // matches the 2025 SPRING row
  });
});

// ───────────────────────────────────────────────────────────────────
// getCurrentAcademicYear — Oct-start calendar-year key (fix A)
// ───────────────────────────────────────────────────────────────────
describe("getCurrentAcademicYear", () => {
  it("Oct–Dec map to that calendar year (academic year start)", () => {
    expect(getCurrentAcademicYear(new Date("2025-10-15"))).toBe(2025);
    expect(getCurrentAcademicYear(new Date("2025-12-31"))).toBe(2025);
  });

  it("Jan–Sep map to the PREVIOUS calendar year (same academic year)", () => {
    expect(getCurrentAcademicYear(new Date("2026-01-01"))).toBe(2025);
    expect(getCurrentAcademicYear(new Date("2026-03-10"))).toBe(2025);
    expect(getCurrentAcademicYear(new Date("2026-09-30"))).toBe(2025);
  });

  it("a FALL semester and the SPRING that follows share ONE academic year", () => {
    // Nov 2025 (fall term) and Mar 2026 (spring term) are the same תשפ"ו year.
    const fall = getCurrentAcademicYear(new Date("2025-11-20"));
    const spring = getCurrentAcademicYear(new Date("2026-03-20"));
    expect(fall).toBe(spring);
    expect(fall).toBe(2025);
  });
});

// ───────────────────────────────────────────────────────────────────
// REAL resolution: a currentYear=2 student now resolves the per-semester
// group instead of silently falling back to the stored miluimGroup (fix A).
// Reproduces the production bug: rows are keyed by getCurrentAcademicYear()
// (~2025), but the read path used to pass academicYear=user.currentYear (1–4),
// which never matched → always fell back to miluimGroup.
// ───────────────────────────────────────────────────────────────────
describe("per-semester resolution with the real academic-year key (fix A)", () => {
  it("currentYear=2 student: row for getCurrentAcademicYear()+semester wins over stored miluimGroup", () => {
    const academicYear = getCurrentAcademicYear(); // e.g. 2025 — NOT the student's standing (2)
    const currentSemester = "FALL" as const;

    // A real per-semester row whose derivedGroup differs from the stored group.
    const semesters: MiluimSemesterLike[] = [
      {
        academicYear,
        semester: currentSemester,
        daysServed: 40,
        isCombat: false,
        derivedGroup: "GROUP_C", // 40 days → C
      },
    ];
    const storedMiluimGroup = "GROUP_A"; // stale single-group fallback

    // OLD (broken) read path: academicYear = user.currentYear = 2 → never
    // matches the 2025 row → falls back to GROUP_A.
    const oldResolved = deriveCurrentGroup(semesters, storedMiluimGroup, {
      academicYear: 2, // academic STANDING, the bug
      semester: currentSemester,
    });
    expect(oldResolved).toBe("GROUP_A"); // demonstrates the dead resolution

    // NEW (fixed) read path: academicYear = getCurrentAcademicYear().
    const resolved = deriveCurrentGroup(semesters, storedMiluimGroup, {
      academicYear: getCurrentAcademicYear(),
      semester: currentSemester,
    });
    expect(resolved).toBe("GROUP_C"); // per-semester group is now used
    expect(resolved).not.toBe(storedMiluimGroup);

    // And it actually drives the exemption (C = 8, vs A = 2 under the old bug).
    expect(computeCreditExemption(resolved, 0)).toBe(8);
  });
});

// ───────────────────────────────────────────────────────────────────
// computeCreditExemption — clamp(min(rate, cap − used), >= 0)
// ───────────────────────────────────────────────────────────────────
describe("computeCreditExemption", () => {
  it("NONE / null → 0", () => {
    expect(computeCreditExemption(null)).toBe(0);
    expect(computeCreditExemption("NONE")).toBe(0);
  });

  it("with 0 used, equals min(group rate, 10) — identical to the OLD inline math", () => {
    // B = 6, C = 8, A = 2, G = 3 — all under the 10 degree cap.
    expect(computeCreditExemption("GROUP_A", 0)).toBe(2);
    expect(computeCreditExemption("GROUP_B", 0)).toBe(6);
    expect(computeCreditExemption("GROUP_C", 0)).toBe(8);
    expect(computeCreditExemption("GROUP_G", 0)).toBe(3);
  });

  it("clamps against the per-degree remaining cap (never over-grants)", () => {
    // 7 already used → only 3 of the degree's 10 remain, so C's 8 is clamped to 3.
    expect(computeCreditExemption("GROUP_C", 7)).toBe(3);
    // Fully used → 0 remaining.
    expect(computeCreditExemption("GROUP_C", 10)).toBe(0);
    // Over-used (defensive) → never negative.
    expect(computeCreditExemption("GROUP_C", 99)).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────
// binary helpers
// ───────────────────────────────────────────────────────────────────
describe("binary cap helpers", () => {
  it("binaryDegreeCap defaults to the BA cap (5)", () => {
    expect(binaryDegreeCap()).toBe(5);
    expect(binaryDegreeCap("NONE")).toBe(5);
    expect(binaryDegreeCap("GROUP_B")).toBe(5);
  });

  it("binaryCapRemaining = cap − used, floored at 0", () => {
    expect(binaryCapRemaining(0)).toBe(5);
    expect(binaryCapRemaining(3)).toBe(2);
    expect(binaryCapRemaining(5)).toBe(0);
    expect(binaryCapRemaining(8)).toBe(0);
  });

  it("honors percent is the configured EXCELLENCE_MAX_PERCENT (25)", () => {
    expect(honorsBinaryPercent()).toBe(MILUIM_CONFIG.BINARY_GRADE.EXCELLENCE_MAX_PERCENT);
    expect(honorsBinaryStatus(0, 0).over).toBe(false); // zero-hour year never "over"
    expect(honorsBinaryStatus(30, 100).over).toBe(true); // 30% > 25%
    expect(honorsBinaryStatus(20, 100).over).toBe(false); // 20% ≤ 25%
  });
});

// ───────────────────────────────────────────────────────────────────
// PARITY: no MiluimSemester rows → IDENTICAL effectiveTotal as today
// ───────────────────────────────────────────────────────────────────
describe("PARITY — no per-semester data reproduces the old numbers exactly", () => {
  it("Group B reservist, 0 used: new path gives the same effectiveTotal as the old inline math", () => {
    const courses = [course({ credits: 50 }), course({ credits: 50 })]; // 100 total

    // OLD behavior: min(group rate, MAX) with no degree-cap-used accounting.
    const oldExemption = Math.min(
      MILUIM_CONFIG.GROUPS.GROUP_B.creditExemptionPerYear,
      MILUIM_CONFIG.MAX_CREDIT_EXEMPTIONS_DEGREE
    );

    // NEW path: deriveCurrentGroup falls back to user.miluimGroup (no rows),
    // computeCreditExemption with miluimCreditsUsed = 0.
    const group = deriveCurrentGroup([], "GROUP_B", { academicYear: 2025, semester: "FALL" });
    const newExemption = computeCreditExemption(group, 0);

    expect(newExemption).toBe(oldExemption);

    const oldCalc = calculateCredits(courses, null, oldExemption);
    const newCalc = calculateCredits(courses, null, newExemption);
    expect(newCalc.breakdown.effectiveTotal).toBe(oldCalc.breakdown.effectiveTotal);
    expect(newCalc.breakdown.effectiveTotal).toBe(100 + oldExemption);
  });

  it("NONE group, no rows: exemption is 0 and effectiveTotal equals raw total", () => {
    const courses = [course({ credits: 30 })];
    const group = deriveCurrentGroup([], "NONE");
    const exemption = computeCreditExemption(group, 0);
    expect(exemption).toBe(0);
    const calc = calculateCredits(courses, null, exemption);
    expect(calc.breakdown.effectiveTotal).toBe(calc.breakdown.total);
  });
});

// ───────────────────────────────────────────────────────────────────
// PKM-024 — binary degree cap (WARNING when over, never ERROR)
// ───────────────────────────────────────────────────────────────────
describe("PKM-024 — binary conversion cap (non-blocking)", () => {
  it("over the BA cap of 5 → WARNING (not ERROR), passed=false", () => {
    const summary = runRegulationEngine([], null, 0, undefined, {
      miluimGroup: "GROUP_C",
      miluimBinaryUsed: 6, // > cap 5
    });
    const r = summary.results.find((x) => x.ruleId === "PKM-024");
    expect(r).toBeDefined();
    expect(r?.passed).toBe(false);
    expect(r?.severity).toBe("WARNING");
    expect(r?.severity).not.toBe("ERROR");
    expect(r?.details?.over).toBe(true);
  });

  it("within the cap → INFO, passed=true, with remaining count", () => {
    const summary = runRegulationEngine([], null, 0, undefined, {
      miluimGroup: "GROUP_B",
      miluimBinaryUsed: 2,
    });
    const r = summary.results.find((x) => x.ruleId === "PKM-024");
    expect(r?.passed).toBe(true);
    expect(r?.severity).toBe("INFO");
    expect(r?.details?.remaining).toBe(3);
  });

  it("never produces an ERROR even when massively over the cap (does not block)", () => {
    const summary = runRegulationEngine([], null, 0, undefined, {
      miluimGroup: "GROUP_C",
      miluimBinaryUsed: 99,
    });
    const r = summary.results.find((x) => x.ruleId === "PKM-024");
    expect(r?.severity).not.toBe("ERROR");
    // And the overall engine reports no failures attributable to this rule.
    expect(summary.results.filter((x) => x.severity === "ERROR" && x.ruleId === "PKM-024")).toHaveLength(0);
  });
});

// ───────────────────────────────────────────────────────────────────
// PKM-025 — honors 25% binary cap (WARNING when heavy, never ERROR)
// ───────────────────────────────────────────────────────────────────
describe("PKM-025 — honors 25% binary cap (non-blocking)", () => {
  it("heavy-binary year (hours far above 25%) → WARNING, never ERROR", () => {
    // 4 courses × 3 weekly hours = 12 total hours for year 1.
    // miluimBinaryUsed = 3 → est. binary hours = 3 × avg(3) = 9 → 75% > 25%.
    const courses = [
      course({ weeklyHours: 3, plannedYear: 1 }),
      course({ weeklyHours: 3, plannedYear: 1 }),
      course({ weeklyHours: 3, plannedYear: 1 }),
      course({ weeklyHours: 3, plannedYear: 1 }),
    ];
    const summary = runRegulationEngine(courses, null, 0, undefined, {
      academicYear: 1,
      miluimGroup: "GROUP_C",
      miluimBinaryUsed: 3,
    });
    const r = summary.results.find((x) => x.ruleId === "PKM-025");
    expect(r).toBeDefined();
    expect(r?.passed).toBe(false);
    expect(r?.severity).toBe("WARNING");
    expect(r?.severity).not.toBe("ERROR");
    expect(r?.details?.over).toBe(true);
  });

  it("no binary conversions → INFO, passed=true (neutral)", () => {
    const courses = [course({ weeklyHours: 3, plannedYear: 1 })];
    const summary = runRegulationEngine(courses, null, 0, undefined, {
      academicYear: 1,
      miluimGroup: "GROUP_C",
      miluimBinaryUsed: 0,
    });
    const r = summary.results.find((x) => x.ruleId === "PKM-025");
    expect(r?.passed).toBe(true);
    expect(r?.severity).toBe("INFO");
  });

  it("a light-binary year stays within the 25% cap → INFO/passed", () => {
    // 10 courses × 3h = 30h; 1 binary × avg(3) = 3h → 10% ≤ 25%.
    const courses = Array.from({ length: 10 }, () =>
      course({ weeklyHours: 3, plannedYear: 1 })
    );
    const summary = runRegulationEngine(courses, null, 0, undefined, {
      academicYear: 1,
      miluimGroup: "GROUP_B",
      miluimBinaryUsed: 1,
    });
    const r = summary.results.find((x) => x.ruleId === "PKM-025");
    expect(r?.passed).toBe(true);
    expect(r?.severity).toBe("INFO");
  });
});

// ───────────────────────────────────────────────────────────────────
// Neither new rule blocks graduation / the year gate
// ───────────────────────────────────────────────────────────────────
describe("new miluim rules never block (no ERROR severity)", () => {
  it("PKM-024 and PKM-025 are WARNING/INFO only across extreme inputs", () => {
    const courses = [course({ weeklyHours: 3, plannedYear: 1 })];
    const summary = runRegulationEngine(courses, null, 0, undefined, {
      academicYear: 1,
      miluimGroup: "GROUP_C",
      miluimBinaryUsed: 50,
    });
    for (const id of ["PKM-024", "PKM-025"]) {
      const r = summary.results.find((x) => x.ruleId === id);
      expect(["WARNING", "INFO"]).toContain(r?.severity);
    }
  });
});

describe("hasMiluimBinaryBenefit — the single binary-eligibility gate (verification 4.7)", () => {
  it("grants the binary benefit only to groups B and C", () => {
    expect(hasMiluimBinaryBenefit("GROUP_B")).toBe(true);
    expect(hasMiluimBinaryBenefit("GROUP_C")).toBe(true);
  });
  it("denies it to A and NONE; G HAS it (credit-denominated, 6 ש״ס per the מתווה — corrected 14.7)", () => {
    // The 4.7 version of this test denied G too — that matched the config's
    // wrong 0, not the domain doc (pakam-domain-rules-2026 §Layer-B: G
    // converts up to 6 CREDITS to binary). The gate now says yes for G, and
    // course-count surfaces read binaryBenefitOf().unit before showing numbers.
    expect(hasMiluimBinaryBenefit("GROUP_A")).toBe(false);
    expect(hasMiluimBinaryBenefit("GROUP_G")).toBe(true);
    expect(hasMiluimBinaryBenefit("NONE")).toBe(false);
    expect(hasMiluimBinaryBenefit(null)).toBe(false);
  });
});

// #18 (12.7) — auto-derived entitlement from recorded semesters
import { deriveExemptionEntitlement, bestGroupOf, binaryBenefitOf } from "@/lib/miluim";

describe("deriveExemptionEntitlement (#18)", () => {
  const row = (academicYear: number, semester: string, daysServed: number, derivedGroup: string) =>
    ({ academicYear, semester, daysServed, isCombat: false, derivedGroup });

  it("group C in both semesters of one year = 8 (per-year, not per-semester)", () => {
    const r = deriveExemptionEntitlement([
      row(2025, "FALL", 100, "GROUP_C"),
      row(2025, "SPRING", 100, "GROUP_C"),
    ]);
    expect(r.total).toBe(8);
    expect(r.perYear).toHaveLength(1);
  });

  it("C in year 1 + C in year 2 caps at the degree max (10, not 16)", () => {
    const r = deriveExemptionEntitlement([
      row(2025, "FALL", 100, "GROUP_C"),
      row(2026, "FALL", 40, "GROUP_C"),
    ]);
    expect(r.total).toBe(10);
  });

  it("the year's BEST group wins when semesters differ", () => {
    expect(bestGroupOf([row(2025, "FALL", 10, "GROUP_A"), row(2025, "SPRING", 40, "GROUP_C")])).toBe("GROUP_C");
  });

  it("no rows → zero entitlement", () => {
    expect(deriveExemptionEntitlement([]).total).toBe(0);
  });
});

// ── 14.7 — the two-engines unification + G's credit-denominated benefit ──
describe("deriveExemptionEntitlement — fallback group materialization (verify 14.7)", () => {
  it("a manual group with NO recorded semesters counts for the CURRENT year only", () => {
    const e = deriveExemptionEntitlement([], "GROUP_C", 2025);
    expect(e.total).toBe(8); // C = 8/year, one year — never invents past years
    expect(e.perYear).toEqual([{ academicYear: 2025, group: "GROUP_C", credits: 8 }]);
  });

  it("a recorded row for the current year WINS over the fallback", () => {
    const rows = [
      { academicYear: 2025, semester: "FALL", daysServed: 25, isCombat: false, derivedGroup: "GROUP_B" },
    ] as never[];
    const e = deriveExemptionEntitlement(rows, "GROUP_C", 2025);
    expect(e.perYear).toHaveLength(1);
    expect(e.perYear[0]!.group).toBe("GROUP_B"); // the real row, not the fallback
    expect(e.total).toBe(6);
  });

  it("no fallback and no rows → honest 0", () => {
    const e = deriveExemptionEntitlement([], "NONE", 2025);
    expect(e.total).toBe(0);
    expect(e.perYear).toEqual([]);
  });
});

describe("binaryBenefitOf — each group's own unit (domain doc §Layer-B)", () => {
  it("B/C are course-denominated with the degree cap", () => {
    expect(binaryBenefitOf("GROUP_B")).toEqual({ unit: "courses", degreeCap: 5 });
    expect(binaryBenefitOf("GROUP_C")).toEqual({ unit: "courses", degreeCap: 5 });
  });

  it("G is CREDIT-denominated — עד 6 ש״ס (was falsely 'no benefit' before 14.7)", () => {
    expect(binaryBenefitOf("GROUP_G")).toEqual({ unit: "credits", degreeCap: 6 });
    expect(hasMiluimBinaryBenefit("GROUP_G")).toBe(true);
  });

  it("A and NONE have no binary benefit", () => {
    expect(binaryBenefitOf("GROUP_A")).toBeNull();
    expect(binaryBenefitOf("NONE")).toBeNull();
    expect(hasMiluimBinaryBenefit("GROUP_A")).toBe(false);
  });
});
