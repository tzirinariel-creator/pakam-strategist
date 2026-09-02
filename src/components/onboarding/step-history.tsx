"use client";

import { useMemo, useState, useCallback, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Search, Plus, X, GraduationCap, Check, Star, Languages, ScanLine, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { DISCIPLINE_CONFIG, SEMESTER_CONFIG, YEAR_CONFIG } from "@/lib/constants";
import type { CourseWithSchedule } from "@/lib/plan-generator";
import { matchExtractedToCatalog } from "@/lib/grade-sheet";
import { passBarFor } from "@/lib/constants";
import { isEnglishCourse, passBarForName } from "@/lib/english-standing";
import { fileToBase64, SCANNER_ACCEPT } from "@/lib/upload";
import { Bidi } from "@/lib/bidi";
import { useScanProgress } from "@/hooks/use-scan-progress";
import { REASSURE_AFTER_S } from "@/lib/scan-progress";
import { WhereIsMySheet } from "@/components/record/where-is-my-sheet";
import type { OnboardingData } from "./onboarding-wizard";
import { heNoun } from "@/lib/he-count";

// ─────────────────────────────────────────────────────────────────────────
// Past-academic-record step ("מה כבר עשית?" / "Your history").
//
// Captures courses a mid-degree student already completed, with optional
// grades, so credits + the grade calculator are true on first dashboard load.
//
// Pre-fill rule (see computePlacement): each MANDATORY course is placed at its
// NATURAL placement — the earliest year it is offered (min of yearOffered),
// and within that year FALL if it is offered in FALL, otherwise SPRING. A
// course is pre-filled (pre-checked) for a given past semester when its natural
// placement falls strictly before the student's current (year, semester).
// ─────────────────────────────────────────────────────────────────────────

/** Canonical semester order index. FALL before SPRING within a year. */
function semOrder(semester: "FALL" | "SPRING"): number {
  return semester === "FALL" ? 0 : 1;
}

/** Absolute order of a (year, semester) across the whole degree. */
function timelineIndex(year: number, semester: "FALL" | "SPRING"): number {
  return (year - 1) * 2 + semOrder(semester);
}

/** Natural placement of a course = its earliest offering. */
function computePlacement(course: CourseWithSchedule): {
  year: number;
  semester: "FALL" | "SPRING";
} | null {
  const years = (course.yearOffered ?? []).filter((y) => y >= 1 && y <= 3);
  if (years.length === 0) return null;
  const year = Math.min(...years);
  const sems = course.semesterOffered ?? [];
  // FALL before SPRING when offered in both; if neither listed, assume FALL.
  const semester: "FALL" | "SPRING" = sems.includes("SPRING") && !sems.includes("FALL")
    ? "SPRING"
    : "FALL";
  return { year, semester };
}

export interface CompletedCourse {
  courseCode: string;
  plannedYear: number;
  plannedSemester: "FALL" | "SPRING";
  grade: number | null;
  /** 18:19 (#10 דוגרי) — a completed course NOT in the PPE catalog (a real
   *  general elective the student took). When set, step-ready persists it via
   *  plan.addScannedCourse (which creates the Course) instead of the catalog
   *  save (which skips unknown codes). */
  customName?: string;
  credits?: number | null;
  /**
   * The sheet's own semester stamp for this row ("2025/1"), when it came from
   * a scan. Kept because it is the only evidence of WHICH academic year the
   * course was taken in — `plannedYear` is relative to a start year we may
   * have derived wrongly, which is exactly the bug this exists to catch.
   * See src/lib/implied-start-year.ts.
   */
  sheetSemester?: string | null;
}

interface PastSemester {
  year: number;
  semester: "FALL" | "SPRING";
}

interface StepHistoryProps {
  data: OnboardingData;
  allCourses: CourseWithSchedule[];
  isLoadingCourses: boolean;
  /** Currently-selected completed courses, keyed by courseCode. */
  value: Record<string, CompletedCourse>;
  onChange: (next: Record<string, CompletedCourse>) => void;
  onNext: () => void;
  onBack: () => void;
  /** #26 — the map arrived from a scanned grade sheet, not from the default
   *  "you must have passed the past mandatory courses" pre-fill. Changes what
   *  this screen CLAIMS: it's a review of a document, not a set of guesses. */
  sheetSeeded?: boolean;
}

/**
 * Returns the list of past semesters (strictly before current), in order.
 * Empty when the student is a fresh year-1-FALL student.
 */
export function getPastSemesters(
  year: number,
  semester: "FALL" | "SPRING"
): PastSemester[] {
  const current = timelineIndex(year, semester);
  const all: PastSemester[] = [
    { year: 1, semester: "FALL" },
    { year: 1, semester: "SPRING" },
    { year: 2, semester: "FALL" },
    { year: 2, semester: "SPRING" },
    { year: 3, semester: "FALL" },
    { year: 3, semester: "SPRING" },
  ];
  return all.filter((s) => timelineIndex(s.year, s.semester) < current);
}

/**
 * Build the default completed map: PRE-CHECK every mandatory course whose
 * natural placement (computePlacement) falls in a semester the student has
 * already passed.
 *
 * Rationale (fixes #18): a student starting year 2/3 has, by definition,
 * completed the mandatory courses of the earlier years — you can't reach year 2
 * without passing year 1. The previous behavior returned an EMPTY map and made
 * the student manually re-check ~16 courses; in practice they skipped it, so
 * their history never persisted and the dashboard showed "only 21 ש״ס". Pre-
 * checking the past mandatory makes their real standing reflect immediately.
 *
 * GPA is NOT over-claimed: grades are left null (the grade calculator only
 * counts COMPLETED courses that actually carry a grade). An irregular student
 * who hasn't passed one of these can simply un-check it.
 */
export function buildDefaultCompleted(
  allCourses: CourseWithSchedule[],
  year: number,
  semester: "FALL" | "SPRING"
): Record<string, CompletedCourse> {
  const past = getPastSemesters(year, semester);
  if (past.length === 0) return {};
  const pastKeys = new Set(past.map((s) => `${s.year}-${s.semester}`));

  const out: Record<string, CompletedCourse> = {};
  for (const c of allCourses) {
    if (!(c.courseType === "MANDATORY" || c.isMandatory)) continue;
    const p = computePlacement(c);
    if (!p) continue;
    if (!pastKeys.has(`${p.year}-${p.semester}`)) continue;
    out[c.code] = {
      courseCode: c.code,
      plannedYear: p.year,
      plannedSemester: p.semester,
      grade: null, // student fills grades; null keeps the average honest
    };
  }
  return out;
}

export function StepHistory({
  data,
  allCourses,
  isLoadingCourses,
  value,
  onChange,
  onNext,
  onBack,
  sheetSeeded = false,
}: StepHistoryProps) {
  const t = useTranslations("onboarding");
  const locale = useLocale();
  const isHe = locale === "he";

  const courseByCode = useMemo(
    () => new Map(allCourses.map((c) => [c.code, c])),
    [allCourses]
  );

  const pastSemesters = useMemo(
    () => getPastSemesters(data.year, data.semester),
    [data.year, data.semester]
  );

  // Course-search state for adding electives.
  const [search, setSearch] = useState("");

  // Grade-sheet scan (#23 golden path) — the same /api/ai/scan-grades used on
  // /record, but here it MERGES into the completed-courses map instead of the
  // plan: matched catalog courses get pre-checked with their grade. It writes
  // nothing on its own — the student still reviews the pre-checked list and the
  // real save happens through the normal onboarding flow.
  const scanRef = useRef<HTMLInputElement>(null);
  // The first scan a student ever runs, at the most fragile moment there is —
  // mid-signup. It had the shortest label of the four ("קורא…") and no clock.
  const scan = useScanProgress(isHe, "sheet");
  const { scanning, elapsed } = scan;

  const handleScanFile = useCallback(
    async (file: File) => {
      scan.start();
      try {
        const { b64, mime } = await fileToBase64(file);
        scan.setStage("upload");
        if (b64.length > 5_000_000) {
          toast.error(
            isHe
              ? "הקובץ גדול מדי — צלמו את העמוד עצמו במקום להעלות PDF כבד."
              : "File too large — photograph the page itself instead of a heavy PDF.",
          );
          return;
        }
        const res = await fetch("/api/ai/scan-grades", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: b64, mimeType: mime }),
        });
        scan.setStage("read");
        const resData = (await res.json()) as { rows?: unknown[]; error?: string };
        if (!res.ok) {
          toast.error(resData.error ?? (isHe ? "הסריקה נכשלה" : "Scan failed"));
          return;
        }
        const matched = matchExtractedToCatalog(
          (resData.rows ?? []) as Parameters<typeof matchExtractedToCatalog>[0],
          allCourses,
        );
        // Clamp a course's natural placement into a semester the student has
        // actually passed — otherwise a course whose earliest offering is in the
        // future (relative to a mid-degree student) would be saved COMPLETED but
        // never rendered in any group for review/removal (#audit-r3).
        const latestPast = pastSemesters.length > 0 ? pastSemesters[pastSemesters.length - 1]! : null;
        const clampToPast = (nat: { year: number; semester: "FALL" | "SPRING" } | null) =>
          nat && pastSemesters.some((p) => p.year === nat.year && p.semester === nat.semester)
            ? nat
            : (latestPast ?? { year: 1, semester: "FALL" as const });

        const next = { ...value };
        let hits = 0;
        let graded = 0;
        let skipped = 0;
        let added = 0;
        for (const { row, course } of matched) {
          if (!course) {
            // 18:19 (#10 דוגרי) — a graded row that matched no catalog course
            // is a real elective taken outside the PPE list. Capture it as a
            // CUSTOM completed course so it's not silently dropped.
            // The bar is 70 for English, 60 for everything else — decided by
            // NAME because an off-catalog row has no courseType. This branch
            // used to hardcode 60 while grade-sheet.decideAddition, which
            // handles the very same off-catalog case in the /record scanner,
            // applied 70: the same 65 in an English elective was FAILED there
            // and a silent COMPLETED here (audit deferred-4).
            if (
              !row.inProgress &&
              row.grade != null &&
              row.grade >= passBarForName(row.courseName) &&
              row.courseCode
            ) {
              const key = row.courseCode.trim();
              const placement = latestPast ?? { year: 1, semester: "FALL" as const };
              if (!next[key]) {
                next[key] = {
                  courseCode: key,
                  plannedYear: placement.year,
                  plannedSemester: placement.semester,
                  grade: row.grade,
                  customName: row.courseName,
                  credits: row.credits,
                  sheetSemester: row.semester ?? null,
                };
                added++;
              }
            }
            continue;
          }
          if (row.inProgress) continue; // *** rows aren't completed yet
          const full = allCourses.find((c) => c.code === course.code);
          // The onboarding history map is COMPLETED-only (no FAILED/EXEMPT), so it
          // must pre-fill ONLY genuine completed passes. A failed grade, a "נכשל",
          // or a "פטור" would otherwise be saved as a passed COMPLETED course
          // (false completion / wrong average). Those belong to the /record flow,
          // which carries full FAILED/EXEMPT status (#audit-r3).
          const passText = row.passText ?? "";
          if (passText.includes("פטור") || passText.includes("נכשל")) {
            skipped++;
            continue;
          }
          if (row.grade != null && row.grade < passBarFor(full?.courseType)) {
            skipped++;
            continue;
          }
          const placement = clampToPast(full ? computePlacement(full) : null);
          const existing = next[course.code];
          next[course.code] = {
            courseCode: course.code,
            plannedYear: existing?.plannedYear ?? placement.year,
            plannedSemester: existing?.plannedSemester ?? placement.semester,
            grade: row.grade ?? existing?.grade ?? null,
            sheetSemester: row.semester ?? existing?.sheetSemester ?? null,
          };
          hits++;
          if (row.grade != null) graded++;
        }
        onChange(next);
        if (hits === 0 && added === 0) {
          toast(
            isHe
              ? "לא מצאנו קורסים שהושלמו בגיליון — אפשר לסמן ידנית למטה."
              : "No completed courses found on the sheet — mark them manually below.",
          );
        } else {
          const parts: string[] = [];
          if (graded > 0) parts.push(isHe ? `${graded} עם ציון` : `${graded} with a grade`);
          if (added > 0) parts.push(isHe ? `${heNoun(added, "קורס", "קורסים")} שאינם בקטלוג שלנו נוספו` : `${added} courses not in our catalog added`);
          if (skipped > 0) parts.push(isHe ? `${skipped} נכשלו/פטור — הוסיפו ב״הרשומה״ אחרי ההרשמה` : `${skipped} failed/exempt — add them in the record after signup`);
          parts.push(isHe ? "עברו לוודא ולתקן למטה" : "review below");
          toast.success(
            // "נמצאו קורס אחד שהושלמו" — heNoun fixed the noun and left both
            // verbs around it in the plural. This is the first toast a student
            // sees after a scan, so it is also the app's first sentence.
            isHe
              ? hits === 1
                ? "נמצא קורס אחד שהושלם"
                : `נמצאו ${hits} קורסים שהושלמו`
              : `Found ${hits} completed course${hits === 1 ? "" : "s"}`,
            { description: parts.join(" · ") },
          );
        }
      } catch {
        toast.error(isHe ? "הסריקה נכשלה — נסו שוב" : "Scan failed — try again");
      } finally {
        scan.stop();
        if (scanRef.current) scanRef.current.value = "";
      }
    },
    [allCourses, value, onChange, isHe, pastSemesters],
  );

  const toggleCourse = useCallback(
    (course: CourseWithSchedule, placement: PastSemester) => {
      const next = { ...value };
      if (next[course.code]) {
        delete next[course.code];
      } else {
        next[course.code] = {
          courseCode: course.code,
          plannedYear: placement.year,
          plannedSemester: placement.semester,
          grade: null,
        };
      }
      onChange(next);
    },
    [value, onChange]
  );

  const setGrade = useCallback(
    (code: string, raw: string) => {
      const entry = value[code];
      if (!entry) return;
      let grade: number | null;
      if (raw === "") {
        grade = null;
      } else {
        const num = parseInt(raw, 10);
        if (isNaN(num) || num < 0 || num > 100) return;
        grade = num;
      }
      onChange({ ...value, [code]: { ...entry, grade } });
    },
    [value, onChange]
  );

  const addElective = useCallback(
    (course: CourseWithSchedule, target: PastSemester) => {
      onChange({
        ...value,
        [course.code]: {
          courseCode: course.code,
          plannedYear: target.year,
          plannedSemester: target.semester,
          grade: null,
        },
      });
      setSearch("");
    },
    [value, onChange]
  );

  // Group the past semesters; each carries its mandatory courses (pre-filled
  // or not) plus any elective the user has already added & placed there.
  const grouped = useMemo(() => {
    return pastSemesters.map((sem) => {
      const idx = timelineIndex(sem.year, sem.semester);
      // Mandatory courses whose natural placement is this semester.
      const mandatory = allCourses
        .filter((c) => c.courseType === "MANDATORY" || c.isMandatory)
        .filter((c) => {
          const p = computePlacement(c);
          return (
            p && p.year === sem.year && p.semester === sem.semester
          );
        });
      // Electives the user explicitly added to this semester.
      const electives = Object.values(value)
        .filter(
          (e) =>
            e.plannedYear === sem.year &&
            e.plannedSemester === sem.semester &&
            !mandatory.some((m) => m.code === e.courseCode)
        )
        .map((e) => courseByCode.get(e.courseCode))
        .filter((c): c is CourseWithSchedule => Boolean(c));
      return { sem, idx, mandatory, electives };
    });
  }, [pastSemesters, allCourses, value, courseByCode]);

  // Search results: any catalog course not already selected, matching the
  // query by code or name. All catalog electives are PPE-approved by definition.
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    return allCourses
      .filter((c) => !value[c.code])
      .filter((c) => {
        const hay = `${c.code} ${c.nameHe ?? ""} ${c.nameEn ?? ""}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 8);
  }, [search, allCourses, value]);

  // Default target semester for an added elective: the latest past semester
  // (closest to "now") — most students add a recent elective. The user can't
  // see a placement picker per the brief, so we place it sensibly.
  const defaultElectiveTarget: PastSemester | null =
    pastSemesters.length > 0 ? pastSemesters[pastSemesters.length - 1]! : null;

  const selectedCount = Object.keys(value).length;
  const gradedCount = Object.values(value).filter((c) => c.grade !== null).length;

  const yearLabel = (year: number) =>
    isHe
      ? YEAR_CONFIG[year as 1 | 2 | 3]?.nameHe
      : YEAR_CONFIG[year as 1 | 2 | 3]?.nameEn;
  const semLabel = (semester: "FALL" | "SPRING") =>
    isHe ? SEMESTER_CONFIG[semester]?.nameHe : SEMESTER_CONFIG[semester]?.nameEn;

  return (
    <div className="flex flex-col items-center">
      {/* Header */}
      <div className="animate-stagger-1 text-center">
        <h2 className="font-display text-2xl font-bold text-foreground/90">
          {sheetSeeded
            ? isHe
              ? "אישור מה שקראנו מהגיליון"
              : "Confirm what we read from your sheet"
            : t("historyTitle")}
        </h2>
        <p className="mt-2 max-w-md text-foreground/60">
          {sheetSeeded
            ? isHe
              ? "עדיין לא נשמר כלום. מה שתאשרו כאן הוא מה שייכנס לתואר שלכם."
              : "Nothing is saved yet. What you confirm here is what goes into your degree."
            : t("historyDesc")}
        </p>
        {/* Two different claims, and they must not be confused. Without a sheet
            we PRE-CHECKED BY ASSUMPTION (past mandatory courses, #18) and have
            to say so. With a sheet we checked exactly what the document shows —
            and nothing beyond it. */}
        <p className="mx-auto mt-2 max-w-md text-xs text-foreground/60">
          {sheetSeeded
            ? isHe
              ? "סימנו אך ורק את מה שמופיע בגיליון — לא הוספנו אף קורס מעבר לזה. אם הסורק פספס קורס, הוסיפו אותו למטה; אם סימן קורס שלא עשיתם, הסירו את הסימון."
              : "We checked only what appears on the sheet — nothing was added beyond it. If the scanner missed a course, add it below; if it checked one you didn't take, un-check it."
            : isHe
              ? "סימנו לכם מראש את קורסי-החובה של השנים שעברתם. הסירו סימון אם לא עשיתם קורס, והוסיפו ציונים אם בא לכם — הם לא חובה."
              : "We pre-checked the mandatory courses from the years you've completed. Un-check any you didn't take, and add grades if you like — they're optional."}
        </p>
      </div>

      <div className="mt-6 w-full max-w-2xl space-y-5">
        {/* Summary chip */}
        <div className="animate-stagger-2 flex items-center justify-center gap-2 text-xs text-foreground/60">
          <GraduationCap className="h-4 w-4 text-status-green" />
          <span>{t("historySelectedCount", { count: selectedCount })}</span>
          {gradedCount > 0 && (
            <span className="text-foreground/60">
              · {t("historyGradedCount", { count: gradedCount })}
            </span>
          )}
        </div>

        {/* Grade-sheet scan — the fastest way to fill history (#23 golden path).
            Pre-checks matched courses + fills grades; the student reviews below. */}
        {!isLoadingCourses && pastSemesters.length > 0 && (
          <div className="animate-stagger-2 rounded-xl border border-accent-brand/25 bg-accent-brand/5 p-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-brand/10 text-accent-brand">
                <ScanLine className="size-4.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground/85">
                  {isHe ? "יש לכם גיליון ציונים? סרקו אותו" : "Have a grade sheet? Scan it"}
                </p>
                <p className="text-xs text-foreground/60">
                  {isHe
                    ? "נסמן את הקורסים שכבר עשיתם ונמלא ציונים — במקום להקליד ידנית."
                    : "We'll check off the courses you've done and fill in grades — instead of typing."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => scanRef.current?.click()}
                disabled={scanning}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-accent-brand px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {scanning ? <Loader2 className="size-4 animate-spin" /> : <ScanLine className="size-4" />}
                {scanning ? scan.label : isHe ? "העלו וסרקו" : "Upload & scan"}
              </button>
              <input
                ref={scanRef}
                type="file"
                accept={SCANNER_ACCEPT}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleScanFile(f);
                }}
              />
            </div>
            {scanning && (
              <p className="mt-2 text-xs text-foreground/60" aria-live="polite">
                {scan.hint ?? (isHe ? "לא סוגרים את העמוד." : "Keep this page open.")}
                {elapsed >= REASSURE_AFTER_S && (
                  <>
                    {" · "}
                    <Bidi text={elapsed} /> {isHe ? "שניות" : "s"}
                  </>
                )}
              </p>
            )}
            <div className="mt-2">
              <WhereIsMySheet />
            </div>
          </div>
        )}

        {/* Loading */}
        {isLoadingCourses && (
          <div className="flex justify-center py-8 text-sm text-foreground/60">
            {t("historyLoading")}
          </div>
        )}

        {/* Grouped past semesters */}
        {!isLoadingCourses &&
          grouped.map(({ sem, mandatory, electives }) => {
            const courses = [...mandatory, ...electives];
            return (
              <div
                key={`${sem.year}-${sem.semester}`}
                className="animate-stagger-3 rounded-xl border border-border bg-card/40 p-4"
              >
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground/70">
                  {yearLabel(sem.year)} · {semLabel(sem.semester)}
                </h3>
                {courses.length === 0 ? (
                  <p className="text-xs text-foreground/60">
                    {t("historyNoMandatory")}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {courses.map((course) => {
                      const entry = value[course.code];
                      const checked = Boolean(entry);
                      const isElective = !(
                        course.courseType === "MANDATORY" || course.isMandatory
                      );
                      const config = DISCIPLINE_CONFIG[course.discipline];
                      const countsForFocus =
                        data.focusArea != null &&
                        (course.discipline === data.focusArea ||
                          (course.canCountAs ?? []).includes(data.focusArea));
                      const isEnglish = isEnglishCourse(course);
                      return (
                        <div
                          key={course.code}
                          className={cn(
                            "flex items-center gap-3 rounded-lg border p-2.5 transition-colors",
                            checked
                              ? "border-emerald-500/30 bg-emerald-500/5"
                              : "border-border bg-card/60"
                          )}
                        >
                          {/* Checkbox */}
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={checked}
                            aria-label={isHe ? course.nameHe : (course.nameEn ?? course.nameHe)}
                            onClick={() =>
                              toggleCourse(course, {
                                year: sem.year,
                                semester: sem.semester,
                              })
                            }
                            className={cn(
                              "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/40",
                              checked
                                ? "border-emerald-500 bg-emerald-500 text-white"
                                : "border-foreground/25 bg-transparent hover:border-foreground/40"
                            )}
                          >
                            {checked && <Check className="h-3.5 w-3.5" />}
                          </button>

                          {/* Course info */}
                          <div className="flex min-w-0 flex-1 flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span
                                className="truncate text-sm font-medium text-foreground/85"
                                title={`${course.code} — ${isHe ? course.nameHe : course.nameEn}`}
                              >
                                {isHe ? course.nameHe : (course.nameEn ?? course.nameHe)}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-mono text-[10px] text-foreground/60">
                                {course.code}
                              </span>
                              <span className="font-mono text-[11px] text-foreground/60">
                                · {course.credits} {t("nz")}
                              </span>
                              {isElective && (
                                <span className="rounded-full bg-foreground/8 px-1.5 py-0.5 text-[11px] font-medium text-foreground/70">
                                  {t("historyElectiveBadge")}
                                </span>
                              )}
                              {countsForFocus && config && (
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium",
                                    config.badgeClass
                                  )}
                                >
                                  <Star className="h-2.5 w-2.5" />
                                  {t("historyFocusBadge")}
                                </span>
                              )}
                              {isEnglish && (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[11px] font-medium text-status-blue">
                                  <Languages className="h-2.5 w-2.5" />
                                  {t("historyEnglishBadge")}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Optional grade input — only when checked */}
                          {checked && (
                            <div className="flex shrink-0 items-center gap-1.5">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                step={1}
                                dir="ltr"
                                value={entry?.grade ?? ""}
                                onChange={(e) => setGrade(course.code, e.target.value)}
                                placeholder={t("historyGradePlaceholder")}
                                aria-label={t("historyGradeAria")}
                                className={cn(
                                  "w-16 rounded-md border border-border/60 bg-background/50 px-2 py-1.5",
                                  "text-center font-mono text-sm text-foreground",
                                  "placeholder:text-foreground/60",
                                  "focus:border-foreground/35 focus:outline-none focus:ring-1 focus:ring-foreground/20"
                                )}
                              />
                            </div>
                          )}

                          {/* Remove (for added electives) */}
                          {isElective && (
                            <button
                              type="button"
                              onClick={() =>
                                toggleCourse(course, {
                                  year: sem.year,
                                  semester: sem.semester,
                                })
                              }
                              aria-label={t("historyRemove")}
                              className="shrink-0 rounded-md p-1 text-foreground/60 transition-colors hover:bg-red-500/10 hover:text-status-red"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

        {/* Add elective via catalog search */}
        {!isLoadingCourses && defaultElectiveTarget && (
          <div className="animate-stagger-4 rounded-xl border border-dashed border-border bg-card/30 p-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground/70">
              <Plus className="h-4 w-4" />
              {t("historyAddElectiveTitle")}
            </h3>
            <p className="mb-3 text-xs text-foreground/60">
              {t("historyAddElectiveDesc")}
            </p>
            <div className="relative">
              <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-foreground/60" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("historySearchPlaceholder")}
                className="w-full rounded-lg border border-border bg-card py-2.5 ps-9 pe-3 text-sm text-foreground placeholder:text-foreground/60 focus:border-foreground/30 focus:outline-none"
              />
            </div>
            {searchResults.length > 0 && (
              <div className="mt-2 max-h-60 space-y-1 overflow-y-auto rounded-lg border border-border bg-card p-1">
                {searchResults.map((course) => {
                  const config = DISCIPLINE_CONFIG[course.discipline];
                  const countsForFocus =
                    data.focusArea != null &&
                    (course.discipline === data.focusArea ||
                      (course.canCountAs ?? []).includes(data.focusArea));
                  const isEnglish = isEnglishCourse(course);
                  return (
                    <button
                      key={course.code}
                      type="button"
                      onClick={() => addElective(course, defaultElectiveTarget)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-start transition-colors hover:bg-foreground/5"
                    >
                      <Plus className="h-3.5 w-3.5 shrink-0 text-status-green" />
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground/80">
                        {isHe ? course.nameHe : (course.nameEn ?? course.nameHe)}
                      </span>
                      {countsForFocus && config && (
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-medium",
                            config.badgeClass
                          )}
                        >
                          {t("historyFocusBadge")}
                        </span>
                      )}
                      {isEnglish && (
                        <span className="shrink-0 rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[11px] font-medium text-status-blue">
                          {t("historyEnglishBadge")}
                        </span>
                      )}
                      <span className="shrink-0 font-mono text-[11px] text-foreground/60">
                        {course.credits} {t("nz")}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {search.trim().length >= 2 && searchResults.length === 0 && (
              <div className="mt-2 space-y-2">
                <p className="text-xs text-foreground/60">{t("historyNoResults")}</p>
                {/* 18:19 (#10 דוגרי) — a course that isn't in the list can still
                    be added: real electives (like דוגרי) live outside the 117
                    PPE catalog. Adds a custom completed course. */}
                <button
                  type="button"
                  onClick={() => {
                    const name = search.trim();
                    const key = `CUSTOM-${name.replace(/\s+/g, "-").slice(0, 24)}`;
                    if (value[key]) return;
                    const placement = defaultElectiveTarget ?? { year: 1, semester: "FALL" as const };
                    onChange({
                      ...value,
                      [key]: {
                        courseCode: key,
                        plannedYear: placement.year,
                        plannedSemester: placement.semester,
                        grade: null,
                        customName: name,
                        credits: 2,
                      },
                    });
                    setSearch("");
                    toast.success(isHe ? `"${name}" נוסף — הזינו ציון למטה` : `"${name}" added — enter a grade below`);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg border border-dashed border-accent-brand/40 bg-accent-brand/[0.04] px-3 py-2 text-start text-sm font-medium text-accent-brand transition-colors hover:bg-accent-brand/10"
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  {isHe ? `הוסיפו "${search.trim()}" — קורס שאינו ברשימה` : `Add "${search.trim()}" — a course not in the list`}
                </button>
              </div>
            )}

            {/* 18:19 (#10) — custom courses the student added (outside the PPE
                list, e.g. דוגרי): shown here so they can set a grade / remove. */}
            {Object.values(value).filter((c) => c.customName).length > 0 && (
              <div className="mt-3 space-y-1.5 border-t border-border/40 pt-3">
                <p className="text-[11px] font-medium text-foreground/60">
                  {/* #8 — "מי אמר שדוגרי מחוץ לרשימה? זה מאושר לנו". Not being in OUR
                      catalog is not the same as not being approved for your degree,
                      and this label asserted the second while only knowing the
                      first. It names what we actually know. */}
                  {isHe ? "קורסים שהוספתם (לא בקטלוג שלנו):" : "Courses you added (not in our catalog):"}
                </p>
                {Object.values(value)
                  .filter((c) => c.customName)
                  .map((c) => (
                    <div key={c.courseCode} className="flex items-center gap-2 rounded-lg border border-border/50 bg-card px-2.5 py-2">
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground/80">{c.customName}</span>
                      {/* Editable credits — an off-catalog course (e.g. a 4-ש״ס
                          דוגרי) was hard-locked at 2, under-counting total credits,
                          the elective requirement, and its average weight (#18). */}
                      <span className="shrink-0 text-[11px] text-foreground/60">{t("nz")}</span>
                      <input
                        type="number"
                        min={1}
                        max={12}
                        step={0.5}
                        value={c.credits ?? 2}
                        onChange={(e) => {
                          const n = parseFloat(e.target.value);
                          onChange({
                            ...value,
                            [c.courseCode]: { ...c, credits: Number.isFinite(n) && n > 0 ? n : c.credits },
                          });
                        }}
                        aria-label={isHe ? `ש״ס ל${c.customName}` : `Credits for ${c.customName}`}
                        className="w-12 rounded-md border border-border bg-card px-1.5 py-1 text-center text-sm"
                        dir="ltr"
                      />
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={c.grade ?? ""}
                        onChange={(e) => setGrade(c.courseCode, e.target.value)}
                        placeholder={isHe ? "ציון" : "grade"}
                        aria-label={isHe ? `ציון ל${c.customName}` : `Grade for ${c.customName}`}
                        className="w-16 rounded-md border border-border bg-card px-2 py-1 text-center text-sm"
                        dir="ltr"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const next = { ...value };
                          delete next[c.courseCode];
                          onChange(next);
                        }}
                        aria-label={isHe ? "הסרה" : "Remove"}
                        className="rounded-md p-1 text-foreground/70 transition-colors hover:bg-foreground/10 hover:text-foreground/70"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="mt-8 flex w-full max-w-2xl items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg px-4 py-2.5 text-sm text-foreground/70 transition-all hover:bg-foreground/5 hover:text-foreground/70"
        >
          {t("back")}
        </button>
        <button
          type="button"
          onClick={onNext}
          className="rounded-lg bg-foreground px-6 py-2.5 text-sm font-medium text-background shadow-sm transition-all hover:scale-[1.02] press-scale"
        >
          {selectedCount > 0 ? t("historyContinue") : t("historySkip")}
        </button>
      </div>
    </div>
  );
}
