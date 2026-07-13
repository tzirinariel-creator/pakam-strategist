// =========================================
// Curated demo seed for the demo account (demo@pakamon.dev).
//
// Paints a realistic, convincing picture so the app showcases well: a 2nd-year
// economics-focus PPE student, ~1.5 years of COMPLETED courses (Year 1 + Year 2
// Fall) with believable grades, plus a PLANNED current semester (Year 2 Spring).
// With this in place /record, the graduation score, the dashboard, and the
// planner all look populated and impressive instead of empty.
//
// SAFETY: looks up the demo user by email and ONLY ever touches that user's
// rows. Aborts safely if the demo user doesn't exist. Idempotent — re-running
// upserts UserCourse rows (matched on userId+courseId) rather than duplicating,
// and never touches any other user.
//
// Run: npx tsx prisma/seed-demo.ts
// =========================================

import { PrismaClient, type CourseStatus, type Semester } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!connectionString) throw new Error("DATABASE_URL or DIRECT_URL must be set");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const DEMO_EMAIL = (process.env.NEXT_PUBLIC_DEMO_USER_EMAIL || "demo@pakamon.dev").trim();

// ---------------------------------------------------------------------------
// The demo profile: a 2nd-year, economics-focus PPE student, mid-degree.
// currentYear/currentSemester = Year 2 Spring, so Year 1 (both semesters) and
// Year 2 Fall are in the PAST (COMPLETED) and Year 2 Spring is the live PLANNED
// semester. Grades are a realistic mix of 70s–90s (a couple of weaker math/stat
// courses, stronger humanities) — nothing absurd. Every course code below comes
// from the real catalog and is placed in a semester it is actually offered in.
// ---------------------------------------------------------------------------

const PROFILE = {
  displayName: "סטודנט/ית דמו",
  // A named persona so the demo dashboard greets "היי יובל" — showcasing the
  // personalization instead of the awkward "היי חשבון" (live-verify 13.7;
  // firstNameOf prefers firstName, then displayName's first word).
  firstName: "יובל",
  focusArea: "ECONOMICS",
  currentYear: 2,
  currentSemester: "SPRING" as Semester,
};

interface SeedCourse {
  code: string;
  year: number;
  semester: Semester;
  status: CourseStatus;
  grade: number | null;
}

// Year 1 — Fall (COMPLETED). Foundations: logic, intro philosophy, math, polsci.
const YEAR1_FALL: SeedCourse[] = [
  { code: "0618-1012", year: 1, semester: "FALL", status: "COMPLETED", grade: 84 }, // מבוא ללוגיקה
  { code: "0618-1018", year: 1, semester: "FALL", status: "COMPLETED", grade: 91 }, // פילוסופיה של המוסר
  { code: "0618-1019", year: 1, semester: "FALL", status: "COMPLETED", grade: 88 }, // פילוסופיה פוליטית
  { code: "0618-1037", year: 1, semester: "FALL", status: "COMPLETED", grade: 86 }, // תורת ההכרה ומטאפיזיקה
  { code: "0651-1007", year: 1, semester: "FALL", status: "COMPLETED", grade: 79 }, // מתמטיקה לפכ"מ
  { code: "1031-1002", year: 1, semester: "FALL", status: "COMPLETED", grade: 90 }, // פוליטיקה ומשטר בישראל
  { code: "1031-1100", year: 1, semester: "FALL", status: "COMPLETED", grade: 87 }, // כתיבה ומחקר במדע המדינה
  { code: "0651-1001", year: 1, semester: "FALL", status: "COMPLETED", grade: 93 }, // קריאה מודרכת א'
  { code: "0651-1019", year: 1, semester: "FALL", status: "COMPLETED", grade: 89 }, // תרגיל צמוד לפ"פ
];

// Year 1 — Spring (COMPLETED). Stats, micro, first law course, more philosophy.
const YEAR1_SPRING: SeedCourse[] = [
  { code: "0618-1032", year: 1, semester: "SPRING", status: "COMPLETED", grade: 85 }, // פילוסופיה חדשה
  { code: "0651-1003", year: 1, semester: "SPRING", status: "COMPLETED", grade: 82 }, // פילוסופיה של מדעי החברה
  { code: "0651-1005", year: 1, semester: "SPRING", status: "COMPLETED", grade: 77 }, // סטטיסטיקה לפכ"מ
  { code: "1011-2103", year: 1, semester: "SPRING", status: "COMPLETED", grade: 81 }, // מיקרו כלכלה א'
  { code: "1031-2108", year: 1, semester: "SPRING", status: "COMPLETED", grade: 88 }, // אסטרטגיה בעידן המודרני
  { code: "1411-9107", year: 1, semester: "SPRING", status: "COMPLETED", grade: 90 }, // חקיקה ורגולציה
  { code: "0651-1002", year: 1, semester: "SPRING", status: "COMPLETED", grade: 92 }, // קריאה מודרכת ב'
];

// Year 2 — Fall (COMPLETED). The econ-heavy core + two English courses (one of
// them econ, reinforcing the focus area and covering the English requirement).
const YEAR2_FALL: SeedCourse[] = [
  { code: "0618-2200", year: 2, semester: "FALL", status: "COMPLETED", grade: 83 }, // פילוסופיה של המאה ה-19
  { code: "1011-2101", year: 2, semester: "FALL", status: "COMPLETED", grade: 80 }, // מאקרו כלכלה
  { code: "1011-2106", year: 2, semester: "FALL", status: "COMPLETED", grade: 76 }, // מבוא לאקונומטריקה
  { code: "1011-2109", year: 2, semester: "FALL", status: "COMPLETED", grade: 84 }, // מיקרו כלכלה ב'
  { code: "1011-3310", year: 2, semester: "FALL", status: "COMPLETED", grade: 89 }, // כלכלה בינלאומית (אנגלית)
  { code: "0618-2741", year: 2, semester: "FALL", status: "COMPLETED", grade: 87 }, // צדק חלוקתי (אנגלית)
];

