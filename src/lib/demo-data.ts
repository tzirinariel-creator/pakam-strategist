/**
 * Demo showcase seeding for the shared demo account.
 *
 * The demo account is READ-ONLY (every mutation is blocked in the tRPC init
 * guard, except this reset) — so it can never build a plan through the UI.
 * The constitution's intent is a rich SHOWCASE ("מצב-דמו: באנר + נתוני-דוגמה
 * בכוונה"): a realistic mid-degree student people can browse.
 *
 * History (11.7): this function used to WIPE without seeding ("start from
 * scratch"), while every demo login routes to /dashboard?reset=demo — the
 * combination permanently emptied the public showcase the moment the reset
 * exception went live. Now the reset restores a pristine, rich demo student:
 * wipe → seed. Every demo login re-runs it, so the showcase self-heals.
 *
 * The seed is CATALOG-DRIVEN (no hardcoded course ids): year-1 mandatory
 * courses are COMPLETED with realistic deterministic grades, year-2 FALL is
 * COMPLETED, year-2 SPRING is IN_PROGRESS (matching a real July), and a slice
 * of year-3 is PLANNED. Grades are derived from a stable hash of the course
 * code — same demo every reset, honest spread, always above the year gates.
 */

import type { PrismaClient } from "@prisma/client";

// Stable tiny hash — same course code → same demo grade on every reset.
function codeHash(code: string): number {
  let h = 0;
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) % 9973;
  return h;
}

/** Deterministic realistic grade in 78–97 — above the 75/80 year gates so the
 *  showcase student is calm/compliant (the gates are demonstrated by copy, not
 *  by scaring browsers with a blocked demo student). */
function demoGrade(code: string): number {
  return 78 + (codeHash(code) % 20);
}

type CatalogCourse = {
  id: string;
  code: string;
  credits: number;
  isMandatory: boolean;
  courseType: string;
  discipline: string;
  yearOffered: number[];
  semesterOffered: string[];
};

/** FALL/SPRING placement: prefer the course's own offering; alternate for
 *  both-semester courses so each semester looks like a real ~15-20 ש״ס load. */
function pickSemester(c: CatalogCourse, index: number): "FALL" | "SPRING" {
  const offersFall = c.semesterOffered.includes("FALL");
  const offersSpring = c.semesterOffered.includes("SPRING");
  if (offersFall && !offersSpring) return "FALL";
  if (offersSpring && !offersFall) return "SPRING";
  return index % 2 === 0 ? "FALL" : "SPRING";
}

export async function seedDemoData(db: PrismaClient, userId: string) {
  // 1. Wipe — the reset must be idempotent (same pristine state every login).
  await db.$transaction([
    db.studyTask.deleteMany({ where: { userId } }),
    db.calendarEvent.deleteMany({ where: { userId } }),
    db.chatSession.deleteMany({ where: { userId } }),
    db.studyMaterial.deleteMany({ where: { userId } }),
    db.synthesisNote.deleteMany({ where: { userId } }),
    db.syllabus.deleteMany({ where: { userId } }),
    db.userCourse.deleteMany({ where: { userId } }),
    db.miluimSemester.deleteMany({ where: { userId } }),
  ]);

  // 2. Build the showcase plan from the LIVE catalog (survives catalog changes).
  const catalog = (await db.course.findMany({
    where: { isActive: true },
    select: {
      id: true,
      code: true,
      credits: true,
      isMandatory: true,
      courseType: true,
      discipline: true,
      yearOffered: true,
      semesterOffered: true,
    },
    orderBy: { code: "asc" }, // deterministic
  })) as CatalogCourse[];

  const mandatoryOfYear = (y: number) =>
    catalog.filter((c) => c.isMandatory && c.yearOffered.includes(y));
  const electives = catalog.filter((c) => c.courseType === "ELECTIVE");
  const englishContent = catalog.filter((c) => c.courseType === "ENGLISH");

  type Row = {
    userId: string;
    courseId: string;
    status: "COMPLETED" | "IN_PROGRESS" | "PLANNED";
    grade: number | null;
    plannedYear: number;
    plannedSemester: "FALL" | "SPRING";
  };
  const rows: Row[] = [];
  const used = new Set<string>();
  const push = (
    c: CatalogCourse,
    status: Row["status"],
    plannedYear: number,
    plannedSemester: "FALL" | "SPRING",
    graded: boolean,
  ) => {
    if (used.has(c.id)) return;
    used.add(c.id);
    rows.push({
      userId,
      courseId: c.id,
      status,
      grade: graded ? demoGrade(c.code) : null,
      plannedYear,
      plannedSemester,
    });
  };

  // Year 1 — fully behind us, graded. Year 2 FALL — graded; SPRING — in progress
  // (it's summer: the semester just ended, grades not in yet — the honest state).
  mandatoryOfYear(1).forEach((c, i) => push(c, "COMPLETED", 1, pickSemester(c, i), true));
  mandatoryOfYear(2).forEach((c, i) => {
    const sem = pickSemester(c, i);
    push(c, sem === "FALL" ? "COMPLETED" : "IN_PROGRESS", 2, sem, sem === "FALL");
  });
  // Two general electives taken along the way + one English content course done,
  // one planned (the PKM-012 pair, mid-way — a real mid-degree state).
  electives.slice(0, 1).forEach((c) => push(c, "COMPLETED", 1, "SPRING", true));
  electives.slice(1, 2).forEach((c) => push(c, "COMPLETED", 2, "FALL", true));
  englishContent.slice(0, 1).forEach((c) => push(c, "COMPLETED", 2, "FALL", true));
  englishContent.slice(1, 2).forEach((c) => push(c, "PLANNED", 3, "FALL", false));
  // A taste of year 3 on the board — so the planner/board shows a future.
  mandatoryOfYear(3)
    .slice(0, 4)
    .forEach((c, i) => push(c, "PLANNED", 3, pickSemester(c, i), false));
  electives.slice(2, 5).forEach((c, i) => push(c, "PLANNED", 3, i % 2 ? "SPRING" : "FALL", false));

  if (rows.length > 0) {
    await db.userCourse.createMany({ data: rows, skipDuplicates: true });
  }

  // 3. Profile — a coherent year-2 student (July = just finished year-2 SPRING).
  await db.user.update({
    where: { id: userId },
    data: {
      displayName: "חשבון הדמו",
      firstName: null, // inclusive plural copy everywhere — no invented persona
      gender: null,
      focusArea: "ECONOMICS",
      currentYear: 2,
      currentSemester: "SPRING",
      startYear: new Date().getFullYear() - 2,
      locale: "he",
      theme: "dark",
      miluimGroup: "NONE",
      miluimCreditsUsed: 0,
      miluimBinaryUsed: 0,
      amiramScore: 140, // פטור — the showcase student cleared English placement
      englishLevel: null,
    },
  });

  return { coursesCreated: rows.length, tasksCreated: 0 };
}
