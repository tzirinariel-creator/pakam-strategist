// regulation.checkCompliance — locks the INPUT-ASSEMBLY wiring of the router.
//
// The procedure fetches the user's courses + per-semester miluim rows (via the
// request loaders that createRequestLoaders(ctx.db) builds when ctx.loaders is
// undefined), then assembles the engine inputs:
//   • the CURRENT miluim group   — deriveCurrentGroup(rows, user.miluimGroup, now)
//   • the credit exemption        — computeCreditExemption(currentGroup, used)
//   • the declared English signal — user.amiramScore / user.englishLevel
//   • the calendar-derived standing — deriveYearOfStudy(...) + getAcademicNow()
// and merges courseCount onto the summary. runRegulationEngine runs for REAL
// here (never mocked) so the asserted rule numbers are the true engine output.
//
// The suite pins TZ=Asia/Jerusalem. We never hard-code "today": every place the
// router reads the real clock, the test re-derives the same value from the SAME
// real helpers (getCurrentAcademicYear / getAcademicNow / deriveYearOfStudy), so
// the assertions are deterministic no matter when they run.

import { describe, it, expect } from "vitest";
import { createCallerFactory } from "@/server/trpc/init";
import { regulationRouter } from "@/server/routers/regulation";
import { runRegulationEngine } from "@/lib/regulations/rule-engine";
import {
  deriveCurrentGroup,
  computeCreditExemption,
  getCurrentAcademicYear,
} from "@/lib/miluim";
import { getAcademicNow, deriveYearOfStudy } from "@/lib/academic-calendar";
import type { Course, UserCourseWithCourse } from "@/types/degree";
import type { RegulationSummary, RegulationResult } from "@/types/regulation";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface FakeUser {
  id: string;
  supabaseId: string;
  email: string;
  focusArea: string | null;
  miluimGroup: string;
  miluimCreditsUsed: number;
  miluimBinaryUsed: number;
  amiramScore: number | null;
  englishLevel: string | null;
  startYear: number | null;
  currentYear: number | null;
}

const BASE_USER: FakeUser = {
  id: "user-reg-1",
  supabaseId: "sb-reg-1",
  email: "student@example.com",
  focusArea: "PHILOSOPHY",
  miluimGroup: "NONE",
  miluimCreditsUsed: 0,
  miluimBinaryUsed: 0,
  amiramScore: null,
  englishLevel: null,
  startYear: 2025,
  currentYear: 1,
};

function makeCourse(o: Partial<Course> & Pick<Course, "code">): Course {
  return {
    id: o.id ?? `course-${o.code}`,
    code: o.code,
    nameHe: o.nameHe ?? "קורס בדיקה",
    nameEn: o.nameEn ?? "Test Course",
    discipline: o.discipline ?? "PHILOSOPHY",
    courseType: o.courseType ?? "ELECTIVE",
    credits: o.credits ?? 4,
    yearOffered: o.yearOffered ?? [1],
    semesterOffered: o.semesterOffered ?? ["FALL"],
    prerequisites: o.prerequisites ?? [],
    canCountAs: o.canCountAs ?? [],
    description: o.description ?? null,
    isMandatory: o.isMandatory ?? false,
    submissionType: o.submissionType ?? "EXAM",
    weeklyHours: o.weeklyHours ?? 4,
    examDateA: o.examDateA ?? null,
    examDateB: o.examDateB ?? null,
    averageGrade: o.averageGrade ?? null,
    difficultyLevel: o.difficultyLevel ?? null,
    failRate: o.failRate ?? null,
    gradeDataYear: o.gradeDataYear ?? null,
    medianGrade: o.medianGrade ?? null,
    gradeStdDev: o.gradeStdDev ?? null,
    gradeDataSource: o.gradeDataSource ?? null,
  };
}

function makeUC(
  o: Partial<UserCourseWithCourse> & Pick<UserCourseWithCourse, "id" | "course">,
): UserCourseWithCourse {
  return {
    id: o.id,
    userId: BASE_USER.id,
    courseId: o.courseId ?? o.course.id,
    status: o.status ?? "COMPLETED",
    grade: o.grade ?? null,
    plannedYear: o.plannedYear ?? 1,
    plannedSemester: o.plannedSemester ?? "FALL",
    attemptNumber: o.attemptNumber ?? 1,
    isGradeImproved: o.isGradeImproved ?? false,
    isBinary: o.isBinary ?? false,
    disciplineOverride: o.disciplineOverride ?? null,
    submissionType: o.submissionType ?? null,
    submissionGrade: o.submissionGrade ?? null,
    notes: o.notes ?? null,
    course: o.course,
  };
}

