import { describe, it, expect, beforeEach } from "vitest";
import { createCallerFactory } from "@/server/trpc/init";
import { planRouter } from "@/server/routers/plan";

// ───────────────────────────────────────────────────────────────────────────
// In-memory fake Prisma client.
//
// We exercise the REAL plan router (via a tRPC caller) against a faithful fake
// of the bits it touches: user.findUnique, userCourse.{findUnique, deleteMany,
// createMany, update}, and $transaction. The fake honors the schema's
// @@unique([userId, courseId, attemptNumber]) so createMany({skipDuplicates})
// actually drops colliding rows and reports a truthful result.count — exactly
// the behavior fix F depends on.
// ───────────────────────────────────────────────────────────────────────────

interface FakeUserCourse {
  id: string;
  userId: string;
  courseId: string;
  plannedYear: number;
  plannedSemester: string;
  attemptNumber: number;
  selectedGroups?: unknown;
  disciplineOverride?: string | null;
  status?: string;
  grade?: number | null;
}

const USER = { id: "user-1", supabaseId: "sb-1", email: "t@example.com" };

function makeFakeDb() {
  const userCourses: FakeUserCourse[] = [];
  let seq = 0;

  const userCourse = {
    findUnique: async ({ where }: { where: { id: string } }) =>
      userCourses.find((uc) => uc.id === where.id) ?? null,

    findFirst: async ({ where }: { where: Partial<FakeUserCourse> }) =>
      userCourses.find((uc) =>
        Object.entries(where).every(
          ([k, v]) => uc[k as keyof FakeUserCourse] === v
        )
      ) ?? null,

    deleteMany: async ({
      where,
    }: {
      where: { userId: string; status?: { in: string[] } };
    }) => {
      let count = 0;
      for (let i = userCourses.length - 1; i >= 0; i--) {
        const uc = userCourses[i]!;
        if (uc.userId !== where.userId) continue;
        // Honor the status filter the data-loss fix relies on: savePlan only
        // deletes PLANNED/IN_PROGRESS, never COMPLETED/EXEMPT/FAILED. A row with
        // no explicit status defaults to PLANNED (the schema default).
        if (where.status?.in && !where.status.in.includes(uc.status ?? "PLANNED")) {
          continue;
        }
        userCourses.splice(i, 1);
        count++;
      }
      return { count };
    },

    createMany: async ({
      data,
      skipDuplicates,
    }: {
      data: FakeUserCourse[];
      skipDuplicates?: boolean;
    }) => {
      let count = 0;
      for (const row of data) {
        const collides = userCourses.some(
          (uc) =>
            uc.userId === row.userId &&
            uc.courseId === row.courseId &&
            uc.attemptNumber === row.attemptNumber
        );
        if (collides) {
          if (skipDuplicates) continue; // dropped — not counted
          throw new Error("Unique constraint failed");
        }
        seq += 1;
        userCourses.push({ ...row, id: `uc-${seq}` });
        count++;
      }
      return { count };
    },

    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
      include?: unknown;
    }) => {
      const uc = userCourses.find((u) => u.id === where.id);
      if (!uc) throw new Error("Record not found");
      Object.assign(uc, data);
      return { ...uc, course: { id: uc.courseId } };
    },

    count: async ({ where }: { where: Partial<FakeUserCourse> }) =>
      userCourses.filter((uc) =>
        Object.entries(where).every(
          ([k, v]) => uc[k as keyof FakeUserCourse] === v
        )
      ).length,
  };

  // Course table — only what addCustomCourses touches (findFirst by nameHe +
  // upsert by the unique `code`). Faithful enough to prove the two things that
  // matter: a student-typed course gets a REAL id, and re-adding the same name
  // upserts the SAME row instead of piling up duplicates.
  interface FakeCourse {
    id: string;
    code: string;
    nameHe: string;
    discipline: string;
    courseType: string;
    credits: number;
    isActive: boolean;
  }
  const courses: FakeCourse[] = [];
  let courseSeq = 0;

  const course = {
    findFirst: async ({ where }: { where: { nameHe?: string } }) =>
      courses.find((c) => (where.nameHe ? c.nameHe === where.nameHe : false)) ?? null,

    findUnique: async ({ where }: { where: { code?: string; id?: string } }) =>
      courses.find((c) =>
        where.code != null ? c.code === where.code : c.id === where.id
      ) ?? null,

    upsert: async ({
      where,
      create,
    }: {
      where: { code: string };
      update: Record<string, unknown>;
      create: Omit<FakeCourse, "id">;
    }) => {
      const found = courses.find((c) => c.code === where.code);
      if (found) return found; // update: {} — an existing row is left alone
      courseSeq += 1;
      // Real-looking UUID: savePlan validates courseId with z.string().uuid(),
      // so a fake id here would hide the very bug this feature fixes.
      const row: FakeCourse = {
        ...create,
        id: `cccccccc-cccc-4ccc-8ccc-${String(courseSeq).padStart(12, "0")}`,
      };
      courses.push(row);
      return row;
    },
  };

  const db = {
    _userCourses: userCourses,
    _courses: courses,
    user: {
      findUnique: async () => USER,
    },
    course,
    userCourse,
    $transaction: async (fn: (tx: unknown) => unknown): Promise<unknown> =>
      fn(db),
  };

  return db;
}

