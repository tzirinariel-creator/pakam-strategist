"use client";

import { StudyPlannerWidget } from "@/components/dashboard/study-planner-widget";

export function AssignmentsTab({ isHe }: { isHe: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      {/* Study planner — full width mode */}
      <StudyPlannerWidget isHe={isHe} />
    </div>
  );
}