// A small, real plan: two COMPLETED courses, 5 ש״ס each → 10 countable credits.
function smallPlan(): UserCourseWithCourse[] {
  return [
    makeUC({
      id: "uc-phil",
      grade: 90,
      status: "COMPLETED",
      plannedYear: 1,
      course: makeCourse({
        code: "0618-1101",
        discipline: "PHILOSOPHY",
        courseType: "MANDATORY",
        isMandatory: true,
        credits: 5,
        weeklyHours: 4,
      }),
    }),
    makeUC({
      id: "uc-econ",
      grade: 80,
      status: "COMPLETED",
      plannedYear: 1,
      course: makeCourse({
        code: "0611-1200",
        discipline: "ECONOMICS",
        courseType: "ELECTIVE",
        isMandatory: false,
        credits: 5,
        weeklyHours: 4,
      }),
    }),
  ];
}

interface MiluimRow {
  academicYear: number;
  semester: string;
  daysServed: number;
  isCombat: boolean;
  derivedGroup: string;
}

// A per-semester row for the CURRENT academic year+semester (re-derived from the
// same real helpers the router uses), so it deterministically matches "now".
function currentSemesterRow(derivedGroup: string): MiluimRow {
  return {
    academicYear: getCurrentAcademicYear(),
    semester: getAcademicNow().semester,
    daysServed: 40,
    isCombat: false,
    derivedGroup,
  };
}

function makeDb(opts: {
  user: FakeUser;
  courses: UserCourseWithCourse[];
  miluimRows: MiluimRow[];
}) {
  return {
    user: { findUnique: async () => opts.user },
    userCourse: { findMany: async () => opts.courses },
    miluimSemester: { findMany: async () => opts.miluimRows },
  };
}

function makeCaller(db: ReturnType<typeof makeDb>, user: FakeUser) {
  const createCaller = createCallerFactory(regulationRouter);
  return createCaller({
    db: db as never,
    userId: user.supabaseId,
    session: { user: { id: user.supabaseId } } as never,
    supabase: {} as never,
    headers: new Headers(),
    loaders: undefined,
  });
}

