import { z } from "zod/v4";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../trpc/init";
import { seedDemoData } from "@/lib/demo-data";
import { getAllDisciplineIds } from "@/lib/programs/registry";

// Discipline enum covering ALL registered programs (PPE, Law, etc.)
const disciplineEnum = z.enum(getAllDisciplineIds());

export const userRouter = createTRPCRouter({
  /**
   * Get current user's profile
   */
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { supabaseId: ctx.userId },
      select: {
        id: true,
        supabaseId: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        focusArea: true,
        currentYear: true,
        currentSemester: true,
        locale: true,
        theme: true,
        miluimGroup: true,
        miluimCreditsUsed: true,
        amiramScore: true,
        programId: true,

        createdAt: true,
        updatedAt: true,
      },
    });
    return user;
  }),

  /**
   * Update user profile
   */
  updateProfile: protectedProcedure
    .input(
      z.object({
        displayName: z.string().min(1).max(100).optional(),
        focusArea: disciplineEnum.nullable().optional(),
        currentYear: z.number().int().min(1).max(4).optional(),
        currentSemester: z.enum(["FALL", "SPRING", "SUMMER"]).optional(),
        locale: z.enum(["he", "en"]).optional(),
        theme: z.enum(["dark", "light"]).optional(),
        miluimGroup: z
          .enum(["NONE", "GROUP_A", "GROUP_B", "GROUP_C", "GROUP_G"])
          .optional(),
        miluimCreditsUsed: z.number().int().min(0).max(10).optional(),
        // AMIRANT/Psychometric English uses the 50–150 scale (DB column kept as amiramScore).
        amiramScore: z.number().int().min(50).max(150).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const updated = await ctx.db.user.update({
        where: { supabaseId: ctx.userId },
        data: input,
        select: {
          id: true,
          supabaseId: true,
          email: true,
          displayName: true,
          avatarUrl: true,
          focusArea: true,
          currentYear: true,
          currentSemester: true,
          locale: true,
          theme: true,
          miluimGroup: true,
          miluimCreditsUsed: true,
          amiramScore: true,
          programId: true,

          createdAt: true,
          updatedAt: true,
        },
      });
      return updated;
    }),

  /**
   * Ensure user exists in Prisma DB (called after auth)
   */
  ensureExists: protectedProcedure
    .input(
      z.object({
        email: z.email(),
        displayName: z.string().optional(),
        avatarUrl: z.string().url().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const safeSelect = {
        id: true,
        supabaseId: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        focusArea: true,
        currentYear: true,
        currentSemester: true,
        locale: true,
        theme: true,
        miluimGroup: true,
        miluimCreditsUsed: true,
        amiramScore: true,
        programId: true,

        createdAt: true,
        updatedAt: true,
      } as const;

      const user = await ctx.db.user.upsert({
        where: { supabaseId: ctx.userId },
        update: {
          email: input.email,
          displayName: input.displayName ?? undefined,
          avatarUrl: input.avatarUrl ?? undefined,
        },
        create: {
          supabaseId: ctx.userId,
          email: input.email,
          displayName: input.displayName ?? null,
          avatarUrl: input.avatarUrl ?? null,
        },
        select: safeSelect,
      });
      return user;
    }),

  /**
   * Reset test user — clears all data, returns to onboarding
   */
  resetTestUser: protectedProcedure.mutation(async ({ ctx }) => {
    const testEmail = process.env.NEXT_PUBLIC_TEST_USER_EMAIL;
    if (!testEmail) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Test user not configured" });
    }

    const user = await ctx.db.user.findUnique({
      where: { supabaseId: ctx.userId },
    });

    if (!user || user.email !== testEmail) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Only the test user can be reset" });
    }

    // Delete all related data
    await ctx.db.$transaction([
      ctx.db.studyTask.deleteMany({ where: { userId: user.id } }),
      ctx.db.calendarEvent.deleteMany({ where: { userId: user.id } }),
      ctx.db.chatSession.deleteMany({ where: { userId: user.id } }),
      ctx.db.studyMaterial.deleteMany({ where: { userId: user.id } }),
      ctx.db.synthesisNote.deleteMany({ where: { userId: user.id } }),
      ctx.db.syllabus.deleteMany({ where: { userId: user.id } }),
      ctx.db.userCourse.deleteMany({ where: { userId: user.id } }),
    ]);

    // Reset profile to defaults
    await ctx.db.user.update({
      where: { id: user.id },
      data: {
        displayName: null,
        focusArea: null,
        currentYear: 1,
        currentSemester: "FALL",
        startYear: null,
        miluimGroup: "NONE",
        miluimCreditsUsed: 0,
        amiramScore: null,
      },
    });

    return { success: true };
  }),

  /**
   * Reset demo user — clears data and re-seeds with demo content
   */
  resetDemoUser: protectedProcedure.mutation(async ({ ctx }) => {
    const demoEmail = process.env.NEXT_PUBLIC_DEMO_USER_EMAIL;
    if (!demoEmail) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Demo user not configured" });
    }

    const user = await ctx.db.user.findUnique({
      where: { supabaseId: ctx.userId },
    });

    if (!user || user.email !== demoEmail) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Only the demo user can be reset" });
    }

    const result = await seedDemoData(ctx.db, user.id);
    return { success: true, ...result };
  }),
});
