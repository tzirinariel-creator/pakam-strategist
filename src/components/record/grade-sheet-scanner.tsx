"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { ScanLine, Loader2, Check, AlertTriangle, X, Languages } from "lucide-react";
import { toast } from "sonner";
import { advisorError } from "@/lib/advisor-toast";
import { api } from "@/lib/trpc/react";
import { getEnglishLevelInfo, type EnglishLevel } from "@/lib/constants";
import {
  matchExtractedToCourses,
  decideApplication,
  passBarFor,
  type MatchedRow,
  type UserCourseLite,
} from "@/lib/grade-sheet";
import { getWrapTarget, wrapStorageKey } from "@/lib/semester-clock";
import { calculateGrades } from "@/lib/grade-calculator";
import type { UserCourseWithCourse } from "@/types/degree";
import { WhereIsMySheet } from "@/components/record/where-is-my-sheet";
import { CohortShareNudge } from "@/components/cohort/cohort-share-nudge";
import { fileToBase64, SCANNER_ACCEPT } from "@/lib/upload";
import { invalidatePlanData } from "@/lib/trpc/invalidate-plan";
import { cn } from "@/lib/utils";

/**
 * Grade-sheet scanner — upload a photo/PDF of the TAU grade sheet, Gemini
 * reads it, and the student REVIEWS each row before anything is written.
 * Apply goes row-by-row through the existing plan.updateCourse mutation
 * (ownership + demo guards live there). Nothing is auto-applied, ever.
 */
