// E2′ — the drag-to-another-day flow persists through studyTask.update.
// Exercises the REAL router via a tRPC caller against a fake Prisma: the date
// actually changes, and the ownership check refuses another user's task.

import { describe, it, expect } from "vitest";
import { createCallerFactory } from "@/server/trpc/init";
import { studyTaskRouter } from "@/server/routers/study-task";

const USER = { id: "user-1", supabaseId: "sb-1", email: "t@example.com" };
const TASK_ID = "11111111-1111-4111-8111-111111111111";
const FOREIGN_ID = "22222222-2222-4222-9222-222222222222";

interface FakeTask {
  id: string;
  userId: string;
  title: string;
  startDate: Date;
  endDate: Date;
  taskType: string;
  courseCode: string | null;
  color: string | null;
  notes: string | null;
  completed: boolean;
}

function makeFakeDb() {
  const tasks: FakeTask[] = [
    {
      id: TASK_ID,
      userId: USER.id,
      title: "לימוד: מיקרו",
      startDate: new Date("2026-07-20T09:00:00"),
      endDate: new Date("2026-07-20T11:30:00"),
      taskType: "study",
      courseCode: "1011-2103",
      color: "#6366f1",
      notes: "[auto] medium",
      completed: false,
    },
    {
      id: FOREIGN_ID,
      userId: "someone-else",
      title: "לא שלך",
      startDate: new Date("2026-07-21T09:00:00"),
      endDate: new Date("2026-07-21T10:00:00"),
      taskType: "study",
      courseCode: "0000-0000",
      color: null,
      notes: null,
      completed: false,
    },
  ];
  return {
    tasks,
    user: {
      findUnique: async () => USER,
      upsert: async () => USER,
    },
    studyTask: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        tasks.find((t) => t.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Partial<FakeTask> }) => {
        const t = tasks.find((x) => x.id === where.id)!;
        Object.assign(t, data);
        return t;
      },
    },
  };
}

function makeCaller(db: ReturnType<typeof makeFakeDb>) {
  const createCaller = createCallerFactory(studyTaskRouter);
  return createCaller({
    db: db as never,
    userId: USER.supabaseId,
    session: { user: { id: USER.supabaseId } } as never,
    supabase: {} as never,
    headers: new Headers(),
    loaders: undefined,
  });
}

describe("studyTask.update — the drag-day persistence path (E2′)", () => {
  it("moves a study task to another day, keeping the clock time and duration", async () => {
    const db = makeFakeDb();
    const caller = makeCaller(db);
    await caller.update({
      id: TASK_ID,
      startDate: new Date("2026-07-25T09:00:00"),
      endDate: new Date("2026-07-25T11:30:00"),
    });
    const t = db.tasks.find((x) => x.id === TASK_ID)!;
    expect(t.startDate.getDate()).toBe(25);
    expect(t.startDate.getHours()).toBe(9);
    expect(t.endDate.getTime() - t.startDate.getTime()).toBe(2.5 * 3_600_000);
  });

  it("refuses to move a task owned by someone else (NOT_FOUND, no write)", async () => {
    const db = makeFakeDb();
    const caller = makeCaller(db);
    await expect(
      caller.update({ id: FOREIGN_ID, startDate: new Date("2026-07-25T09:00:00") }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.tasks.find((x) => x.id === FOREIGN_ID)!.startDate.getDate()).toBe(21);
  });
});

// Phase 5 — re-tune must NOT wipe a MANUAL locked block (data-loss regression).
function makeGenerateDb() {
  const deleteWheres: Record<string, unknown>[] = [];
  const created: unknown[] = [];
  const examDate = new Date(new Date().getTime() + 10 * 86_400_000); // 10 days out (future)
  return {
    deleteWheres,
    created,
    user: { findUnique: async () => USER, upsert: async () => USER },
    userCourse: {
      findMany: async () => [
        { course: { code: "1011-2103", nameHe: "מיקרו", examDateA: examDate, examDateB: null, credits: 5, averageGrade: 78, failRate: 0.1 } },
      ],
    },
    studyTask: {
      // A MANUAL locked block (no [auto]) for a course NOT being planned.
      findMany: async () => [
        { taskType: "study", startDate: examDate, notes: "2.5h [locked]", courseCode: "9999-9999", completed: false },
      ],
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        deleteWheres.push(where);
        return { count: 0 };
      },
      createMany: async ({ data }: { data: unknown[] }) => {
        created.push(...data);
        return { count: data.length };
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<number>) => fn(makeTx(deleteWheres, created)),
  };
}
function makeTx(deleteWheres: Record<string, unknown>[], created: unknown[]) {
  return {
    studyTask: {
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        deleteWheres.push(where);
        return { count: 0 };
      },
      createMany: async ({ data }: { data: unknown[] }) => {
        created.push(...data);
        return { count: data.length };
      },
    },
  };
}

