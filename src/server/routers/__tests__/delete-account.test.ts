// SEC2 — deleteAccount: full erasure through the real router. Contributions
// (located only by the one-way hash), the user's review-reports, and the User
// row (cascades) — nobody else's data.

import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { createCallerFactory } from "@/server/trpc/init";
import { userRouter } from "@/server/routers/user";

const USER = { id: "user-1", supabaseId: "sb-1", email: "t@example.com" };
const hashFor = (code: string) =>
  createHash("sha256").update(`${USER.id}:${code}`).digest("hex");

function makeFakeDb() {
  const points = [
    { dedupeHash: hashFor("1011-2103") },
    { dedupeHash: hashFor("0651-1005") },
    { dedupeHash: "someone-elses-hash" },
  ];
  const reviews = [{ userId: USER.id }, { userId: "other" }];
  const reports = [{ userId: USER.id }, { userId: "other" }];
  let userDeleted = false;
  const del = (arr: Array<{ userId?: string; dedupeHash?: string }>, pred: (x: never) => boolean) => {
    let count = 0;
    for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i] as never)) { arr.splice(i, 1); count++; }
    return { count };
  };
  return {
    points, reviews, reports,
    get userDeleted() { return userDeleted; },
    user: {
      findUnique: async () => USER,
      upsert: async () => USER,
      delete: async () => { userDeleted = true; return USER; },
    },
    userCourse: {
      findMany: async () => [
        { course: { code: "1011-2103" } },
        { course: { code: "0651-1005" } },
      ],
    },
    courseReview: { deleteMany: async ({ where }: { where: { userId: string } }) => del(reviews, (r: { userId: string }) => r.userId === where.userId) },
    reviewReport: { deleteMany: async ({ where }: { where: { userId: string } }) => del(reports, (r: { userId: string }) => r.userId === where.userId) },
    courseGradePoint: { deleteMany: async ({ where }: { where: { dedupeHash: { in: string[] } } }) => del(points, (p: { dedupeHash: string }) => where.dedupeHash.in.includes(p.dedupeHash)) },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };
}

describe("user.deleteAccount (SEC2)", () => {
  it("erases the user's contributions + row; leaves everyone else's data", async () => {
    const db = makeFakeDb();
    const createCaller = createCallerFactory(userRouter);
    const caller = createCaller({
      db: db as never,
      userId: USER.supabaseId,
      session: { user: { id: USER.supabaseId } } as never,
      supabase: {} as never,
      headers: new Headers(),
    loaders: undefined,
    });
    const r = await caller.deleteAccount();
    expect(r.ok).toBe(true);
    expect(db.userDeleted).toBe(true);
    expect(db.points).toEqual([{ dedupeHash: "someone-elses-hash" }]);
    expect(db.reviews).toEqual([{ userId: "other" }]);
    expect(db.reports).toEqual([{ userId: "other" }]);
  });
});
