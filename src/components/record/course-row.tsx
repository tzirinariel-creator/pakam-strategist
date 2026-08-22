"use client";

import { isEnglishLevelCourseName } from "@/lib/english-standing";
import { useTranslations } from "next-intl";
import { Star, Languages, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { DISCIPLINE_CONFIG, ALL_DISCIPLINE_IDS } from "@/lib/constants";
import { isOffCatalogCourse, isStudentAddedCourse, isDeclaredApproved } from "@/lib/off-catalog";
import type { UserCourseWithCourse } from "@/types/degree";
import type { CourseStatus } from "@/types/enums";
import { GradeInput } from "./grade-input";
import { SubmissionGradeInput, type SubmissionKind } from "./submission-grade-input";
import { DisciplineBadge } from "./discipline-badge";
import { isEnglishCourse } from "@/lib/english-standing";

// -----------------------------------------------------------------------
// One completed-course row.
// -----------------------------------------------------------------------

export function CourseRow({
  uc,
  focusArea,
  locale,
  isHe,
  onSaveGrade,
  onDeclare,
  onRemove,
  onSaveSubmission,
  savedSignal,
  t,
}: {
  uc: UserCourseWithCourse;
  focusArea: string | null;
  locale: string;
  isHe: boolean;
  onSaveGrade: (id: string, grade: number | null, status: CourseStatus) => void;
  /** #8 — the student's declaration for a course outside our catalog:
   *  a discipline = "approved for our degree, counts toward this",
   *  null = no declaration. */
  onDeclare: (id: string, discipline: string | null) => void;
  onRemove: (id: string) => void;
  /** The seminar paper's own mark — the 18%+4% of the degree score. */
  onSaveSubmission: (id: string, grade: number | null, type: SubmissionKind) => void;
  /** Per-course success counter, bumped on a confirmed save. */
  savedSignal: number;
  t: ReturnType<typeof useTranslations<"record">>;
}) {
  const { course } = uc;
  const discipline = uc.disciplineOverride ?? course.discipline;
  // Outside OUR catalog — which says NOTHING about whether the degree approved
  // it (דוגרי is approved and was never in our list). The only honest thing we
  // can show is the student's own declaration (#8).
  const offCatalog = isOffCatalogCourse(course);
  // 21.8 — Ariel: "הוא שולח אותי לבחור ולשייך לתחומי מיקוד את קורסי הבחירה
  // ולא נותן לי לערוך אותם במסך".
  //
  // Exactly right, and the two halves had drifted apart: the dashboard prompt
  // asks about EVERY course whose discipline is GENERAL, but this selector only
  // appeared for courses OUTSIDE our catalog. משבר האקלים and צעדים ראשונים are
  // both in the catalog and both tagged GENERAL — so he was told to assign three
  // courses and given the control for one of them.
  //
  // A course needs the selector whenever it counts toward no focus area, and
  // English never does (it is a university requirement, not a field) — so it is
  // excluded here for the same reason it was excluded from the prompt.
  const unassignedDiscipline = !discipline || discipline === "GENERAL";
  // Reuse the app's one English predicate rather than writing a second — that
  // duplication is exactly what produced four disagreeing variants before.
  // The level-name check is added because TAU titles these without "אנגלית".
  const englishCourse =
    isEnglishCourse(course) || isEnglishLevelCourseName(course.nameHe, course.code);
  const studentAdded = isStudentAddedCourse(course);
  const declared = isDeclaredApproved(uc);
  const isElective = !(course.courseType === "MANDATORY" || course.isMandatory);
  // Ariel, 21.8: "בוא תמיד ניתן אפשרות לשנות שיוך של קורס בחירה - כי יש כאלו
  // שיש להם כמה אופציות".
  //
  // The picker used to appear only for a course with NO field, on the reasoning
  // that an assigned course has its answer already. But the catalog's answer is
  // one of several for a genuine cross-listed elective — "משבר האקלים וקיימות:
  // מבט רב-תחומי" is the obvious case — and which one it counts toward is the
  // student's declaration to make, not ours. A MANDATORY course keeps its
  // field: that one really is fixed, and offering to change it would invite a
  // choice that does not exist.
  const canAssignDiscipline =
    (offCatalog || unassignedDiscipline || isElective) && !englishCourse;
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
            {/* #8 — never "מחוץ לרשימה". Either the student declared it, and we
                say whose declaration it is, or they haven't, and we say only
                the one thing we actually know: it isn't in OUR catalog. */}
            {offCatalog && (
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-medium",
                  declared
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "bg-foreground/8 text-foreground/50",
                )}
                title={
                  declared
                    ? t("declaredApprovedHint")
                    : studentAdded
                      ? t("notInCatalogHint")
                      : t("notInYedionHint")
                }
              >
                {declared
                  ? t("declaredApprovedBadge")
                  : studentAdded
                    ? t("notInCatalogBadge")
                    : t("notInYedionBadge")}
              </span>
            )}
          </div>

          {/* A seminar's mark lives in submissionGrade, not in the exam-grade
              column — and until now nothing in the app could write it, so the
              degree score was null for everyone. Shown in the always-visible
              name cell for the same reason the declaration is. */}
          {course.courseType === "SEMINAR" && (
            <SubmissionGradeInput
              userCourseId={uc.id}
              initialGrade={uc.submissionGrade ?? null}
              initialType={
                uc.submissionType === "PAPER" || uc.submissionType === "REFERAT"
                  ? uc.submissionType
                  : null
              }
              onSave={onSaveSubmission}
              savedSignal={savedSignal}
              isHe={isHe}
              courseName={courseName}
            />
          )}

          {/* The declaration itself — one control that says both "this counts
              toward our degree" and "it counts as this". Sits in the always-
              visible name cell, because the discipline column is hidden on
              mobile and a declaration you can't reach is no declaration. */}
          {canAssignDiscipline && (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <label
                htmlFor={`declare-${uc.id}`}
                className="text-[11px] text-foreground/45"
              >
                {t("declareLabel")}
              </label>
              <select
                id={`declare-${uc.id}`}
                value={uc.disciplineOverride ?? ""}
                onChange={(e) => onDeclare(uc.id, e.target.value || null)}
                title={t("declareHint")}
                className="rounded-md border border-border bg-card px-1.5 py-0.5 text-[11px] text-foreground/70 focus:border-foreground/30 focus:outline-none"
              >
                <option value="">{t("declareNone")}</option>
                {ALL_DISCIPLINE_IDS.map((id) => {
                  const cfg = DISCIPLINE_CONFIG[id];
                  if (!cfg) return null;
                  return (
                    <option key={id} value={id}>
                      {t("declareOption", {
                        discipline: isHe ? cfg.nameHe : cfg.nameEn,
                      })}
                    </option>
                  );
                })}
              </select>
            </div>
          )}
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
