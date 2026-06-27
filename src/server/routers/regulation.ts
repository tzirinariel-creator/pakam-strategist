import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../trpc/init";
import { runRegulationEngine } from "@/lib/regulations/rule-engine";
import { computeCreditExemption, deriveCurrentGroup, getCurrentAcademicYear } from "@/lib/miluim";

export const regulationRouter = createTRPCRouter({
  /**
   * Check the current user's academic compliance against all 16 PKM rules.
   *
   * Fetches the user's courses (with embedded Course data), runs the
   * regulation engine, and returns a full RegulationSummary.
   */
  checkCompliance: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { supabaseId: ctx.userId },
    });

    if (!user) {
      throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    }

    // Fetch all user courses with related course data
    const userCourses = await ctx.db.userCourse.findMany({
      where: { userId: user.id },
      include: { course: true },
      orderBy: [
        { plannedYear: "asc" },
        { plannedSemester: "asc" },
      ],
    });

    // Per-semester miluim rows (may be empty). Resolve the CURRENT group from
    // the current-semester row, else the stored miluimGroup — a user with NO
    // rows behaves exactly as before. (Mirrors plan.getCredits.)
    const miluimSemesters = await ctx.db.miluimSemester.findMany({
      where: { userId: user.id },
    });
    // academicYear is the calendar-year key the rows were written with
    // (getCurrentAcademicYear), NOT user.currentYear (academic standing 1–4).
    // Mirrors plan.getCredits — see fix A.
    const currentGroup = deriveCurrentGroup(miluimSemesters, user.miluimGroup, {
      academicYear: getCurrentAcademicYear(),
      semester: user.currentSemester,
    });
    const miluimExemption = computeCreditExemption(
      currentGroup,
      user.miluimCreditsUsed,
    );

    // Run the regulation engine (safe for empty course lists).
    // Thread the AMIRANT (English placement) score + academic standing so the
    // English-level and exemption-deadline rules can fire. The DB column is
    // still `amiramScore`; the rules layer calls it amirantScore. The miluim
    // fields drive the new non-blocking PKM-024 / PKM-025 binary-cap rules.
    try {
      const summary = runRegulationEngine(
        userCourses,
        user.focusArea,
        miluimExemption,
        undefined,
        {
          amirantScore: user.amiramScore,
          academicYear: user.currentYear,
          currentSemester: user.currentSemester,
          miluimGroup: currentGroup,
          miluimBinaryUsed: user.miluimBinaryUsed,
          miluimCreditsUsed: user.miluimCreditsUsed,
        },
      );

      return {
        ...summary,
        courseCount: userCourses.length,
      };
    } catch (err) {
      console.error("[regulation.checkCompliance] Engine error:", err);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to run regulation engine",
        cause: err,
      });
    }
  }),
});
