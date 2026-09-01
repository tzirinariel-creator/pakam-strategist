// =========================================================================
// savePlan must not destroy anything it was not asked to change
// =========================================================================
// Two rules meet in this file.
//
// QA 13.7 — an EMPTY payload is a no-op. The onboarding auto-save could send
// an empty courses[] (catalog not loaded → every planned courseId dropped);
// the transaction then deleted the plan and wrote nothing, "succeeding" with a
// zero-course plan.
//
// 1.9 — Ariel: "לדעתי תכננתי את הקורסים וזה נמחק משום מה" · "נראה שיש פה איזה
// באג רציני עם הסנכרון של התכנן". savePlan was delete-everything-then-recreate,
// and the delete was wider than what any one screen could send back. Summer
// rows, second-sitting rows and anything added after the board mounted were
// deleted and never rewritten — and skipDuplicates swallowed the collisions,
// so the mutation still reported success.
//
// The old version of this file asserted the destructive shape directly
// ("a non-empty plan still replaces (delete + create)") and was green for as
// long as the bug lived. It is rewritten here to assert the OUTCOME the
// student cares about — what survives a save — rather than the mechanism.

import { describe, it, expect } from "vitest";
import { createCallerFactory } from "@/server/trpc/init";
import { planRouter } from "@/server/routers/plan";

const USER = { id: "user-1", supabaseId: "sb-1", email: "t@example.com" };
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

interface Row {
  id: string;
  courseId: string;
  status: string;
  attemptNumber: number;
  plannedSemester: string;
  plannedYear?: number;
}

/** An in-memory userCourse table that behaves like the real one. */
function makeDb(rows: Row[] = []) {
  const table = [...rows];
  const created: Record<string, unknown>[] = [];
  const updated: { id: string; data: Record<string, unknown> }[] = [];

  const tx = {
    userCourse: {
      findMany: async () => table.map((r) => ({ ...r })),
      deleteMany: async ({ where }: { where: { id?: { in: string[] } } }) => {
        const ids = new Set(where.id?.in ?? []);
        let count = 0;
        for (let i = table.length - 1; i >= 0; i--) {
          if (ids.has(table[i]!.id)) {
            table.splice(i, 1);
            count++;
          }
        }
        return { count };
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        updated.push({ id: where.id, data });
        const row = table.find((r) => r.id === where.id);
        if (row) Object.assign(row, data);
        return row;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        const row = {
          id: `new-${created.length}`,
          courseId: String(data.courseId),
          status: "PLANNED",
          attemptNumber: Number(data.attemptNumber),
          plannedSemester: String(data.plannedSemester),
          plannedYear: Number(data.plannedYear),
        };
        table.push(row);
        return row;
      },
    },
  };

  return {
    table,
    created,
    updated,
    user: { findUnique: async () => USER, upsert: async () => USER, create: async () => USER },
    userCourse: tx.userCourse,
    $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  };
}

function makeCaller(db: ReturnType<typeof makeDb>) {
  return createCallerFactory(planRouter)({
    db: db as never,
    userId: USER.supabaseId,
    session: { user: { id: USER.supabaseId } } as never,
    supabase: {} as never,
    headers: new Headers(),
    loaders: undefined,
  });
}

const planned = (id: string, courseId: string, semester = "FALL", attempt = 1): Row => ({
  id, courseId, status: "PLANNED", attemptNumber: attempt, plannedSemester: semester, plannedYear: 1,
});

describe("savePlan — an empty payload never wipes the plan (QA 13.7)", () => {
  it("does not touch the table", async () => {
    const db = makeDb([planned("r1", A)]);
    const r = await makeCaller(db).savePlan({ courses: [] });
    expect(db.table).toHaveLength(1);
    expect(r.savedCount).toBe(0);
  });
});

describe("savePlan — what a save must leave alone (1.9)", () => {
  it("keeps a SUMMER row the board never loads and never sends back", async () => {
    // The semester board reads only FALL/SPRING, so a summer row can never
    // appear in its payload. The old delete took it anyway — a course removed
    // from a student's plan by a screen that cannot even display it.
    const db = makeDb([
      planned("r1", A, "FALL"),
      { id: "r2", courseId: B, status: "PLANNED", attemptNumber: 1, plannedSemester: "SUMMER" },
    ]);
    await makeCaller(db).savePlan({
      courses: [{ courseId: A, plannedYear: 1, plannedSemester: "FALL" }],
    });
    expect(db.table.map((r) => r.id).sort()).toEqual(["r1", "r2"]);
  });

  it("keeps a second-sitting row instead of deleting it and rewriting attempt 1", async () => {
    // addCourse creates attempt ≥ 2 for a re-sit, and the assistant recommends
    // exactly that. The old re-create was hardcoded to attemptNumber: 1.
    const db = makeDb([
      { id: "r1", courseId: A, status: "COMPLETED", attemptNumber: 1, plannedSemester: "FALL" },
      planned("r2", A, "SPRING", 2),
    ]);
    await makeCaller(db).savePlan({
      courses: [{ courseId: A, plannedYear: 1, plannedSemester: "SPRING" }],
    });
    const attempts = db.table.map((r) => r.attemptNumber).sort();
    expect(attempts).toEqual([1, 2]);
    expect(db.table.find((r) => r.status === "COMPLETED")).toBeTruthy();
  });

  it("creates a NEW attempt rather than colliding with a finished row", async () => {
    // A course with only a COMPLETED attempt-1 row, planned again. The old
    // code inserted attempt 1, hit the unique key, and skipDuplicates ate it —
    // the student's re-sit simply never appeared, with a success toast.
    const db = makeDb([
      { id: "r1", courseId: A, status: "FAILED", attemptNumber: 1, plannedSemester: "FALL" },
    ]);
    const r = await makeCaller(db).savePlan({
      courses: [{ courseId: A, plannedYear: 2, plannedSemester: "FALL" }],
    });
    expect(db.created).toHaveLength(1);
    expect(db.created[0]!.attemptNumber).toBe(2);
    expect(r.savedCount).toBe(1);
  });

  it("moves an existing planned row in place, without resetting its status", async () => {
    // Re-creating the row defaulted status back to PLANNED, so a course the
    // student had marked "בלימוד" quietly stopped being in progress.
    const db = makeDb([
      { id: "r1", courseId: A, status: "IN_PROGRESS", attemptNumber: 1, plannedSemester: "FALL", plannedYear: 1 },
    ]);
    await makeCaller(db).savePlan({
      courses: [{ courseId: A, plannedYear: 2, plannedSemester: "SPRING" }],
    });
    expect(db.created).toHaveLength(0);
    expect(db.updated).toHaveLength(1);
    const row = db.table[0]!;
    expect(row.status).toBe("IN_PROGRESS");
    expect(row.plannedSemester).toBe("SPRING");
  });

  it("removes exactly the course taken off the board, and nothing else", async () => {
    const db = makeDb([planned("r1", A), planned("r2", B)]);
    await makeCaller(db).savePlan({
      courses: [{ courseId: A, plannedYear: 1, plannedSemester: "FALL" }],
    });
    expect(db.table.map((r) => r.courseId)).toEqual([A]);
  });

  it("reports what was requested, so a partial write cannot read as success", async () => {
    const db = makeDb();
    const r = await makeCaller(db).savePlan({
      courses: [
        { courseId: A, plannedYear: 1, plannedSemester: "FALL" },
        { courseId: B, plannedYear: 1, plannedSemester: "FALL" },
      ],
    });
    expect(r.requested).toBe(2);
    expect(r.savedCount).toBe(2);
  });
});
