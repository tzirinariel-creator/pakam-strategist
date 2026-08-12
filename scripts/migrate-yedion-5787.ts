#!/usr/bin/env npx tsx
// =========================================================================
// Yedion תשפ״ז (5787 / 2026-27) migration
// =========================================================================
// Source of truth: the official TAU yedion page for the PPE program,
// exported by Ariel on 13.8.2026 ("ידיעון תשפז מעודכן לפכמון.docx").
// Parsed into scripts/yedion_classified.json (302 courses) and
// scripts/yedion_schedule.json (556 meetings / 317 groups).
//
// SAFETY RULES (this runs against the ONE production DB with real students):
//  1. NEVER delete a Course. ~24 real users hold 248 userCourse rows across
//     57 courses — deleting would destroy their academic record.
//  2. Courses absent from תשפ״ז are DEACTIVATED (isActive=false), which only
//     hides them from forward-planning surfaces. Historical userCourse rows
//     join by courseId and still render.
//  3. For courses that ALREADY exist we only correct `credits` (3 known
//     mismatches) — courseType/discipline stay as curated, because the DB
//     carries hand-tuned data (e.g. ENGLISH-taught flags) the yedion's
//     section headers cannot express.
//  4. Schedule sessions ARE replaced: the 187 stored rows are stale תשפ״ו
//     content, and Ariel's explicit instruction is "מה שיש בתשפ״ו לא מעודכן
//     ולא רלוונטי". תשפ״ז groups/rooms/hours load fresh.
//  5. Exam dates are NOT touched — the תשפ״ז exam tab is still empty on the
//     university site ("לוח הבחינות והמטלות יפורסם בהמשך"). Inventing them
//     is forbidden by the project's iron rules.
//
// Usage:
//   npx tsx scripts/migrate-yedion-5787.ts            # DRY RUN (default)
//   npx tsx scripts/migrate-yedion-5787.ts --apply    # write to the DB
// =========================================================================
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "node:fs";
import path from "node:path";

const REPO = path.join(__dirname, "..");
for (const envFile of [".env.local", ".env"]) {
  const p = path.join(REPO, envFile);
  if (fs.existsSync(p)) {
    for (const line of fs.readFileSync(p, "utf-8").split("\n")) {
      const t = line.trim();
      if (t && !t.startsWith("#")) {
        const i = t.indexOf("=");
        if (i > 0) {
          const k = t.substring(0, i);
          if (!process.env[k]) process.env[k] = t.substring(i + 1);
        }
      }
    }
    break;
  }
}

const APPLY = process.argv.includes("--apply");
/** תשפ״ז — matches TAU_CALENDARS' startYear convention in academic-calendar.ts. */
const ACADEMIC_YEAR = 2026;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

type YedCourse = {
  code: string;
  name: string;
  credits: number | null;
  year: number | null;
  section: string | null;
  courseType: string;
  discipline: string;
  semesters: string[];
};
type YedMeeting = {
  code: string;
  name: string;
  group: string;
  mode: string;
  freq: string;
  semester: string;
  day: string;
  start: string;
  end: string;
  teacher: string | null;
  location: string | null;
};

const DAY_MAP: Record<string, string> = {
  "א": "SUNDAY", "ב": "MONDAY", "ג": "TUESDAY",
  "ד": "WEDNESDAY", "ה": "THURSDAY", "ו": "FRIDAY",
};
/** Yedion teaching-mode → the app's sessionType vocabulary. */
function sessionTypeOf(mode: string): string {
  if (mode.includes("תרגיל")) return "tutorial";
  if (mode.includes("סמינר") || mode.includes("פרוסמינר")) return "seminar";
  if (mode.includes("סדנה")) return "workshop";
  if (mode.includes("פרוייקט") || mode.includes("פרויקט")) return "project";
  return "lecture";
}
/** Split "…גילמן 361 א" into a building phrase and a room token when possible. */
function splitLocation(loc: string | null): { building: string | null; room: string | null } {
  if (!loc) return { building: null, room: null };
  const m = loc.match(/^(.*?)\s+(\d+[א-ת]?)\s*[א-ת]?$/);
  if (m && m[1] && m[2]) return { building: m[1].trim(), room: m[2] };
  return { building: loc, room: null };
}

