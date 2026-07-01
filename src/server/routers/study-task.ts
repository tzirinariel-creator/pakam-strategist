import { z } from "zod/v4";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../trpc/init";
import { generateExamPlan, type ExamInput } from "@/lib/exam-planner";

// Marker stored in `notes` so we can regenerate the auto plan without wiping a
// student's manually-added tasks (assignments, work shifts, custom).
const AUTO_MARK = "[auto]";

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

  /**
   * Auto-generate a reverse-planned study schedule for the chosen exams. Creates
   * an exam block + spaced study sessions per exam. Regenerable: it first clears
   * the previous AUTO-generated tasks (marked in `notes`) but never touches the
   * student's manually-added assignments / shifts / custom tasks.
   */
  generateExamPlan: protectedProcedure
    .input(
      z.object({
        exams: z
          .array(z.object({ courseCode: z.string().max(40), moed: z.enum(["A", "B"]) }))
          .min(1)
          .max(20),
        unavailable: z.array(z.string()).max(60).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({ where: { supabaseId: ctx.userId } });
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

      const codes = Array.from(new Set(input.exams.map((e) => e.courseCode)));
      const moedByCode = new Map(input.exams.map((e) => [e.courseCode, e.moed]));

      const userCourses = await ctx.db.userCourse.findMany({
        where: { userId: user.id, course: { code: { in: codes } } },
        include: { course: true },
      });

      // De-dup by course code (a course can appear in multiple semesters).
      const seen = new Set<string>();
      const examInputs: ExamInput[] = [];
      for (const uc of userCourses) {
        const code = uc.course.code;
        if (seen.has(code)) continue;
        const moed = moedByCode.get(code);
        if (!moed) continue;
        const examDate = moed === "B" ? uc.course.examDateB : uc.course.examDateA;
        if (!examDate) continue;
        seen.add(code);
        examInputs.push({
          courseCode: code,
          courseName: uc.course.nameHe,
          examDate,
          credits: uc.course.credits,
          averageGrade: uc.course.averageGrade,
          failRate: uc.course.failRate,
          moed,
        });
      }

      if (examInputs.length === 0) {
        return { created: 0, message: "no exams with dates" };
      }

      const plan = generateExamPlan(examInputs, new Date(), input.unavailable ?? []);

      // Atomic: clear previous auto tasks, then create the fresh plan.
      const created = await ctx.db.$transaction(async (tx) => {
        await tx.studyTask.deleteMany({
          where: { userId: user.id, notes: { startsWith: AUTO_MARK } },
        });

        const rows: {
          userId: string;
          title: string;
          startDate: Date;
          endDate: Date;
          taskType: string;
          courseCode: string;
          color: string;
          notes: string;
        }[] = [];

        // Exam blocks (all-day). Stamp NOON of the exam's calendar day, not
        // midnight: a local-midnight instant read back on a UTC-negative client
        // (a student abroad) rolls to the previous day and the anchor lands a
        // column early. Noon survives ±12h shifts — mirrors the 09:00 offset
        // used for the study sessions below.
        for (const ex of plan.exams) {
          const examAt = new Date(ex.examDate);
          examAt.setHours(12, 0, 0, 0);
          rows.push({
            userId: user.id,
            title: `מבחן: ${ex.courseName} (מועד ${ex.moed === "B" ? "ב׳" : "א׳"})`,
            startDate: examAt,
            endDate: examAt,
            taskType: "exam",
            courseCode: ex.courseCode,
            color: ex.color,
            notes: `${AUTO_MARK} ${ex.difficulty}`,
          });
        }
        // Study sessions — a study block starting 09:00, exact duration.
        for (const s of plan.sessions) {
          const start = new Date(s.date);
          start.setHours(9, 0, 0, 0);
          const end = new Date(start.getTime() + s.hours * 60 * 60 * 1000);
          rows.push({
            userId: user.id,
            title: `לימוד: ${s.courseName}`,
            startDate: start,
            endDate: end,
            taskType: "study",
            courseCode: s.courseCode,
            color: s.color,
            notes: `${AUTO_MARK} ${s.hours}h`,
          });
        }

        const res = await tx.studyTask.createMany({ data: rows });
        return res.count;
      });

      return { created, exams: plan.exams.length, sessions: plan.sessions.length };
    }),
});
