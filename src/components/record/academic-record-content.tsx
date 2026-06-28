"use client";

import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  Search,
  Plus,
  Check,
  FolderOpen,
  Sparkles,
  Languages,
  Trash2,
  Calculator,
  GraduationCap,
} from "lucide-react";
import { api } from "@/lib/trpc/react";
import { ThemedLoader } from "@/components/ui/themed-loader";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  DISCIPLINE_CONFIG,
  SEMESTER_CONFIG,
  YEAR_CONFIG,
  CREDIT_REQUIREMENTS,
} from "@/lib/constants";
import type { UserCourseWithCourse } from "@/types/degree";
import type { CourseStatus, Semester } from "@/types/enums";
import type { CourseWithSchedule } from "@/lib/plan-generator";
import { getPastSemesters } from "@/components/onboarding/step-history";

// ─────────────────────────────────────────────────────────────────────────
// My Academic Record — a single always-available place to SEE / ADD / EDIT /
// REMOVE every COMPLETED course, grouped by year·semester, with a running
// summary (completed credits, weighted average, focus-area progress).
//
// Complements the Grade Calculator (graduation/) — that screen owns the
// weighted graduation-score formula + reverse calculator over the WHOLE plan;
// this screen owns management of the PAST (COMPLETED) record only. The two
// cross-link so there's no dead-end.
// ─────────────────────────────────────────────────────────────────────────

const SEM_ORDER: Record<Semester, number> = { FALL: 0, SPRING: 1, SUMMER: 2 };

/** Is a catalog course taught in English? Mirrors step-history's heuristic. */
function isEnglishCourse(course: { courseType: string; nameHe?: string | null; nameEn?: string | null }): boolean {
  if (course.courseType === "ENGLISH") return true;
  const hay = `${course.nameHe ?? ""} ${course.nameEn ?? ""}`.toLowerCase();
  return hay.includes("אנגלית") || /\benglish\b/.test(hay);
}

// -----------------------------------------------------------------------
// Discipline badge (matches the grade-calculator screen)
// -----------------------------------------------------------------------

function DisciplineBadge({ discipline, locale }: { discipline: string; locale: string }) {
  const cfg = DISCIPLINE_CONFIG[discipline] ?? DISCIPLINE_CONFIG["GENERAL"];
  if (!cfg) return <span className="text-xs">{discipline}</span>;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        cfg.badgeClass
      )}
    >
      {locale === "he" ? cfg.nameHe : cfg.nameEn}
    </span>
  );
}

// -----------------------------------------------------------------------
// Inline grade input — debounced, clears to "no grade" on blur when empty.
// -----------------------------------------------------------------------

