// =========================================
// Cohort social layer, stage ב (owner-approved 11.7) — insights + plan gallery
// =========================================
// "מה הייתי אומר לעצמי" insights and the winning-plans registry. Anonymous on
// display, moderated like reviews (report → auto-hide at 3 → admin queue).
// Demo write-block and ownership come from the shared middlewares.

import { z } from "zod/v4";
import { createTRPCRouter, protectedProcedure } from "../trpc/init";
import { TRPCError } from "@trpc/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { decodePlan } from "@/lib/plan-share";

const INSIGHT_STAGES = ["BIDDING", "EXAMS", "FOCUS", "FIRST_YEAR", "GENERAL"] as const;
const HIDE_THRESHOLD = 3;

export const cohortRouter = createTRPCRouter({
  /** Visible insights, grouped client-side by stage. Anonymous by design. */
  listInsights: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.cohortInsight.findMany({
      where: { status: "VISIBLE" },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, stage: true, text: true, cohortYear: true, createdAt: true },
    });
    return rows;
  }),

  /** The caller's own insights — for the contribute box (edit-in-place). */
  myInsights: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.cohortInsight.findMany({
      where: { userId: ctx.user.id },
      select: { id: true, stage: true, text: true },
    });
  }),

  /** One insight per stage per user — upsert keeps it editable, never dupes. */
  contributeInsight: protectedProcedure
    .input(
      z.object({
        stage: z.enum(INSIGHT_STAGES),
        text: z.string().trim().min(10).max(400),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const cohortYear = ctx.user.startYear ?? null;
      // A HIDDEN insight (reported past the threshold) must NOT silently
      // un-hide itself when the author re-saves — that bypassed moderation
      // (audit). Editing a VISIBLE one starts a fresh report slate; a HIDDEN
      // one stays hidden pending admin review.
      const existing = await ctx.db.cohortInsight.findUnique({
        where: { userId_stage: { userId: ctx.user.id, stage: input.stage } },
        select: { status: true },
      });
      const keepHidden = existing?.status === "HIDDEN";
      return ctx.db.cohortInsight.upsert({
        where: { userId_stage: { userId: ctx.user.id, stage: input.stage } },
        create: {
          userId: ctx.user.id,
          stage: input.stage,
          text: input.text,
          cohortYear,
        },
        update: keepHidden
          ? { text: input.text } // stays HIDDEN, report slate untouched
          : { text: input.text, status: "VISIBLE", reportCount: 0 },
      });
    }),

  deleteMyInsight: protectedProcedure
    .input(z.object({ stage: z.enum(INSIGHT_STAGES) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.cohortInsight.deleteMany({
        where: { userId: ctx.user.id, stage: input.stage },
      });
      return { ok: true };
    }),

  reportInsight: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Rate-limit reports per user so one account can't mass-hide the wall
      // (audit HIGH — no per-reporter dedup table exists, so cap the abuse).
      if (!checkRateLimit(`cohort-report:${ctx.user.id}`, { maxRequests: 8, windowSeconds: 3600 }).allowed) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many reports — try later." });
      }
      const row = await ctx.db.cohortInsight.findUnique({ where: { id: input.id } });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      // Can't report your own — and re-reporting the same hidden row is a no-op.
      if (row.userId === ctx.user.id || row.status === "HIDDEN") return { ok: true };
      const reportCount = row.reportCount + 1;
      await ctx.db.cohortInsight.update({
        where: { id: input.id },
        data: {
          reportCount,
          status: reportCount >= HIDE_THRESHOLD ? "HIDDEN" : row.status,
        },
      });
      return { ok: true };
    }),

  /** Contribution stats for the game layer — counts only, derived live. */
  myContributionStats: protectedProcedure.query(async ({ ctx }) => {
    const [reviews, insights, plans] = await Promise.all([
      ctx.db.courseReview.count({ where: { userId: ctx.user.id } }),
      ctx.db.cohortInsight.count({ where: { userId: ctx.user.id } }),
      ctx.db.sharedPlanEntry.count({ where: { userId: ctx.user.id } }),
    ]);
    return { reviews, insights, plans, total: reviews + insights + plans };
  }),

  // ─── Winning-plans gallery ────────────────────────────────────────

  listGallery: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.sharedPlanEntry.findMany({
      where: { status: "VISIBLE" },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, title: true, token: true, cohortYear: true, createdAt: true },
    });
  }),

  /** Publish the caller's CURRENT plan under a title. Token is built client-
   *  side with the same encoder the share button uses — the server only
   *  validates shape/limits, it never fabricates a plan. */
  publishPlan: protectedProcedure
    .input(
      z.object({
        title: z.string().trim().min(3).max(80),
        token: z.string().min(8).max(6000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // The token must decode to a real plan — a garbage string would become
      // a permanent gallery entry that errors on every viewer (audit).
      const decoded = decodePlan(input.token);
      if (!decoded || decoded.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid plan token" });
      }
      // One entry per user (the latest wins) — a gallery, not a feed.
      await ctx.db.sharedPlanEntry.deleteMany({ where: { userId: ctx.user.id } });
      return ctx.db.sharedPlanEntry.create({
        data: {
          userId: ctx.user.id,
          title: input.title,
          token: input.token,
          cohortYear: ctx.user.startYear ?? null,
        },
      });
    }),

  unpublishMyPlan: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db.sharedPlanEntry.deleteMany({ where: { userId: ctx.user.id } });
    return { ok: true };
  }),

  reportGalleryEntry: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!checkRateLimit(`cohort-report:${ctx.user.id}`, { maxRequests: 8, windowSeconds: 3600 }).allowed) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many reports — try later." });
      }
      const row = await ctx.db.sharedPlanEntry.findUnique({ where: { id: input.id } });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      if (row.userId === ctx.user.id || row.status === "HIDDEN") return { ok: true };
      const reportCount = row.reportCount + 1;
      await ctx.db.sharedPlanEntry.update({
        where: { id: input.id },
        data: {
          reportCount,
          status: reportCount >= HIDE_THRESHOLD ? "HIDDEN" : row.status,
        },
      });
      return { ok: true };
    }),
});
