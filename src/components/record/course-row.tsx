"use client";

import { useTranslations } from "next-intl";
import { Star, Languages, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { DISCIPLINE_CONFIG } from "@/lib/constants";
import type { UserCourseWithCourse } from "@/types/degree";
import type { CourseStatus } from "@/types/enums";
import { GradeInput } from "./grade-input";
import { DisciplineBadge } from "./discipline-badge";
import { isEnglishCourse } from "./record-utils";

// -----------------------------------------------------------------------
// One completed-course row.
// -----------------------------------------------------------------------

export function CourseRow({
  uc,
  focusArea,
  locale,
  isHe,
  onSaveGrade,
  onRemove,
  savedSignal,
  t,
}: {
  uc: UserCourseWithCourse;
  focusArea: string | null;
  locale: string;
  isHe: boolean;
  onSaveGrade: (id: string, grade: number | null, status: CourseStatus) => void;
  onRemove: (id: string) => void;
  /** Per-course success counter, bumped on a confirmed save. */
  savedSignal: number;
  t: ReturnType<typeof useTranslations<"record">>;
}) {
  const { course } = uc;
  const discipline = uc.disciplineOverride ?? course.discipline;
  const isElective = !(course.courseType === "MANDATORY" || course.isMandatory);
  const countsForFocus =
    focusArea != null &&
    (discipline === focusArea || (course.canCountAs ?? []).includes(focusArea));
  const english = isEnglishCourse(course);
  const isBinary = uc.isBinary ?? false;
  const courseName = isHe ? course.nameHe : (course.nameEn ?? course.nameHe);

  return (
    <tr className="border-b border-border/10 transition-colors hover:bg-foreground/[0.02]">
      {/* Name + badges */}
      <td className="px-5 py-3">
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground/85" title={`${course.code} — ${courseName}`}>
            {courseName}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {/* <bdi> (not dir="ltr") so a custom code containing Hebrew (e.g.
                CUSTOM-דוגרי) isolates without garbling — a numeric catalog code
                still renders LTR correctly (#18, RTL iron rule). */}
            <bdi className="font-mono text-[10px] text-foreground/40">{course.code}</bdi>
            {isElective && (
              <span className="rounded-full bg-foreground/8 px-1.5 py-0.5 text-[11px] font-medium text-foreground/50">
                {t("electiveBadge")}
              </span>
            )}
            {countsForFocus && (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium",
                  (DISCIPLINE_CONFIG[discipline] ?? DISCIPLINE_CONFIG["GENERAL"])?.badgeClass
                )}
              >
                <Star className="h-2.5 w-2.5" />
                {t("focusBadge")}
              </span>
            )}
            {english && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[11px] font-medium text-blue-500">
                <Languages className="h-2.5 w-2.5" />
                {t("englishBadge")}
              </span>
            )}
            {/* Make the silent "not in average" automation visible (#30). */}
            {english && (
              <span className="inline-flex items-center rounded-full bg-foreground/5 px-1.5 py-0.5 text-[11px] text-foreground/45">
                {t("notInAvgEnglish")}
              </span>
            )}
            {isBinary && (
              <span className="inline-flex items-center rounded-full bg-foreground/5 px-1.5 py-0.5 text-[11px] text-foreground/45">
                {t("notInAvgBinary")}
              </span>
            )}
          </div>
        </div>
      </td>
      {/* Discipline */}
      <td className="hidden px-3 py-3 sm:table-cell">
        <DisciplineBadge discipline={discipline} locale={locale} />
      </td>
      {/* Credits */}
      <td className="px-3 py-3 text-center font-mono text-foreground/60">{course.credits}</td>
      {/* Grade */}
      <td className="px-3 py-3">
        <div className="flex justify-center">
          <GradeInput
            userCourseId={uc.id}
            initialGrade={uc.grade}
            initialStatus={uc.status}
            courseType={course.courseType}
            onSave={onSaveGrade}
            placeholder={t("gradePlaceholder")}
            ariaLabel={`${t("gradeAria")} — ${courseName}`}
            savedSignal={savedSignal}
            isHe={locale === "he"}
          />
        </div>
      </td>
      {/* Remove */}
      <td className="px-3 py-3 text-center">
        <button
          type="button"
          onClick={() => {
            if (window.confirm(t("removeConfirm"))) onRemove(uc.id);
          }}
          aria-label={`${t("remove")} — ${courseName}`}
          className="rounded-md p-1.5 text-foreground/30 transition-colors hover:bg-red-500/10 hover:text-red-400"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </td>
    </tr>
  );
}