function ruleById(summary: RegulationSummary, id: string): RegulationResult {
  const r = summary.results.find((x) => x.ruleId === id);
  if (!r) throw new Error(`rule ${id} not found in summary`);
  return r;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("regulation.checkCompliance — input-assembly wiring", () => {
  it("assembles current-group + exemption + english + standing into the REAL engine, and merges courseCount", async () => {
    const courses = smallPlan();
    // Per-semester GROUP_C row for NOW, while the stored fallback is NONE — the
    // CURRENT group (from the row) must win over user.miluimGroup.
    const miluimRows = [currentSemesterRow("GROUP_C")];
    const user: FakeUser = {
      ...BASE_USER,
      miluimGroup: "NONE",
      miluimCreditsUsed: 0,
      miluimBinaryUsed: 2,
    };

    const caller = makeCaller(makeDb({ user, courses, miluimRows }), user);
    const summary = await caller.checkCompliance();

    // ---- Independently assemble what the engine SHOULD receive (the spec) ----
    const currentGroup = deriveCurrentGroup(miluimRows as never, user.miluimGroup as never, {
      academicYear: getCurrentAcademicYear(),
      semester: getAcademicNow().semester,
    });
    expect(currentGroup).toBe("GROUP_C"); // the per-semester row won, not NONE

    const exemption = computeCreditExemption(currentGroup, user.miluimCreditsUsed);
    expect(exemption).toBe(8); // GROUP_C grants 8 ש״ס, uncapped at used=0

    const oracle = runRegulationEngine(courses, user.focusArea, exemption, undefined, {
      amirantScore: user.amiramScore,
      englishLevel: user.englishLevel,
      academicYear: deriveYearOfStudy(user.startYear, user.currentYear ?? 1),
      currentSemester: getAcademicNow().semester,
      miluimGroup: currentGroup,
      miluimBinaryUsed: user.miluimBinaryUsed,
      miluimCreditsUsed: user.miluimCreditsUsed,
    });

    // The router's rule results must be byte-identical to the independent run —
    // proving every threaded input (group, exemption, english, standing) matches.
    expect(summary.results).toEqual(oracle.results);

    // courseCount is merged by the router (it is NOT part of the engine summary).
    expect(summary.courseCount).toBe(courses.length);
    expect(summary.courseCount).toBe(2);
    expect(oracle).not.toHaveProperty("courseCount");

    // ---- Guard: the wiring is NON-vacuous — the WRONG assembly diverges. ----
    const wrong = runRegulationEngine(courses, user.focusArea, 0, undefined, {
      amirantScore: null,
      englishLevel: null,
      academicYear: undefined,
      currentSemester: undefined,
      miluimGroup: "NONE",
      miluimBinaryUsed: 0,
      miluimCreditsUsed: 0,
    });
    expect(summary.results).not.toEqual(wrong.results);
  });

  it("threads the credit-exemption so PKM-001 counts effectiveTotal (total + exemption)", async () => {
    const courses = smallPlan();
    const miluimRows = [currentSemesterRow("GROUP_C")]; // exemption 8
    const user: FakeUser = { ...BASE_USER, miluimGroup: "NONE", miluimCreditsUsed: 0 };

    const caller = makeCaller(makeDb({ user, courses, miluimRows }), user);
    const summary = await caller.checkCompliance();

    // Plain total (exemption 0) straight from the engine — no hard-coded number.
    const plain = runRegulationEngine(courses, user.focusArea, 0);
    const plainTotal = ruleById(plain, "PKM-001").details!.current as number;

    const pkm001 = ruleById(summary, "PKM-001");
    expect(pkm001.details!.required).toBe(150); // PPE program total
    expect(pkm001.details!.current).toBe(plainTotal + 8); // exemption threaded
    expect(pkm001.details!.current).toBe(18); // 10 countable + 8 exemption
  });

  it("threads the CURRENT miluim group into the binary-cap rule with real numbers", async () => {
    const courses = smallPlan();
    const miluimRows = [currentSemesterRow("GROUP_C")];
    const user: FakeUser = {
      ...BASE_USER,
      miluimGroup: "NONE",
      miluimBinaryUsed: 2,
    };

    const caller = makeCaller(makeDb({ user, courses, miluimRows }), user);
    const summary = await caller.checkCompliance();

    const pkm024 = ruleById(summary, "PKM-024");
    expect(pkm024.details!.group).toBe("GROUP_C"); // per-semester row, not NONE
    expect(pkm024.details!.used).toBe(2); // miluimBinaryUsed threaded
    expect(pkm024.details!.cap).toBe(5); // BA degree cap
    expect(pkm024.details!.remaining).toBe(3);
  });

  it("falls back to user.miluimGroup when there are no per-semester rows; threads amiramScore", async () => {
    const courses = smallPlan();
    const user: FakeUser = {
      ...BASE_USER,
      miluimGroup: "GROUP_B", // the stored fallback
      amiramScore: 100, // → Advanced A
      englishLevel: null,
    };

    const caller = makeCaller(makeDb({ user, courses, miluimRows: [] }), user);
    const summary = await caller.checkCompliance();

    // No current-semester row → deriveCurrentGroup returns the stored group.
    expect(ruleById(summary, "PKM-024").details!.group).toBe("GROUP_B");

    // amiramScore is threaded to the English-level rule (echoed + placed).
    const pkm021 = ruleById(summary, "PKM-021");
    expect(pkm021.details!.amirantScore).toBe(100);
    expect(pkm021.details!.level).toBe("ADVANCED_A");
  });

  it("threads a declared englishLevel that OVERRIDES the amiram score", async () => {
    const courses = smallPlan();
    // Score 60 alone would place PRE_BASIC (auto-rejection / ERROR). The declared
    // level must win, keeping PKM-021 a non-blocking INFO at Advanced B.
    const user: FakeUser = {
      ...BASE_USER,
      amiramScore: 60,
      englishLevel: "ADVANCED_B",
    };

    const caller = makeCaller(makeDb({ user, courses, miluimRows: [] }), user);
    const summary = await caller.checkCompliance();

    const pkm021 = ruleById(summary, "PKM-021");
    expect(pkm021.details!.level).toBe("ADVANCED_B"); // declared level wins
    expect(pkm021.details!.isRejected).toBe(false);
    expect(pkm021.passed).toBe(true); // NOT the ERROR the raw score would give
  });

  it("surfaces an engine input error as an honest error, not a silent partial", async () => {
    const courses = smallPlan();
    // A malformed row (missing its embedded course) makes the REAL engine throw
    // while computing credits. The router must reject, never return a partial
    // summary that hides the failure.
    const broken = [
      ...courses,
      {
        id: "uc-broken",
        userId: BASE_USER.id,
        courseId: "course-missing",
        status: "COMPLETED",
        grade: null,
        plannedYear: 1,
        plannedSemester: "FALL",
        attemptNumber: 1,
        isGradeImproved: false,
        isBinary: false,
        disciplineOverride: null,
        submissionType: null,
        submissionGrade: null,
        notes: null,
        course: null, // <- the input error the engine cannot compute over
      } as unknown as UserCourseWithCourse,
    ];
    const user: FakeUser = { ...BASE_USER };

    const caller = makeCaller(makeDb({ user, courses: broken, miluimRows: [] }), user);

    await expect(caller.checkCompliance()).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
  });
});
