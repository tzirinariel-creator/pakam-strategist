import { z } from "zod/v4";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { createTRPCRouter, protectedProcedure } from "../trpc/init";
import { decrypt } from "@/lib/crypto";
import { parseSyllabusContent } from "@/lib/ai/syllabus-parser";

export const syllabusRouter = createTRPCRouter({
  /**
   * Upload a syllabus — creates a record with text content.
   * Actual AI parsing is triggered separately via the `parse` mutation.
   */
  upload: protectedProcedure
    .input(
      z.object({
        courseId: z.string().uuid(),
        fileName: z.string().min(1).max(255),
        fileContent: z.string().min(1).max(5_000_000), // base64-encoded or raw text — ~5MB cap
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { supabaseId: ctx.userId },
      });

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      // Verify course exists
      const course = await ctx.db.course.findUnique({
        where: { id: input.courseId },
      });

      if (!course) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Course not found",
        });
      }

      // Decode base64 content if needed
      let textContent: string;
      try {
        textContent = Buffer.from(input.fileContent, "base64").toString(
          "utf-8"
        );
      } catch {
        // If base64 decoding fails, treat as raw text
        textContent = input.fileContent;
      }

      const syllabus = await ctx.db.syllabus.create({
        data: {
          userId: user.id,
          courseId: input.courseId,
          fileName: input.fileName,
          fileUrl: "", // No actual file storage for now — text is stored in parsedContent
          parsedContent: { rawText: textContent } as Prisma.InputJsonValue,
          topics: [],
          deadlines: undefined,
          gradingBreakdown: undefined,
        },
      });

      return { syllabusId: syllabus.id };
    }),

  /**
   * Trigger AI parsing of an uploaded syllabus.
   * Decrypts the user's Claude API key and calls the parser.
   */
  parse: protectedProcedure
    .input(z.object({ syllabusId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { supabaseId: ctx.userId },
      });

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      if (!user.encryptedClaudeKey) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Claude API key is required for syllabus parsing",
        });
      }

      // Get the syllabus
      const syllabus = await ctx.db.syllabus.findUnique({
        where: { id: input.syllabusId },
      });

      if (!syllabus || syllabus.userId !== user.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Syllabus not found",
        });
      }

      // Extract raw text from parsedContent
      const parsedContent = syllabus.parsedContent as Record<
        string,
        unknown
      > | null;
      const rawText =
        typeof parsedContent?.rawText === "string"
          ? parsedContent.rawText
          : null;

      if (!rawText) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No text content found in syllabus",
        });
      }

      // Decrypt key and parse (wrapped for error resilience)
      let parsed;
      try {
        const apiKey = decrypt(user.encryptedClaudeKey);
        parsed = await parseSyllabusContent(rawText, apiKey);
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        const status = (err as { status?: number }).status;
        if (status === 401) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Invalid Claude API key" });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to parse syllabus with AI" });
      }

      // Update syllabus record with parsed data
      await ctx.db.syllabus.update({
        where: { id: input.syllabusId },
        data: {
          parsedContent: {
            rawText,
            ...parsed,
          } as unknown as Prisma.InputJsonValue,
          topics: parsed.topics,
          deadlines: parsed.deadlines as unknown as Prisma.InputJsonValue,
          gradingBreakdown:
            parsed.gradingBreakdown as unknown as Prisma.InputJsonValue,
        },
      });

      return {
        topics: parsed.topics,
        deadlines: parsed.deadlines,
        gradingBreakdown: parsed.gradingBreakdown,
        summary: parsed.summary,
        weeklySchedule: parsed.weeklySchedule ?? null,
      };
    }),

  /**
   * List user's syllabi with basic info.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { supabaseId: ctx.userId },
    });

    if (!user) {
      throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    }

    const syllabi = await ctx.db.syllabus.findMany({
      where: { userId: user.id },
      include: { course: true },
      orderBy: { createdAt: "desc" },
    });

    return syllabi.map((s) => {
      const parsed = s.parsedContent as Record<string, unknown> | null;
      const hasParsedContent =
        parsed !== null &&
        typeof parsed === "object" &&
        "summary" in parsed;

      const deadlinesArr = Array.isArray(s.deadlines) ? s.deadlines : [];

      return {
        id: s.id,
        courseId: s.courseId,
        courseName: s.course.nameHe,
        courseNameEn: s.course.nameEn,
        fileName: s.fileName,
        hasParsedContent,
        deadlinesCount: deadlinesArr.length,
        createdAt: s.createdAt,
      };
    });
  }),

  /**
   * Get a specific syllabus with full parsed content.
   */
  get: protectedProcedure
    .input(z.object({ syllabusId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { supabaseId: ctx.userId },
      });

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      const syllabus = await ctx.db.syllabus.findUnique({
        where: { id: input.syllabusId },
        include: { course: true },
      });

      if (!syllabus || syllabus.userId !== user.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Syllabus not found",
        });
      }

      return syllabus;
    }),

  /**
   * Manually update parsed content (for user corrections).
   */
  updateParsed: protectedProcedure
    .input(
      z.object({
        syllabusId: z.string().uuid(),
        topics: z.array(z.string()).optional(),
        deadlines: z
          .array(
            z.object({
              title: z.string(),
              date: z.string(),
              type: z.enum(["exam", "assignment", "paper"]),
            })
          )
          .optional(),
        gradingBreakdown: z
          .array(
            z.object({
              component: z.string(),
              weight: z.number(),
            })
          )
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { supabaseId: ctx.userId },
      });

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      const syllabus = await ctx.db.syllabus.findUnique({
        where: { id: input.syllabusId },
      });

      if (!syllabus || syllabus.userId !== user.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Syllabus not found",
        });
      }

      // Build update data
      const updateData: Record<string, unknown> = {};
      const existingParsed =
        (syllabus.parsedContent as Record<string, unknown> | null) ?? {};

      if (input.topics !== undefined) {
        updateData.topics = input.topics;
        existingParsed.topics = input.topics;
      }

      if (input.deadlines !== undefined) {
        updateData.deadlines = input.deadlines;
        existingParsed.deadlines = input.deadlines;
      }

      if (input.gradingBreakdown !== undefined) {
        updateData.gradingBreakdown = input.gradingBreakdown;
        existingParsed.gradingBreakdown = input.gradingBreakdown;
      }

      updateData.parsedContent = existingParsed;

      const updated = await ctx.db.syllabus.update({
        where: { id: input.syllabusId },
        data: updateData,
      });

      return updated;
    }),

  /**
   * Delete a syllabus.
   */
  delete: protectedProcedure
    .input(z.object({ syllabusId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { supabaseId: ctx.userId },
      });

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      const syllabus = await ctx.db.syllabus.findUnique({
        where: { id: input.syllabusId },
      });

      if (!syllabus || syllabus.userId !== user.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Syllabus not found",
        });
      }

      await ctx.db.syllabus.delete({
        where: { id: input.syllabusId },
      });

      return { success: true };
    }),
});
