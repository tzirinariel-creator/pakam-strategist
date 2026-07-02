"use client";

import { useMemo } from "react";
import { useLocale } from "next-intl";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { usePlannerStore } from "@/stores/planner-store";
import { api } from "@/lib/trpc/react";
import {
  detectAllConflicts,
  formatConflict,
  type SessionInfo,
} from "@/lib/conflict-detector";
import { filterSessionsBySelectedGroups } from "@/components/onboarding/semester-planner/session-group-selector";
import type { CourseWithSchedule } from "@/lib/plan-generator";
import type { UserCourseWithCourse } from "@/types/degree";
import type { DayOfWeek } from "@/types/enums";

/**
 * The bidding overlap trap ("last request wins"), personalized to the student's
 * REAL plan. Runs the (previously orphaned) conflict-detector over the student's
 * own group-filtered sessions for the current semester and names each clash — so
 * the abstract warning in the explainer becomes "פילוסופיה חופף לכלכלה ביום ג׳
 * 10:00". Additive read-only card; never predicts points. Reuses the same
 * session assembly the live timetable uses (cached course.list, selectedGroups).
 */
export function BiddingOverlapAlert({ courses }: { courses: UserCourseWithCourse[] }) {
  const isHe = useLocale() === "he";
  const selectedYear = usePlannerStore((s) => s.selectedYear);

  const coursesQuery = api.course.list.useQuery(undefined, { staleTime: 5 * 60 * 1000 });
  const profileQuery = api.user.getProfile.useQuery();
  const allCourses = (coursesQuery.data ?? []) as CourseWithSchedule[];
  const courseById = useMemo(
    () => new Map(allCourses.map((c) => [c.id, c])),
    [allCourses],
  );

  const semester = profileQuery.data?.currentSemester === "SPRING" ? "SPRING" : "FALL";

  const { conflicts, distinctCourses, unscheduledCount } = useMemo(() => {
    const sessions: SessionInfo[] = [];
    let unscheduled = 0;
    for (const uc of courses) {
      if (uc.plannedYear !== selectedYear || uc.plannedSemester !== semester) continue;
      const c = courseById.get(uc.courseId);
      // A course with no session data can't be clash-checked — count it so the
      // green "safe to bid" verdict is honest about its coverage.
      if (!c?.scheduleSessions?.length) {
        if (c) unscheduled++;
        continue;
      }
      const sel = (uc as { selectedGroups?: unknown }).selectedGroups;
      const groups = sel && typeof sel === "object" ? (sel as Record<string, string>) : {};
      const filtered = filterSessionsBySelectedGroups(c.scheduleSessions, groups);
      for (const s of filtered) {
        sessions.push({
          id: `${c.id}-${s.dayOfWeek}-${s.startTime}-${s.groupCode ?? ""}`,
          courseCode: c.code,
          courseName: isHe ? c.nameHe : (c.nameEn ?? c.nameHe),
          dayOfWeek: s.dayOfWeek as DayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
          sessionType: s.sessionType,
        });
      }
    }
    return {
      conflicts: detectAllConflicts(sessions),
      distinctCourses: new Set(sessions.map((s) => s.courseCode)).size,
      unscheduledCount: unscheduled,
    };
  }, [courses, selectedYear, semester, courseById, isHe]);

  // Nothing meaningful to check with fewer than two scheduled courses.
  if (distinctCourses < 2) return null;

  if (conflicts.length === 0) {
    return (
      <div className="data-card flex items-center gap-2 p-3">
        <ShieldCheck className="size-4 shrink-0 text-emerald-500" />
        <p className="text-xs text-foreground/70">
          {isHe
            ? "אין חפיפות זמן בין הקורסים שלך בסמסטר הזה — בטוח להגיש למכרז."
            : "No time clashes between your courses this semester — safe to bid."}
          {unscheduledCount > 0 && (
            <span className="text-foreground/45">
              {" "}
              {isHe
                ? `(${unscheduledCount === 1 ? "לקורס אחד" : `ל-${unscheduledCount} קורסים`} אין עדיין שעות בידיעון — לא נבדקו.)`
                : ` (${unscheduledCount} course${unscheduledCount === 1 ? " has" : "s have"} no published times yet — not checked.)`}
            </span>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="data-card border-amber-400/30 bg-amber-400/[0.05] p-4">
      <div className="mb-2 flex items-center gap-2">
        <AlertTriangle className="size-4 shrink-0 text-amber-500" />
        <h3 className="text-sm font-bold text-foreground/85">
          {isHe
            ? `שים לב — ${conflicts.length === 1 ? "חפיפה אחת" : conflicts.length === 2 ? "שתי חפיפות" : `${conflicts.length} חפיפות`} בקורסים שלך`
            : `Heads up — ${conflicts.length} clash${conflicts.length > 1 ? "es" : ""} in your courses`}
        </h3>
      </div>
      <p className="mb-2.5 text-[11px] leading-snug text-foreground/60">
        {isHe
          ? 'במכרז, הגשת בקשה לשני קורסים חופפים מבטלת אוטומטית את הראשון ("הבקשה האחרונה מנצחת"). כדאי לתקן לפני שמגישים:'
          : 'In bidding, requesting two overlapping courses auto-cancels the first ("last request wins"). Worth fixing before you bid:'}
      </p>
      <ul className="space-y-1.5">
        {conflicts.map((c, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-foreground/75">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-500" />
            <span className="leading-snug">{formatConflict(c, isHe ? "he" : "en")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
