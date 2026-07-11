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