describe("studyTask.generateExamPlan — re-tune preserves manual/locked blocks", () => {
  it("orphan cleanup is scoped to [auto], so a MANUAL locked block is never wiped", async () => {
    const db = makeGenerateDb();
    const caller = makeCaller(db as unknown as ReturnType<typeof makeFakeDb>);
    const r = await caller.generateExamPlan({ exams: [{ courseCode: "1011-2103", moed: "A" }] });
    expect(r.created).toBeGreaterThan(0); // a plan was built
    // The orphan-cleanup deleteMany (the one with courseCode.notIn) MUST require
    // startsWith [auto] — otherwise it would delete the student's manual
    // "2.5h [locked]" block for the de-selected course 9999-9999.
    const orphan = db.deleteWheres.find((w) => (w.courseCode as { notIn?: unknown })?.notIn);
    expect(orphan).toBeDefined();
    const notes = orphan!.notes as { startsWith?: string; contains?: string };
    expect(notes.startsWith).toBe("[auto]");
    expect(notes.contains).toBe("[locked]");
  });
});

// ─── #39 — a student's OWN exam date, for a catalog with none ───────────────
// The תשפ״ז yedion ships without an exam timetable, so a planner that can only
// read Course.examDateA is a dead end. The student may supply the date — but it
// must never override, shift, or invent over a PUBLISHED one.
function makeDatelessDb(courseDates: { examDateA: Date | null; examDateB: Date | null }) {
  const created: { title: string; startDate: Date; taskType: string }[] = [];
  return {
    created,
    user: { findUnique: async () => USER, upsert: async () => USER },
    userCourse: {
      findMany: async () => [
        {
          course: {
            code: "1011-2103",
            nameHe: "מיקרו",
            credits: 5,
            averageGrade: 78,
            failRate: 0.1,
            ...courseDates,
          },
        },
      ],
    },
    studyTask: { findMany: async () => [] },
    $transaction: async (fn: (tx: unknown) => Promise<number>) =>
      fn({
        studyTask: {
          deleteMany: async () => ({ count: 0 }),
          createMany: async ({ data }: { data: typeof created }) => {
            created.push(...data);
            return { count: data.length };
          },
        },
      }),
  };
}

const IN_30_DAYS = new Date(new Date().getTime() + 30 * 86_400_000);
const IN_10_DAYS = new Date(new Date().getTime() + 10 * 86_400_000);

describe("studyTask.generateExamPlan — manual exam dates (#39)", () => {
  it("a course with NO catalog date is planned from the date the student typed", async () => {
    const db = makeDatelessDb({ examDateA: null, examDateB: null });
    const caller = makeCaller(db as unknown as ReturnType<typeof makeFakeDb>);
    const r = await caller.generateExamPlan({
      exams: [{ courseCode: "1011-2103", moed: "A", examDate: IN_30_DAYS }],
    });
    expect(r.created).toBeGreaterThan(0);
    const examBlock = db.created.find((t) => t.taskType === "exam");
    expect(examBlock).toBeDefined();
    expect(new Date(examBlock!.startDate).toDateString()).toBe(IN_30_DAYS.toDateString());
  });

  it("without a date from either side there is nothing to plan — and we say so, not guess", async () => {
    const db = makeDatelessDb({ examDateA: null, examDateB: null });
    const caller = makeCaller(db as unknown as ReturnType<typeof makeFakeDb>);
    const r = await caller.generateExamPlan({ exams: [{ courseCode: "1011-2103", moed: "A" }] });
    expect(r).toMatchObject({ created: 0, message: "no exams with dates" });
    expect(db.created).toHaveLength(0);
  });

  it("a PUBLISHED date always wins — a student's date can never overwrite the university's", async () => {
    const db = makeDatelessDb({ examDateA: IN_10_DAYS, examDateB: null });
    const caller = makeCaller(db as unknown as ReturnType<typeof makeFakeDb>);
    await caller.generateExamPlan({
      exams: [{ courseCode: "1011-2103", moed: "A", examDate: IN_30_DAYS }],
    });
    const examBlock = db.created.find((t) => t.taskType === "exam")!;
    expect(new Date(examBlock.startDate).toDateString()).toBe(IN_10_DAYS.toDateString());
  });
});
