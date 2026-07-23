#!/usr/bin/env npx tsx
// =========================================================================
// PROD integration smoke for the session's NEW WRITE paths — the flows the
// read-only demo could not exercise: the King's mutation verbs and the
// consent-based mentoring privacy guarantee.
// =========================================================================
// Runs the REAL routers (same caller factory the unit tests use) against the
// REAL prod DB, scoped to the throwaway test user + a fixture mentor row that
// is created and DELETED here. Everything is cleaned up in `finally`, and the
// test user is reset at the end. No auth accounts are created (the fixture is a
// bare User row with no Supabase login), and the shared demo user is untouched.
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "node:fs";
import path from "node:path";
// Routers are imported DYNAMICALLY inside main() — their module chain requires
// the Supabase env vars at load time, which we must set from .env.local first.

for (const envFile of [".env.local", ".env"]) {
  const p = path.join(__dirname, "..", envFile);
  if (fs.existsSync(p)) {
    for (const line of fs.readFileSync(p, "utf-8").split("\n")) {
      const t = line.trim();
      if (t && !t.startsWith("#")) {
        const i = t.indexOf("=");
        if (i > 0 && !process.env[t.slice(0, i)]) process.env[t.slice(0, i)] = t.slice(i + 1);
      }
    }
    break;
  }
}

const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!connectionString) throw new Error("DATABASE_URL not set");
const testEmail = process.env.NEXT_PUBLIC_TEST_USER_EMAIL?.trim();
if (!testEmail) throw new Error("NEXT_PUBLIC_TEST_USER_EMAIL not set");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const FIXTURE_EMAIL = "mentor-fixture@pakamon.test";
const FIXTURE_SB = "fixture-mentor-writepath-smoke";

// Loaded dynamically after env is set (see main()).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let createCallerFactory: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let planRouter: any, mentorRouter: any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function caller(router: any, u: { id: string; supabaseId: string }) {
  return createCallerFactory(router)({
    db: prisma as never,
    userId: u.supabaseId,
    session: { user: { id: u.supabaseId } } as never,
    supabase: {} as never,
    headers: new Headers(),
    loaders: undefined,
  });
}

function ok(label: string, cond: boolean) {
  if (!cond) throw new Error(`✗ ${label}`);
  console.log(`  ✓ ${label}`);
}
async function expectForbidden(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    throw new Error(`✗ ${label} — expected FORBIDDEN, got success`);
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code !== "FORBIDDEN") throw new Error(`✗ ${label} — expected FORBIDDEN, got ${code ?? (e as Error).message}`);
    console.log(`  ✓ ${label} (denied)`);
  }
}

async function cleanup(testUserId: string) {
  await prisma.mentorLink.deleteMany({ where: { OR: [{ menteeUserId: testUserId }, { mentor: { email: FIXTURE_EMAIL } }] } }).catch(() => {});
  await prisma.user.deleteMany({ where: { email: FIXTURE_EMAIL } }).catch(() => {});
  // Reset the test user to a clean slate (mirrors resetTestUser).
  await prisma.$transaction([
    prisma.studyTask.deleteMany({ where: { userId: testUserId } }),
    prisma.calendarEvent.deleteMany({ where: { userId: testUserId } }),
    prisma.chatSession.deleteMany({ where: { userId: testUserId } }),
    prisma.userCourse.deleteMany({ where: { userId: testUserId } }),
  ]).catch(() => {});
  await prisma.miluimSemester.deleteMany({ where: { userId: testUserId } }).catch(() => {});
  await prisma.user.update({ where: { id: testUserId }, data: { miluimGroup: "NONE", focusArea: null, startYear: null, currentYear: 1 } }).catch(() => {});
}

