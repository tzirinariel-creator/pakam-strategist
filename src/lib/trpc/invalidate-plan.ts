import type { api } from "@/lib/trpc/react";

/**
 * Invalidate EVERY query that a course/grade/plan change can affect, so the
 * whole app stays in sync from any surface (#23). Any mutation that adds,
 * moves, grades, or removes a course should call this in onSuccess — a partial
 * invalidation (e.g. only getUserPlan) leaves the credits headline, the
 * graduation forecast, or the regulation compliance showing stale numbers.
 */
export function invalidatePlanData(utils: ReturnType<typeof api.useUtils>): void {
  void utils.plan.getUserPlan.invalidate();
  void utils.plan.getCredits.invalidate();
  void utils.plan.getGraduationScore.invalidate();
  void utils.regulation.checkCompliance.invalidate();
  void utils.user.getProfile.invalidate();
}