// Year 2 — Spring (PLANNED current semester). No grades yet — this is the live
// schedule the student is mid-way through; it populates the planner + timetable.
const YEAR2_SPRING_PLANNED: SeedCourse[] = [
  { code: "0651-1010", year: 2, semester: "SPRING", status: "PLANNED", grade: null }, // כלכלה פוליטית בינלאומית
  { code: "1031-1108", year: 2, semester: "SPRING", status: "PLANNED", grade: null }, // פוליטיקה השוואתית
  { code: "0618-2601", year: 2, semester: "SPRING", status: "PLANNED", grade: null }, // פילוסופיה של המוסר - המשך
  { code: "1011-3359", year: 2, semester: "SPRING", status: "PLANNED", grade: null }, // ארגון תעשייתי (אנגלית, econ)
  { code: "1011-3483", year: 2, semester: "SPRING", status: "PLANNED", grade: null }, // מדיניות מוניטרית (econ elective)
];

const ALL_COURSES: SeedCourse[] = [
  ...YEAR1_FALL,
  ...YEAR1_SPRING,
  ...YEAR2_FALL,
  ...YEAR2_SPRING_PLANNED,
];

async function main() {
  // 1) Find the demo user — and ONLY the demo user. Abort safely if absent.
  const user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (!user) {
    console.error(
      `⚠️  Demo user "${DEMO_EMAIL}" not found — nothing seeded. ` +
        `Create the demo account first (e.g. the /api/setup-demo-users route), then re-run.`,
    );
    await prisma.$disconnect();
    process.exit(0);
  }

  // 2) Set the demo profile (focus area + current placement). Scoped to this user.
  await prisma.user.update({
    where: { id: user.id },
    data: {
      displayName: PROFILE.displayName,
      firstName: PROFILE.firstName,
      focusArea: PROFILE.focusArea,
      currentYear: PROFILE.currentYear,
      currentSemester: PROFILE.currentSemester,
    },
  });

  // 3) Resolve course codes → ids in one query. Skip any code not in the DB so a
  //    partially-loaded catalog never crashes the seed.
  const codes = Array.from(new Set(ALL_COURSES.map((c) => c.code)));
  const dbCourses = await prisma.course.findMany({
    where: { code: { in: codes } },
    select: { id: true, code: true },
  });
  const idByCode = new Map(dbCourses.map((c) => [c.code, c.id]));

  // 4) Idempotently upsert each UserCourse — matched on (userId, courseId) just
  //    like plan.saveCompletedCourses — so re-running updates rather than
  //    duplicates. All writes are scoped to the demo user's id.
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let completedCount = 0;
  let plannedCount = 0;

  // No wrapping interactive transaction: every write is an idempotent upsert
  // scoped to the demo user, so atomicity isn't needed — and a single long
  // transaction over the Supabase pooler exceeds the 5s interactive timeout.
  for (const c of ALL_COURSES) {
    const courseId = idByCode.get(c.code);
    if (!courseId) {
      skipped++;
      continue;
    }

    const existing = await prisma.userCourse.findFirst({
      where: { userId: user.id, courseId },
    });

    if (existing) {
      await prisma.userCourse.update({
        where: { id: existing.id },
        data: {
          status: c.status,
          grade: c.grade,
          plannedYear: c.year,
          plannedSemester: c.semester,
        },
      });
      updated++;
    } else {
      await prisma.userCourse.create({
        data: {
          userId: user.id,
          courseId,
          status: c.status,
          grade: c.grade,
          plannedYear: c.year,
          plannedSemester: c.semester,
          attemptNumber: 1,
        },
      });
      created++;
    }

    if (c.status === "COMPLETED") completedCount++;
    else if (c.status === "PLANNED") plannedCount++;
  }

  // 5) Summary — completed credits + average over graded completed courses.
  const seededCourseIds = ALL_COURSES.map((c) => idByCode.get(c.code)).filter(
    (id): id is string => Boolean(id),
  );
  const seeded = await prisma.userCourse.findMany({
    where: { userId: user.id, courseId: { in: seededCourseIds } },
    include: { course: { select: { credits: true } } },
  });
  const completedCredits = seeded
    .filter((uc) => uc.status === "COMPLETED")
    .reduce((sum, uc) => sum + uc.course.credits, 0);
  const graded = seeded.filter(
    (uc) => uc.status === "COMPLETED" && uc.grade !== null,
  );
  const avg =
    graded.length > 0
      ? graded.reduce((s, uc) => s + (uc.grade ?? 0), 0) / graded.length
      : 0;

  console.log(`✅ Demo seed complete for ${DEMO_EMAIL}`);
  console.log(
    `   profile: economics-focus · Year ${PROFILE.currentYear} · ${PROFILE.currentSemester}`,
  );
  console.log(`   userCourses: ${created} created, ${updated} updated, ${skipped} skipped (code not in DB)`);
  console.log(`   courses: ${completedCount} completed, ${plannedCount} planned (Year 2 Spring)`);
  console.log(`   completed credits: ${completedCredits} · avg over ${graded.length} graded: ${avg.toFixed(1)}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
