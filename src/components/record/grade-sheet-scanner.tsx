"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { ScanLine, Loader2, Check, AlertTriangle, X, Languages, PenLine } from "lucide-react";
import { toast } from "sonner";
import { advisorError } from "@/lib/advisor-toast";
import { api } from "@/lib/trpc/react";
import { getEnglishLevelInfo, type EnglishLevel } from "@/lib/constants";
import {
  matchExtractedToCourses,
  decideApplication,
  decideAddition,
  placeScannedRow,
  passBarFor,
  reviseMatchedRow,
  type MatchedRow,
  type MatchedRowEdit,
  type UserCourseLite,
} from "@/lib/grade-sheet";
import type { ScanDiagnostics } from "@/lib/grade-sheet";
import { ScanDiagnosticsPanel } from "@/components/record/scan-diagnostics";
import { heCount, heNoun } from "@/lib/he-count";
import { getWrapTarget, wrapStorageKey } from "@/lib/semester-clock";
import { calculateGrades } from "@/lib/grade-calculator";
import { prefersHigherGrade, type MiluimGroupKey } from "@/lib/miluim";
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
  // 14.8 — the shape of what the scan read, so "it didn't pick up my grade"
  // becomes answerable instead of a shrug. See scan-diagnostics.tsx.
  const [diagnostics, setDiagnostics] = useState<ScanDiagnostics | null>(null);
  const [scanSummary, setScanSummary] = useState<{
    updated: number;
    /** #28 — electives the sheet had that weren't in the plan, now recorded. */
    added: number;
    failedGrades: number;
    average: number | null;
  } | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [applying, setApplying] = useState(false);
  // #5 (13.8) — which row's correction panel is open. One at a time: the course
  // picker lists every course in the student's plan, and rendering ~40 of those
  // for every one of up to 80 rows would make the review list crawl.
  const [editing, setEditing] = useState<number | null>(null);
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
    setEditing(null);
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
        diagnostics?: ScanDiagnostics | null;
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
      setDiagnostics(data.diagnostics ?? null);
      // #23 — offer the read-off English level only when it actually adds
      // something: present on the sheet AND not already the student's stored level.
      const current = profileQuery.data?.englishLevel ?? null;
      setScannedEnglish(
        data.englishLevel && data.englishLevel !== current ? data.englishLevel : null,
      );
      // Pre-check ONLY high-confidence, unambiguous matches (still requires a
      // grade — passText/EXEMPT rows are applicable but never auto-checked, so
      // a "עובר" is a deliberate tick). A fuzzy/ambiguous match stays unchecked.
      //
      // #28 — a graded row that matched NOTHING is an elective the student took
      // outside the seeded plan. It overwrites nothing, so it is pre-checked on
      // exactly the same terms as a safe update: only a clean PASS, never an
      // uncertain read and never a failure (a FAILED elective is a deliberate
      // tick, not something we record on the student's behalf).
      setChecked(
        new Set(
          matched
            .map((r, i) => {
              if (r.uncertain) return -1;
              if (r.autoApplySafe) return i;
              return decideAddition(r)?.status === "COMPLETED" ? i : -1;
            })
            .filter((i) => i >= 0),
        ),
      );
    } catch {
      advisorError(isHe ? "הסריקה לא הצליחה — נסו שוב. הציונים שלכם לא נגעו." : "The scan didn't work — try again. Your grades are untouched.");
    } finally {
      setScanning(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  /**
   * #5 (13.8) — a student correction to one row.
   *
   * The edit is written back into `rows` itself, which is the exact array
   * `applySelected` iterates. There is deliberately NO second "edits" state: a
   * parallel map of corrections is how an edited grade ends up displayed but
   * never saved, which is the whole bug being fixed here.
   */
  const editRow = (i: number, edit: MatchedRowEdit) => {
    if (!rows) return;
    const current = rows[i];
    if (!current) return;
    const revised = reviseMatchedRow(current, edit);
    if (revised === current) return; // out-of-range input — nothing changes
    const next = [...rows];
    next[i] = revised;
    setRows(next);
    // Keep the tick honest. A row the student just corrected into something
    // saveable is ticked (they told us what it should say — silently leaving it
    // out would lose the correction); a row they emptied can't be saved at all.
    const applicable = decideApplication(revised) != null || decideAddition(revised) != null;
    setChecked((s) => {
      const n = new Set(s);
      if (applicable) n.add(i);
      else n.delete(i);
      return n;
    });
  };

  const applySelected = async () => {
    if (!rows) return;
    setApplying(true);
    let ok = 0;
    let added = 0; // #28 — electives that weren't in the plan, now recorded
    let failed = 0;
    let failedGrades = 0; // rows written as FAILED — surfaced honestly (#30)
    let englishApplied = 0;
    for (const i of checked) {
      const r = rows[i];
      if (!r) continue;
      const decision = decideApplication(r);
      // #28 — an unmatched graded row is an ADDITION, not a no-op. Before this,
      // the loop `continue`d on `!r.match` and every elective on the sheet was
      // silently dropped from the bulk apply.
      const addition = decision ? null : decideAddition(r);
      if (!decision && !addition) continue;
      try {
        if (decision && r.match) {
          await updateMutation.mutateAsync({
            userCourseId: r.match.userCourseId,
            grade: decision.grade,
            status: decision.status,
          });
          ok++;
          if (decision.status === "FAILED") failedGrades++;
          if (r.match.courseType === "ENGLISH") englishApplied++;
        } else if (addition) {
          const place = placeScannedRow(
            r.semester,
            profileQuery.data?.startYear ?? null,
            profileQuery.data?.currentYear ?? null,
          );
          await addScannedMutation.mutateAsync({
            courseCode: addition.courseCode,
            courseName: addition.courseName,
            credits: addition.credits,
            grade: addition.grade,
            status: addition.status,
            plannedYear: place.plannedYear,
            plannedSemester: place.plannedSemester,
          });
          added++;
          if (addition.status === "FAILED") failedGrades++;
        }
      } catch (e) {
        failed++;
        if (failed === 1) {
          advisorError((e as { message?: string })?.message ?? (isHe ? "העדכון לא הצליח — השורות שכבר עודכנו נשמרו." : "The update didn't go through — rows already applied are saved."));
        }
      }
    }
    setApplying(false);
    if (ok > 0 || added > 0) {
      // Honest summary (#30): name what happened, not just a count.
      const parts: string[] = [];
      if (added > 0) {
        // #28 — say it out loud: these weren't in the plan and are now on record.
        parts.push(
          isHe
            ? heCount(added, {
                one: "קורס אחד שלא היה בתוכנית נוסף לתיק",
                many: `${added} קורסים שלא היו בתוכנית נוספו לתיק`,
              })
            : `${added} course${added === 1 ? "" : "s"} that ${added === 1 ? "wasn't" : "weren't"} in the plan ${added === 1 ? "was" : "were"} added to your record`,
        );
      }
      if (failedGrades > 0) {
        parts.push(
          isHe
            ? heCount(failedGrades, { one: "אחד נרשם כנכשל", many: `${failedGrades} נרשמו כנכשלים` })
            : `${failedGrades} recorded as failed`,
        );
      }
      if (englishApplied > 0) {
        parts.push(isHe ? "ציוני אנגלית אינם נספרים בממוצע" : "English grades don't count toward the average");
      }
      toast.success(
        isHe
          ? heCount(ok + added, {
              one: "נקלט קורס אחד מהגיליון",
              many: `נקלטו ${ok + added} קורסים מהגיליון`,
            })
          : `${ok + added} course${ok + added === 1 ? "" : "s"} taken from the sheet`,
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
      setEditing(null);
      setScannedEnglish(null);
      setAvgMismatch(null);
      setDiagnostics(null);
      invalidatePlanData(utils);
      // #4 — a personal wrap-up right after the scan lands: the fresh average
      // and what changed, computed deterministically from the updated plan
      // (never invented). Fetched AFTER the writes so the numbers are real.
      try {
        const fresh = await utils.plan.getUserPlan.fetch();
        const calc = calculateGrades((fresh?.courses ?? []) as unknown as UserCourseWithCourse[], {
          preferHigherGrade: prefersHigherGrade((profileQuery.data?.miluimGroup ?? "NONE") as MiluimGroupKey),
        });
        setScanSummary({ updated: ok, added, failedGrades, average: calc.courseAverage });
      } catch {
        setScanSummary({ updated: ok, added, failedGrades, average: null });
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

      {/* #30 — the "where do I get the sheet?" guide sits OUTSIDE the header's
          flex row. Inside it, the text column is `min-w-0 flex-1` and measures
          only 121px at 375px (the icon and the upload button take the rest), so
          a three-step guide wrapped into a 215px-tall ribbon. Out here it gets
          the card's full width, which is the whole point of a guide you are
          meant to follow while looking for the file. */}
      <div className="mt-2"><WhereIsMySheet /></div>

      {/* Review table — the student approves each row explicitly */}
      {scanSummary && !rows && (
        <div className="space-y-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-foreground/85">
            <Check className="size-4 text-emerald-500" />
            {isHe
              ? `הגיליון נקלט — ${heNoun(scanSummary.updated + scanSummary.added, "קורס", "קורסים")}`
              : `Sheet applied — ${scanSummary.updated + scanSummary.added} course${scanSummary.updated + scanSummary.added === 1 ? "" : "s"}`}
          </p>
          <div className="space-y-1 text-xs leading-relaxed text-foreground/70">
            {scanSummary.added > 0 && (
              // #28 — electives the plan never had. Named explicitly, because
              // "לא בתוכנית" used to mean "quietly not imported".
              <p>
                {isHe
                  ? `${heCount(scanSummary.updated, {
                      one: "קורס אחד מהתוכנית עודכן",
                      many: `${scanSummary.updated} קורסים מהתוכנית עודכנו`,
                    })}, ו${heCount(scanSummary.added, {
                      one: "קורס אחד שלא היה בתוכנית (בחירה כללית) נוסף",
                      many: `-${scanSummary.added} קורסים שלא היו בתוכנית (בחירה כללית) נוספו`,
                    })} לתיק עם הציון מהגיליון.`
                  : `${scanSummary.updated} planned courses updated, and ${scanSummary.added} courses that weren't in the plan were added with the sheet's grade.`}
              </p>
            )}
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
                  ? `${heCount(scanSummary.failedGrades, {
                      one: "קורס אחד נרשם כנכשל",
                      many: `${scanSummary.failedGrades} קורסים נרשמו כנכשלים`,
                    })} — בבדיקת-המסלול תראו מה זה אומר ומה אפשר לעשות.`
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
              {isHe
                ? `נמצאו ${rows.length} שורות — סמנו מה לשמור, ותקנו כל שורה שנקראה לא נכון:`
                : `Found ${rows.length} rows — pick what to save, and fix any row we misread:`}
            </p>
            <button type="button" onClick={() => { setRows(null); setEditing(null); setScannedEnglish(null); }} aria-label={isHe ? "סגירה" : "Close"} className="rounded-md p-1 text-foreground/30 hover:text-foreground/60">
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
          {diagnostics && <ScanDiagnosticsPanel d={diagnostics} isHe={isHe} />}
          <ul className="space-y-1.5">
            {rows.map((r, i) => {
              const decision = decideApplication(r);
              // #28 — an unmatched graded row is applicable too: it gets ADDED.
              // It is no longer a dead row with a separate button nobody pressed.
              const addition = decision ? null : decideAddition(r);
              const applicable = decision != null || addition != null;
              const isEnglish = r.match?.courseType === "ENGLISH";
              // The whole label toggles the row — an 18px checkbox alone is far
              // below the 44px touch target for the scanner's core interaction
              // (launch audit 24.7).
              const toggleRow = () => {
                if (!applicable) return;
                setChecked((s) => {
                  const n = new Set(s);
                  if (n.has(i)) n.delete(i);
                  else n.add(i);
                  return n;
                });
              };
              return (
                <li key={i} className={cn("flex min-h-11 flex-wrap items-center gap-2 rounded-lg border p-2 text-xs", r.match || addition ? "border-border/50" : "border-dashed border-border/50 opacity-70")}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={checked.has(i)}
                    aria-label={isHe ? `שמרו את ${r.courseName}` : `Save ${r.courseName}`}
                    disabled={!applicable}
                    onClick={toggleRow}
                    className={cn(
                      "flex size-4.5 shrink-0 items-center justify-center rounded border transition-colors disabled:opacity-30",
                      checked.has(i) ? "border-emerald-400 bg-emerald-400 text-white" : "border-foreground/25",
                    )}
                  >
                    {checked.has(i) && <Check className="size-3" />}
                  </button>
                  {/* #27 — course name, code and semester used to render as one
                      glued run ("מבוא ללוגיקה0618-1012 2025/1"): the name was a
                      bare text node and the only separation was a CSS margin,
                      which never reaches textContent (copy/paste, screen
                      readers) and reads as glued at small sizes. Every part is
                      now its own element with a REAL "·" separator between. */}
                  <span
                    className={cn("min-w-0 flex-1 self-stretch flex items-center gap-1.5 text-foreground/80", applicable && "cursor-pointer")}
                    dir="auto"
                    onClick={toggleRow}
                  >
                    <span className="truncate">{r.courseName}</span>
                    {r.courseCode && (
                      <span className="shrink-0 text-foreground/40" dir="ltr">
                        {"· "}
                        {r.courseCode}
                      </span>
                    )}
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
                  ) : addition ? (
                    // #28 — a graded course that isn't in the plan (a general
                    // elective like דוגרי, משבר האקלים וקיימות, a Python course).
                    // This used to be a separate "+ הוסיפו לתיק" button that the
                    // bulk apply ignored, so pressing "עדכנו" left every elective
                    // behind. It is now a normal, tickable row like any other —
                    // the badge DECLARES what will be written before it happens.
                    addition.status === "FAILED" ? (
                      <span className="flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-px text-[10px] font-semibold text-amber-600">
                        <AlertTriangle className="size-2.5" />
                        {isHe ? "לא בתוכנית — יתווסף לתיק כנכשל" : "Not in plan — will be added as failed"}
                      </span>
                    ) : addition.status === "EXEMPT" ? (
                      <span className="rounded bg-accent-brand/10 px-1.5 py-px text-[10px] font-semibold text-accent-brand">
                        {isHe ? "לא בתוכנית — יתווסף לתיק כפטור" : "Not in plan — will be added as exempt"}
                      </span>
                    ) : (
                      <span className="rounded bg-accent-brand/10 px-1.5 py-px text-[10px] font-semibold text-accent-brand">
                        {isHe ? "לא בתוכנית — יתווסף לתיק עם הציון" : "Not in plan — will be added with the grade"}
                      </span>
                    )
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
                      {isHe ? "לא נכנס לממוצע התואר" : "not in the degree average"}
                    </span>
                  )}

                  {/* #5 (13.8) — the correction control. Every row can be fixed
                      BEFORE anything is written: the grade we read, the ש״ס on
                      an off-plan course, and which course of yours the row
                      really belongs to. */}
                  <button
                    type="button"
                    onClick={() => setEditing((cur) => (cur === i ? null : i))}
                    aria-expanded={editing === i}
                    aria-controls={`scan-edit-${i}`}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-semibold transition-colors",
                      editing === i
                        ? "bg-accent-brand/15 text-accent-brand"
                        : "text-foreground/45 hover:bg-foreground/5 hover:text-foreground/70",
                    )}
                  >
                    <PenLine className="size-3" />
                    {isHe ? "תיקון" : "Fix"}
                  </button>

                  {editing === i && (
                    <div
                      id={`scan-edit-${i}`}
                      className="mt-1 w-full space-y-2 rounded-lg border border-accent-brand/25 bg-accent-brand/[0.04] p-2.5"
                    >
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="flex flex-col gap-1">
                          {/* No "0–100" in the Hebrew label: a digit-dash-digit
                              range inside an RTL line renders reversed. The
                              range is stated below, with a Hebrew word between
                              the two numbers so their order survives. */}
                          <label htmlFor={`scan-grade-${i}`} className="text-[10px] font-semibold text-foreground/60">
                            {isHe ? "ציון" : "Grade (0-100)"}
                          </label>
                          <input
                            id={`scan-grade-${i}`}
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={100}
                            step={1}
                            dir="ltr"
                            value={r.grade ?? ""}
                            onChange={(e) => {
                              const raw = e.target.value;
                              if (raw === "") {
                                editRow(i, { grade: null });
                                return;
                              }
                              const n = Number(raw);
                              // Out of range is REJECTED, never clamped — a
                              // clamp would invent a grade the sheet doesn't
                              // show. reviseMatchedRow enforces this too.
                              if (!Number.isFinite(n)) return;
                              editRow(i, { grade: n });
                            }}
                            className="w-20 rounded-md border border-border bg-background px-2 py-1.5 text-center font-mono text-sm text-foreground focus:border-accent-brand focus:outline-none focus:ring-1 focus:ring-accent-brand/40"
                          />
                        </div>

                        {/* ש״ס are only ever WRITTEN for an off-plan addition —
                            a course already in the plan takes its ש״ס from the
                            catalog, so offering to edit them there would be a
                            control that changes nothing. */}
                        {!r.match && (
                          <div className="flex flex-col gap-1">
                            <label htmlFor={`scan-credits-${i}`} className="text-[10px] font-semibold text-foreground/60">
                              {isHe ? "ש״ס" : "Credits"}
                            </label>
                            <input
                              id={`scan-credits-${i}`}
                              type="number"
                              inputMode="decimal"
                              min={0}
                              max={20}
                              step={0.5}
                              dir="ltr"
                              value={r.credits ?? ""}
                              onChange={(e) => {
                                const raw = e.target.value;
                                if (raw === "") {
                                  editRow(i, { credits: null });
                                  return;
                                }
                                const n = Number(raw);
                                if (!Number.isFinite(n)) return;
                                editRow(i, { credits: n });
                              }}
                              className="w-20 rounded-md border border-border bg-background px-2 py-1.5 text-center font-mono text-sm text-foreground focus:border-accent-brand focus:outline-none focus:ring-1 focus:ring-accent-brand/40"
                            />
                          </div>
                        )}

                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <label htmlFor={`scan-match-${i}`} className="text-[10px] font-semibold text-foreground/60">
                            {isHe ? "לאיזה קורס שלכם זה שייך" : "Which of your courses this is"}
                          </label>
                          <select
                            id={`scan-match-${i}`}
                            value={r.match?.userCourseId ?? ""}
                            onChange={(e) => {
                              const id = e.target.value;
                              editRow(i, {
                                match: id
                                  ? (userCourses.find((c) => c.userCourseId === id) ?? null)
                                  : null,
                              });
                            }}
                            className="w-full min-w-40 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:border-accent-brand focus:outline-none focus:ring-1 focus:ring-accent-brand/40"
                          >
                            <option value="">
                              {isHe ? "לא בתוכנית — יתווסף כקורס חדש" : "Not in the plan — add as a new course"}
                            </option>
                            {userCourses.map((c) => (
                              <option key={c.userCourseId} value={c.userCourseId}>
                                {c.nameHe} · {c.courseCode}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <p className="text-[10px] leading-relaxed text-foreground/45">
                        {isHe
                          ? "ציון תקין הוא 0 עד 100. מה שתתקנו כאן הוא מה שיישמר; כדי לוותר על השורה — הסירו את הסימון שלה."
                          : "A valid grade is 0 to 100. What you fix here is what gets saved; to leave a row out, un-tick it."}
                      </p>
                    </div>
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
            {isHe ? `שמרו ${checked.size} שורות מסומנות` : `Save ${checked.size} selected`}
          </button>
        </div>
      )}
    </div>
  );
}