async function main() {
  console.log(`\n${"=".repeat(66)}`);
  console.log(`  ידיעון תשפ״ז migration — ${APPLY ? "APPLY (writing)" : "DRY RUN (no writes)"}`);
  console.log(`${"=".repeat(66)}\n`);

  const courses: YedCourse[] = JSON.parse(
    fs.readFileSync(path.join(__dirname, "yedion_classified.json"), "utf-8"),
  );
  const meetings: YedMeeting[] = JSON.parse(
    fs.readFileSync(path.join(__dirname, "yedion_schedule.json"), "utf-8"),
  );

  const db = await prisma.course.findMany({
    select: { id: true, code: true, nameHe: true, credits: true, isActive: true, courseType: true },
  });
  const dbByCode = new Map(db.map((c) => [c.code, c]));
  const yedCodes = new Set(courses.map((c) => c.code));

  // Which courses do real students actually hold? Never lose these.
  const held = await prisma.userCourse.findMany({
    select: { course: { select: { code: true } } },
    distinct: ["courseId"],
  });
  const heldCodes = new Set(held.map((h) => h.course.code));

  const toCreate = courses.filter((c) => !dbByCode.has(c.code));
  const toFixCredits = courses.filter((c) => {
    const d = dbByCode.get(c.code);
    return d && c.credits != null && Math.abs(Number(d.credits) - c.credits) > 0.01;
  });
  const toDeactivate = db.filter((d) => !yedCodes.has(d.code) && d.isActive);

  console.log(`── COURSES ─────────────────────────────────────────`);
  console.log(`  in yedion תשפ״ז        : ${courses.length}`);
  console.log(`  in DB                  : ${db.length}`);
  console.log(`  → CREATE (new)         : ${toCreate.length}`);
  console.log(`  → FIX credits          : ${toFixCredits.length}`);
  for (const c of toFixCredits) {
    const d = dbByCode.get(c.code)!;
    console.log(`      ${c.code}  ${d.nameHe.slice(0, 34).padEnd(34)}  ${d.credits} → ${c.credits}`);
  }
  console.log(`  → DEACTIVATE (not in תשפ״ז): ${toDeactivate.length}`);
  const deactivatedButHeld = toDeactivate.filter((d) => heldCodes.has(d.code));
  console.log(`      …of which students already took: ${deactivatedButHeld.length} (history preserved, hidden from planning)`);

  // Schedule
  const validMeetings = meetings.filter((m) => DAY_MAP[m.day] && (m.semester === "א" || m.semester === "ב"));
  const skipped = meetings.length - validMeetings.length;
  const schedCodes = new Set(validMeetings.map((m) => m.code));
  const orphan = [...schedCodes].filter((c) => !yedCodes.has(c) && !dbByCode.has(c));
  const existingSessions = await prisma.scheduleSession.count();

  console.log(`\n── SCHEDULE ────────────────────────────────────────`);
  console.log(`  parsed meetings        : ${meetings.length}  (usable: ${validMeetings.length}, skipped: ${skipped})`);
  console.log(`  distinct courses       : ${schedCodes.size}`);
  console.log(`  distinct (course,group): ${new Set(validMeetings.map((m) => m.code + "|" + m.group)).size}`);
  console.log(`  sessions currently in DB (stale תשפ״ו): ${existingSessions} → will be REPLACED`);
  console.log(`  meetings whose course is unknown: ${orphan.length}${orphan.length ? " " + orphan.slice(0, 5).join(",") : ""}`);

  if (!APPLY) {
    console.log(`\n⚠️  DRY RUN — nothing written. Re-run with --apply to commit.\n`);
    return;
  }

  // ---- WRITE ----
  console.log(`\n── WRITING ─────────────────────────────────────────`);
  let created = 0;
  for (const c of toCreate) {
    const sems = c.semesters.length ? c.semesters : ["FALL", "SPRING"];
    await prisma.course.create({
      data: {
        code: c.code,
        nameHe: c.name || c.code,
        discipline: c.discipline,
        courseType: c.courseType as never,
        credits: c.credits ?? 0,
        yearOffered: c.year ? [c.year] : [1, 2, 3],
        semesterOffered: sems as never,
        isMandatory: c.courseType === "MANDATORY",
        isActive: true,
        lastSyncedAt: new Date(),
      },
    });
    created++;
  }
  console.log(`  created courses      : ${created}`);

  for (const c of toFixCredits) {
    await prisma.course.update({ where: { code: c.code }, data: { credits: c.credits!, lastSyncedAt: new Date() } });
  }
  console.log(`  credit fixes         : ${toFixCredits.length}`);

  if (toDeactivate.length) {
    await prisma.course.updateMany({
      where: { code: { in: toDeactivate.map((d) => d.code) } },
      data: { isActive: false },
    });
  }
  console.log(`  deactivated          : ${toDeactivate.length}`);

  // Replace schedule with תשפ״ז
  const delRes = await prisma.scheduleSession.deleteMany({});
  console.log(`  deleted stale sessions: ${delRes.count}`);

  const knownCodes = new Set((await prisma.course.findMany({ select: { code: true } })).map((c) => c.code));
  const rows = validMeetings
    .filter((m) => knownCodes.has(m.code))
    .map((m) => {
      const { building, room } = splitLocation(m.location);
      return {
        courseCode: m.code,
        dayOfWeek: DAY_MAP[m.day] as never,
        startTime: m.start,
        endTime: m.end,
        room,
        building,
        sessionType: sessionTypeOf(m.mode),
        semester: (m.semester === "א" ? "FALL" : "SPRING") as never,
        academicYear: ACADEMIC_YEAR,
        groupCode: m.group,
        lecturerName: m.teacher,
      };
    });
  const ins = await prisma.scheduleSession.createMany({ data: rows });
  console.log(`  inserted תשפ״ז sessions: ${ins.count}`);

  const finalCourses = await prisma.course.count();
  const finalActive = await prisma.course.count({ where: { isActive: true } });
  const finalSessions = await prisma.scheduleSession.count();
  console.log(`\n── RESULT ──────────────────────────────────────────`);
  console.log(`  courses total ${finalCourses} | active ${finalActive} | sessions ${finalSessions}`);
  console.log(`✅ תשפ״ז migration applied.\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
