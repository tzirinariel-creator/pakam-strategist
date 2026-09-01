import { z } from "zod/v4";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure, createRequestLoaders } from "../trpc/init";
import { calculateCredits } from "@/lib/credit-calculator";
import { calculateGraduationScore } from "@/lib/grade-calculator";
import { computeCreditExemption, deriveCurrentGroup, getCurrentAcademicYear, prefersHigherGrade, type MiluimGroupKey } from "@/lib/miluim";
import { getAcademicNow } from "@/lib/academic-calendar";
import { getAllDisciplineIds } from "@/lib/programs/registry";
import { customCourseCode } from "@/lib/off-catalog";

// Discipline enum covering ALL registered programs (PPE, Law, etc.)
const disciplineEnum = z.enum(getAllDisciplineIds());

export const planRouter = createTRPCRouter({
  /**
   * Get the current user's full degree plan — all UserCourse records
   * with related Course data, grouped by plannedYear and plannedSemester.
   */
  getUserPlan: protectedProcedure.query(async ({ ctx }) => {
    // Authenticated user row already loaded + verified by enforceAuth — reuse
    // it instead of a redundant per-procedure findUnique (#9 N+1 fix).
    const user = ctx.user;

    // PERF2 — request-scoped loader: shared with getCredits/getGraduationScore/
    // checkCompliance when the dashboard batches them into one request.
    const loaders = ctx.loaders ?? createRequestLoaders(ctx.db);
    const userCourses = await loaders.userCoursesWithCourse(user.id);

    // PERF (#31) — this used to ALSO return a `semesters` map: the exact same
    // course objects a second time, grouped by `${plannedYear}-${plannedSemester}`.
    // Measured on a 32-course account that doubled the response from ~53 KB to
    // ~106 KB (44 KB of duplicated rows + the superjson Date-metadata paths for
    // every duplicated field). getUserPlan is the app's hottest query — it is
    // refetched after EVERY grade save — and exactly one of its 30+ call sites
    // ever read `semesters` (the calendar). Grouping is a one-line client-side
    // reduce (`groupCoursesBySemester`), so the server no longer ships it.
    return { courses: userCourses };
  }),

  /**
   * Add a course to the user's plan
   */
  addCourse: protectedProcedure
    .input(
      z.object({
        courseId: z.string().uuid(),
        plannedYear: z.number().int().min(1).max(4),
        plannedSemester: z.enum(["FALL", "SPRING", "SUMMER"]),
        disciplineOverride: disciplineEnum.optional(),
        selectedGroups: z
          .record(z.string().max(30), z.string().max(30))
          .refine((o) => Object.keys(o).length <= 30, "too many groups")
          .optional(), // { "tutorial": "B", "lab": "01" }
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user; // enforceAuth already loaded the row (#9: no refetch)

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      // Check that the course exists
      const course = await ctx.db.course.findUnique({
        where: { id: input.courseId },
      });

      if (!course) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Course not found" });
      }

      // Atomic check-and-create inside a transaction to prevent race conditions
      // (two parallel requests could otherwise both pass the duplicate check).
      const userCourse = await ctx.db.$transaction(async (tx) => {
        // Check for duplicate — same course in same semester (idempotent for onboarding retries)
        const duplicate = await tx.userCourse.findFirst({
          where: {
            userId: user.id,
            courseId: input.courseId,
            plannedYear: input.plannedYear,
            plannedSemester: input.plannedSemester,
          },
          include: { course: true },
        });
        if (duplicate) {
          return duplicate;
        }

        // Determine next attempt number for this user+course pair
        const existingAttempts = await tx.userCourse.count({
          where: {
            userId: user.id,
            courseId: input.courseId,
          },
        });

        return tx.userCourse.create({
          data: {
            userId: user.id,
            courseId: input.courseId,
            plannedYear: input.plannedYear,
            plannedSemester: input.plannedSemester,
            disciplineOverride: input.disciplineOverride ?? null,
            selectedGroups: input.selectedGroups ?? undefined,
            attemptNumber: existingAttempts + 1,
          },
          include: { course: true },
        });
      });

      return userCourse;
    }),

  /**
   * Update a course in the user's plan
   */
  updateCourse: protectedProcedure
    .input(
      z.object({
        userCourseId: z.string().uuid(),
        plannedYear: z.number().int().min(1).max(4).optional(),
        plannedSemester: z.enum(["FALL", "SPRING", "SUMMER"]).optional(),
        status: z
          .enum(["PLANNED", "IN_PROGRESS", "COMPLETED", "FAILED", "EXEMPT"])
          .optional(),
        grade: z.number().min(0).max(100).nullable().optional(), // null clears the grade
        isBinary: z.boolean().optional(), // miluim pass/fail conversion
        disciplineOverride: disciplineEnum.nullable().optional(), // null clears a mis-assigned discipline
        attempt: z.number().int().min(1).optional(),
        // The degree score is 78% courses + 18% seminar papers + 4% referat
        // (grade-calculator.ts:56). The two fields the last 22% is built from
        // existed in the schema and were read in four places — and NOTHING in
        // the app could ever write them. Verified against production: 220
        // userCourse rows, 0 with submissionGrade, 0 with submissionType. So
        // `weightedScore` returned null for every user, always, and the screen
        // called "מחשבון ציון הגמר" could not produce its number for anyone
        // while telling them "את הציונים עצמם מזינים בתיק האקדמי" — a place
        // that had no such field.
        submissionType: z.enum(["PAPER", "REFERAT", "EXAM", "NONE"]).nullable().optional(),
        submissionGrade: z.number().min(0).max(100).nullable().optional(),
        selectedGroups: z
          .record(z.string().max(30), z.string().max(30))
          .refine((o) => Object.keys(o).length <= 30, "too many groups")
          .nullable()
          .optional(), // { "tutorial": "B" } or null to clear
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user; // enforceAuth already loaded the row (#9: no refetch)

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      // Verify the UserCourse belongs to this user
      const existing = await ctx.db.userCourse.findUnique({
        where: { id: input.userCourseId },
      });

      if (!existing || existing.userId !== user.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "UserCourse not found",
        });
      }

      // Duplicate guard (#35 root cause 1): moving a course into a semester
      // that already holds another row of the SAME course (a retake) used to
      // create two rows side by side — addCourse checks this, updateCourse
      // didn't. CONFLICT is mapped to a friendly toast by the movers.
      if (input.plannedYear !== undefined || input.plannedSemester !== undefined) {
        const targetYear = input.plannedYear ?? existing.plannedYear;
        const targetSemester = input.plannedSemester ?? existing.plannedSemester;
        const twin = await ctx.db.userCourse.findFirst({
          where: {
            userId: user.id,
            courseId: existing.courseId,
            plannedYear: targetYear,
            plannedSemester: targetSemester,
            id: { not: existing.id },
          },
          select: { id: true },
        });
        if (twin) {
          throw new TRPCError({ code: "CONFLICT", message: "COURSE_ALREADY_IN_SEMESTER" });
        }
      }

      const { userCourseId, attempt, selectedGroups, disciplineOverride, ...updateFields } =
        input;

      const data: Record<string, unknown> = { ...updateFields };
      if (attempt !== undefined) {
        data.attemptNumber = attempt;
      }
      if (selectedGroups !== undefined) {
        data.selectedGroups = selectedGroups; // null clears, object sets
      }
      if (disciplineOverride !== undefined) {
        // null clears a mis-assigned discipline override; a value sets it.
        data.disciplineOverride = disciplineOverride;
      }

      const updated = await ctx.db.userCourse.update({
        where: { id: userCourseId },
        data,
        include: { course: true },
      });

      return updated;
    }),

  /**
   * Remove a course from the user's plan
   */
  removeCourse: protectedProcedure
    .input(z.object({ userCourseId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user; // enforceAuth already loaded the row (#9: no refetch)

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      // Verify the UserCourse belongs to this user
      const existing = await ctx.db.userCourse.findUnique({
        where: { id: input.userCourseId },
      });

      if (!existing || existing.userId !== user.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "UserCourse not found",
        });
      }

      await ctx.db.userCourse.delete({
        where: { id: input.userCourseId },
      });

      return { success: true };
    }),

  /**
   * Get credit breakdown for the user's plan
   */
  getCredits: protectedProcedure.query(async ({ ctx }) => {
    // Authenticated user row already loaded + verified by enforceAuth — reuse
    // it instead of a redundant per-procedure findUnique (#9 N+1 fix).
    const user = ctx.user;

    const loaders = ctx.loaders ?? createRequestLoaders(ctx.db);
    const userCourses = await loaders.userCoursesWithCourse(user.id);

    // Per-semester miluim rows (may be empty). The current group is the row for
    // the user's current academic year + semester, else the stored miluimGroup —
    // a user with NO rows gets the EXACT same group (and exemption) as before.
    const miluimSemesters = await loaders.miluimSemesters(user.id);
    // academicYear MUST be the calendar-year key used when the rows were
    // WRITTEN (getCurrentAcademicYear), NOT user.currentYear (academic standing
    // 1–4) — those never match, which silently killed per-semester resolution.
    const currentGroup = deriveCurrentGroup(miluimSemesters, user.miluimGroup, {
      academicYear: getCurrentAcademicYear(),
      // Real-time semester (calendar source-of-truth) so the dashboard credit
      // exemption matches the client miluim surfaces after a rollover (#audit-r2).
      semester: getAcademicNow().semester,
    });
    // Credit exemption, capped at the per-degree maximum minus what's already
    // been used. With no rows + miluimCreditsUsed 0 this equals the old
    // min(group rate, 10) — no regression.
    const miluimExemption = computeCreditExemption(currentGroup, user.miluimCreditsUsed);

    const breakdown = calculateCredits(userCourses, user.focusArea, miluimExemption);
    return breakdown;
  }),

  /**
   * Get graduation score for completed courses
   */
  getGraduationScore: protectedProcedure.query(async ({ ctx }) => {
    // Authenticated user row already loaded + verified by enforceAuth — reuse
    // it instead of a redundant per-procedure findUnique (#9 N+1 fix).
    const user = ctx.user;

    // PERF2 — reuse the request-scoped full fetch and filter in memory; the
    // COMPLETED-with-grade subset is tiny relative to a second round-trip.
    const loaders = ctx.loaders ?? createRequestLoaders(ctx.db);
    const all = await loaders.userCoursesWithCourse(user.id);
    // A seminar paper carries its mark in `submissionGrade`, and often has no
    // numeric `grade` at all — so filtering on `grade !== null` threw away the
    // 18% before it could be counted. Keep a completed row if it carries
    // EITHER mark; the calculator already ignores the one that is missing.
    const userCourses = all.filter(
      (uc) =>
        uc.status === "COMPLETED" && (uc.grade !== null || uc.submissionGrade !== null),
    );

    // B/C/G reservists' higher exam grade counts (Ariel 23.7) — the headline
    // graduation score must honor the same rule the app promises them.
    const gradeBreakdown = calculateGraduationScore(userCourses, {
      preferHigherGrade: prefersHigherGrade((user.miluimGroup ?? "NONE") as MiluimGroupKey),
    });
    return gradeBreakdown;
  }),

  /**
   * Bulk save an entire plan from onboarding — single request instead of N
   * Deletes any existing courses and replaces with the new plan.
   */
  savePlan: protectedProcedure
    .input(
      z.object({
        courses: z.array(
          z.object({
            courseId: z.string().uuid(),
            plannedYear: z.number().int().min(1).max(4),
            plannedSemester: z.enum(["FALL", "SPRING", "SUMMER"]),
            selectedGroups: z
              .record(z.string().max(30), z.string().max(30))
              .refine((o) => Object.keys(o).length <= 30, "too many groups")
              .optional(), // { "tutorial": "B", "lab": "01" }
            // Which discipline this course counts toward FOR THIS STUDENT.
            // savePlan deletes+recreates every PLANNED row, so without carrying
            // the override through here, every re-save silently wiped it — a
            // student who re-filed a course (or declared an off-catalog course
            // approved for their degree, note #8) lost that on the next edit.
            disciplineOverride: disciplineEnum.nullish(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user; // enforceAuth already loaded the row (#9: no refetch)

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      // De-dupe on courseId BEFORE insert. All saved rows use attemptNumber 1,
      // so the @@unique([userId, courseId, attemptNumber]) means the same course
      // placed in two semesters would silently collide — createMany's
      // skipDuplicates drops the second row. Collapsing here (first placement
      // wins) makes the dropped course visible in the count instead of the old
      // bug where savedCount claimed the full input.courses.length.
      const seen = new Set<string>();
      const deduped = input.courses.filter((c) => {
        if (seen.has(c.courseId)) return false;
        seen.add(c.courseId);
        return true;
      });

      // GUARD (QA 13.7): an EMPTY payload must NEVER wipe the plan. A stray empty
      // save — e.g. onboarding auto-saving before the course catalog finished
      // loading, so every planned courseId got dropped — previously deleted the
      // PLANNED/IN_PROGRESS rows and then wrote nothing, silently "succeeding"
      // with a zero-course plan (→ empty dashboard + the 8x retry loop). No UI
      // legitimately clears the plan to zero (the planner's Done button is
      // disabled at 0 courses), so treat an empty save as a NO-OP.
      if (deduped.length === 0) {
        return { savedCount: 0, removedCount: 0, requested: 0, skippedEmpty: true };
      }

      // Ariel, 1.9: "לדעתי תכננתי את הקורסים וזה נמחק משום מה" ·
      // "נראה שיש פה איזה באג רציני עם הסנכרון של התכנן".
      //
      // This used to be delete-everything-then-recreate. The delete had no
      // filter beyond the status, but the re-create could only write back what
      // ONE screen happened to send — so every gap between the two was a
      // silent deletion:
      //
      //   · SUMMER rows. The semester board loads only FALL/SPRING, so it
      //     never sent them back, and the delete took them anyway. year-board
      //     already carries a rescue path for these, which is how we know real
      //     accounts have them.
      //   · Second-sitting rows (attemptNumber ≥ 2). addCourse creates them,
      //     the floating assistant recommends creating them — and the re-create
      //     was hardcoded to attemptNumber: 1, so they were deleted and never
      //     came back.
      //   · Anything added after the board mounted. The board seeds its state
      //     once, in a useState initializer, and never re-reads. The assistant
      //     runs on that same screen and can add or drop a course underneath
      //     it; pressing "finished" then wrote the stale snapshot over the top.
      //
      // And skipDuplicates turned the remaining collisions into silence: a
      // course with an existing COMPLETED/FAILED row at attempt 1 collided
      // with the unique key and was simply dropped, with the mutation still
      // reporting success.
      //
      // So this reconciles instead of replacing. It matches the payload only
      // against rows the board actually manages, updates those in place, and
      // creates a genuinely new attempt for the rest. Nothing outside that set
      // is touched.
      const result = await ctx.db.$transaction(async (tx) => {
        const existing = await tx.userCourse.findMany({
          where: { userId: user.id },
          select: {
            id: true, courseId: true, status: true, attemptNumber: true,
            plannedSemester: true,
          },
        });

        // Only these rows are the board's to move. A COMPLETED / FAILED /
        // EXEMPT row is the student's earned record, and a SUMMER row is not
        // on the board at all.
        const managed = existing.filter(
          (r) =>
            (r.status === "PLANNED" || r.status === "IN_PROGRESS") &&
            (r.plannedSemester === "FALL" || r.plannedSemester === "SPRING"),
        );
        const managedByCourse = new Map(managed.map((r) => [r.courseId, r]));
        const incoming = new Set(deduped.map((c) => c.courseId));

        // Remove only what the student actually took OFF the board.
        const toRemove = managed.filter((r) => !incoming.has(r.courseId));
        if (toRemove.length > 0) {
          await tx.userCourse.deleteMany({
            where: { id: { in: toRemove.map((r) => r.id) } },
          });
        }

        // The highest attempt per course, so a genuinely new row does not
        // collide with a finished one on @@unique([userId, courseId, attempt]).
        const maxAttempt = new Map<string, number>();
        for (const r of existing) {
          maxAttempt.set(r.courseId, Math.max(maxAttempt.get(r.courseId) ?? 0, r.attemptNumber));
        }

        let written = 0;

        for (const c of deduped) {
          const row = managedByCourse.get(c.courseId);
          if (row) {
            // In place: placement and group choices are the board's business.
            // status, grade, isBinary and attemptNumber are NOT — rewriting a
            // row is what used to turn "בלימוד" back into "מתוכנן".
            await tx.userCourse.update({
              where: { id: row.id },
              data: {
                plannedYear: c.plannedYear,
                plannedSemester: c.plannedSemester,
                selectedGroups: c.selectedGroups ?? undefined,
                ...(c.disciplineOverride !== undefined
                  ? { disciplineOverride: c.disciplineOverride ?? null }
                  : {}),
              },
            });
            written += 1;
            continue;
          }

          await tx.userCourse.create({
            data: {
              userId: user.id,
              courseId: c.courseId,
              plannedYear: c.plannedYear,
              plannedSemester: c.plannedSemester,
              selectedGroups: c.selectedGroups ?? undefined,
              disciplineOverride: c.disciplineOverride ?? null,
              attemptNumber: (maxAttempt.get(c.courseId) ?? 0) + 1,
            },
          });
          written += 1;
        }

        return { savedCount: written, removedCount: toRemove.length };
      }, { timeout: 15000, maxWait: 8000 });

      // `requested` lets the caller notice a partial write instead of showing
      // "נשמר" over one. The old shape returned only savedCount and every
      // caller ignored it.
      return { ...result, requested: deduped.length, skippedEmpty: false };
    }),

  /**
   * Save the user's past academic record from onboarding ("Your history").
   *
   * Takes courses the student already completed (by course CODE, with optional
   * grade) and upserts each as a UserCourse with status COMPLETED. Idempotent:
   * matched on userId + courseId, so re-running onboarding updates rather than
   * duplicates. Courses are matched by code; unknown codes are skipped.
   */
  /** #10 (12.7 test session) — a scanned row that matched nothing in the
   *  plan (e.g. a general-elective like "דוגרי" taken outside the PPE list)
   *  can be ADDED straight from the scanner: catalog hit by code/name when
   *  possible, otherwise a minimal custom Course row, then a userCourse with
   *  the scanned grade. #28 — `status` is now passed in from the row's DECLARED
   *  outcome (decideAddition) instead of being hardcoded COMPLETED, so a failed
   *  or exempt elective is recorded honestly. Defaults to COMPLETED for
   *  existing callers. Still one explicit, student-approved row at a time. */
  addScannedCourse: protectedProcedure
    .input(
      z.object({
        courseCode: z.string().max(40).nullable(),
        courseName: z.string().min(1).max(120),
        credits: z.number().min(0).max(20).nullable(),
        grade: z.number().min(0).max(100).nullable(),
        plannedYear: z.number().int().min(1).max(4),
        plannedSemester: z.enum(["FALL", "SPRING", "SUMMER"]),
        status: z.enum(["COMPLETED", "FAILED", "EXEMPT"]).default("COMPLETED"),
        // #8 — the student's own declaration: "this course counts toward my
        // degree, under this discipline". Written to UserCourse.
        // disciplineOverride (per-student, never onto the shared Course row),
        // which the credit engine already honors. Omitted = no declaration.
        discipline: disciplineEnum.nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user;
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

      // 1. Catalog hit — by exact code, else by exact Hebrew name.
      let course =
        (input.courseCode
          ? await ctx.db.course.findUnique({ where: { code: input.courseCode } })
          : null) ??
        (await ctx.db.course.findFirst({ where: { nameHe: input.courseName } }));

      // 2. No catalog row → create a minimal general-elective entry. The code
      //    is the sheet's real code when present (so future sheets re-match),
      //    else a stable name-derived custom code.
      if (!course) {
        const code =
          input.courseCode && input.courseCode.trim().length >= 4
            ? input.courseCode.trim()
            : customCourseCode(input.courseName);
        course = await ctx.db.course.upsert({
          where: { code },
          update: {},
          create: {
            code,
            nameHe: input.courseName,
            discipline: "GENERAL",
            courseType: "ELECTIVE",
            credits: input.credits ?? 2,
            yearOffered: [1, 2, 3],
            prerequisites: [],
            canCountAs: [],
            isMandatory: false,
            // A user-scanned ad-hoc course must NOT leak into the shared, PUBLIC
            // catalog (course.list is a publicProcedure gated on isActive:true).
            // isActive defaults to true, so set it false: the row still backs
            // THIS user's record (UserCourse joins by id regardless of isActive),
            // but nobody else sees the free-text name. If the real course is later
            // scraped, the arazim sync upserts by code and reactivates it.
            isActive: false,
          },
        });
      }

      // 3. The user row — upsert so a re-scan never duplicates.
      const existing = await ctx.db.userCourse.findFirst({
        where: { userId: user.id, courseId: course.id },
      });
      if (existing) {
        await ctx.db.userCourse.update({
          where: { id: existing.id },
          data: {
            status: input.status,
            grade: input.grade,
            // Only touch the declaration when this call actually carries one —
            // a re-scan that says nothing about the discipline must not erase
            // a declaration the student already made.
            ...(input.discipline !== undefined
              ? { disciplineOverride: input.discipline ?? null }
              : {}),
          },
        });
      } else {
        await ctx.db.userCourse.create({
          data: {
            userId: user.id,
            courseId: course.id,
            status: input.status,
            grade: input.grade,
            plannedYear: input.plannedYear,
            plannedSemester: input.plannedSemester,
            disciplineOverride: input.discipline ?? null,
            attemptNumber: 1,
          },
        });
      }
      return { ok: true, courseId: course.id, courseName: course.nameHe };
    }),

  /**
   * The same thing as addScannedCourse, for a whole scanned sheet at once.
   *
   * Ariel, 21.8: "באג רציני בשמירה" and "השמירה לוקחת מלא זמן משום מה".
   *
   * The onboarding finale used to call addScannedCourse in a `for` loop — one
   * HTTP round-trip PER custom course, awaited in sequence, each with its own
   * 15-second timeout, at the END of a save that had already made three
   * sequential calls. On his own account (19 planned courses and ~20 scanned
   * rows, several of them custom) that is a dozen serialised round-trips: slow
   * enough to look broken, and long enough that a single slow one could push
   * the whole finale into the failure state he saw.
   *
   * One call, one pass. Failures are reported PER COURSE rather than throwing,
   * because the old loop deliberately swallowed individual errors so one bad
   * row could not abort the save — that property is worth keeping, but
   * swallowing them silently is not: the caller now learns which rows did not
   * make it and can say so.
   */
  addScannedCourses: protectedProcedure
    .input(
      z.object({
        courses: z
          .array(
            z.object({
              courseCode: z.string().max(40).nullable(),
              courseName: z.string().min(1).max(120),
              credits: z.number().min(0).max(20).nullable(),
              grade: z.number().min(0).max(100).nullable(),
              plannedYear: z.number().int().min(1).max(4),
              plannedSemester: z.enum(["FALL", "SPRING", "SUMMER"]),
              status: z.enum(["COMPLETED", "FAILED", "EXEMPT"]).default("COMPLETED"),
              discipline: disciplineEnum.nullish(),
            }),
          )
          .max(60),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user;
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

      const saved: { courseId: string; courseName: string }[] = [];
      const failed: { courseName: string }[] = [];

      for (const c of input.courses) {
        try {
          let course =
            (c.courseCode
              ? await ctx.db.course.findUnique({ where: { code: c.courseCode } })
              : null) ?? (await ctx.db.course.findFirst({ where: { nameHe: c.courseName } }));

          if (!course) {
            const code =
              c.courseCode && c.courseCode.trim().length >= 4
                ? c.courseCode.trim()
                : customCourseCode(c.courseName);
            course = await ctx.db.course.upsert({
              where: { code },
              update: {},
              create: {
                code,
                nameHe: c.courseName,
                discipline: "GENERAL",
                courseType: "ELECTIVE",
                credits: c.credits ?? 2,
                yearOffered: [1, 2, 3],
                prerequisites: [],
                canCountAs: [],
                isMandatory: false,
                // Same quarantine as addScannedCourse — a scanned free-text
                // name must never reach the shared public catalog.
                isActive: false,
              },
            });
          }

          const existing = await ctx.db.userCourse.findFirst({
            where: { userId: user.id, courseId: course.id },
          });
          if (existing) {
            await ctx.db.userCourse.update({
              where: { id: existing.id },
              data: {
                status: c.status,
                grade: c.grade,
                ...(c.discipline !== undefined ? { disciplineOverride: c.discipline ?? null } : {}),
              },
            });
          } else {
            await ctx.db.userCourse.create({
              data: {
                userId: user.id,
                courseId: course.id,
                status: c.status,
                grade: c.grade,
                plannedYear: c.plannedYear,
                plannedSemester: c.plannedSemester,
                disciplineOverride: c.discipline ?? null,
                attemptNumber: 1,
              },
            });
          }
          saved.push({ courseId: course.id, courseName: course.nameHe });
        } catch {
          // One unusable row must not lose the other nineteen.
          failed.push({ courseName: c.courseName });
        }
      }

      return { saved, failed };
    }),

  /**
   * #8 — Register the Course rows for courses the student added by hand in the
   * planner ("דוגרי" and friends: real courses, approved for their degree, that
   * were never in OUR catalog).
   *
   * The planner works with client-only ids (`custom-<uuid>`), which savePlan
   * rightly refuses (`z.string().uuid()`) — which is why a manually added course
   * used to be dropped with a toast instead of saved. This resolves each one to
   * a REAL courseId (catalog row when the name matches one, else a minimal
   * student-owned row) so it can go through savePlan like any other course.
   *
   * Creates Course rows only — never a UserCourse. The plan itself stays owned
   * by savePlan's single atomic delete+create, so a course the student REMOVED
   * from the plan still disappears.
   */
  addCustomCourses: protectedProcedure
    .input(
      z.object({
        courses: z
          .array(
            z.object({
              /** The planner's client-side id — echoed back so the caller can
               *  swap it for the real courseId in its payload. */
              clientId: z.string().min(1).max(80),
              name: z.string().min(1).max(120),
              credits: z.number().min(0).max(20),
            })
          )
          .max(30),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user;
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

      const resolved: { clientId: string; courseId: string; code: string }[] = [];
      for (const c of input.courses) {
        const name = c.name.trim();
        if (!name) continue;

        // A student typing the exact name of a catalog course means the catalog
        // course — link to it instead of shadowing it with a duplicate row.
        let course = await ctx.db.course.findFirst({ where: { nameHe: name } });

        if (!course) {
          // Same shape (and the same isActive:false quarantine) as
          // addScannedCourse: the row backs THIS student's plan without leaking
          // a free-text name into the shared, public catalog. The discipline
          // stays GENERAL on the shared row — the student's own attribution
          // lives per-student on UserCourse.disciplineOverride.
          course = await ctx.db.course.upsert({
            where: { code: customCourseCode(name) },
            update: {},
            create: {
              code: customCourseCode(name),
              nameHe: name,
              discipline: "GENERAL",
              courseType: "ELECTIVE",
              credits: c.credits,
              yearOffered: [1, 2, 3],
              prerequisites: [],
              canCountAs: [],
              isMandatory: false,
              isActive: false,
            },
          });
        }

        resolved.push({ clientId: c.clientId, courseId: course.id, code: course.code });
      }

      return { courses: resolved };
    }),

  saveCompletedCourses: protectedProcedure
    .input(
      z.object({
        courses: z.array(
          z.object({
            courseCode: z.string().min(1).max(40),
            plannedYear: z.number().int().min(1).max(4),
            plannedSemester: z.enum(["FALL", "SPRING", "SUMMER"]),
            grade: z.number().min(0).max(100).nullable().optional(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user; // enforceAuth already loaded the row (#9: no refetch)

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      if (input.courses.length === 0) {
        return { savedCount: 0 };
      }

      // Resolve course codes → ids in one query.
      const codes = Array.from(new Set(input.courses.map((c) => c.courseCode)));
      const courses = await ctx.db.course.findMany({
        where: { code: { in: codes } },
        select: { id: true, code: true },
      });
      const idByCode = new Map(courses.map((c) => [c.code, c.id]));

      // NO wrapping interactive transaction: each write is an idempotent upsert,
      // so atomicity isn't needed — and a per-course findFirst+write loop inside a
      // single 5s interactive transaction over the Supabase pooler TIMES OUT for a
      // mid-degree student with many completed courses (this was the real
      // "השמירה נכשלה" / save-failed bug). Same class as the seed-demo timeout.
      let savedCount = 0;
      for (const c of input.courses) {
        const courseId = idByCode.get(c.courseCode);
        if (!courseId) continue; // skip unknown codes

        const existing = await ctx.db.userCourse.findFirst({
          where: { userId: user.id, courseId },
        });

        if (existing) {
          await ctx.db.userCourse.update({
            where: { id: existing.id },
            data: {
              status: "COMPLETED",
              grade: c.grade ?? null,
              plannedYear: c.plannedYear,
              plannedSemester: c.plannedSemester,
            },
          });
        } else {
          await ctx.db.userCourse.create({
            data: {
              userId: user.id,
              courseId,
              status: "COMPLETED",
              grade: c.grade ?? null,
              plannedYear: c.plannedYear,
              plannedSemester: c.plannedSemester,
              attemptNumber: 1,
            },
          });
        }
        savedCount += 1;
      }

      return { savedCount };
    }),
});
