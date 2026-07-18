import { z } from "zod/v4";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../trpc/init";
import { generateExamPlan, israelCivilDate, type ExamInput } from "@/lib/exam-planner";
import { buildPrePlaced, LOCK_MARK } from "@/lib/plan-from-tasks";

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
      const user = ctx.user; // enforceAuth already loaded the row (#9: no refetch)

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
      const user = ctx.user; // enforceAuth already loaded the row (#9: no refetch)

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
      const user = ctx.user; // enforceAuth already loaded the row (#9: no refetch)

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
      const user = ctx.user; // enforceAuth already loaded the row (#9: no refetch)

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
      const user = ctx.user; // enforceAuth already loaded the row (#9: no refetch)

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
        // Prep style scales the study budget so the SAVED plan matches the
        // wizard preview — "light" (already started, just review) = ~25% fewer
        // hours; steady/crammer keep the engine's default window (#audit-r3).
        prepStyle: z.enum(["light", "steady", "crammer"]).optional(),
        // Phase 2 — how many study hours the student has per weekday (0=Sun…6=Sat)
        // + per-date overrides. The engine caps a day's TOTAL across all courses
        // to this; omitted → DEFAULT_CAPACITY (Sun–Thu 3h, Fri 2h, Sat 0).
        capacity: z
          .object({
            weekdayHours: z.array(z.number().min(0).max(16)).length(7),
            overrides: z.record(z.string(), z.number().min(0).max(16)).optional(),
          })
          .optional(),
        // Phase 3 — per-course self-reported readiness 1-5 (the student's own
        // report, NOT a prediction). Scales that exam's budget; omitted codes
        // stay neutral (1.0×).
        confidence: z.record(z.string(), z.number().min(1).max(5)).optional(),
        // 13.7 #25 — the student's OWN total-hours choice per course. When set
        // it replaces the credits×difficulty×readiness estimate entirely.
        hoursOverride: z.record(z.string(), z.number().min(1).max(120)).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user; // enforceAuth already loaded the row (#9: no refetch)
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
        // Mirror the client preview's "light" scaling (×0.75, min 1) so the saved
        // plan is the one the student approved in the wizard (#audit-r3).
        const credits =
          input.prepStyle === "light" ? Math.max(1, Math.round(uc.course.credits * 0.75)) : uc.course.credits;
        examInputs.push({
          courseCode: code,
          courseName: uc.course.nameHe,
          examDate,
          credits,
          averageGrade: uc.course.averageGrade,
          failRate: uc.course.failRate,
          confidence: input.confidence?.[code],
          hoursOverride: input.hoursOverride?.[code],
          moed,
        });
      }

      if (examInputs.length === 0) {
        return { created: 0, message: "no exams with dates" };
      }

      // Phase 5 — blocks the student MOVED/locked ([locked]) or added manually
      // survive a re-tune and become PRE-PLACED, so the fresh plan fills AROUND
      // them instead of wiping the arrangement. Limited to courses still in the
      // plan (examCodes) so a de-selected course's locks don't linger (D3).
      // Israel civil "today" — the server runs UTC, so a bare new Date() at
      // 00:00–03:00 Israel is still yesterday and would place study blocks a day
      // off from the client-local preview. See israelCivilDate.
      const today = israelCivilDate();
      const examCodes = new Set(examInputs.map((e) => e.courseCode));
      const survivors = await ctx.db.studyTask.findMany({
        where: { userId: user.id, taskType: "study", completed: false },
        select: { taskType: true, startDate: true, notes: true, courseCode: true, completed: true },
      });
      const prePlaced = buildPrePlaced(survivors, today, examCodes);

      // input.capacity is undefined when the client sends none → the engine
      // falls back to DEFAULT_CAPACITY, so plans are always capacity-bounded.
      const plan = generateExamPlan(examInputs, today, input.unavailable ?? [], input.prepStyle ?? "steady", input.capacity, prePlaced);

      // Atomic: clear the regeneratable auto plan, then create the fresh one.
      const created = await ctx.db.$transaction(async (tx) => {
        // Wipe auto tasks — but SPARE locked blocks (moved/edited study) so the
        // student's arrangement survives. Exam blocks ([auto] <difficulty>)
        // never carry [locked], so they're still deleted + recreated (intended).
        await tx.studyTask.deleteMany({
          where: { userId: user.id, notes: { startsWith: AUTO_MARK, not: { contains: LOCK_MARK } } },
        });
        // Orphan cleanup (D3): drop an AUTO locked block for a course no longer
        // planned. Scoped to [auto] ONLY — a MANUAL block the student added and
        // then moved ("2.5h [locked]", no [auto]) is user-authored and must never
        // be wiped, matching the quick-add "manual additions survive" contract.
        await tx.studyTask.deleteMany({
          where: {
            userId: user.id,
            taskType: "study",
            notes: { startsWith: AUTO_MARK, contains: LOCK_MARK },
            courseCode: { notIn: Array.from(examCodes) },
          },
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
            // Persist the ORIGINAL hour BUDGET (not just what fit) so the
            // capacity-shortfall / overload recs and the skyline legend stay
            // honest on the reconstructed plan. `budget=N` (NOT `Nh`) so the
            // study-hours regex /([\d.]+)h/ never mistakes it for study time.
            // `conf=K` / `own=1` record the wizard answers behind that budget,
            // so a re-tune re-seeds the SAME assumptions the student approved
            // instead of silently resetting to neutral (13.7 #25 depth).
            notes: `${AUTO_MARK} ${ex.difficulty} budget=${ex.totalHours}${
              input.confidence?.[ex.courseCode] ? ` conf=${input.confidence[ex.courseCode]}` : ""
            }${input.hoursOverride?.[ex.courseCode] ? " own=1" : ""}`,
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
