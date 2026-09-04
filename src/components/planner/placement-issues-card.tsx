"use client";

// -----------------------------------------------------------------------
// "הקורס הזה מתוכנן לסמסטר שהוא לא ניתן בו"
// -----------------------------------------------------------------------
// On 21.8 I corrected 18 courses whose stored semester was wrong, from the
// ידיעון — מיקרו א׳ and מיקרו ב׳ had been the one way round a two-part
// sequence cannot run. That fixed the catalog and did nothing for the plans
// students had already built against the old data. 26 rows across real
// accounts were left sitting in a term their course is not offered in, most of
// them מיקרו כלכלה א׳ parked in spring by people who would have shown up to a
// course that was not running.
//
// A data fix that leaves people holding the old answer is half a fix, and the
// half that is missing is the one they can see.
//
// It proposes and never moves. Where a course sits is the student's decision —
// they may be planning around something we do not know — so the card states
// the conflict, offers the move, and leaves the plan untouched until they
// press it.

import { useMemo } from "react";
import { studyYearLabel } from "@/lib/study-year-label";
import { useLocale } from "next-intl";
import { CalendarX2, ArrowLeftRight } from "lucide-react";
import { heNoun } from "@/lib/he-count";
import { Bidi } from "@/lib/bidi";
import { planPlacementIssues, suggestedSemester, type PlacementCourse } from "@/lib/plan-placement";

const termHe = (t: string) => (t === "FALL" ? "סמסטר א׳" : "סמסטר ב׳");
const termEn = (t: string) => (t === "FALL" ? "Semester A" : "Semester B");

export function PlacementIssuesCard({
  courses,
  onMove,
  busy = false,
}: {
  courses: PlacementCourse[];
  /** Move one row to the semester the catalog says it is given in. */
  onMove: (userCourseId: string, semester: "FALL" | "SPRING") => void;
  busy?: boolean;
}) {
  const isHe = useLocale() === "he";
  const issues = useMemo(() => planPlacementIssues(courses), [courses]);

  if (issues.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-500/35 bg-amber-500/[0.07] p-4">
      <div className="flex items-start gap-2.5">
        <CalendarX2 className="mt-0.5 size-4 shrink-0 text-status-amber" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-foreground/90">
            {isHe ? (
              <>
                {heNoun(issues.length, "קורס מתוכנן", "קורסים מתוכננים")} לסמסטר שהם לא ניתנים בו
              </>
            ) : (
              <>
                {issues.length} course{issues.length === 1 ? "" : "s"} planned in a term they are not
                given in
              </>
            )}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-foreground/65">
            {isHe
              ? "עדכנו את לוח הקורסים מול הידיעון, וכמה קורסים בתכנית שלכם נשארו בסמסטר הישן. התכנית שלכם לא שונתה — אתם מחליטים."
              : "We refreshed the course timetable against the ידיעון, and a few courses in your plan stayed in the old term. Your plan was not changed — it's your call."}
          </p>

          <ul className="mt-2.5 flex flex-col gap-1.5">
            {issues.map((it) => {
              const target = suggestedSemester(it);
              return (
                <li
                  key={it.userCourseId}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-foreground/10 bg-card/70 px-3 py-2"
                >
                  <span className="min-w-0 flex-1 basis-48 text-xs">
                    <span className="font-semibold text-foreground/85">{it.nameHe}</span>
                    {it.isMandatory && (
                      <span className="ms-1.5 rounded bg-foreground/[0.07] px-1.5 py-px text-[10px] text-foreground/70">
                        {isHe ? "חובה" : "required"}
                      </span>
                    )}
                    <span className="mt-0.5 block text-foreground/60">
                      {it.kind === "wrong-semester"
                        ? isHe
                          ? `אצלכם ב${termHe(it.plannedSemester)} · ניתן ב${it.offeredSemesters.map(termHe).join(" / ")}`
                          : `You have it in ${termEn(it.plannedSemester)} · given in ${it.offeredSemesters.map(termEn).join(" / ")}`
                        : isHe
                          ? `אצלכם ב${studyYearLabel(it.plannedYear, true)} · ניתן ב${it.offeredYears.map((y) => studyYearLabel(y, true)).join(" / ")}`
                          : `You have it in ${studyYearLabel(it.plannedYear, false)} · given in ${it.offeredYears.map((y) => studyYearLabel(y, false)).join(" / ")}`}
                    </span>
                  </span>

                  {target && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onMove(it.userCourseId, target)}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-500/40 bg-background px-2.5 py-1.5 text-[11px] font-semibold text-status-amber transition-colors hover:bg-amber-500/10 disabled:opacity-50"
                    >
                      <ArrowLeftRight className="size-3" />
                      {isHe ? `העבירו ל${termHe(target)}` : `Move to ${termEn(target)}`}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
