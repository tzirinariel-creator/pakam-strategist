import { z } from "zod/v4";
import { getAcademicNow, deriveYearOfStudy } from "@/lib/academic-calendar";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../trpc/init";
import { seedDemoData } from "@/lib/demo-data";
import { getAllDisciplineIds } from "@/lib/programs/registry";
import { deriveGroupFromDays } from "@/lib/miluim";

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
        firstName: true,
        lastName: true,
        gender: true,
        avatarUrl: true,
        focusArea: true,
        currentYear: true,
        currentSemester: true,
        startYear: true,
        locale: true,
        theme: true,
        miluimGroup: true,
        miluimCareerService: true,
        miluimCreditsUsed: true,
        miluimBinaryUsed: true,
        amiramScore: true,
        // #23 — the English level as printed on the grade sheet (no number).
        englishLevel: true,
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
        // Personal address: name + gender for a personalized, gendered UI.
        firstName: z.string().max(50).nullable().optional(),
        lastName: z.string().max(50).nullable().optional(),
        gender: z.enum(["male", "female"]).nullable().optional(),
        focusArea: disciplineEnum.nullable().optional(),
        currentYear: z.number().int().min(1).max(4).optional(),
        currentSemester: z.enum(["FALL", "SPRING", "SUMMER"]).optional(),
        // The degree-start anchor (#43): the derived year/semester flow from it.
        startYear: z.number().int().min(2020).max(2030).optional(),
        locale: z.enum(["he", "en"]).optional(),
        theme: z.enum(["dark", "light"]).optional(),
        miluimGroup: z
          .enum(["NONE", "GROUP_A", "GROUP_B", "GROUP_C", "GROUP_G"])
          .optional(),
        // Group C via career service (not 35+ reserve days) — drives the label.
        miluimCareerService: z.boolean().optional(),
        miluimCreditsUsed: z.number().int().min(0).max(10).optional(),
        // Binary (pass/fail) conversions used across the BA (cap 5, domain §6).
        miluimBinaryUsed: z.number().int().min(0).max(5).optional(),
        // AMIRANT/Psychometric English uses the 50–150 scale (DB column kept as amiramScore).
        amiramScore: z.number().int().min(50).max(150).nullable().optional(),
        // #23 — the placement level itself, as printed on the grade sheet with
        // no number. When set, it OVERRIDES the score-derived level everywhere.
        englishLevel: z
          .enum(["EXEMPT", "ADVANCED_B", "ADVANCED_A", "BASIC", "PRE_BASIC"])
          .nullable()
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Keep the startYear anchor and the legacy year/semester cache in sync
      // in BOTH directions (#43): onboarding sends currentYear → derive the
      // anchor; settings sends startYear → refresh the cached pair so every
      // legacy fallback reader stays current.
      const data: typeof input & { startYear?: number } = { ...input };
      const acadNow = getAcademicNow();
      if (input.currentYear !== undefined && input.startYear === undefined) {
        data.startYear = acadNow.startYear - (input.currentYear - 1);
      }
      if (input.startYear !== undefined) {
        data.currentYear = deriveYearOfStudy(input.startYear, input.currentYear ?? 1);
        data.currentSemester = acadNow.semester;
      }
      const updated = await ctx.db.user.update({
        where: { supabaseId: ctx.userId },
        data,
        select: {
          id: true,
          supabaseId: true,
          email: true,
          displayName: true,
          firstName: true,
          lastName: true,
          gender: true,
          avatarUrl: true,
          focusArea: true,
          currentYear: true,
          currentSemester: true,
          startYear: true,
          locale: true,
          theme: true,
          miluimGroup: true,
          miluimCareerService: true,
          miluimCreditsUsed: true,
          miluimBinaryUsed: true,
          amiramScore: true,
          englishLevel: true,
          programId: true,

          createdAt: true,
          updatedAt: true,
        },
      });
      return updated;
    }),

  /**
   * Upsert a per-semester miluim record. The miluim group is reassigned every
   * semester from that semester's service days, so we key on
   * (userId, academicYear, semester) and recompute derivedGroup server-side via
   * the pure lib/miluim.ts logic (single source of truth). Purely additive — a
   * user who never calls this keeps the exact same numbers as before.
   */
  upsertMiluimSemester: protectedProcedure
    .input(
      z.object({
        academicYear: z.number().int().min(2020).max(2100),
        semester: z.enum(["FALL", "SPRING", "SUMMER"]),
        daysServed: z.number().int().min(0).max(365),
        isCombat: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { supabaseId: ctx.userId },
        select: { id: true },
      });
      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      // Derive the group server-side from days + combat (authoritative).
      const derivedGroup = deriveGroupFromDays(input.daysServed, input.isCombat);

      const row = await ctx.db.miluimSemester.upsert({
        where: {
          userId_academicYear_semester: {
            userId: user.id,
            academicYear: input.academicYear,
            semester: input.semester,
          },
        },
        update: {
          daysServed: input.daysServed,
          isCombat: input.isCombat,
          derivedGroup,
        },
        create: {
          userId: user.id,
          academicYear: input.academicYear,
          semester: input.semester,
          daysServed: input.daysServed,
          isCombat: input.isCombat,
          derivedGroup,
        },
      });

      return row;
    }),

  /**
   * List the current user's per-semester miluim records (most recent first).
   */
  listMiluimSemesters: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { supabaseId: ctx.userId },
      select: { id: true },
    });
    if (!user) {
      throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    }

    return ctx.db.miluimSemester.findMany({
      where: { userId: user.id },
      orderBy: [{ academicYear: "desc" }, { semester: "asc" }],
    });
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
        startYear: true,
        locale: true,
        theme: true,
        miluimGroup: true,
        miluimCreditsUsed: true,
        miluimBinaryUsed: true,
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
        miluimBinaryUsed: 0,
        amiramScore: null,
        englishLevel: null,
      },
    });

    // Clear per-semester miluim rows so the reset user returns to a clean slate.
    await ctx.db.miluimSemester.deleteMany({ where: { userId: user.id } });

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
