// Pure READ queries of scheduleRouter, exercised through the REAL tRPC caller
// against a fake Prisma. Covers the two behaviors that shipped as bug fixes:
//   getExamSchedule — #35 de-dupe a retake to ONE row (latest attempt), drop
//     the graded-COMPLETED course from the upcoming board (#33/#8), drop
//     courses with no exam date and sort a null examDateA last.
//   getScheduleForSemester — the selected-group session filter.
// Google-sync procedures are intentionally NOT touched.

import { describe, it, expect } from "vitest";
import { createCallerFactory } from "@/server/trpc/init";
import { scheduleRouter } from "@/server/routers/schedule";

const USER = { id: "user-1", supabaseId: "sb-1", email: "t@example.com" };

function makeCaller(db: unknown) {
  const createCaller = createCallerFactory(scheduleRouter);
  return createCaller({
    db: db as never,
    userId: USER.supabaseId,
    session: { user: { id: USER.supabaseId } } as never,
    supabase: {} as never,
    headers: new Headers(),
    loaders: undefined,
  });
}

// ─── getExamSchedule ────────────────────────────────────────────────

interface ExamCourse {
  code: string;
  nameHe: string;
  discipline: string;
  credits: number;
  courseType: string;
  submissionType: string;
  examDateA: Date | null;
  examDateB: Date | null;
}
interface ExamUC {
  id: string;
  userId: string;
  status: string;
  grade: number | null;
  plannedYear: number;
  plannedSemester: string;
  disciplineOverride: string | null;
  course: ExamCourse;
}
type ExamWhere = {
  userId?: string;
  plannedYear?: number;
  plannedSemester?: string;
  NOT?: { AND?: Array<{ status?: string; grade?: { not?: number | null } }> };
};

function course(over: Partial<ExamCourse> & { code: string }): ExamCourse {
  return {
    nameHe: `קורס ${over.code}`,
    discipline: "כלכלה",
    credits: 4,
    courseType: "CORE",
    submissionType: "EXAM",
    examDateA: null,
    examDateB: null,
    ...over,
  };
}

// Faithfully applies the where-clause getExamSchedule builds, so a
// graded-COMPLETED row is filtered out by the fake DB exactly as production
// Prisma would — the router "excludes" it purely by constructing this where.
function matchesExamWhere(uc: ExamUC, where: ExamWhere): boolean {
  if (where.userId && uc.userId !== where.userId) return false;
  if (where.plannedYear && uc.plannedYear !== where.plannedYear) return false;
  if (where.plannedSemester && uc.plannedSemester !== where.plannedSemester) return false;
  const and = where.NOT?.AND;
  if (and) {
    const allMatch = and.every((cond) => {
      if (cond.status !== undefined) return uc.status === cond.status;
      if (cond.grade !== undefined) return uc.grade !== (cond.grade.not ?? null);
      return false;
    });
    if (allMatch) return false; // NOT (COMPLETED AND graded) → excluded
  }
  return true;
}

function makeExamDb() {
  const recorded: { where?: ExamWhere } = {};
  // Ordered plannedYear asc, as the real query returns them — so the LAST row
  // per course code is the latest attempt.
  const courses: ExamUC[] = [
    // Retake, first (older) attempt — same code as the row below.
    {
      id: "uc-old",
      userId: USER.id,
      status: "FAILED",
      grade: 55,
      plannedYear: 1,
      plannedSemester: "SPRING",
      disciplineOverride: null,
      course: course({ code: "1011-2103", examDateA: new Date("2025-06-01T00:00:00"), examDateB: null }),
    },
    // Retake, latest attempt — should be the ONE surviving row for this code.
    {
      id: "uc-new",
      userId: USER.id,
      status: "PLANNED",
      grade: null,
      plannedYear: 2,
      plannedSemester: "SPRING",
      disciplineOverride: null,
      course: course({ code: "1011-2103", examDateA: new Date("2026-02-10T00:00:00"), examDateB: null }),
    },
    // COMPLETED with a grade → excluded from the upcoming board.
    {
      id: "uc-done",
      userId: USER.id,
      status: "COMPLETED",
      grade: 88,
      plannedYear: 2,
      plannedSemester: "SPRING",
      disciplineOverride: null,
      course: course({ code: "1071-1013", examDateA: new Date("2026-02-05T00:00:00"), examDateB: null }),
    },
    // A middle exam date — kept, sorts between the two below.
    {
      id: "uc-mid",
      userId: USER.id,
      status: "PLANNED",
      grade: null,
      plannedYear: 2,
      plannedSemester: "SPRING",
      disciplineOverride: null,
      course: course({ code: "0303-3333", examDateA: new Date("2026-02-12T00:00:00"), examDateB: null }),
    },
    // No examDateA but has examDateB → kept, but null examDateA sorts LAST.
    {
      id: "uc-onlyB",
      userId: USER.id,
      status: "PLANNED",
      grade: null,
      plannedYear: 2,
      plannedSemester: "SPRING",
      disciplineOverride: null,
      course: course({ code: "0202-2222", examDateA: null, examDateB: new Date("2026-02-15T00:00:00") }),
    },
    // No exam dates at all → dropped entirely.
    {
      id: "uc-noexam",
      userId: USER.id,
      status: "PLANNED",
      grade: null,
      plannedYear: 2,
      plannedSemester: "SPRING",
      disciplineOverride: null,
      course: course({ code: "0000-9999", examDateA: null, examDateB: null }),
    },
  ];
  return {
    recorded,
    user: { findUnique: async () => USER },
    userCourse: {
      findMany: async ({ where }: { where: ExamWhere }) => {
        recorded.where = where;
        return courses.filter((uc) => matchesExamWhere(uc, where));
      },
    },
  };
}