function GradeInput({
  userCourseId,
  initialGrade,
  initialStatus,
  onSave,
  placeholder,
  ariaLabel,
  savedSignal,
}: {
  userCourseId: string;
  initialGrade: number | null;
  initialStatus: CourseStatus;
  onSave: (id: string, grade: number | null, status: CourseStatus) => void;
  placeholder: string;
  ariaLabel: string;
  /** Bumped by the parent when THIS course's save mutation succeeds. */
  savedSignal: number;
}) {
  const [value, setValue] = useState<string>(
    initialGrade !== null ? String(initialGrade) : ""
  );
  const [saved, setSaved] = useState(false);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === "") {
      setValue("");
      return;
    }
    const num = parseInt(raw, 10);
    if (isNaN(num) || num < 0 || num > 100) return;
    setValue(String(num));
  }, []);

  // Save immediately on blur — blur already means the user finished editing,
  // so there's no debounce timer that could be lost on unmount (e.g. navigating
  // away or collapsing a section). The save fires synchronously here.
  const handleBlur = useCallback(() => {
    const num = parseInt(value, 10);
    if (value === "" || isNaN(num)) {
      // Cleared — drop the grade but keep the course COMPLETED in the record.
      if (initialGrade !== null) {
        onSave(userCourseId, null, initialStatus);
      }
      return;
    }
    const grade = Math.max(0, Math.min(100, num));
    onSave(userCourseId, grade, "COMPLETED");
  }, [value, userCourseId, initialStatus, initialGrade, onSave]);

  // Show the "saved" checkmark only when the parent confirms the mutation
  // actually succeeded (savedSignal bump), never on the fire-and-forget call.
  useEffect(() => {
    if (savedSignal === 0) return;
    setSaved(true);
    const id = setTimeout(() => setSaved(false), 1500);
    return () => clearTimeout(id);
  }, [savedSignal]);

  return (
    <div className="relative">
      <input
        type="number"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        aria-label={ariaLabel}
        dir="ltr"
        className={cn(
          "w-20 rounded-md border border-border/50 bg-background/50 px-2 py-1.5",
          "font-mono text-sm text-foreground text-center",
          "placeholder:text-foreground/20",
          "focus:border-foreground/35 focus:outline-none focus:ring-1 focus:ring-foreground/20",
          "transition-all",
          saved && "border-emerald-400/50 ring-1 ring-emerald-400/30"
        )}
      />
      {saved && (
        <Check className="absolute -end-5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-emerald-400 animate-in fade-in" />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------
// Summary card — completed credits, weighted average, focus-area progress.
// -----------------------------------------------------------------------

function SummaryCard({
  completedCredits,
  weightedAvg,
  focusCredits,
  focusTarget,
  hasFocus,
  t,
}: {
  completedCredits: number;
  weightedAvg: number | null;
  focusCredits: number;
  focusTarget: number;
  hasFocus: boolean;
  t: ReturnType<typeof useTranslations<"record">>;
}) {
  const totalTarget = CREDIT_REQUIREMENTS.TOTAL;
  const totalPct = Math.min((completedCredits / totalTarget) * 100, 100);
  const focusPct = focusTarget > 0 ? Math.min((focusCredits / focusTarget) * 100, 100) : 0;

  return (
    <div className="data-card grid gap-6 p-6 sm:grid-cols-3">
      {/* Completed credits + progress to 150 */}
      <div className="space-y-2">
        <span className="text-xs text-foreground/50">{t("summaryCompletedCredits")}</span>
        <div className="flex items-baseline gap-1">
          <span className="font-display tabular text-3xl font-bold text-foreground/85">
            {completedCredits}
          </span>
          <span className="text-sm text-foreground/40">/ {totalTarget}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
          <div
            className="h-full rounded-full bg-emerald-500/70 transition-all duration-500"
            style={{ width: `${totalPct}%` }}
          />
        </div>
        <span className="text-[11px] text-foreground/40">
          {t("summaryTotalProgress", { target: totalTarget })}
        </span>
      </div>

      {/* Weighted average — explicitly NOT the official graduation score, which
          uses 78/18/4 weighting. Labeled + linked so grade-anxious students
          don't mistake this credit-weighted mean for their final score. */}
      <div className="space-y-2 sm:border-s sm:border-border/40 sm:ps-6">
        <span className="block text-xs leading-snug text-foreground/50">
          {t("summaryWeightedAvg")}
        </span>
        <div className="font-display tabular text-3xl font-bold text-foreground/85">
          {weightedAvg !== null ? weightedAvg.toFixed(1) : "--"}
        </div>
        <Link
          href="/graduation"
          className="inline-flex items-center gap-1 text-[11px] leading-snug text-foreground/45 underline-offset-2 transition-colors hover:text-foreground/70 hover:underline"
        >
          <Calculator className="h-3 w-3 shrink-0" />
          {t("summaryWeightedAvgHint")}
        </Link>
      </div>

      {/* Focus-area progress */}
      <div className="space-y-2 sm:border-s sm:border-border/40 sm:ps-6">
        <span className="text-xs text-foreground/50">{t("summaryFocusCredits")}</span>
        {hasFocus ? (
          <>
            <div className="flex items-baseline gap-1">
              <span className="font-display tabular text-3xl font-bold text-foreground/85">
                {focusCredits}
              </span>
              <span className="text-sm text-foreground/40">/ {focusTarget}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
              <div
                className="h-full rounded-full bg-accent-brand transition-all duration-500"
                style={{ width: `${focusPct}%` }}
              />
            </div>
            <span className="text-[11px] text-foreground/40">
              {t("summaryFocusProgress", { target: focusTarget })}
            </span>
          </>
        ) : (
          <p className="pt-1 text-sm text-foreground/40">{t("summaryNoFocus")}</p>
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------
// One completed-course row.
// -----------------------------------------------------------------------

function CourseRow({
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
            <span className="font-mono text-[10px] text-foreground/40">{course.code}</span>
            {isElective && (
              <span className="rounded-full bg-foreground/8 px-1.5 py-0.5 text-[9px] font-medium text-foreground/50">
                {t("electiveBadge")}
              </span>
            )}
            {countsForFocus && (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-medium",
                  (DISCIPLINE_CONFIG[discipline] ?? DISCIPLINE_CONFIG["GENERAL"])?.badgeClass
                )}
              >
                <Sparkles className="h-2.5 w-2.5" />
                {t("focusBadge")}
              </span>
            )}
            {english && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-medium text-blue-500">
                <Languages className="h-2.5 w-2.5" />
                {t("englishBadge")}
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
            onSave={onSaveGrade}
            placeholder={t("gradePlaceholder")}
            ariaLabel={`${t("gradeAria")} — ${courseName}`}
            savedSignal={savedSignal}
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

// -----------------------------------------------------------------------
// Add-a-past-course search (reuses step-history's catalog search idea).
// -----------------------------------------------------------------------

function AddCourse({
  catalog,
  existingCourseIds,
  focusArea,
  pastSemesters,
  isHe,
  onAdd,
  isSaving,
  t,
}: {
  catalog: CourseWithSchedule[];
  existingCourseIds: Set<string>;
  focusArea: string | null;
  /** Valid past placements, oldest→newest. Last entry = most recent past. */
  pastSemesters: { year: number; semester: "FALL" | "SPRING" }[];
  isHe: boolean;
  onAdd: (
    course: CourseWithSchedule,
    placement: { year: number; semester: Semester }
  ) => void;
  isSaving: boolean;
  t: ReturnType<typeof useTranslations<"record">>;
}) {
  const [search, setSearch] = useState("");

  // Distinct past years + semesters offered, for the two selectors.
  const years = useMemo(
    () => Array.from(new Set(pastSemesters.map((s) => s.year))).sort((a, b) => a - b),
    [pastSemesters]
  );

  // Default placement = the MOST RECENT past semester (one step before current),
  // never the current one — this screen records the past.
  const mostRecentPast =
    pastSemesters.length > 0 ? pastSemesters[pastSemesters.length - 1]! : null;
  const [chosenYear, setChosenYear] = useState<number>(
    mostRecentPast?.year ?? years[0] ?? 1
  );
  const [chosenSemester, setChosenSemester] = useState<"FALL" | "SPRING">(
    mostRecentPast?.semester ?? "FALL"
  );

  // Semesters available for the chosen year (FALL/SPRING that are actually past).
  const semestersForYear = useMemo(
    () =>
      pastSemesters
        .filter((s) => s.year === chosenYear)
        .map((s) => s.semester),
    [pastSemesters, chosenYear]
  );

  // Keep the semester selection valid when the year changes.
  const effectiveSemester: "FALL" | "SPRING" = semestersForYear.includes(
    chosenSemester
  )
    ? chosenSemester
    : (semestersForYear[0] ?? "FALL");

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    return catalog
      .filter((c) => !existingCourseIds.has(c.id))
      .filter((c) => {
        const hay = `${c.code} ${c.nameHe ?? ""} ${c.nameEn ?? ""}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 8);
  }, [search, catalog, existingCourseIds]);

  const yearLabel = isHe
    ? YEAR_CONFIG[chosenYear as 1 | 2 | 3]?.nameHe
    : YEAR_CONFIG[chosenYear as 1 | 2 | 3]?.nameEn;
  const semLabel = isHe
    ? SEMESTER_CONFIG[effectiveSemester]?.nameHe
    : SEMESTER_CONFIG[effectiveSemester]?.nameEn;
  const targetLabel = `${yearLabel} · ${semLabel}`;

  const selectClass =
    "rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-foreground/30 focus:outline-none";

  // No genuinely-past semester exists (e.g. a brand-new year-1·FALL student):
  // there is no valid PAST placement, so adding a course here would silently
  // mark it COMPLETED in the current, unfinished semester with no placement
  // choice — polluting completed credits, the weighted average, and the
  // year-1 transition gate. Refuse: show an honest empty state pointing at
  // onboarding/the planner instead of the catalog add-search.
  if (pastSemesters.length === 0) {
    return (
      <div className="data-card p-8 text-center">
        <div className="mb-5 flex justify-center">
          <FolderOpen className="h-12 w-12 text-foreground/40" />
        </div>
        <h2 className="mb-2 font-display text-lg font-bold text-foreground/90">
          {t("addTitle")}
        </h2>
        <p className="mb-6 text-sm text-foreground/55">{t("emptyDescNoCourses")}</p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-full border border-accent-brand/30 bg-accent-brand/15 px-6 py-2.5 text-sm font-bold text-foreground/90 transition-colors hover:bg-accent-brand/25"
        >
          <GraduationCap className="h-4 w-4" />
          {t("backToOnboarding")}
        </Link>
      </div>
    );
  }

  return (
    <div className="data-card p-6">
      <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-bold text-foreground/90">
        <Plus className="h-5 w-5 text-accent-brand" />
        {t("addTitle")}
      </h2>
      <p className="mb-4 text-sm text-foreground/50">{t("addDesc")}</p>

      {/* Placement picker — when did you take it? Defaults to the most recent
          PAST semester so an added course lands in the correct year·semester
          bucket (and the year-1 transition-gate average stays correct). */}
      {pastSemesters.length > 0 && (
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <span className="w-full text-xs font-medium text-foreground/60">
            {t("placementLabel")}
          </span>
          <div className="flex flex-col gap-1">
            <label htmlFor="record-add-year" className="text-[11px] text-foreground/45">
              {t("placementYear")}
            </label>
            <select
              id="record-add-year"
              value={chosenYear}
              onChange={(e) => setChosenYear(parseInt(e.target.value, 10))}
              className={selectClass}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {isHe
                    ? YEAR_CONFIG[y as 1 | 2 | 3]?.nameHe
                    : YEAR_CONFIG[y as 1 | 2 | 3]?.nameEn}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="record-add-semester" className="text-[11px] text-foreground/45">
              {t("placementSemester")}
            </label>
            <select
              id="record-add-semester"
              value={effectiveSemester}
              onChange={(e) =>
                setChosenSemester(e.target.value as "FALL" | "SPRING")
              }
              className={selectClass}
            >
              {semestersForYear.map((s) => (
                <option key={s} value={s}>
                  {isHe ? SEMESTER_CONFIG[s]?.nameHe : SEMESTER_CONFIG[s]?.nameEn}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-foreground/30" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          className="w-full rounded-lg border border-border bg-card py-2.5 ps-9 pe-3 text-sm text-foreground placeholder:text-foreground/30 focus:border-foreground/30 focus:outline-none"
        />
      </div>

      {results.length > 0 && (
        <div className="mt-2 max-h-72 space-y-1 overflow-y-auto rounded-lg border border-border bg-card p-1">
          {results.map((course) => {
            const config = DISCIPLINE_CONFIG[course.discipline];
            const countsForFocus =
              focusArea != null &&
              (course.discipline === focusArea ||
                (course.canCountAs ?? []).includes(focusArea));
            const english = isEnglishCourse(course);
            return (
              <button
                key={course.id}
                type="button"
                disabled={isSaving}
                onClick={() => {
                  onAdd(course, { year: chosenYear, semester: effectiveSemester });
                  setSearch("");
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-start transition-colors hover:bg-foreground/5 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                <span className="min-w-0 flex-1 truncate text-sm text-foreground/80">
                  {isHe ? course.nameHe : (course.nameEn ?? course.nameHe)}
                </span>
                {countsForFocus && config && (
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium",
                      config.badgeClass
                    )}
                  >
                    {t("focusBadge")}
                  </span>
                )}
                {english && (
                  <span className="shrink-0 rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-medium text-blue-500">
                    {t("englishBadge")}
                  </span>
                )}
                <span className="shrink-0 font-mono text-[10px] text-foreground/40">
                  {course.credits} {t("credits")}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {search.trim().length >= 2 && results.length === 0 && (
        <p className="mt-2 text-sm text-foreground/35">{t("noResults")}</p>
      )}
      {search.trim().length >= 2 && results.length > 0 && (
        <p className="mt-2 text-[11px] text-foreground/35">{t("addToSemester", { label: targetLabel })}</p>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------
// Empty state — honest CTA. The primary action points at THIS screen's
// add-course form (an empty record with planned courses still lives on /record,
// so promising "onboarding" would be a dead end). The dashboard/onboarding link
// only appears when the student has zero courses ANYWHERE — the one case where
// building a fresh plan there is genuinely the right next step.
// -----------------------------------------------------------------------

function EmptyState({
  hasAnyCourses,
  onAddFirstCourse,
  t,
}: {
  hasAnyCourses: boolean;
  onAddFirstCourse: () => void;
  t: ReturnType<typeof useTranslations<"record">>;
}) {
  return (
    <div className="data-card mx-auto w-full max-w-lg p-8 text-center">
      <div className="mb-5 flex justify-center">
        <FolderOpen className="h-14 w-14 text-foreground/70" />
      </div>
      <h2 className="mb-2 font-display text-2xl font-bold text-foreground/85">
        {t("emptyTitle")}
      </h2>
      <p className="mb-6 text-foreground/60">
        {hasAnyCourses ? t("emptyDesc") : t("emptyDescNoCourses")}
      </p>
      <div className="flex flex-col items-center gap-3">
        {/* Primary, honest CTA — jumps to the add-course form on this screen. */}
        <button
          type="button"
          onClick={onAddFirstCourse}
          className="inline-flex items-center gap-2 rounded-full border border-accent-brand/30 bg-accent-brand/15 px-6 py-2.5 text-sm font-bold text-foreground/90 transition-colors hover:bg-accent-brand/25"
        >
          <Plus className="h-4 w-4" />
          {t("emptyAddFirstCourse")}
        </button>
        {/* Onboarding link only when the student has no courses at all. */}
        {!hasAnyCourses && (
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-sm font-medium text-foreground/55 underline-offset-4 transition-colors hover:text-foreground/80 hover:underline"
          >
            <GraduationCap className="h-4 w-4" />
            {t("backToOnboarding")}
          </Link>
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------
// Main content
// -----------------------------------------------------------------------

interface SemesterGroup {
  year: number;
  semester: Semester;
  key: string;
  courses: UserCourseWithCourse[];
}

export function AcademicRecordContent() {
  const t = useTranslations("record");
  const locale = useLocale();
  const isHe = locale === "he";

  // Lets the empty-state CTA jump to (and focus) the add-course form below.
  const addCourseRef = useRef<HTMLDivElement>(null);
  const scrollToAddCourse = useCallback(() => {
    const el = addCourseRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.querySelector<HTMLInputElement>('input[type="text"]')?.focus({
      preventScroll: true,
    });
  }, []);

  const utils = api.useUtils();
  // refetchOnMount: "always" so navigating to this screen always pulls a fresh
  // snapshot — a grade written on /graduation is never masked by a stale
  // per-page QueryClient cache (global staleTime is 30s).
  const planQuery = api.plan.getUserPlan.useQuery(undefined, {
    retry: false,
    refetchOnMount: "always",
  });
  const profileQuery = api.user.getProfile.useQuery(undefined, { retry: false });
  // Gate the credits query behind a successful plan load. getCredits throws
  // NOT_FOUND when no User row exists yet (e.g. visiting /record before
  // onboarding), so running it unconditionally spams query errors. The plan
  // query is the screen's user-existence check; once it resolves we know the
  // user exists and getCredits is safe. Focus-area progress just shows 0/empty
  // until then — a graceful degrade, not an error.
  const creditsQuery = api.plan.getCredits.useQuery(undefined, {
    retry: false,
    enabled: planQuery.isSuccess,
  });
  const catalogQuery = api.course.list.useQuery(undefined, {
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const invalidateAll = useCallback(() => {
    void utils.plan.getUserPlan.invalidate();
    void utils.plan.getCredits.invalidate();
    void utils.plan.getGraduationScore.invalidate();
  }, [utils]);

  // Per-course "saved" counters — bumped only on a confirmed mutation success,
  // so the GradeInput checkmark reflects a real save (never a fire-and-forget
  // call that later failed).
  const [savedSignals, setSavedSignals] = useState<Record<string, number>>({});

  const updateCourseMutation = api.plan.updateCourse.useMutation({
    onSuccess: (_data, variables) => {
      invalidateAll();
      setSavedSignals((prev) => ({
        ...prev,
        [variables.userCourseId]: (prev[variables.userCourseId] ?? 0) + 1,
      }));
    },
    onError: () => toast.error(t("saveError")),
  });
  const removeCourseMutation = api.plan.removeCourse.useMutation({
    onSuccess: () => {
      invalidateAll();
      toast.success(t("removed"));
    },
    onError: () => toast.error(t("saveError")),
  });
  const addCompletedMutation = api.plan.saveCompletedCourses.useMutation({
    onSuccess: () => {
      invalidateAll();
      toast.success(t("added"));
    },
    onError: () => toast.error(t("saveError")),
  });

  const handleSaveGrade = useCallback(
    (userCourseId: string, grade: number | null, status: CourseStatus) => {
      updateCourseMutation.mutate({ userCourseId, grade, status });
    },
    [updateCourseMutation]
  );

  const handleRemove = useCallback(
    (userCourseId: string) => {
      removeCourseMutation.mutate({ userCourseId });
    },
    [removeCourseMutation]
  );

  const profile = profileQuery.data;
  const focusArea = profile?.focusArea ?? null;

  // Valid PAST placements for an added course — every (year, semester) strictly
  // before the student's current one. The picker defaults to the most recent of
  // these (one step before current), so courses land in the right year·semester
  // bucket and the year-1 transition-gate average stays correct. The onboarding
  // flow only ever uses FALL/SPRING, so SUMMER current → treat as FALL boundary.
  const pastSemesters = useMemo(() => {
    const year = profile?.currentYear ?? 1;
    const semester: "FALL" | "SPRING" =
      profile?.currentSemester === "SPRING" ? "SPRING" : "FALL";
    return getPastSemesters(year, semester);
  }, [profile?.currentYear, profile?.currentSemester]);

  const handleAdd = useCallback(
    (course: CourseWithSchedule, placement: { year: number; semester: Semester }) => {
      addCompletedMutation.mutate({
        courses: [
          {
            courseCode: course.code,
            plannedYear: placement.year,
            plannedSemester: placement.semester,
            grade: null,
          },
        ],
      });
    },
    [addCompletedMutation]
  );

  // Only COMPLETED courses belong in the academic record.
  const completedCourses = useMemo(
    () =>
      (planQuery.data?.courses ?? []).filter((uc) => uc.status === "COMPLETED"),
    [planQuery.data?.courses]
  );

  // Course ids already present anywhere in the plan — so add-search never
  // offers a course the student already has (matches addCourse idempotency).
  const existingCourseIds = useMemo(
    () => new Set((planQuery.data?.courses ?? []).map((uc) => uc.courseId)),
    [planQuery.data?.courses]
  );

  const semesterGroups = useMemo((): SemesterGroup[] => {
    const grouped: Record<string, UserCourseWithCourse[]> = {};
    for (const uc of completedCourses) {
      const key = `${uc.plannedYear}-${uc.plannedSemester}`;
      (grouped[key] ??= []).push(uc);
    }
    return Object.entries(grouped)
      .map(([key, courses]) => {
        const parts = key.split("-");
        const year = parseInt(parts[0] ?? "1", 10);
        const semester = (parts[1] ?? "FALL") as Semester;
        return { year, semester, key, courses };
      })
      .sort((a, b) =>
        a.year !== b.year
          ? a.year - b.year
          : SEM_ORDER[a.semester] - SEM_ORDER[b.semester]
      );
  }, [completedCourses]);

  // Running summary.
  const completedCredits = useMemo(
    () => completedCourses.reduce((sum, c) => sum + c.course.credits, 0),
    [completedCourses]
  );
  const weightedAvg = useMemo(() => {
    const graded = completedCourses.filter((c) => c.grade !== null);
    const totalCredits = graded.reduce((s, c) => s + c.course.credits, 0);
    if (totalCredits === 0) return null;
    const weightedSum = graded.reduce((s, c) => s + (c.grade ?? 0) * c.course.credits, 0);
    return weightedSum / totalCredits;
  }, [completedCourses]);

  const focusCredits = creditsQuery.data?.breakdown.focusArea ?? 0;
  const focusTarget =
    creditsQuery.data?.breakdown.focusAreaTarget ?? CREDIT_REQUIREMENTS.FOCUS_AREA_MIN;

  // Note: creditsQuery is intentionally excluded — it's gated behind the plan
  // query (enabled: planQuery.isSuccess), so a disabled query reads as
  // isLoading and would otherwise pin the loader forever. Focus-area progress
  // degrades to 0/empty until credits arrive.
  const isLoading = planQuery.isLoading || profileQuery.isLoading;

  if (isLoading) {
    return <ThemedLoader />;
  }

  const catalog = (catalogQuery.data ?? []) as CourseWithSchedule[];
  const isEmpty = completedCourses.length === 0;
  // Does the student have ANY course (planned, in-progress, etc.) — not just
  // completed ones? Drives whether the empty state offers an onboarding link.
  const hasAnyCourses = (planQuery.data?.courses ?? []).length > 0;

  return (
    <div className="bg-mesh space-y-8 p-4 md:p-6">
      {/* Header */}
      <div className="animate-stagger-1 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground/85">
            {t("title")}
          </h1>
          <p className="mt-1 text-foreground/50">{t("subtitle")}</p>
        </div>
        {/* Cross-link to the Grade Calculator */}
        <Link
          href="/graduation"
          className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border bg-card/60 px-4 py-2 text-sm font-medium text-foreground/70 transition-colors hover:border-foreground/30 hover:text-foreground/90"
        >
          <Calculator className="h-4 w-4" />
          {t("crossLinkGrades")}
        </Link>
      </div>

      {!isEmpty && (
        <div className="animate-stagger-2">
          <SummaryCard
            completedCredits={completedCredits}
            weightedAvg={weightedAvg}
            focusCredits={focusCredits}
            focusTarget={focusTarget}
            hasFocus={focusArea != null}
            t={t}
          />
        </div>
      )}

      {/* Completed courses grouped by year·semester */}
      {isEmpty ? (
        <div className="animate-stagger-2">
          <EmptyState
            hasAnyCourses={hasAnyCourses}
            onAddFirstCourse={scrollToAddCourse}
            t={t}
          />
        </div>
      ) : (
        <div className="animate-stagger-3 space-y-4">
          {semesterGroups.map((group) => {
            const yearCfg = YEAR_CONFIG[group.year as keyof typeof YEAR_CONFIG];
            const semCfg = SEMESTER_CONFIG[group.semester];
            const yearLabel = isHe ? yearCfg?.nameHe : yearCfg?.nameEn;
            const semLabel = isHe ? semCfg?.nameHe : semCfg?.nameEn;
            const groupCredits = group.courses.reduce(
              (s, c) => s + c.course.credits,
              0
            );
            return (
              <div key={group.key} className="data-card overflow-hidden">
                <div className="flex items-center justify-between border-b border-border/30 px-5 py-4">
                  <span className="font-bold text-foreground/90">
                    {yearLabel} — {semLabel}
                  </span>
                  <span className="text-xs text-foreground/40">
                    {group.courses.length} {t("course")} · {groupCredits} {t("credits")}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/20 text-foreground/50">
                        <th className="px-5 py-2.5 text-start font-medium">{t("course")}</th>
                        <th className="hidden px-3 py-2.5 text-start font-medium sm:table-cell">
                          {t("discipline")}
                        </th>
                        <th className="px-3 py-2.5 text-center font-medium">{t("credits")}</th>
                        <th className="px-3 py-2.5 text-center font-medium">{t("grade")}</th>
                        <th className="px-3 py-2.5 text-center font-medium">{t("actions")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.courses.map((uc) => (
                        <CourseRow
                          key={uc.id}
                          uc={uc}
                          focusArea={focusArea}
                          locale={locale}
                          isHe={isHe}
                          onSaveGrade={handleSaveGrade}
                          onRemove={handleRemove}
                          savedSignal={savedSignals[uc.id] ?? 0}
                          t={t}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add a past course — always available */}
      <div ref={addCourseRef} className="animate-stagger-4">
        <AddCourse
          catalog={catalog}
          existingCourseIds={existingCourseIds}
          focusArea={focusArea}
          pastSemesters={pastSemesters}
          isHe={isHe}
          onAdd={handleAdd}
          isSaving={addCompletedMutation.isPending}
          t={t}
        />
      </div>
    </div>
  );
}