async function main() {
  // Now that env is loaded, pull in the real routers.
  ({ createCallerFactory } = await import("@/server/trpc/init"));
  ({ planRouter } = await import("@/server/routers/plan"));
  ({ mentorRouter } = await import("@/server/routers/mentor"));

  const testUser = await prisma.user.findUnique({ where: { email: testEmail } });
  if (!testUser) throw new Error(`test user ${testEmail} not found`);

  // Fresh slate + a fixture mentor row (bare User, no auth account).
  await cleanup(testUser.id);
  const fixture = await prisma.user.create({
    data: { supabaseId: FIXTURE_SB, email: FIXTURE_EMAIL, firstName: "פיקס", lastName: "מנטור" },
  });

  try {
    const plan = caller(planRouter, testUser);
    const courses = await prisma.course.findMany({ where: { isActive: true, courseType: "MANDATORY" }, take: 4, select: { id: true, nameHe: true } });
    ok("have ≥3 catalog courses to test with", courses.length >= 3);

    // ---- King verbs ----
    console.log("King mutation verbs:");
    await plan.addCourse({ courseId: courses[0]!.id, plannedYear: 1, plannedSemester: "FALL" });
    await plan.addCourse({ courseId: courses[1]!.id, plannedYear: 1, plannedSemester: "FALL" });
    await plan.addCourse({ courseId: courses[2]!.id, plannedYear: 1, plannedSemester: "FALL" });
    let rows = await prisma.userCourse.findMany({ where: { userId: testUser.id }, orderBy: { createdAt: "asc" } });
    ok("addCourse created 3 plan rows", rows.length === 3);

    await plan.updateCourse({ userCourseId: rows[0]!.id, status: "COMPLETED", grade: 88 });
    await plan.updateCourse({ userCourseId: rows[1]!.id, status: "FAILED" });
    await plan.updateCourse({ userCourseId: rows[2]!.id, plannedSemester: "SPRING" });
    const after = await prisma.userCourse.findMany({ where: { userId: testUser.id } });
    const byId = new Map(after.map((r) => [r.id, r]));
    ok("COMPLETE_COURSE persisted status + grade 88", byId.get(rows[0]!.id)?.status === "COMPLETED" && byId.get(rows[0]!.id)?.grade === 88);
    ok("MARK_FAILED persisted status FAILED", byId.get(rows[1]!.id)?.status === "FAILED");
    ok("MOVE_COURSE persisted plannedSemester SPRING", byId.get(rows[2]!.id)?.plannedSemester === "SPRING");

    await plan.removeCourse({ userCourseId: rows[2]!.id });
    rows = await prisma.userCourse.findMany({ where: { userId: testUser.id } });
    ok("DROP_COURSE removed the row (2 left)", rows.length === 2 && !rows.some((r) => r.id === courses[2]!.id));

    // ---- Mentoring privacy ----
    console.log("Mentoring — consent + plan-only:");
    const menteeM = caller(mentorRouter, testUser);
    const mentorM = caller(mentorRouter, fixture);

    const inv = await menteeM.invite({ mentorEmail: FIXTURE_EMAIL });
    ok("invite created a PENDING link", inv.status === "PENDING");

    await expectForbidden("mentor CANNOT read plan while PENDING", () => mentorM.getMenteePlan({ menteeUserId: testUser.id }));

    const pend = await mentorM.pendingInvites();
    ok("mentor sees exactly 1 pending invite", pend.length === 1);
    const linkId = pend[0]!.linkId;
    const resp = await mentorM.respond({ linkId, accept: true });
    ok("mentor accepted → ACTIVE", resp.status === "ACTIVE");

    const view = await mentorM.getMenteePlan({ menteeUserId: testUser.id });
    ok("mentor now sees the plan (courses present)", view.courses.length === 2);
    // THE privacy guarantee — no grade must appear anywhere in the payload.
    const json = JSON.stringify(view);
    ok("payload contains NO 'grade' field", !json.includes('"grade"') && !json.includes('"submissionGrade"'));
    ok("the real grade value (88) is NOT leaked", !json.includes("88"));

    // A DIFFERENT user must not read the plan (IDOR guard): the fixture asking
    // for its OWN id, or the mentee reading the mentor — both have no active row.
    await expectForbidden("no ACTIVE link the other direction (role confusion)", () => menteeM.getMenteePlan({ menteeUserId: fixture.id }));

    await menteeM.endLink({ linkId });
    await expectForbidden("access revoked after endLink", () => mentorM.getMenteePlan({ menteeUserId: testUser.id }));

    console.log("\n✅ ALL WRITE-PATH CHECKS PASSED");
  } finally {
    await cleanup(testUser.id);
    console.log("🧹 cleaned up (fixture deleted, test user reset)");
  }
}

main()
  .catch((e) => { console.error("\n" + (e as Error).message); process.exit(1); })
  .finally(() => prisma.$disconnect());
