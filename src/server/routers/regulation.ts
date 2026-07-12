import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure, createRequestLoaders } from "../trpc/init";
import { runRegulationEngine } from "@/lib/regulations/rule-engine";
import { computeCreditExemption, deriveCurrentGroup, getCurrentAcademicYear } from "@/lib/miluim";
import { getAcademicNow, deriveYearOfStudy } from "@/lib/academic-calendar";

export const regulationRouter = createTRPCRouter({
  /**
   * Check the current user's academic compliance against all 16 PKM rules.
   *
   * Fetches the user's courses (with embedded Course data), runs the
   * regulation engine, and returns a full RegulationSummary.
   */
  checkCompliance: protectedProcedure.query(async ({ ctx }) => {
    // Authenticated user row already loaded + verified by enforceAuth — reuse
    // it instead of a redundant per-procedure findUnique (#9 N+1 fix).
    const user = ctx.user;

    // Fetch all user courses with related course data (PERF2 — request-scoped
    // loader, shared with the plan procedures in the same dashboard batch).
    const loaders = ctx.loaders ?? createRequestLoaders(ctx.db);
    const userCourses = await loaders.userCoursesWithCourse(user.id);

    // Per-semester miluim rows (may be empty). Resolve the CURRENT group from
    // the current-semester row, else the stored miluimGroup — a user with NO
    // rows behaves exactly as before. (Mirrors plan.getCredits.)
    const miluimSemesters = await loaders.miluimSemesters(user.id);
    // academicYear is the calendar-year key the rows were written with
    // (getCurrentAcademicYear), NOT user.currentYear (academic standing 1–4).
    // Mirrors plan.getCredits — see fix A.
    const currentGroup = deriveCurrentGroup(miluimSemesters, user.miluimGroup, {
      academicYear: getCurrentAcademicYear(),
      // Real-time semester (the calendar source-of-truth), NOT the stored
      // user.currentSemester which can lag a rollover — so the server picks the
      // SAME MiluimSemester row the client surfaces use (#audit-r2 consistency).
      semester: getAcademicNow().semester,
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
          englishLevel: user.englishLevel,
          // A4: calendar-derived standing so the English-deadline rule isn't
          // computed against a stale stored year/semester.
          academicYear: deriveYearOfStudy(user.startYear, user.currentYear ?? 1),
          currentSemester: getAcademicNow().semester,
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