describe("scheduleRouter.getExamSchedule — pure read", () => {
  it("de-dupes a retaken course to ONE row and keeps the LATEST attempt (#35)", async () => {
    const db = makeExamDb();
    const { exams } = await makeCaller(db).getExamSchedule({});

    const retake = exams.filter((e) => e.courseCode === "1011-2103");
    expect(retake).toHaveLength(1); // shown once, not twice
    expect(retake[0]!.userCourseId).toBe("uc-new"); // latest attempt won
    expect(retake[0]!.plannedYear).toBe(2);
    expect(retake[0]!.grade).toBeNull();
    expect(retake[0]!.examDateA).toEqual(new Date("2026-02-10T00:00:00"));
  });

  it("excludes a COMPLETED-with-grade course from the upcoming board (#33/#8)", async () => {
    const db = makeExamDb();
    const { exams } = await makeCaller(db).getExamSchedule({});

    expect(exams.some((e) => e.courseCode === "1071-1013")).toBe(false);
    // The exclusion lives entirely in the where-clause the router builds.
    expect(db.recorded.where?.NOT).toEqual({
      AND: [{ status: "COMPLETED" }, { grade: { not: null } }],
    });
  });

  it("drops courses with no exam date and sorts a null examDateA last", async () => {
    const db = makeExamDb();
    const { exams } = await makeCaller(db).getExamSchedule({});

    // uc-noexam had neither date → not on the board.
    expect(exams.some((e) => e.courseCode === "0000-9999")).toBe(false);

    // Remaining three, ascending by examDateA, the null one pinned last.
    expect(exams.map((e) => e.courseCode)).toEqual(["1011-2103", "0303-3333", "0202-2222"]);
    expect(exams[exams.length - 1]!.examDateA).toBeNull();
  });
});

// ─── getScheduleForSemester (group filter) ──────────────────────────

interface FakeSession {
  id: string;
  courseCode: string;
  sessionType: string;
  groupCode: string;
  semester: string;
  dayOfWeek: string;
  startTime: string;
  course: { code: string; nameHe: string };
}

function makeSemesterDb() {
  const userCourses = [
    {
      id: "uc-A",
      userId: USER.id,
      plannedYear: 1,
      plannedSemester: "FALL",
      selectedGroups: null, // no selections → all A sessions pass
      course: { code: "AAA-111", nameHe: "קורס א" },
    },
    {
      id: "uc-B",
      userId: USER.id,
      plannedYear: 1,
      plannedSemester: "FALL",
      selectedGroups: { tutorial: "t2" }, // only tutorial group t2 for course B
      course: { code: "BBB-222", nameHe: "קורס ב" },
    },
  ];
  const sessions: FakeSession[] = [
    { id: "s-a1", courseCode: "AAA-111", sessionType: "lecture", groupCode: "L1", semester: "FALL", dayOfWeek: "SUNDAY", startTime: "09:00", course: { code: "AAA-111", nameHe: "קורס א" } },
    { id: "s-a2", courseCode: "AAA-111", sessionType: "tutorial", groupCode: "T9", semester: "FALL", dayOfWeek: "MONDAY", startTime: "10:00", course: { code: "AAA-111", nameHe: "קורס א" } },
    { id: "s-b-lec", courseCode: "BBB-222", sessionType: "lecture", groupCode: "L1", semester: "FALL", dayOfWeek: "TUESDAY", startTime: "09:00", course: { code: "BBB-222", nameHe: "קורס ב" } },
    // Mixed case on purpose — the router lowercases sessionType before matching.
    { id: "s-b-t2", courseCode: "BBB-222", sessionType: "TUTORIAL", groupCode: "t2", semester: "FALL", dayOfWeek: "WEDNESDAY", startTime: "12:00", course: { code: "BBB-222", nameHe: "קורס ב" } },
    { id: "s-b-t1", courseCode: "BBB-222", sessionType: "TUTORIAL", groupCode: "t1", semester: "FALL", dayOfWeek: "THURSDAY", startTime: "12:00", course: { code: "BBB-222", nameHe: "קורס ב" } },
  ];
  return {
    user: { findUnique: async () => USER },
    userCourse: { findMany: async () => userCourses },
    scheduleSession: { findMany: async () => sessions },
  };
}

describe("scheduleRouter.getScheduleForSemester — selected-group filter", () => {
  it("includes ALL sessions of a course with no selectedGroups", async () => {
    const { sessions } = await makeCaller(makeSemesterDb()).getScheduleForSemester({ year: 1, semester: "FALL" });
    const ids = sessions.map((s) => s.id);
    // Course A has no selections → both its lecture and tutorial pass.
    expect(ids).toContain("s-a1");
    expect(ids).toContain("s-a2");
  });

  it("includes a sessionType that is NOT among the student's selections", async () => {
    const { sessions } = await makeCaller(makeSemesterDb()).getScheduleForSemester({ year: 1, semester: "FALL" });
    // Course B selected a tutorial group but no lecture group → lecture passes.
    expect(sessions.map((s) => s.id)).toContain("s-b-lec");
  });

  it("for a selected type, keeps only the matching groupCode and drops the rest", async () => {
    const { sessions } = await makeCaller(makeSemesterDb()).getScheduleForSemester({ year: 1, semester: "FALL" });
    const ids = sessions.map((s) => s.id);
    expect(ids).toContain("s-b-t2"); // selected group t2 kept
    expect(ids).not.toContain("s-b-t1"); // non-selected tutorial group dropped
    // Net result across both courses: everything except the unselected tutorial.
    expect(ids.sort()).toEqual(["s-a1", "s-a2", "s-b-lec", "s-b-t2"]);
  });
});
