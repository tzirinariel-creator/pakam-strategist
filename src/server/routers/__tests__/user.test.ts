// #43 launch-blocker — updateProfile's bidirectional startYear<->currentYear
// derivation, exercised through the REAL userRouter via a tRPC caller against a
// fake Prisma. Expected numbers are DERIVED by importing the same calendar
// helpers the router uses (getPlanningAnchor / deriveYearOfStudy / getAcademicNow)
// so the lock holds whatever real day the suite runs on (TZ=Asia/Jerusalem is
// pinned by vitest.config). Also locks the miluim per-semester guards:
// NOT_FOUND when the user row is missing, and delete-by-composite-key is an
// idempotent, owner-scoped no-op.

import { describe, it, expect } from "vitest";
import { createCallerFactory } from "@/server/trpc/init";
import { userRouter } from "@/server/routers/user";
import {
  getPlanningAnchor,
  deriveYearOfStudy,
  getAcademicNow,
} from "@/lib/academic-calendar";

const USER = { id: "user-1", supabaseId: "sb-1", email: "t@example.com" };

interface MiluimRow {
  id: string;
  userId: string;
  academicYear: number;
  semester: string;
  daysServed: number;
  isCombat: boolean;
  derivedGroup?: string;
}

type UserRow =
  | { id: string; email: string; supabaseId: string; startYear?: number | null }
  | null;

function makeDb(
  opts: { userRow?: UserRow; miluim?: MiluimRow[]; startYear?: number | null } = {},
) {
  // `userRow === undefined` → the normal, existing user. Pass `userRow: null`
  // to simulate the guard case (the app-user row is gone).
  const userRow: UserRow =
    "userRow" in opts
      ? opts.userRow!
      : {
          id: USER.id,
          email: USER.email,
          supabaseId: USER.supabaseId,
          // The degree-start anchor the miluim guard reads (#7/#37).
          startYear: opts.startYear ?? null,
        };
  const updateCalls: Array<{ where: unknown; data: Record<string, unknown> }> = [];
  const miluim: MiluimRow[] = opts.miluim ?? [];
  let seq = 0;

  return {
    updateCalls,
    miluim,
    user: {
      // Used both by enforceAuth (full row) and by the miluim procedures
      // (select: { id: true }). Returns the fixed fixture regardless of `where`.
      findUnique: async () => userRow,
      // enforceAuth creates the row when findUnique returns null; return a
      // non-demo user so the middleware passes and the procedure's OWN
      // findUnique (still null) is what trips the NOT_FOUND guard.
      create: async () => ({ id: USER.id, email: USER.email, supabaseId: USER.supabaseId }),
      update: async ({ where, data }: { where: unknown; data: Record<string, unknown> }) => {
        updateCalls.push({ where, data });
        return { id: USER.id, ...data };
      },
    },
    miluimSemester: {
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { userId_academicYear_semester: { userId: string; academicYear: number; semester: string } };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        const k = where.userId_academicYear_semester;
        const found = miluim.find(
          (r) => r.userId === k.userId && r.academicYear === k.academicYear && r.semester === k.semester,
        );
        if (found) {
          Object.assign(found, update);
          return found;
        }
        const row = { id: `m${++seq}`, ...create } as MiluimRow;
        miluim.push(row);
        return row;
      },
      deleteMany: async ({
        where,
      }: {
        where: { userId: string; academicYear: number; semester: string };
      }) => {
        let count = 0;
        for (let i = miluim.length - 1; i >= 0; i--) {
          const r = miluim[i]!;
          if (r.userId === where.userId && r.academicYear === where.academicYear && r.semester === where.semester) {
            miluim.splice(i, 1);
            count++;
          }
        }
        return { count };
      },
    },
  };
}

function makeCaller(db: ReturnType<typeof makeDb>) {
  const createCaller = createCallerFactory(userRouter);
  return createCaller({
    db: db as never,
    userId: USER.supabaseId,
    session: { user: { id: USER.supabaseId } } as never,
    supabase: {} as never,
    headers: new Headers(),
    loaders: undefined,
  });
}

