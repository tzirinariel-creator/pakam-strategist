// =========================================================================
// Consent-based named mentoring (owner decision 23.7 — "חונכות בעל-שם,
// בהסכמה, תוכנית-בלבד").
// =========================================================================
// The MENTEE initiates (invites a specific person by email), so the plan owner
// is always the one who chose to share. The MENTOR accepts, and only then may
// view the mentee's PLAN — courses + semesters + status, NEVER grades. Either
// party can end the link, which revokes access immediately. Every read is
// gated on a live ACTIVE row; there is no other path to another user's plan.
//
// Demo write-block + auth come from the shared protectedProcedure middleware.

import { z } from "zod/v4";
import { createTRPCRouter, protectedProcedure } from "../trpc/init";
import { TRPCError } from "@trpc/server";

/** Public-safe shape of a person on either side of a link. */
const personSelect = { id: true, firstName: true, lastName: true, displayName: true, email: true } as const;

function personName(u: { firstName: string | null; lastName: string | null; displayName: string | null; email: string }): string {
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return full || u.displayName || u.email;
}

export const mentorRouter = createTRPCRouter({
  /**
   * Mentee invites a specific person (by email) to mentor them. Creating the
   * link is itself the consent: the plan owner is the one calling this.
   */
  invite: protectedProcedure
    .input(z.object({ mentorEmail: z.string().email() }))
    .mutation(async ({ ctx, input }) => {
      const me = ctx.user;
      const email = input.mentorEmail.trim().toLowerCase();

      const mentor = await ctx.db.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
        select: personSelect,
      });
      if (!mentor) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "לא נמצא משתמש עם האימייל הזה. ודאו שהוא רשום לפכמון (בעל-שם, לא אנונימי).",
        });
      }
      if (mentor.id === me.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "אי אפשר להזמין את עצמכם." });
      }

      // One row per (mentee, mentor). Re-inviting after an END/DECLINE reopens it.
      const existing = await ctx.db.mentorLink.findUnique({
        where: { menteeUserId_mentorUserId: { menteeUserId: me.id, mentorUserId: mentor.id } },
      });
      if (existing && (existing.status === "PENDING" || existing.status === "ACTIVE")) {
        return { status: existing.status, mentorName: personName(mentor) };
      }
      const link = existing
        ? await ctx.db.mentorLink.update({
            where: { id: existing.id },
            data: { status: "PENDING", respondedAt: null, endedAt: null },
          })
        : await ctx.db.mentorLink.create({
            data: { menteeUserId: me.id, mentorUserId: mentor.id, status: "PENDING" },
          });
      return { status: link.status, mentorName: personName(mentor) };
    }),

  /** As MENTOR — invitations awaiting my accept/decline. */
  pendingInvites: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.mentorLink.findMany({
      where: { mentorUserId: ctx.user.id, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true, mentee: { select: personSelect } },
    });
    return rows.map((r) => ({ linkId: r.id, since: r.createdAt, menteeName: personName(r.mentee) }));
  }),

  /** As MENTOR — accept or decline an invitation addressed to me. */
  respond: protectedProcedure
    .input(z.object({ linkId: z.string().uuid(), accept: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const link = await ctx.db.mentorLink.findUnique({ where: { id: input.linkId } });
      // Only the invited MENTOR may respond, and only while it's PENDING.
      if (!link || link.mentorUserId !== ctx.user.id || link.status !== "PENDING") {
        throw new TRPCError({ code: "NOT_FOUND", message: "ההזמנה לא נמצאה." });
      }
      await ctx.db.mentorLink.update({
        where: { id: link.id },
        data: { status: input.accept ? "ACTIVE" : "DECLINED", respondedAt: new Date() },
      });
      return { status: input.accept ? ("ACTIVE" as const) : ("DECLINED" as const) };
    }),

  /** As MENTEE — who can see my plan (ACTIVE) + invitations I've sent (PENDING). */
  myMentors: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.mentorLink.findMany({
      where: { menteeUserId: ctx.user.id, status: { in: ["PENDING", "ACTIVE"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, createdAt: true, mentor: { select: personSelect } },
    });
    return rows.map((r) => ({ linkId: r.id, status: r.status, since: r.createdAt, mentorName: personName(r.mentor) }));
  }),

  /** As MENTOR — the mentees whose plans I may view (ACTIVE only). */
  myMentees: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.mentorLink.findMany({
      where: { mentorUserId: ctx.user.id, status: "ACTIVE" },
      orderBy: { respondedAt: "desc" },
      select: { id: true, mentee: { select: personSelect } },
    });
    return rows.map((r) => ({ linkId: r.id, menteeUserId: r.mentee.id, menteeName: personName(r.mentee) }));
  }),

  /** Either party ends a link (any status) → access revoked immediately. */
  endLink: protectedProcedure
    .input(z.object({ linkId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const link = await ctx.db.mentorLink.findUnique({ where: { id: input.linkId } });
      if (!link || (link.mentorUserId !== ctx.user.id && link.menteeUserId !== ctx.user.id)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "הקישור לא נמצא." });
      }
      await ctx.db.mentorLink.update({
        where: { id: link.id },
        data: { status: "ENDED", endedAt: new Date() },
      });
      return { success: true };
    }),

  /**
   * As MENTOR — view a mentee's PLAN. The privacy core:
   *   1. requires a LIVE ACTIVE link where I am the mentor and they the mentee;
   *   2. returns PLAN ONLY — course + semester + status. Grades and submission
   *      grades are NEVER selected, so they can't leak even by accident.
   */
  getMenteePlan: protectedProcedure
    .input(z.object({ menteeUserId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const link = await ctx.db.mentorLink.findUnique({
        where: { menteeUserId_mentorUserId: { menteeUserId: input.menteeUserId, mentorUserId: ctx.user.id } },
      });
      if (!link || link.status !== "ACTIVE") {
        throw new TRPCError({ code: "FORBIDDEN", message: "אין לכם גישה לתוכנית הזו." });
      }

      const mentee = await ctx.db.user.findUnique({
        where: { id: input.menteeUserId },
        select: { ...personSelect, focusArea: true, currentYear: true },
      });
      const courses = await ctx.db.userCourse.findMany({
        where: { userId: input.menteeUserId },
        orderBy: [{ plannedYear: "asc" }, { plannedSemester: "asc" }],
        // PLAN-ONLY — deliberately NO grade / submissionGrade / submissionType.
        select: {
          id: true,
          status: true,
          plannedYear: true,
          plannedSemester: true,
          isBinary: true,
          disciplineOverride: true,
          course: {
            select: { code: true, nameHe: true, nameEn: true, credits: true, courseType: true, discipline: true },
          },
        },
      });

      return {
        menteeName: mentee ? personName(mentee) : "",
        focusArea: mentee?.focusArea ?? null,
        currentYear: mentee?.currentYear ?? null,
        courses,
      };
    }),
});
