"use client";

import { useTranslations } from "next-intl";
import { Bidi } from "@/lib/bidi";
import type { UserCourseWithCourse } from "@/types/degree";
import type { CourseStatus } from "@/types/enums";
import { GradeInput } from "./grade-input";

// -----------------------------------------------------------------------
// "In progress now" — the derived PRESENT state (#4/#22): the courses the
// student is sitting in class for RIGHT NOW (isCurrentlyStudying), surfaced at
// the top of the record with a one-tap "mark done + grade" per course. When the
// grade comes out they close the loop here, and the row moves into the
// COMPLETED groups below. Renders nothing when there are no live courses.
// -----------------------------------------------------------------------

export function InProgressSection({
  courses,
  locale,
  isHe,
  onSaveGrade,
  savedSignals,
  t,
}: {
  courses: UserCourseWithCourse[];
  locale: string;
  isHe: boolean;
  onSaveGrade: (id: string, grade: number | null, status: CourseStatus) => void;
  savedSignals: Record<string, number>;
  t: ReturnType<typeof useTranslations<"record">>;
}) {
  if (courses.length === 0) return null;

  return (
    <div className="data-card overflow-hidden">
      <div className="border-b border-border/30 px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
          <span className="font-bold text-foreground/90">
            {isHe ? "בלימוד עכשיו" : "In progress now"} (
            <Bidi text={courses.length} />)
          </span>
        </div>
        <p className="mt-1 text-xs leading-snug text-foreground/60">
          {isHe
            ? "אלה הקורסים של הסמסטר הנוכחי. כשמתפרסם ציון — מסמנים ✓ ליד הקורס ומזינים אותו."
            : "The courses you're taking right now. When grades come out — mark done + grade here."}
        </p>
      </div>
      <div className="divide-y divide-border/10">
        {courses.map((uc) => {
          const courseName = isHe
            ? uc.course.nameHe
            : (uc.course.nameEn ?? uc.course.nameHe);
          return (
            <div
              key={uc.id}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span
                  className="truncate font-medium text-foreground/85"
                  title={`${uc.course.code} — ${courseName}`}
                >
                  {courseName}
                </span>
                <span dir="ltr" className="font-mono text-[10px] text-foreground/60">
                  {uc.course.code}
                </span>
              </div>
              <GradeInput
                userCourseId={uc.id}
                initialGrade={uc.grade}
                initialStatus={uc.status}
                courseType={uc.course.courseType}
                onSave={onSaveGrade}
                placeholder={t("gradePlaceholder")}
                ariaLabel={`${t("gradeAria")} — ${courseName}`}
                savedSignal={savedSignals[uc.id] ?? 0}
                isHe={locale === "he"}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
