"use client";

import { heNoun } from "@/lib/he-count";
import { SEMESTER_CONFIG } from "@/lib/constants";
import { useMemo } from "react";
import { useLocale } from "next-intl";
import { AlertTriangle, ShieldCheck } from "lucide-react";
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
export function BiddingOverlapAlert({
  courses,
  targetYear,
  targetSemester,
}: {
  courses: UserCourseWithCourse[];
  /** #13 — the NEXT (bidding) semester, not the one on screen. */
  targetYear: number;
  targetSemester: "FALL" | "SPRING";
}) {
  const isHe = useLocale() === "he";
  const selectedYear = targetYear;

  const coursesQuery = api.course.list.useQuery(undefined, { staleTime: 5 * 60 * 1000 });
  // Reference-stable (`?? []` mints a new array every render while loading —
  // the onboarding wizard's hydration render-loop class of bug, fixed 10.7).
  const allCourses = useMemo(
    () => (coursesQuery.data ?? []) as CourseWithSchedule[],
    [coursesQuery.data],
  );
  const courseById = useMemo(
    () => new Map(allCourses.map((c) => [c.id, c])),
    [allCourses],
  );

  // #13 (12.7) — the alert describes the BIDDING semester (the next one),
  // which is what you actually submit requests for.
  const semester = targetSemester;

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

  // מסך הבידינג מרכיב את הרכיב הזה פעמיים — פעם לסמסטר א׳ ופעם לב׳ — ואף אחד
  // מהשניים לא אמר על איזה סמסטר הוא מדבר. התוצאה: או שני כרטיסים ירוקים
  // זהים בית־בית זה מעל זה, או אזהרת חפיפה שהסטודנט לא יודע לאיזה סמסטר
  // לשייך — בדיוק במסך שבו הוא מגיש את שניהם יחד.
  const termHe = SEMESTER_CONFIG[semester]?.nameHe ?? "";
  const termEn = SEMESTER_CONFIG[semester]?.nameEn ?? "";
  const termLabel = isHe ? termHe : termEn;

  // Nothing meaningful to check with fewer than two scheduled courses.
  if (distinctCourses < 2) return null;

  if (conflicts.length === 0) {
    return (
      <div className="data-card flex items-center gap-2 p-3">
        <ShieldCheck className="size-4 shrink-0 text-status-green" />
        <p className="text-xs text-foreground/70">
          {isHe
            ? `${termLabel}: אין חפיפות בין הקורסים שבחרתם — אפשר להגיש בראש שקט.`
            : `${termLabel}: no time clashes between your courses — safe to bid.`}
          {unscheduledCount > 0 && (
            <span className="text-foreground/60">
              {" "}
              {isHe
                ? `(${unscheduledCount === 1 ? "לקורס אחד" : `ל-${heNoun(unscheduledCount, "קורס", "קורסים")}`} אין עדיין שעות בידיעון — לא נבדקו.)`
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
        <AlertTriangle className="size-4 shrink-0 text-status-amber" />
        <h3 className="text-sm font-bold text-foreground/85">
          {isHe
            ? `${termLabel} — ${conflicts.length === 1 ? "חפיפה אחת" : conflicts.length === 2 ? "שתי חפיפות" : `${conflicts.length} חפיפות`} בקורסים שלכם`
            : `${termLabel} — ${conflicts.length} clash${conflicts.length > 1 ? "es" : ""} in your courses`}
        </h3>
      </div>
      <p className="mb-2.5 text-xs leading-snug text-foreground/60">
        {isHe
          ? 'אי-אפשר להירשם לשני קורסים שחופפים בשעות. באותו מקצה ישובץ זה עם הניקוד הגבוה והנקודות של השני יעברו הלאה; במקצה השני קורס חופף גם מבטל שיבוץ שכבר קיבלתם. כדאי לתקן לפני שמגישים:'
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