export function GradeSheetScanner() {
  const isHe = useLocale() === "he";
  const fileRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [rows, setRows] = useState<MatchedRow[] | null>(null);
  // #5 — printed-average cross-check result; #4 — post-apply personal summary.
  const [avgMismatch, setAvgMismatch] = useState<{ computed: number; printed: number } | null>(null);
  const [scanSummary, setScanSummary] = useState<{
    updated: number;
    failedGrades: number;
    average: number | null;
  } | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [applying, setApplying] = useState(false);
  // #23 — English level the scan read off the sheet (no number). Offered as an
  // explicit, declared change (never written silently) and cleared once applied.
  const [scannedEnglish, setScannedEnglish] = useState<EnglishLevel | null>(null);

  const utils = api.useUtils();
  const planQuery = api.plan.getUserPlan.useQuery();
  const profileQuery = api.user.getProfile.useQuery();
  const updateMutation = api.plan.updateCourse.useMutation();
  const addScannedMutation = api.plan.addScannedCourse.useMutation();
  const updateProfile = api.user.updateProfile.useMutation();

  // The end-of-semester rite (#22) deep-links here with ?scan=1 — scroll to the
  // scanner so the student lands right on the action they came for.
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get("scan") === "1") {
      const el = document.getElementById("grade-scanner");
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [searchParams]);

  const userCourses = useMemo<UserCourseLite[]>(
    () =>
      (planQuery.data?.courses ?? []).map((uc) => ({
        userCourseId: uc.id,
        courseCode: uc.course.code,
        nameHe: uc.course.nameHe,
        currentGrade: uc.grade ?? null,
        status: uc.status,
        courseType: uc.course.courseType,
      })),
    [planQuery.data],
  );

  const handleFile = async (file: File) => {
    setScanning(true);
    setRows(null);
    try {
      const { b64, mime } = await fileToBase64(file);
      // Photos are downscaled in fileToBase64; PDFs pass through, so a heavy PDF
      // can exceed the server cap and fail with an opaque platform error. Catch
      // it here with a clear, localized hint instead. (audit #11)
      if (b64.length > 5_000_000) {
        toast.error(
          isHe
            ? "הקובץ גדול מדי — צלמו את העמוד עצמו במקום להעלות PDF כבד (עד ~3.5MB)."
            : "File too large — photograph the page itself instead of a heavy PDF (max ~3.5MB).",
        );
        return;
      }
      const res = await fetch("/api/ai/scan-grades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: b64, mimeType: mime }),
      });
      const data = (await res.json()) as {
        rows?: unknown[];
        englishLevel?: EnglishLevel | null;
        averageMismatch?: { computed: number; printed: number } | null;
        error?: string;
      };
      if (!res.ok) {
        advisorError(data.error ?? (isHe ? "הסריקה לא הצליחה — נסו שוב או צלמו תמונה חדה יותר." : "The scan didn't work — try again or take a sharper photo."));
        return;
      }
      const matched = matchExtractedToCourses(
        (data.rows ?? []) as Parameters<typeof matchExtractedToCourses>[0],
        userCourses,
      );
      setRows(matched);
      setAvgMismatch(data.averageMismatch ?? null);
      // #23 — offer the read-off English level only when it actually adds
      // something: present on the sheet AND not already the student's stored level.
      const current = profileQuery.data?.englishLevel ?? null;
      setScannedEnglish(
        data.englishLevel && data.englishLevel !== current ? data.englishLevel : null,
      );
      // Pre-check ONLY high-confidence, unambiguous matches (still requires a
      // grade — passText/EXEMPT rows are applicable but never auto-checked, so
      // a "עובר" is a deliberate tick). A fuzzy/ambiguous match stays unchecked.
      setChecked(
        new Set(matched.map((r, i) => (r.autoApplySafe && !r.uncertain ? i : -1)).filter((i) => i >= 0)),
      );
    } catch {
      advisorError(isHe ? "הסריקה לא הצליחה — נסו שוב. הציונים שלכם לא נגעו." : "The scan didn't work — try again. Your grades are untouched.");
    } finally {
      setScanning(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const applySelected = async () => {
    if (!rows) return;
    setApplying(true);
    let ok = 0;
    let failed = 0;
    let failedGrades = 0; // rows written as FAILED — surfaced honestly (#30)
    let englishApplied = 0;
    for (const i of checked) {
      const r = rows[i];
      const decision = r ? decideApplication(r) : null;
      if (!r?.match || !decision) continue;
      try {
        await updateMutation.mutateAsync({
          userCourseId: r.match.userCourseId,
          grade: decision.grade,
          status: decision.status,
        });
        ok++;
        if (decision.status === "FAILED") failedGrades++;
        if (r.match.courseType === "ENGLISH") englishApplied++;
      } catch (e) {
        failed++;
        if (failed === 1) {
          advisorError((e as { message?: string })?.message ?? (isHe ? "העדכון לא הצליח — השורות שכבר עודכנו נשמרו." : "The update didn't go through — rows already applied are saved."));
        }
      }
    }
    setApplying(false);
    if (ok > 0) {
      // Honest summary (#30): name what happened, not just a count.
      const parts: string[] = [];
      if (failedGrades > 0) {
        parts.push(isHe ? `${failedGrades} נרשמו כנכשלים` : `${failedGrades} recorded as failed`);
      }
      if (englishApplied > 0) {
        parts.push(isHe ? "ציוני אנגלית אינם נספרים בממוצע" : "English grades don't count toward the average");
      }
      toast.success(
        isHe ? `עודכנו ${ok} קורסים מהגיליון` : `Updated ${ok} courses from the sheet`,
        parts.length ? { description: parts.join(" · ") } : undefined,
      );
      // Close the end-of-semester rite for this semester once grades are in.
      const wrap = getWrapTarget();
      if (wrap) {
        try {
          localStorage.setItem(wrapStorageKey(wrap.key), "done");
        } catch {
          /* storage blocked — the rite re-checks pending next load */
        }
      }
      setRows(null);
      setScannedEnglish(null);
      setAvgMismatch(null);
      invalidatePlanData(utils);
      // #4 — a personal wrap-up right after the scan lands: the fresh average
      // and what changed, computed deterministically from the updated plan
      // (never invented). Fetched AFTER the writes so the numbers are real.
      try {
        const fresh = await utils.plan.getUserPlan.fetch();
        const calc = calculateGrades((fresh?.courses ?? []) as unknown as UserCourseWithCourse[]);
        setScanSummary({ updated: ok, failedGrades, average: calc.courseAverage });
      } catch {
        setScanSummary({ updated: ok, failedGrades, average: null });
      }
    }
  };

  // #23 — apply the read-off English level as an explicit, declared change.
  const applyEnglishLevel = () => {
    if (!scannedEnglish) return;
    updateProfile.mutate(
      { englishLevel: scannedEnglish },
      {
        onSuccess: () => {
          setScannedEnglish(null);
          void utils.user.getProfile.invalidate();
          toast.success(isHe ? "רמת האנגלית עודכנה מהגיליון" : "English level updated from the sheet");
        },
        onError: (e) =>
          toast.error(e.message ?? (isHe ? "עדכון רמת האנגלית נכשל" : "Failed to update English level")),
      },
    );
  };

  return (
    <div id="grade-scanner" className="data-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-brand/10 text-accent-brand">
          <ScanLine className="size-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground/85">
            {isHe ? "סריקת גיליון ציונים" : "Scan your grade sheet"}
          </p>
          <p className="text-xs text-foreground/50">
            {isHe
              ? "מעלים את 'אישור קורסים וציונים' מהאזור האישי של ת״א — ואנחנו ממלאים ציונים, קורסים בלימוד ורמת-אנגלית. שום דבר לא נשמר בלי אישור שלכם."
              : "Upload your 'Record of study' from the TAU personal area — we fill in grades, in-progress courses and English level. Nothing is saved without your approval."}
          </p>
          <div className="mt-1"><WhereIsMySheet /></div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept={SCANNER_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={scanning || planQuery.isLoading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent-brand px-3 py-2 text-sm font-semibold text-accent-brand-fg transition-colors hover:bg-accent-brand-hover disabled:opacity-40"
        >
          {scanning ? <Loader2 className="size-4 animate-spin" /> : <ScanLine className="size-4" />}
          {scanning ? (isHe ? "קורא את הגיליון…" : "Reading…") : isHe ? "העלו וסרקו" : "Upload & scan"}
        </button>
      </div>

      {/* Review table — the student approves each row explicitly */}
      {scanSummary && !rows && (
        <div className="space-y-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-foreground/85">
            <Check className="size-4 text-emerald-500" />
            {isHe ? `הגיליון נקלט — עודכנו ${scanSummary.updated} קורסים` : `Sheet applied — ${scanSummary.updated} courses updated`}
          </p>
          <div className="space-y-1 text-xs leading-relaxed text-foreground/70">
            {scanSummary.average != null && (
              <p>
                {isHe
                  ? <>הממוצע שלכם עכשיו: <bdi dir="ltr"><b>{scanSummary.average.toFixed(1)}</b></bdi></>
                  : <>Your average now: <b>{scanSummary.average.toFixed(1)}</b></>}
              </p>
            )}
            {scanSummary.failedGrades > 0 ? (
              <p>
                {isHe
                  ? `${scanSummary.failedGrades} קורסים נרשמו כנכשלים — בבדיקת-המסלול תראו מה זה אומר ומה אפשר לעשות.`
                  : `${scanSummary.failedGrades} courses recorded as failed — the track check shows what that means and what you can do.`}
              </p>
            ) : (
              <p>
                {isHe
                  ? "אין נכשלים בגיליון הזה. כל הציונים נכנסו למחשבון ולבדיקת-המסלול."
                  : "No failures on this sheet. All grades now feed the calculator and the track check."}
              </p>
            )}
          </div>
          {/* Growth loop: right after grades land is the strongest moment to
              invite an anonymous contribution to the cohort pool (#3/#16). */}
          <CohortShareNudge variant="inline" />
          <button
            type="button"
            onClick={() => setScanSummary(null)}
            className="text-xs text-foreground/45 transition-colors hover:text-foreground/70"
          >
            {isHe ? "סגירה" : "Dismiss"}
          </button>
        </div>
      )}

      {rows && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-foreground/70">
              {isHe ? `נמצאו ${rows.length} שורות — סמנו מה לעדכן:` : `Found ${rows.length} rows — pick what to apply:`}
            </p>
            <button type="button" onClick={() => { setRows(null); setScannedEnglish(null); }} aria-label={isHe ? "סגור" : "Close"} className="rounded-md p-1 text-foreground/30 hover:text-foreground/60">
              <X className="size-4" />
            </button>
          </div>

          {/* #23 — declared English level read off the sheet. Explicit apply, no
              silent write; hidden once it matches the stored level. */}
          {scannedEnglish && (() => {
            const info = getEnglishLevelInfo(scannedEnglish);
            if (!info) return null;
            return (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-accent-brand/30 bg-accent-brand/5 p-2.5 text-xs">
                <Languages className="size-4 shrink-0 text-accent-brand" />
                <span className="min-w-0 flex-1 text-foreground/75">
                  {isHe
                    ? <>מהגיליון עולה שרמת האנגלית שלכם היא <b className="font-semibold text-foreground">{info.nameHe}</b>. לעדכן בפרופיל?</>
                    : <>The sheet shows your English level is <b className="font-semibold text-foreground">{info.nameEn}</b>. Update your profile?</>}
                </span>
                <button
                  type="button"
                  onClick={applyEnglishLevel}
                  disabled={updateProfile.isPending}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md bg-accent-brand px-2.5 py-1 font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {updateProfile.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                  {isHe ? "עדכנו" : "Update"}
                </button>
                <button
                  type="button"
                  onClick={() => setScannedEnglish(null)}
                  className="shrink-0 rounded-md px-1.5 py-1 text-foreground/40 hover:text-foreground/70"
                >
                  {isHe ? "לא עכשיו" : "Not now"}
                </button>
              </div>
            );
          })()}

          {avgMismatch && (
            // #5 — the grades we read don't add up to the average printed on
            // the sheet itself. Something was misread — say it before apply.
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>
                {isHe
                  ? <>משהו לא מסתדר: הממוצע בגיליון הוא <bdi dir="ltr">{avgMismatch.printed}</bdi>, אבל מהציונים שנקראו יוצא <bdi dir="ltr">{avgMismatch.computed}</bdi>. כנראה ציון אחד או יותר נקרא לא נכון — עברו על השורות לפני האישור.</>
                  : <>The numbers disagree: the sheet prints an average of {avgMismatch.printed}, but the grades we read compute to {avgMismatch.computed}. One or more grades were probably misread — review the rows before applying.</>}
              </span>
            </div>
          )}
          <ul className="space-y-1.5">
            {rows.map((r, i) => {
              const decision = decideApplication(r);
              const applicable = decision != null;
              const isEnglish = r.match?.courseType === "ENGLISH";
              return (
                <li key={i} className={cn("flex flex-wrap items-center gap-2 rounded-lg border p-2 text-xs", r.match ? "border-border/50" : "border-dashed border-border/50 opacity-70")}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={checked.has(i)}
                    aria-label={isHe ? `עדכן ציון ל${r.courseName}` : `Update grade for ${r.courseName}`}
                    disabled={!applicable}
                    onClick={() =>
                      setChecked((s) => {
                        const n = new Set(s);
                        if (n.has(i)) n.delete(i);
                        else n.add(i);
                        return n;
                      })
                    }
                    className={cn(
                      "flex size-4.5 shrink-0 items-center justify-center rounded border transition-colors disabled:opacity-30",
                      checked.has(i) ? "border-emerald-400 bg-emerald-400 text-white" : "border-foreground/25",
                    )}
                  >
                    {checked.has(i) && <Check className="size-3" />}
                  </button>
                  <span className="min-w-0 flex-1 truncate text-foreground/80" dir="auto">
                    {r.courseName}
                    {r.courseCode && <span className="ms-1 text-foreground/40" dir="ltr">{r.courseCode}</span>}
                  </span>
                  {r.semester && (
                    <span className="rounded bg-foreground/5 px-1.5 py-px font-data text-[10px] text-foreground/45" dir="ltr">
                      {r.semester}
                    </span>
                  )}
                  <span className="font-mono font-bold text-foreground/85" dir="ltr">
                    {r.grade ?? r.passText ?? "—"}
                  </span>
                  {r.inProgress && r.grade == null && !r.passText ? (
                    // The sheet prints *** for enrolled-not-yet-graded — a calm
                    // fact, not a warning and not "unreadable gibberish".
                    <span className="rounded bg-accent-brand/10 px-1.5 py-px text-[10px] font-semibold text-accent-brand">
                      {isHe ? "בלימוד — עדיין אין ציון" : "In progress — no grade yet"}
                    </span>
                  ) : r.match && decision ? (
                    // DECLARE the exact outcome before applying (#30) — the
                    // student never gets a silent COMPLETED/FAILED.
                    !r.changesGrade && decision.status === "COMPLETED" && r.grade != null ? (
                      <span className="rounded bg-foreground/5 px-1.5 py-px text-[10px] text-foreground/45">
                        {isHe ? "כבר מעודכן" : "Already current"}
                      </span>
                    ) : decision.status === "FAILED" ? (
                      <span className="flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-px text-[10px] font-semibold text-amber-600">
                        <AlertTriangle className="size-2.5" />
                        {isHe ? `מתחת לרף (${passBarFor(r.match.courseType)}) — יירשם כנכשל` : `Below ${passBarFor(r.match.courseType)} — will record as failed`}
                      </span>
                    ) : decision.status === "EXEMPT" ? (
                      <span className="rounded bg-emerald-400/10 px-1.5 py-px text-[10px] font-semibold text-emerald-600">
                        {isHe ? `יירשם כפטור: ${r.match.nameHe}` : `Will record as exempt: ${r.match.nameHe}`}
                      </span>
                    ) : decision.grade == null ? (
                      // "עובר" → COMPLETED with no grade
                      <span className="rounded bg-emerald-400/10 px-1.5 py-px text-[10px] font-semibold text-emerald-600">
                        {isHe ? "עובר — יירשם כהושלם בלי ציון" : "Pass — will record as completed, no grade"}
                      </span>
                    ) : r.overwritesGrade && !r.ambiguous && r.matchKind !== "fuzzy" ? (
                      // Re-upload diff (SC-4): the sheet REPLACES a recorded grade
                      // (e.g. after מועד ב'). Shown as an explicit old→new change,
                      // never pre-checked — the student ticks it deliberately.
                      <span className="rounded bg-amber-500/10 px-1.5 py-px text-[10px] font-semibold text-amber-600">
                        {isHe
                          ? <>רשום אצלכם <bdi dir="ltr">{r.match.currentGrade}</bdi> — בגיליון <bdi dir="ltr">{r.grade}</bdi>. סמנו כדי להחליף</>
                          : <>Recorded: {r.match.currentGrade} — sheet says {r.grade}. Tick to replace</>}
                      </span>
                    ) : r.autoApplySafe ? (
                      <span className="rounded bg-emerald-400/10 px-1.5 py-px text-[10px] font-semibold text-emerald-600">
                        {isHe ? `יעודכן: ${r.match.nameHe}` : `Will update: ${r.match.nameHe}`}
                      </span>
                    ) : (
                      // Low-confidence (fuzzy/ambiguous) — left unchecked; the
                      // student must confirm this is really the right course.
                      <span className="flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-px text-[10px] font-semibold text-amber-600">
                        <AlertTriangle className="size-2.5" />
                        {isHe ? `ודאו: ${r.match.nameHe}?` : `Verify: ${r.match.nameHe}?`}
                      </span>
                    )
                  ) : r.grade != null || r.passText ? (
                    // #10 (12.7) — a graded course that isn't in the plan (a
                    // general elective like דוגרי) can be ADDED right here.
                    <button
                      type="button"
                      disabled={addScannedMutation.isPending}
                      onClick={() => {
                        const sem = r.semester?.endsWith("/2") ? "SPRING" : "FALL";
                        // The sheet's semester header is "2025/1" (academic year /
                        // sitting). Derive the study-year from the student's own
                        // start year — hardcoding 1 misfiled every added elective
                        // under שנה א׳ (evening-wave verify). Fallback: their
                        // current year, never a blind 1.
                        const sheetYear = Number(r.semester?.split("/")[0]);
                        const startYear = profileQuery.data?.startYear ?? null;
                        const plannedYear =
                          Number.isFinite(sheetYear) && startYear
                            ? Math.min(3, Math.max(1, sheetYear - startYear + 1))
                            : (profileQuery.data?.currentYear ?? 1);
                        addScannedMutation.mutate(
                          {
                            courseCode: r.courseCode,
                            courseName: r.courseName,
                            credits: r.credits,
                            grade: r.grade,
                            plannedYear,
                            plannedSemester: sem,
                          },
                          {
                            onSuccess: (res) => {
                              toast.success(
                                isHe
                                  ? `${res.courseName} נוסף לתיק עם הציון מהגיליון`
                                  : `${res.courseName} added to your record with the sheet's grade`,
                              );
                              invalidatePlanData(utils);
                              setRows((prev) => prev?.filter((_, j) => j !== i) ?? prev);
                            },
                            onError: (e) => toast.error(e.message || (isHe ? "ההוספה נכשלה" : "Add failed")),
                          },
                        );
                      }}
                      className="flex items-center gap-1 rounded bg-accent-brand/10 px-2 py-0.5 text-[10px] font-bold text-accent-brand transition-colors hover:bg-accent-brand/20 disabled:opacity-50"
                    >
                      + {isHe ? "לא בתוכנית — הוסיפו לתיק" : "Not in plan — add to record"}
                    </button>
                  ) : r.match ? (
                    // #5 (12.7, sub-fix 5) — the course IS matched in the plan
                    // but the sheet row came back with no grade/pass-text.
                    // Saying "לא נמצא בתוכנית" here was factually wrong.
                    <span className="flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-px text-[10px] font-semibold text-amber-600">
                      <AlertTriangle className="size-2.5" />
                      {isHe
                        ? `בגיליון אין ציון ל${r.match.nameHe} — אם כבר יש ציון, הזינו אותו בתיק`
                        : `No grade on the sheet for ${r.match.nameHe} — enter it in the record if you have one`}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-px text-[10px] font-semibold text-amber-600">
                      <AlertTriangle className="size-2.5" />
                      {isHe ? "לא נמצא בתוכנית — עדכנו ידנית" : "Not in your plan — update manually"}
                    </span>
                  )}
                  {r.uncertain && (
                    // #5 — the two reads disagreed here (or one dropped the
                    // row). Loud, specific, and never pre-checked.
                    <span className="flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-px text-[10px] font-bold text-amber-700">
                      <AlertTriangle className="size-2.5" />
                      {isHe
                        ? r.otherGrade != null
                          ? <>בקריאה חוזרת יצא <bdi dir="ltr">{r.otherGrade}</bdi> — ודאו מול הגיליון</>
                          : "ודאו מול הגיליון — הקריאה לא הייתה חד-משמעית"
                        : r.otherGrade != null
                          ? `Second read gave ${r.otherGrade} — verify against the sheet`
                          : "Verify against the sheet — the read was ambiguous"}
                    </span>
                  )}
                  {applicable && isEnglish && (
                    <span className="rounded bg-foreground/5 px-1.5 py-px text-[10px] text-foreground/45">
                      {isHe ? "לא נספר בממוצע" : "not in average"}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            onClick={() => void applySelected()}
            disabled={applying || checked.size === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent-brand px-3 py-2 text-sm font-semibold text-accent-brand-fg transition-colors hover:bg-accent-brand-hover disabled:opacity-40"
          >
            {applying ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            {isHe ? `עדכן ${checked.size} ציונים מסומנים` : `Apply ${checked.size} selected`}
          </button>
        </div>
      )}
    </div>
  );
}
