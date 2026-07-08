import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createHash } from "node:crypto";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "../trpc/init";
import { moderateTip } from "@/lib/course-knowledge-moderation";
import { ALLOWED_TAGS } from "@/lib/course-knowledge-tags";

/**
 * Cross-cohort course knowledge (notes #3, #16).
 *
 * Anonymous + aggregate-only. Individual grades are NEVER exposed:
 *  - grade points carry NO userId (physically decoupled from identity);
 *  - aggregates unlock only above k-anonymity thresholds (grades N>=5, ratings
 *    N>=3), and a cohort filter unlocks only if that cohort clears the bar on
 *    its own — otherwise it's ignored (no de-anonymising a rare cohort).
 * Reviews link to userId in the DB only (one-per-course + withdrawal +
 * moderation); the read API never returns userId. Honesty-first: this shows the
 * aggregate PAST, never a prediction, and never "take this, it's easy".
 */

const GRADE_MIN_N = 5;
const RATING_MIN_N = 3;
const REVIEW_HIDE_THRESHOLD = 3;
const COHORT_LABEL_MIN_N = 5;
const TIP_MAX = 400;

function dedupeHashFor(userId: string, courseCode: string): string {
  // One-way — enforces one grade point per person per course WITHOUT storing
  // who. Not reversible to an identity.
  return createHash("sha256").update(`${userId}:${courseCode}`).digest("hex");
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function percentile(sortedAsc: number[], p: number): number | null {
  if (sortedAsc.length === 0) return null;
  const idx = Math.min(
    sortedAsc.length - 1,
    Math.max(0, Math.round((p / 100) * (sortedAsc.length - 1))),
  );
  return sortedAsc[idx] ?? null;
}

const contributeInput = z.object({
  courseCode: z.string().min(1).max(30),
  workload: z.number().int().min(1).max(5).optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  verdict: z.enum(["RECOMMEND", "NEUTRAL", "AVOID"]).optional(),
  tip: z.string().trim().max(TIP_MAX).optional(),
  tags: z.array(z.enum(ALLOWED_TAGS)).max(6).default([]),
});

export const courseKnowledgeRouter = createTRPCRouter({
  /** Aggregate-only read. Public — visible without login, like the catalog. */
  getForCourse: publicProcedure
    .input(z.object({ courseCode: z.string().min(1).max(30), cohortYear: z.number().int().optional() }))
    .query(async ({ ctx, input }) => {
      const [allPoints, reviews] = await Promise.all([
        ctx.db.courseGradePoint.findMany({
          where: { courseCode: input.courseCode },
          select: { grade: true, isBinary: true, cohortYear: true },
        }),
        ctx.db.courseReview.findMany({
          where: { courseCode: input.courseCode, status: "VISIBLE" },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            tip: true,
            tags: true,
            verdict: true,
            createdAt: true,
            cohortYear: true,
            workload: true,
            difficulty: true,
          },
        }),
      ]);

      // Cohort filter unlocks ONLY if that cohort clears the grade bar on its
      // own; otherwise ignore it (never de-anonymise a small cohort).
      let points = allPoints;
      let cohortSuppressed = false;
      if (input.cohortYear != null) {
        const sub = allPoints.filter((p) => p.cohortYear === input.cohortYear);
        if (sub.filter((p) => !p.isBinary && p.grade != null).length >= GRADE_MIN_N) {
          points = sub;
        } else {
          cohortSuppressed = true; // fall back to all, flag it
        }
      }

      const graded = points.filter((p) => !p.isBinary && p.grade != null).map((p) => p.grade as number);
      graded.sort((a, b) => a - b);
      const gradeRevealed = graded.length >= GRADE_MIN_N;

      const ratingRows = reviews.filter((r) => r.workload != null || r.difficulty != null || r.verdict != null);
      const ratingRevealed = ratingRows.length >= RATING_MIN_N;
      const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
      const workloadVals = ratingRows.map((r) => r.workload).filter((x): x is number => x != null);
      const difficultyVals = ratingRows.map((r) => r.difficulty).filter((x): x is number => x != null);
      const verdictVals = ratingRows.map((r) => r.verdict).filter((v) => v != null);
      const recommendShare = verdictVals.length
        ? verdictVals.filter((v) => v === "RECOMMEND").length / verdictVals.length
        : null;

      // Cohort label per review — only when that cohort has enough reviews.
      const cohortCounts = new Map<number, number>();
      for (const r of reviews) if (r.cohortYear != null) cohortCounts.set(r.cohortYear, (cohortCounts.get(r.cohortYear) ?? 0) + 1);

      const cohortsAvailable = [...new Set(allPoints.map((p) => p.cohortYear).filter((y): y is number => y != null))]
        .filter((y) => allPoints.filter((p) => p.cohortYear === y && !p.isBinary && p.grade != null).length >= GRADE_MIN_N)
        .sort((a, b) => b - a);

      return {
        grade: {
          n: points.length,
          nGraded: graded.length,
          revealed: gradeRevealed,
          average: gradeRevealed ? round1(avg(graded) as number) : null,
          median: gradeRevealed ? percentile(graded, 50) : null,
          p25: gradeRevealed ? percentile(graded, 25) : null,
          p75: gradeRevealed ? percentile(graded, 75) : null,
          binaryShare: points.length ? round1(points.filter((p) => p.isBinary).length / points.length) : null,
          cohortSuppressed,
        },
        ratings: {
          n: ratingRows.length,
          revealed: ratingRevealed,
          workloadAvg: ratingRevealed ? round1(avg(workloadVals) ?? 0) : null,
          difficultyAvg: ratingRevealed ? round1(avg(difficultyVals) ?? 0) : null,
          recommendShare: ratingRevealed && recommendShare != null ? round1(recommendShare) : null,
        },
        reviews: reviews
          .filter((r) => r.tip && r.tip.trim().length > 0)
          .slice(0, 5)
          .map((r) => ({
            id: r.id,
            tip: r.tip as string,
            tags: r.tags,
            verdict: r.verdict,
            createdAt: r.createdAt,
            cohortLabel:
              r.cohortYear != null && (cohortCounts.get(r.cohortYear) ?? 0) >= COHORT_LABEL_MIN_N
                ? `מחזור ${r.cohortYear}`
                : null,
          })),
        cohortsAvailable,
      };
    }),

  /** Contribute/update a rating + review. One per (user, course). */
  contributeReview: protectedProcedure.input(contributeInput).mutation(async ({ ctx, input }) => {
    if (input.workload == null && input.difficulty == null && input.verdict == null && !input.tip?.trim()) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "צריך לפחות דירוג אחד או טיפ." });
    }
    const course = await ctx.db.course.findUnique({ where: { code: input.courseCode }, select: { id: true } });
    if (!course) throw new TRPCError({ code: "NOT_FOUND", message: "קורס לא נמצא." });

    if (input.tip?.trim()) {
      const mod = moderateTip(input.tip);
      if (!mod.ok) throw new TRPCError({ code: "BAD_REQUEST", message: mod.reason ?? "הטיפ נדחה." });
    }

    const cohortYear = ctx.user.startYear ?? null;
    await ctx.db.courseReview.upsert({
      where: { userId_courseCode: { userId: ctx.user.id, courseCode: input.courseCode } },
      create: {
        userId: ctx.user.id,
        courseCode: input.courseCode,
        cohortYear,
        workload: input.workload ?? null,
        difficulty: input.difficulty ?? null,
        verdict: input.verdict ?? null,
        tip: input.tip?.trim() || null,
        tags: input.tags,
      },
      update: {
        cohortYear,
        workload: input.workload ?? null,
        difficulty: input.difficulty ?? null,
        verdict: input.verdict ?? null,
        tip: input.tip?.trim() || null,
        tags: input.tags,
        status: "VISIBLE",
        reportCount: 0,
      },
    });
    return { ok: true };
  }),

  /** Cold-start engine — opt-in import of the user's OWN completed grades as
   *  anonymous points. Idempotent via dedupeHash. */
  importMyGrades: protectedProcedure.mutation(async ({ ctx }) => {
    const completed = await ctx.db.userCourse.findMany({
      where: { userId: ctx.user.id, status: "COMPLETED" },
      select: { grade: true, isBinary: true, attemptNumber: true, course: { select: { code: true } } },
    });
    const cohortYear = ctx.user.startYear ?? null;
    // One anonymous point per course. All completed rows for a course share the
    // same dedupeHash (userId:courseCode), so upserting every row would let an
    // arbitrary earlier attempt overwrite the determining one. Keep only the
    // DETERMINING attempt (highest attemptNumber) per course.
    const canonical = new Map<string, (typeof completed)[number]>();
    for (const uc of completed) {
      const code = uc.course.code;
      const prev = canonical.get(code);
      if (!prev || uc.attemptNumber > prev.attemptNumber) canonical.set(code, uc);
    }
    let imported = 0;
    for (const uc of canonical.values()) {
      const code = uc.course.code;
      const hash = dedupeHashFor(ctx.user.id, code);
      await ctx.db.courseGradePoint.upsert({
        where: { dedupeHash: hash },
        create: {
          courseCode: code,
          grade: uc.isBinary ? null : uc.grade,
          isBinary: uc.isBinary,
          cohortYear,
          source: "import",
          dedupeHash: hash,
        },
        update: { grade: uc.isBinary ? null : uc.grade, isBinary: uc.isBinary, cohortYear },
      });
      imported += 1;
    }
    return { imported };
  }),

  /** Full withdrawal (privacy right): delete this user's reviews + their
   *  anonymous grade points (recomputed by hash across all their courses). */
  withdrawMyContributions: protectedProcedure.mutation(async ({ ctx }) => {
    const courses = await ctx.db.userCourse.findMany({
      where: { userId: ctx.user.id },
      select: { course: { select: { code: true } } },
    });
    const hashes = [...new Set(courses.map((c) => c.course.code))].map((code) => dedupeHashFor(ctx.user.id, code));
    const [reviews, points] = await ctx.db.$transaction([
      ctx.db.courseReview.deleteMany({ where: { userId: ctx.user.id } }),
      ctx.db.courseGradePoint.deleteMany({ where: { dedupeHash: { in: hashes } } }),
    ]);
    return { reviewsRemoved: reviews.count, pointsRemoved: points.count };
  }),

  /** Report a review; auto-hide at the DISTINCT-reporter threshold, then admin
   *  review. Idempotent per reporter (a ReviewReport unique on [reviewId,userId])
   *  so no single user can drive a review to HIDDEN, and you can't report your
   *  own review (#audit-r1). */
  reportReview: protectedProcedure.input(z.object({ reviewId: z.string() })).mutation(async ({ ctx, input }) => {
    const review = await ctx.db.courseReview.findUnique({
      where: { id: input.reviewId },
      select: { id: true, userId: true },
    });
    if (!review) throw new TRPCError({ code: "NOT_FOUND" });
    // Can't report your own review.
    if (review.userId === ctx.user.id) return { ok: true };
    // Record this reporter once; a repeat report from the same user hits the
    // unique constraint and is a no-op (doesn't advance the count).
    try {
      await ctx.db.reviewReport.create({ data: { reviewId: review.id, userId: ctx.user.id } });
    } catch (e) {
      if ((e as { code?: string })?.code === "P2002") return { ok: true }; // already reported
      throw e;
    }
    const reporters = await ctx.db.reviewReport.count({ where: { reviewId: review.id } });
    await ctx.db.courseReview.update({
      where: { id: review.id },
      data: { reportCount: reporters, status: reporters >= REVIEW_HIDE_THRESHOLD ? "HIDDEN" : undefined },
    });
    return { ok: true };
  }),
});
