import type { Prisma } from "@prisma/client";
import { z } from "zod/v4";
import { createTRPCRouter, publicProcedure } from "../trpc/init";
import { codesMatchingHebrewAlias } from "@/lib/english-taught-courses";

export const courseRouter = createTRPCRouter({
  /**
   * List all courses from the catalog (public, no auth needed for browsing)
   */
  list: publicProcedure
    .input(
      z
        .object({
          discipline: z.string().optional(),
          courseType: z
            .enum([
              "MANDATORY",
              "ELECTIVE",
              "SEMINAR",
              "PRACTICE",
              "ENGLISH",
              "LAW_FOUNDATION",
            ])
            .optional(),
          year: z.number().int().min(1).max(3).optional(),
          search: z.string().max(200).optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const where: Record<string, unknown> = {
        isActive: true, // only show active courses
      };

      if (input?.discipline) {
        where.discipline = input.discipline;
      }
      if (input?.courseType) {
        where.courseType = input.courseType;
      }
      if (input?.year) {
        where.yearOffered = { has: input.year };
      }
      if (input?.search) {
        const or: Prisma.CourseWhereInput[] = [
          { nameHe: { contains: input.search, mode: "insensitive" } },
          { nameEn: { contains: input.search, mode: "insensitive" } },
          { code: { contains: input.search, mode: "insensitive" } },
        ];
        // Ten courses are taught in English and are named in English, per the
        // ידיעון. A student still thinks of them in Hebrew, so their Hebrew
        // gloss stays searchable even though it is no longer their name.
        const aliasCodes = codesMatchingHebrewAlias(input.search);
        if (aliasCodes.length > 0) or.push({ code: { in: aliasCodes } });
        where.OR = or;
      }

      const courses = await ctx.db.course.findMany({
        where,
        include: {
          scheduleSessions: {
            select: {
              id: true,
              courseCode: true,
              dayOfWeek: true,
              startTime: true,
              endTime: true,
              sessionType: true,
              semester: true,
              room: true,
              building: true,
              groupCode: true,
              lecturerName: true,
            },
          },
        },
        orderBy: [{ discipline: "asc" }, { nameHe: "asc" }],
      });

      return courses;
    }),

  /**
   * Get a single course by ID
   */
  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const course = await ctx.db.course.findUnique({
        where: { id: input.id },
      });
      return course;
    }),

  /**
   * Get a course by code
   */
  getByCode: publicProcedure
    .input(z.object({ code: z.string().min(1).max(30) }))
    .query(async ({ ctx, input }) => {
      const course = await ctx.db.course.findUnique({
        where: { code: input.code },
      });
      return course;
    }),
});
