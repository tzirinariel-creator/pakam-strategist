import { z } from "zod/v4";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../trpc/init";

export const studyTaskRouter = createTRPCRouter({
  /**
   * List all study tasks for the current user.
   * Optionally filter by date range or completion status.
   */
  list: protectedProcedure
    .input(
      z
        .object({
          completed: z.boolean().optional(),
          from: z.coerce.date().optional(),
          to: z.coerce.date().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { supabaseId: ctx.userId },
      });

      // Return empty list for users who haven't completed profile setup yet
      if (!user) {
        return { tasks: [] };
      }

      const where: Record<string, unknown> = { userId: user.id };

      if (input?.completed !== undefined) {
        where.completed = input.completed;
      }

      if (input?.from || input?.to) {
        where.startDate = {};
        if (input?.from) (where.startDate as Record<string, Date>).gte = input.from;
        if (input?.to) (where.startDate as Record<string, Date>).lte = input.to;
      }

      const tasks = await ctx.db.studyTask.findMany({
        where,
        orderBy: [{ startDate: "asc" }, { endDate: "asc" }],
      });

      return { tasks };
    }),

  /**
   * Create a new study task.
   */
  create: protectedProcedure
    .input(
      z
        .object({
          title: z.string().min(1).max(200),
          startDate: z.coerce.date(),
          endDate: z.coerce.date(),
          taskType: z.enum(["study", "assignment", "exam", "custom"]),
          courseCode: z.string().max(30).optional(),
          color: z.string().optional(),
          notes: z.string().max(500).optional(),
        })
        .refine((d) => d.endDate >= d.startDate, {
          message: "endDate must be on/after startDate",
          path: ["endDate"],
        })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { supabaseId: ctx.userId },
      });

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      const task = await ctx.db.studyTask.create({
        data: {
          userId: user.id,
          title: input.title,
          startDate: input.startDate,
          endDate: input.endDate,
          taskType: input.taskType,
          courseCode: input.courseCode ?? null,
          color: input.color ?? null,
          notes: input.notes ?? null,
        },
      });

      return task;
    }),

  /**
   * Update an existing study task.
   */
  update: protectedProcedure
    .input(
      z
        .object({
          id: z.string().uuid(),
          title: z.string().min(1).max(200).optional(),
          startDate: z.coerce.date().optional(),
          endDate: z.coerce.date().optional(),
          taskType: z.enum(["study", "assignment", "exam", "custom"]).optional(),
          courseCode: z.string().max(30).nullable().optional(),
          color: z.string().nullable().optional(),
          notes: z.string().max(500).nullable().optional(),
        })
        .refine(
          (d) => d.startDate == null || d.endDate == null || d.endDate >= d.startDate,
          {
            message: "endDate must be on/after startDate",
            path: ["endDate"],
          }
        )
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { supabaseId: ctx.userId },
      });

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      // Verify ownership
      const existing = await ctx.db.studyTask.findUnique({
        where: { id: input.id },
      });

      if (!existing || existing.userId !== user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
      }

      const { id, ...updateData } = input;
      const task = await ctx.db.studyTask.update({
        where: { id },
        data: updateData,
      });

      return task;
    }),

  /**
   * Toggle completion status of a study task.
   */
  toggleComplete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { supabaseId: ctx.userId },
      });

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      const existing = await ctx.db.studyTask.findUnique({
        where: { id: input.id },
      });

      if (!existing || existing.userId !== user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
      }

      const task = await ctx.db.studyTask.update({
        where: { id: input.id },
        data: { completed: !existing.completed },
      });

      return task;
    }),

  /**
   * Delete a study task.
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { supabaseId: ctx.userId },
      });

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      const existing = await ctx.db.studyTask.findUnique({
        where: { id: input.id },
      });

      if (!existing || existing.userId !== user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
      }

      await ctx.db.studyTask.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),
});
