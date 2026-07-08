import { z } from "zod/v4";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../trpc/init";
import { calculateCredits } from "@/lib/credit-calculator";
import { calculateGraduationScore } from "@/lib/grade-calculator";
import { computeCreditExemption, deriveCurrentGroup, getCurrentAcademicYear } from "@/lib/miluim";
import { getAllDisciplineIds } from "@/lib/programs/registry";

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

    const userCourses = await ctx.db.userCourse.findMany({
      where: { userId: user.id },
      include: { course: true },
      orderBy: [
        { plannedYear: "asc" },
        { plannedSemester: "asc" },
      ],
    });

    // Group by year and semester
    const grouped: Record<string, typeof userCourses> = {};

    for (const uc of userCourses) {
      const key = `${uc.plannedYear}-${uc.plannedSemester}`;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(uc);
    }

    return {
      courses: userCourses,
      semesters: grouped,
    };
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
      const user = await ctx.db.user.findUnique({
        where: { supabaseId: ctx.userId },
      });

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
        selectedGroups: z
          .record(z.string().max(30), z.string().max(30))
          .refine((o) => Object.keys(o).length <= 30, "too many groups")
          .nullable()
          .optional(), // { "tutorial": "B" } or null to clear
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { supabaseId: ctx.userId },
      });

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
      const user = await ctx.db.user.findUnique({
        where: { supabaseId: ctx.userId },
      });

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

    const userCourses = await ctx.db.userCourse.findMany({
      where: { userId: user.id },
      include: { course: true },
    });

    // Per-semester miluim rows (may be empty). The current group is the row for
    // the user's current academic year + semester, else the stored miluimGroup —
    // a user with NO rows gets the EXACT same group (and exemption) as before.
    const miluimSemesters = await ctx.db.miluimSemester.findMany({
      where: { userId: user.id },
    });
    // academicYear MUST be the calendar-year key used when the rows were
    // WRITTEN (getCurrentAcademicYear), NOT user.currentYear (academic standing
    // 1–4) — those never match, which silently killed per-semester resolution.
    const currentGroup = deriveCurrentGroup(miluimSemesters, user.miluimGroup, {
      academicYear: getCurrentAcademicYear(),
      semester: user.currentSemester,
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

    const userCourses = await ctx.db.userCourse.findMany({
      where: {
        userId: user.id,
        status: "COMPLETED",
        grade: { not: null },
      },
      include: { course: true },
    });

    const gradeBreakdown = calculateGraduationScore(userCourses);
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
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { supabaseId: ctx.userId },
      });

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

      // Atomic: delete + create inside a single transaction so the user
      // never ends up with zero courses if createMany fails.
      const savedCount = await ctx.db.$transaction(async (tx) => {
        // Replace only the PLAN (PLANNED + IN_PROGRESS). COMPLETED / EXEMPT /
        // FAILED rows are the student's earned RECORD — never wiped by a plan
        // edit. This is what makes editing the plan non-destructive: the
        // standalone planner (and onboarding) no longer needs to re-write
        // history after this delete, which previously risked losing it (and
        // stripped isBinary/disciplineOverride/grades on the re-write).
        await tx.userCourse.deleteMany({
          where: { userId: user.id, status: { in: ["PLANNED", "IN_PROGRESS"] } },
        });

        // Bulk create all courses. Return the REAL number of rows written
        // (createMany result.count), never the raw payload length.
        if (deduped.length > 0) {
          const result = await tx.userCourse.createMany({
            data: deduped.map((c) => ({
              userId: user.id,
              courseId: c.courseId,
              plannedYear: c.plannedYear,
              plannedSemester: c.plannedSemester,
              selectedGroups: c.selectedGroups ?? undefined,
              attemptNumber: 1,
            })),
            skipDuplicates: true,
          });
          return result.count;
        }

        return 0;
      }, { timeout: 15000, maxWait: 8000 });

      return { savedCount };
    }),

  /**
   * Save the user's past academic record from onboarding ("Your history").
   *
   * Takes courses the student already completed (by course CODE, with optional
   * grade) and upserts each as a UserCourse with status COMPLETED. Idempotent:
   * matched on userId + courseId, so re-running onboarding updates rather than
   * duplicates. Courses are matched by code; unknown codes are skipped.
   */
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
      const user = await ctx.db.user.findUnique({
        where: { supabaseId: ctx.userId },
      });

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