describe("userRouter.updateProfile — #43 bidirectional year/anchor derivation", () => {
  it("onboarding (currentYear) anchors startYear at the PLANNING anchor — a July fresh year-1 signup is NOT stored a year ahead", async () => {
    const db = makeDb();
    const caller = makeCaller(db);

    await caller.updateProfile({ currentYear: 1 });

    const data = db.updateCalls.at(-1)!.data;
    // year-1 → anchor − 0. Derived from the SAME helper the router calls, so it
    // tracks the real "now": during the summer gap this is the year being
    // planned (getPlanningAnchor), NOT today's academic year — that off-by-one
    // was the launch-gate blocker (would have opened the planner on "שנה ב׳").
    const expected = getPlanningAnchor().startYear - (1 - 1);
    expect(data.startYear).toBe(expected);
    expect(data.startYear).toBe(getPlanningAnchor().startYear);
    // Onboarding path leaves the declared year as-is and does NOT overwrite the
    // semester (the settings branch keys on input.startYear, which is absent).
    expect(data.currentYear).toBe(1);
    expect(data.currentSemester).toBeUndefined();
  });

  it("onboarding anchor formula holds for a returning year (year 2 → anchor − 1)", async () => {
    const db = makeDb();
    const caller = makeCaller(db);

    await caller.updateProfile({ currentYear: 2 });

    const data = db.updateCalls.at(-1)!.data;
    expect(data.startYear).toBe(getPlanningAnchor().startYear - (2 - 1));
  });

  it("settings (startYear) recomputes currentYear via deriveYearOfStudy and refreshes currentSemester to the real academic semester", async () => {
    const db = makeDb();
    const caller = makeCaller(db);

    const startYear = 2024;
    await caller.updateProfile({ startYear });

    const data = db.updateCalls.at(-1)!.data;
    // startYear is written through untouched...
    expect(data.startYear).toBe(startYear);
    // ...currentYear is recomputed (router passes input.currentYear ?? 1)...
    expect(data.currentYear).toBe(deriveYearOfStudy(startYear, 1));
    // ...and the cached semester is snapped to the live academic semester.
    expect(data.currentSemester).toBe(getAcademicNow().semester);
  });
});

describe("userRouter miluim per-semester guards", () => {
  it("upsertMiluimSemester throws NOT_FOUND when the app-user row is missing", async () => {
    const db = makeDb({ userRow: null });
    const caller = makeCaller(db);
    await expect(
      caller.upsertMiluimSemester({ academicYear: 2025, semester: "FALL", daysServed: 20 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.miluim).toHaveLength(0);
  });

  it("deleteMiluimSemester throws NOT_FOUND when the app-user row is missing", async () => {
    const db = makeDb({ userRow: null });
    const caller = makeCaller(db);
    await expect(
      caller.deleteMiluimSemester({ academicYear: 2025, semester: "FALL" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("deleteMiluimSemester is an idempotent no-op (deleteMany) on a missing row — returns { deleted: 0 }, never throws", async () => {
    const db = makeDb(); // user exists, no miluim rows
    const caller = makeCaller(db);
    const res = await caller.deleteMiluimSemester({ academicYear: 2025, semester: "SUMMER" });
    expect(res).toEqual({ deleted: 0 });
  });

  it("miluim writes are scoped to the caller — a foreign user's row is never touched", async () => {
    const foreign: MiluimRow = {
      id: "foreign-1",
      userId: "someone-else",
      academicYear: 2025,
      semester: "FALL",
      daysServed: 40,
      isCombat: true,
    };
    const db = makeDb({ miluim: [foreign] });
    const caller = makeCaller(db);

    // delete for the SAME (year, semester) matches nothing owned by USER → no-op.
    const del = await caller.deleteMiluimSemester({ academicYear: 2025, semester: "FALL" });
    expect(del).toEqual({ deleted: 0 });
    expect(db.miluim).toContain(foreign);

    // upsert keys on (USER.id, year, semester): can't hijack the foreign row —
    // it creates a NEW row for USER and leaves the foreign one intact.
    await caller.upsertMiluimSemester({ academicYear: 2025, semester: "FALL", daysServed: 20 });
    expect(db.miluim).toContain(foreign);
    const mine = db.miluim.find((r) => r.userId === USER.id);
    expect(mine).toBeDefined();
    expect(mine!.academicYear).toBe(2025);
    expect(mine!.semester).toBe("FALL");
    expect(foreign.daysServed).toBe(40); // untouched
  });
});

// #7/#37 — the 3010 importer is not the only door into MiluimSemester (the
// manual add-form and the undo path write too), so the degree window is enforced
// on the SERVER. A row for a semester before the student enrolled is refused.
describe("userRouter.upsertMiluimSemester — pre-enrolment semesters are refused (#7/#37)", () => {
  it("rejects a semester earlier than the degree start, and writes nothing", async () => {
    const db = makeDb({ startYear: 2025 }); // began תשפ"ו
    const caller = makeCaller(db);

    await expect(
      caller.upsertMiluimSemester({ academicYear: 2024, semester: "SPRING", daysServed: 40 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.miluim).toHaveLength(0);
  });

  it("accepts the degree-start year itself (boundary) and later years", async () => {
    const db = makeDb({ startYear: 2025 });
    const caller = makeCaller(db);

    await caller.upsertMiluimSemester({ academicYear: 2025, semester: "FALL", daysServed: 40 });
    await caller.upsertMiluimSemester({ academicYear: 2026, semester: "SPRING", daysServed: 10 });
    expect(db.miluim.map((r) => r.academicYear).sort()).toEqual([2025, 2026]);
    // The group is still derived server-side from the days (unchanged path).
    expect(db.miluim.find((r) => r.academicYear === 2025)!.derivedGroup).toBe("GROUP_C");
  });

  it("an unknown start year never blocks a write — we don't guess an enrolment date", async () => {
    const db = makeDb(); // startYear: null
    const caller = makeCaller(db);

    await caller.upsertMiluimSemester({ academicYear: 2023, semester: "SPRING", daysServed: 40 });
    expect(db.miluim).toHaveLength(1);
  });
});