function makeCaller(db: ReturnType<typeof makeFakeDb>) {
  const createCaller = createCallerFactory(planRouter);
  // The plan router only ever reaches for ctx.db + ctx.userId; session/supabase
  // are present to satisfy enforceAuth's session check.
  return createCaller({
    db: db as never,
    userId: USER.supabaseId,
    session: { user: { id: USER.supabaseId } } as never,
    supabase: {} as never,
    headers: new Headers(),
    loaders: undefined,
  });
}

// Valid UUIDs (version nibble 1–8, variant nibble 8/9/a/b) — the router's zod
// uses z.string().uuid(), which rejects all-same-digit strings.
const VALID_UUID_1 = "11111111-1111-4111-8111-111111111111";
const VALID_UUID_2 = "22222222-2222-4222-9222-222222222222";
const SEED_UC_ID_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SEED_UC_ID_2 = "bbbbbbbb-bbbb-4bbb-9bbb-bbbbbbbbbbbb";

// ───────────────────────────────────────────────────────────────────────────
// Fix F — savePlan reports the REAL created count, not the raw payload length.
// ───────────────────────────────────────────────────────────────────────────
describe("plan.savePlan — truthful saved count (fix F)", () => {
  let db: ReturnType<typeof makeFakeDb>;
  beforeEach(() => {
    db = makeFakeDb();
  });

  it("a course placed in two semesters is de-duped — count reflects rows actually written", async () => {
    const caller = makeCaller(db);
    const res = await caller.savePlan({
      courses: [
        { courseId: VALID_UUID_1, plannedYear: 1, plannedSemester: "FALL" },
        // Same course, different semester → collides on (userId, courseId, attempt=1)
        { courseId: VALID_UUID_1, plannedYear: 1, plannedSemester: "SPRING" },
        { courseId: VALID_UUID_2, plannedYear: 1, plannedSemester: "FALL" },
      ],
    });

    // 3 in the payload, but the duplicate is dropped → only 2 rows exist.
    expect(res.savedCount).toBe(2);
    expect(db._userCourses).toHaveLength(2);
    // The dropped course no longer hides behind an inflated count (old bug: 3).
    expect(res.savedCount).not.toBe(3);
  });

  it("distinct courses all save — count equals payload length", async () => {
    const caller = makeCaller(db);
    const res = await caller.savePlan({
      courses: [
        { courseId: VALID_UUID_1, plannedYear: 1, plannedSemester: "FALL" },
        { courseId: VALID_UUID_2, plannedYear: 1, plannedSemester: "SPRING" },
      ],
    });
    expect(res.savedCount).toBe(2);
    expect(db._userCourses).toHaveLength(2);
  });

  it("empty payload saves nothing and reports 0", async () => {
    const caller = makeCaller(db);
    const res = await caller.savePlan({ courses: [] });
    expect(res.savedCount).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Data-loss fix — savePlan replaces only the PLAN (PLANNED/IN_PROGRESS) and
// must NEVER delete the student's earned record (COMPLETED/EXEMPT/FAILED). This
// is what makes editing the plan non-destructive; a regression here silently
// wipes grades + credits, which is exactly the bug the overnight review caught.
// ───────────────────────────────────────────────────────────────────────────
describe("plan.savePlan — preserves COMPLETED history on a plan edit", () => {
  it("keeps COMPLETED/EXEMPT/FAILED rows, replaces only PLANNED/IN_PROGRESS", async () => {
    const db = makeFakeDb();
    db._userCourses.push(
      { id: "h1", userId: USER.id, courseId: "hist-completed", plannedYear: 1, plannedSemester: "FALL", attemptNumber: 1, status: "COMPLETED", grade: 88 },
      { id: "h2", userId: USER.id, courseId: "hist-exempt", plannedYear: 1, plannedSemester: "SPRING", attemptNumber: 1, status: "EXEMPT", grade: null },
      { id: "h3", userId: USER.id, courseId: "hist-failed", plannedYear: 1, plannedSemester: "FALL", attemptNumber: 1, status: "FAILED", grade: 40 },
      { id: "p1", userId: USER.id, courseId: "old-planned", plannedYear: 2, plannedSemester: "FALL", attemptNumber: 1, status: "PLANNED" },
      { id: "ip1", userId: USER.id, courseId: "in-progress", plannedYear: 2, plannedSemester: "FALL", attemptNumber: 1, status: "IN_PROGRESS" },
    );

    const caller = makeCaller(db);
    await caller.savePlan({
      courses: [{ courseId: VALID_UUID_1, plannedYear: 2, plannedSemester: "SPRING" }],
    });

    const byCourse = (c: string) => db._userCourses.find((uc) => uc.courseId === c);
    // Earned record survives untouched (grade intact).
    expect(byCourse("hist-completed")?.grade).toBe(88);
    expect(byCourse("hist-exempt")).toBeTruthy();
    expect(byCourse("hist-failed")?.grade).toBe(40);
    // Old plan (PLANNED + IN_PROGRESS) is cleared and replaced.
    expect(byCourse("old-planned")).toBeUndefined();
    expect(byCourse("in-progress")).toBeUndefined();
    expect(byCourse(VALID_UUID_1)).toBeTruthy();
  });

  it("a COMPLETED course that slips into the planned payload is NOT corrupted (stays COMPLETED, not duplicated)", async () => {
    const db = makeFakeDb();
    // Defense-in-depth: even if a completed course leaks into the plan payload
    // (the callers try to exclude it), savePlan must not flip it to PLANNED or
    // duplicate it. The surviving COMPLETED row (attempt 1) collides with the new
    // attempt-1 planned row → skipDuplicates drops the planned one.
    db._userCourses.push({
      id: "keep", userId: USER.id, courseId: VALID_UUID_1,
      plannedYear: 1, plannedSemester: "FALL", attemptNumber: 1, status: "COMPLETED", grade: 90,
    });
    const caller = makeCaller(db);
    const res = await caller.savePlan({
      courses: [{ courseId: VALID_UUID_1, plannedYear: 2, plannedSemester: "SPRING" }],
    });
    const rows = db._userCourses.filter((uc) => uc.courseId === VALID_UUID_1);
    expect(rows).toHaveLength(1); // not duplicated
    expect(rows[0]!.status).toBe("COMPLETED"); // not flipped to PLANNED
    expect(rows[0]!.grade).toBe(90); // grade intact
    expect(res.savedCount).toBe(0); // the colliding planned row was dropped
  });
});

// ───────────────────────────────────────────────────────────────────────────
// #8 — a course the student added by hand must actually PERSIST.
//
// The old behavior: the planner's `custom-<uuid>` id isn't a UUID, savePlan
// rejects it, so every caller dropped it and toasted "not saved yet". These
// tests cover the full chain that replaced that: register → real courseId →
// savePlan → a row that carries the student's declaration.
// ───────────────────────────────────────────────────────────────────────────
describe("plan.addCustomCourses — a manually added course becomes a real row (#8)", () => {
  it("creates a Course row and returns a persistent id keyed by the client id", async () => {
    const db = makeFakeDb();
    const caller = makeCaller(db);

    const res = await caller.addCustomCourses({
      courses: [{ clientId: "custom-abc", name: "דוגרי", credits: 4 }],
    });

    expect(res.courses).toHaveLength(1);
    const [row] = res.courses;
    expect(row!.clientId).toBe("custom-abc");
    expect(row!.courseId).not.toBe("custom-abc");
    // Kept OUT of the shared public catalog (course.list filters isActive:true).
    const created = db._courses.find((c) => c.id === row!.courseId);
    expect(created?.isActive).toBe(false);
    expect(created?.nameHe).toBe("דוגרי");
    expect(created?.credits).toBe(4);
    // Name-derived code, so the same course re-added resolves to the same row.
    expect(created?.code).toBe("CUSTOM-דוגרי");
  });

  it("re-adding the same course resolves to the SAME row (no duplicates)", async () => {
    const db = makeFakeDb();
    const caller = makeCaller(db);

    const first = await caller.addCustomCourses({
      courses: [{ clientId: "custom-1", name: "דוגרי", credits: 4 }],
    });
    const second = await caller.addCustomCourses({
      courses: [{ clientId: "custom-2", name: "דוגרי", credits: 4 }],
    });

    expect(second.courses[0]!.courseId).toBe(first.courses[0]!.courseId);
    expect(db._courses).toHaveLength(1);
  });

  it("an exact catalog name links to the CATALOG course instead of shadowing it", async () => {
    const db = makeFakeDb();
    db._courses.push({
      id: VALID_UUID_1,
      code: "0618-2033",
      nameHe: "פילוסופיה של המוסר",
      discipline: "PHILOSOPHY",
      courseType: "ELECTIVE",
      credits: 4,
      isActive: true,
    });
    const caller = makeCaller(db);

    const res = await caller.addCustomCourses({
      courses: [{ clientId: "custom-x", name: "פילוסופיה של המוסר", credits: 2 }],
    });

    expect(res.courses[0]!.courseId).toBe(VALID_UUID_1);
    expect(db._courses).toHaveLength(1); // no shadow row
  });

  it("end-to-end: the registered id saves into the plan, carrying the declaration", async () => {
    const db = makeFakeDb();
    const caller = makeCaller(db);

    // 1. The planner registers the course the student typed in…
    const registered = await caller.addCustomCourses({
      courses: [{ clientId: "custom-abc", name: "דוגרי", credits: 4 }],
    });
    const courseId = registered.courses[0]!.courseId;

    // 2. …and saves the plan with it, declared as counting toward PHILOSOPHY.
    const saved = await caller.savePlan({
      courses: [
        {
          courseId,
          plannedYear: 2,
          plannedSemester: "FALL",
          disciplineOverride: "PHILOSOPHY",
        },
      ],
    });

    // It is IN the plan — the old code dropped it here and toasted instead.
    expect(saved.savedCount).toBe(1);
    const row = db._userCourses.find((uc) => uc.courseId === courseId);
    expect(row).toBeTruthy();
    expect(row!.disciplineOverride).toBe("PHILOSOPHY");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// #8 — savePlan carries the student's discipline attribution.
//
// savePlan deletes + recreates every PLANNED row, so an override that isn't in
// the payload is WIPED on the next edit. That silently erased the declaration
// "this off-catalog course is approved for my degree, as PHILOSOPHY".
// ───────────────────────────────────────────────────────────────────────────
describe("plan.savePlan — persists disciplineOverride (#8)", () => {
  it("writes the override, and null/absent leaves it clear", async () => {
    const db = makeFakeDb();
    const caller = makeCaller(db);

    await caller.savePlan({
      courses: [
        { courseId: VALID_UUID_1, plannedYear: 1, plannedSemester: "FALL", disciplineOverride: "ECONOMICS" },
        { courseId: VALID_UUID_2, plannedYear: 1, plannedSemester: "SPRING" },
      ],
    });

    const byCourse = (c: string) => db._userCourses.find((uc) => uc.courseId === c);
    expect(byCourse(VALID_UUID_1)!.disciplineOverride).toBe("ECONOMICS");
    expect(byCourse(VALID_UUID_2)!.disciplineOverride).toBeNull();
  });

  it("survives a re-save that re-sends it (the edit-the-plan round trip)", async () => {
    const db = makeFakeDb();
    const caller = makeCaller(db);
    const withOverride = {
      courseId: VALID_UUID_1,
      plannedYear: 1,
      plannedSemester: "FALL" as const,
      disciplineOverride: "PHILOSOPHY" as const,
    };

    await caller.savePlan({ courses: [withOverride] });
    // Second save = the student edited something else and saved again.
    await caller.savePlan({ courses: [withOverride] });

    const rows = db._userCourses.filter((uc) => uc.courseId === VALID_UUID_1);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.disciplineOverride).toBe("PHILOSOPHY");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Fix G — updateCourse can CLEAR a mis-assigned disciplineOverride via null.
// ───────────────────────────────────────────────────────────────────────────
describe("plan.updateCourse — clears disciplineOverride with null (fix G)", () => {
  it("passing disciplineOverride: null writes null (clears the override)", async () => {
    const db = makeFakeDb();
    // Seed a course that already carries a (wrong) discipline override.
    db._userCourses.push({
      id: SEED_UC_ID_1,
      userId: USER.id,
      courseId: VALID_UUID_1,
      plannedYear: 1,
      plannedSemester: "FALL",
      attemptNumber: 1,
      disciplineOverride: "ECONOMICS",
    });

    const caller = makeCaller(db);
    const updated = await caller.updateCourse({
      userCourseId: SEED_UC_ID_1,
      disciplineOverride: null,
    });

    expect(updated.disciplineOverride).toBeNull();
    expect(db._userCourses[0]!.disciplineOverride).toBeNull();
  });

  it("omitting disciplineOverride leaves the existing value untouched", async () => {
    const db = makeFakeDb();
    db._userCourses.push({
      id: SEED_UC_ID_2,
      userId: USER.id,
      courseId: VALID_UUID_1,
      plannedYear: 1,
      plannedSemester: "FALL",
      attemptNumber: 1,
      disciplineOverride: "PHILOSOPHY",
    });

    const caller = makeCaller(db);
    await caller.updateCourse({
      userCourseId: SEED_UC_ID_2,
      plannedYear: 2,
    });

    expect(db._userCourses[0]!.disciplineOverride).toBe("PHILOSOPHY");
    expect(db._userCourses[0]!.plannedYear).toBe(2);
  });
});
