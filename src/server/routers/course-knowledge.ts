import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createHash } from "node:crypto";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "../trpc/init";
import { moderateTip } from "@/lib/course-knowledge-moderation";
import { ALLOWED_TAGS } from "@/lib/course-knowledge-tags";
import {
  GRADE_MIN_N,
  RATING_MIN_N,
  TIP_MIN_N,
  COHORT_LABEL_MIN_N,
  REPORT_HIDE_THRESHOLD,
  countByCohortYear,
  safeCohortYear,
} from "@/lib/k-anonymity";

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

// Thresholds live in ONE place now (src/lib/k-anonymity.ts), pinned by a guard
// test — they used to be private constants here and in cohort.ts, which made
// "never weaken k-anonymity" a grep rather than a rule.
const REVIEW_HIDE_THRESHOLD = REPORT_HIDE_THRESHOLD;
const TIP_MAX = 400;

export function dedupeHashFor(userId: string, courseCode: string): string {
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
      const cohortCounts = countByCohortYear(reviews);

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
          // Gate on the SAME grade-reveal threshold as the other grade fields —
          // binaryShare is derived from the grade points and must not leak below
          // the N≥5 anonymity bar (audit 22.7).
          binaryShare: gradeRevealed && points.length ? round1(points.filter((p) => p.isBinary).length / points.length) : null,
          cohortSuppressed,
        },
        ratings: {
          n: ratingRows.length,
          revealed: ratingRevealed,
          // null (not 0) when nobody supplied a numeric rating — 0 would render
          // as "lightest/easiest", the opposite of "no data" (#audit-r2).
          // Gate each average on ITS OWN contributor count >= RATING_MIN_N — not
          // just the total row count — or a single person's 1-5 rating shows as
          // the cohort aggregate under an N>=3 label (k-anon leak, QA 13.7).
          // Mirrors the recommendShare guard below.
          workloadAvg: ratingRevealed && workloadVals.length >= RATING_MIN_N ? round1(avg(workloadVals) as number) : null,
          difficultyAvg: ratingRevealed && difficultyVals.length >= RATING_MIN_N ? round1(avg(difficultyVals) as number) : null,
          // Only reveal the recommend-share when ENOUGH people actually gave a
          // verdict — otherwise "100% ממליצים" could reflect a single opinion
          // while the N beside it counts workload/difficulty-only raters (#audit-r3).
          recommendShare:
            verdictVals.length >= RATING_MIN_N && recommendShare != null ? round1(recommendShare) : null,
          // Privacy-safe 3-state bucket for the cohort chip. ALL threshold math
          // is done HERE, never on the client: N=0 and N=1 both read as EMPTY so
          // a single contributor is never exposed; the count crosses the wire
          // only at N>=2 (SEEDING). REVEALED is the existing k-anon reveal
          // (RATING_MIN_N). k-anonymity constants are untouched.
          contributorBucket: (ratingRevealed
            ? "REVEALED"
            : ratingRows.length >= 2
              ? "SEEDING"
              : "EMPTY") as "EMPTY" | "SEEDING" | "REVEALED",
          seedingContributors:
            !ratingRevealed && ratingRows.length >= 2 ? ratingRows.length : null,
          seedingRemaining:
            !ratingRevealed && ratingRows.length >= 2 ? RATING_MIN_N - ratingRows.length : null,
        },
        // k-anonymity for prose (13.8). This array used to return at N=1 to
        // anonymous visitors while every sibling field was gated — with ~24
        // students, a single-reviewer course makes its tip attributable to the
        // one person known to have taken it. Gated on the count of tip-bearing
        // reviews specifically, not the row total: four ratings and one tip is
        // still one identifiable author.
        reviews: (reviews.filter((r) => r.tip && r.tip.trim().length > 0).length >= TIP_MIN_N
          ? reviews.filter((r) => r.tip && r.tip.trim().length > 0)
          : []
        )
          .slice(0, 5)
          .map((r) => ({
            id: r.id,
            tip: r.tip as string,
            tags: r.tags,
            verdict: r.verdict,
            createdAt: r.createdAt,
            cohortLabel: (() => {
              const y = safeCohortYear(r.cohortYear, cohortCounts, COHORT_LABEL_MIN_N);
              return y == null ? null : `מחזור ${y}`;
            })(),
          })),
        cohortsAvailable,
      };
    }),

  /** S3 — BATCHED aggregate for the planner's course pool: one query for many
   *  codes (never N+1), returning ONLY what the "מומלץ ע"י המחזור" tag needs.
   *  Same k-anonymity thresholds as getForCourse — nothing leaks below them. */
  /**
   * The cohort file (notes 3+16, approved plan stage א) — ONE aggregate
   * digest for the "תיק המחזור" page. Same k-anonymity bars as everywhere:
   * ratings reveal at N≥3, grades at N≥5; below the bar nothing shows.
   * Deliberately NOT filtered by cohort year — accumulated knowledge is the
   * whole point (stage ה: it passes forward automatically).
   */
  getCohortDigest: protectedProcedure.query(async ({ ctx }) => {
    const [reviews, gradePoints, courses] = await Promise.all([
      ctx.db.courseReview.findMany({
        where: { status: "VISIBLE" },
        select: {
          courseCode: true,
          workload: true,
          difficulty: true,
          verdict: true,
          tip: true,
          tags: true,
          createdAt: true,
          // #41 — a tip is far more useful when you know how far ahead of you
          // the person who wrote it was. Gated below by the SAME bar the course
          // page already uses (safeCohortYear), so it never labels a lone voice.
          cohortYear: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      ctx.db.courseGradePoint.findMany({
        select: { courseCode: true, grade: true, isBinary: true, cohortYear: true },
      }),
      ctx.db.course.findMany({
        where: { isActive: true },
        select: { code: true, nameHe: true, nameEn: true, discipline: true, courseType: true },
      }),
    ]);

    const nameByCode = new Map(courses.map((c) => [c.code, c]));
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    const round1 = (x: number) => Math.round(x * 10) / 10;

    // Per-course rating aggregates — revealed only above the bar.
    const byCourse = new Map<string, typeof reviews>();
    for (const r of reviews) {
      const list = byCourse.get(r.courseCode) ?? [];
      list.push(r);
      byCourse.set(r.courseCode, list);
    }
    const gradesByCourse = new Map<string, number[]>();
    for (const p of gradePoints) {
      if (p.isBinary || p.grade == null) continue;
      const list = gradesByCourse.get(p.courseCode) ?? [];
      list.push(p.grade);
      gradesByCourse.set(p.courseCode, list);
    }

    const courseDigests = [...byCourse.entries()]
      .filter(([, rows]) => rows.length >= RATING_MIN_N)
      .map(([code, rows]) => {
        const course = nameByCode.get(code);
        // Gate each average on its OWN contributor count >= RATING_MIN_N (not the
        // total row count), same as recommendShare below — else one person's 1-5
        // rating leaks as a cohort aggregate under an N>=3 label (QA 13.7).
        const workloadVals = rows.map((r) => r.workload).filter((x): x is number => x != null);
        const difficultyVals = rows.map((r) => r.difficulty).filter((x): x is number => x != null);
        const workload = workloadVals.length >= RATING_MIN_N ? avg(workloadVals) : null;
        const difficulty = difficultyVals.length >= RATING_MIN_N ? avg(difficultyVals) : null;
        const verdicts = rows.map((r) => r.verdict).filter((v) => v != null);
        const recommendShare = verdicts.length >= RATING_MIN_N
          ? verdicts.filter((v) => v === "RECOMMEND").length / verdicts.length
          : null;
        const grades = gradesByCourse.get(code) ?? [];
        return {
          courseCode: code,
          nameHe: course?.nameHe ?? code,
          nameEn: course?.nameEn ?? null,
          discipline: course?.discipline ?? null,
          courseType: course?.courseType ?? null,
          ratingCount: rows.length,
          workload: workload != null ? round1(workload) : null,
          difficulty: difficulty != null ? round1(difficulty) : null,
          recommendShare: recommendShare != null ? round1(recommendShare) : null,
          cohortAverage: grades.length >= GRADE_MIN_N ? round1(avg(grades)!) : null,
          gradeCount: grades.length >= GRADE_MIN_N ? grades.length : null,
        };
      })
      .sort((a, b) => b.ratingCount - a.ratingCount)
      .slice(0, 30);

    // The tips wall — freshest non-empty tips, already anonymous, capped.
    // The cohort year rides along ONLY through safeCohortYear: a year attached
    // to content from a thin cohort stops being context and starts being a
    // pointer at one person.
    const reviewCohortCounts = countByCohortYear(reviews);
    const tips = reviews
      .filter((r) => r.tip && r.tip.trim().length > 0)
      .slice(0, 12)
      .map((r) => ({
        courseCode: r.courseCode,
        courseName: nameByCode.get(r.courseCode)?.nameHe ?? r.courseCode,
        tip: r.tip as string,
        tags: r.tags,
        cohortYear: safeCohortYear(r.cohortYear, reviewCohortCounts),
      }));

    // Which cohorts are represented in the file at all — DISTINCT YEARS only,
    // never per-year counts (a count of 1 would name a person). Feeds the
    // "generations" strip on /lineage; see src/lib/lineage.ts.
    const cohortYearsPresent = [
      ...new Set(
        [...reviews, ...gradePoints]
          .map((r) => r.cohortYear)
          .filter((y): y is number => y != null),
      ),
    ].sort((a, b) => a - b);

    // How close the file is to opening something new. An empty table with no
    // explanation reads as "this feature is broken"; the same emptiness with
    // "two more reviews open three courses" reads as a queue you can move.
    //
    // PRIVACY: this aggregates over COURSES, never over people, and names
    // neither. It is strictly less than the per-course SEEDING chip the catalog
    // already renders next to a course code, and it cannot be inverted to a
    // contributor — a total of "4 reviews needed" says nothing about who wrote
    // the ones already there, or for what. No threshold moves; the whole point
    // of the number is that the bar is still there and is worth crossing.
    const belowBar = [...byCourse.values()]
      .map((rows) => rows.length)
      .filter((n) => n > 0 && n < RATING_MIN_N);
    const almostUnlocked = {
      courses: belowBar.length,
      reviewsNeeded: belowBar.reduce((sum, n) => sum + (RATING_MIN_N - n), 0),
    };

    // "דבר הרפרנט" — data-driven counts only, no LLM, no invention.
    const totals = {
      reviews: reviews.length,
      gradePoints: gradePoints.length,
      coursesCovered: courseDigests.length,
      mostDiscussed: courseDigests[0]
        ? { nameHe: courseDigests[0].nameHe, count: courseDigests[0].ratingCount }
        : null,
    };

    return { courses: courseDigests, tips, totals, almostUnlocked, cohortYearsPresent };
  }),

  /**
   * The caller's OWN completed courses, flagged with whether they already
   * reviewed each one. Every row is the caller's own data — nothing about
   * anybody else crosses the wire, so this adds no privacy surface and touches
   * no k-anonymity bar.
   *
   * Why it exists (#31): rating a finished course had no door a student could
   * walk through on purpose. `ContributeReviewSheet` opened from exactly two
   * places — the catalog's course-detail modal, and a one-shot toast fired in
   * the onSuccess of a grade-locking write (and marked "done" the first time it
   * is merely SHOWN). So the student the lineage's "start here" CTA addresses,
   * the one who ALREADY entered their grades, was sent to /record and found
   * nothing to click. This is the list that CTA needs in order to be true.
   */
  myReviewableCourses: protectedProcedure.query(async ({ ctx }) => {
    const [completed, mine] = await Promise.all([
      ctx.db.userCourse.findMany({
        where: { userId: ctx.user.id, status: "COMPLETED" },
        select: { course: { select: { code: true, nameHe: true, nameEn: true } } },
      }),
      ctx.db.courseReview.findMany({
        where: { userId: ctx.user.id },
        select: { courseCode: true },
      }),
    ]);
    const reviewed = new Set(mine.map((r) => r.courseCode));
    // A retaken course has one UserCourse row per attempt, but it is still ONE
    // course to rate (contributeReview upserts on [userId, courseCode]).
    const byCode = new Map<
      string,
      { courseCode: string; nameHe: string; nameEn: string | null; reviewed: boolean }
    >();
    for (const uc of completed) {
      if (!uc.course || byCode.has(uc.course.code)) continue;
      byCode.set(uc.course.code, {
        courseCode: uc.course.code,
        nameHe: uc.course.nameHe,
        nameEn: uc.course.nameEn,
        reviewed: reviewed.has(uc.course.code),
      });
    }
    const courses = [...byCode.values()];
    return {
      courses,
      completedCount: courses.length,
      reviewedCount: courses.filter((c) => c.reviewed).length,
    };
  }),

  /** Batched aggregate for the catalog table (audit 24.7 fast-follow): the
   *  table used to render one CohortCourseChip per row, each firing its own
   *  getForCourse query — ~100-200 tRPC calls / ~400 findMany on one catalog
   *  load. One round-trip here, keyed by code, covers every field the chip
   *  needs (including the SEEDING bucket) so the per-row query can go away.
   *  Same k-anonymity thresholds as getForCourse — nothing leaks below them. */
  getForCourses: publicProcedure
    .input(z.object({ courseCodes: z.array(z.string().min(1).max(30)).min(1).max(200) }))
    .query(async ({ ctx, input }) => {
      const reviews = await ctx.db.courseReview.findMany({
        where: { courseCode: { in: input.courseCodes }, status: "VISIBLE" },
        select: { courseCode: true, verdict: true, workload: true, difficulty: true },
      });
      const byCode = new Map<string, typeof reviews>();
      for (const r of reviews) {
        const list = byCode.get(r.courseCode) ?? [];
        list.push(r);
        byCode.set(r.courseCode, list);
      }
      const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
      const out: Record<
        string,
        {
          n: number;
          revealed: boolean;
          recommendShare: number | null;
          workloadAvg: number | null;
          contributorBucket: "EMPTY" | "SEEDING" | "REVEALED";
          seedingContributors: number | null;
          seedingRemaining: number | null;
        }
      > = {};
      for (const code of input.courseCodes) {
        const rows = (byCode.get(code) ?? []).filter(
          (r) => r.workload != null || r.difficulty != null || r.verdict != null,
        );
        const verdicts = rows.map((r) => r.verdict).filter((v) => v != null);
        const revealed = rows.length >= RATING_MIN_N;
        const workloadVals = rows.map((r) => r.workload).filter((x): x is number => x != null);
        out[code] = {
          n: rows.length,
          revealed,
          recommendShare:
            revealed && verdicts.length >= RATING_MIN_N
              ? round1(verdicts.filter((v) => v === "RECOMMEND").length / verdicts.length)
              : null,
          workloadAvg: revealed && workloadVals.length >= RATING_MIN_N ? round1(avg(workloadVals) as number) : null,
          contributorBucket: revealed ? "REVEALED" : rows.length >= 2 ? "SEEDING" : "EMPTY",
          seedingContributors: !revealed && rows.length >= 2 ? rows.length : null,
          seedingRemaining: !revealed && rows.length >= 2 ? RATING_MIN_N - rows.length : null,
        };
      }
      return out;
    }),

  /** Contribute/update a rating + review. One per (user, course). */
  contributeReview: protectedProcedure.input(contributeInput).mutation(async ({ ctx, input }) => {
    if (input.workload == null && input.difficulty == null && input.verdict == null && !input.tip?.trim()) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "צריך לפחות דירוג אחד או טיפ." });
    }
    const course = await ctx.db.course.findUnique({ where: { code: input.courseCode }, select: { id: true } });
    if (!course) throw new TRPCError({ code: "NOT_FOUND", message: "קורס לא נמצא." });

    // Only someone who actually COMPLETED the course may rate it — otherwise any
    // user could fabricate ratings for any catalog code and corrupt the public
    // aggregate (symmetric with importMyGrades, which gates on COMPLETED). (#audit-r2)
    const taken = await ctx.db.userCourse.findFirst({
      where: { userId: ctx.user.id, status: "COMPLETED", course: { code: input.courseCode } },
      select: { id: true },
    });
    if (!taken) {
      throw new TRPCError({ code: "FORBIDDEN", message: "רק מי שסיים את הקורס יכול לדרג אותו." });
    }

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
