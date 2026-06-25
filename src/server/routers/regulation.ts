import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../trpc/init";
import { runRegulationEngine } from "@/lib/regulations/rule-engine";
import { MILUIM_CONFIG } from "@/lib/constants";

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

    // Calculate miluim credit exemption (same logic as plan.getCredits)
    let miluimExemption = 0;
    if (user.miluimGroup && user.miluimGroup !== "NONE") {
      const groupConfig = MILUIM_CONFIG.GROUPS[user.miluimGroup as keyof typeof MILUIM_CONFIG.GROUPS];
      if (groupConfig && groupConfig.creditExemptionPerYear > 0) {
        const yearsInProgram = user.currentYear ?? 1;
        miluimExemption = Math.min(
          groupConfig.creditExemptionPerYear * yearsInProgram,
          MILUIM_CONFIG.MAX_CREDIT_EXEMPTIONS_DEGREE,
        );
      }
    }

    // Run the regulation engine (safe for empty course lists)
    try {
      const summary = runRegulationEngine(userCourses, user.focusArea, miluimExemption);

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
