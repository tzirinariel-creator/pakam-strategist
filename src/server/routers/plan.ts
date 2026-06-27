import { z } from "zod/v4";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../trpc/init";
import { calculateCredits } from "@/lib/credit-calculator";
import { calculateGraduationScore } from "@/lib/grade-calculator";
import { computeCreditExemption, deriveCurrentGroup } from "@/lib/miluim";
import { getAllDisciplineIds } from "@/lib/programs/registry";

// Discipline enum covering ALL registered programs (PPE, Law, etc.)
const disciplineEnum = z.enum(getAllDisciplineIds());

export const planRouter = createTRPCRouter({
  /**
   * Get the current user's full degree plan — all UserCourse records
   * with related Course data, grouped by plannedYear and plannedSemester.
   */
  getUserPlan: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { supabaseId: ctx.userId },
    });

    if (!user) {
      throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    }

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
        disciplineOverride: disciplineEnum.optional(),
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

      const { userCourseId, attempt, selectedGroups, ...updateFields } = input;

      const data: Record<string, unknown> = { ...updateFields };
      if (attempt !== undefined) {
        data.attemptNumber = attempt;
      }
      if (selectedGroups !== undefined) {
        data.selectedGroups = selectedGroups; // null clears, object sets
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
    const user = await ctx.db.user.findUnique({
      where: { supabaseId: ctx.userId },
    });

    if (!user) {
      throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    }

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
    const currentGroup = deriveCurrentGroup(miluimSemesters, user.miluimGroup, {
      academicYear: user.currentYear,
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
    const user = await ctx.db.user.findUnique({
      where: { supabaseId: ctx.userId },
    });

    if (!user) {
      throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    }

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

      // Atomic: delete + create inside a single transaction so the user
      // never ends up with zero courses if createMany fails.
      const savedCount = await ctx.db.$transaction(async (tx) => {
        // Clear any existing courses (fresh onboarding)
        await tx.userCourse.deleteMany({
          where: { userId: user.id },
        });

        // Bulk create all courses
        if (input.courses.length > 0) {
          await tx.userCourse.createMany({
            data: input.courses.map((c) => ({
              userId: user.id,
              courseId: c.courseId,
              plannedYear: c.plannedYear,
              plannedSemester: c.plannedSemester,
              selectedGroups: c.selectedGroups ?? undefined,
              attemptNumber: 1,
            })),
            skipDuplicates: true,
          });
        }

        return input.courses.length;
      });

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

      const savedCount = await ctx.db.$transaction(async (tx) => {
        let count = 0;
        for (const c of input.courses) {
          const courseId = idByCode.get(c.courseCode);
          if (!courseId) continue; // skip unknown codes

          // Idempotent upsert on userId + courseId (first attempt).
          const existing = await tx.userCourse.findFirst({
            where: { userId: user.id, courseId },
          });

          if (existing) {
            await tx.userCourse.update({
              where: { id: existing.id },
              data: {
                status: "COMPLETED",
                grade: c.grade ?? null,
                plannedYear: c.plannedYear,
                plannedSemester: c.plannedSemester,
              },
            });
          } else {
            await tx.userCourse.create({
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
          count += 1;
        }
        return count;
      });

      return { savedCount };
    }),
});
