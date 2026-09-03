"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { ScanLine, Loader2, GraduationCap, AlertTriangle, Check, PenLine, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Bidi } from "@/lib/bidi";
import { fileToBase64, SCANNER_ACCEPT } from "@/lib/upload";
import { matchExtractedToCatalog } from "@/lib/grade-sheet";
import type { ExtractedRow, ScanDiagnostics } from "@/lib/grade-sheet";
import { ScanDiagnosticsPanel } from "@/components/record/scan-diagnostics";
import { ScanGapBanner } from "@/components/record/scan-gap-banner";
import { aggregateStanding, buildCompletedSeed, formatSheetSemester, groupRowsBySemester, manualStandingRow, reviseStandingRow, summarizeStanding, type StandingRowEdit, type StandingSummary } from "@/lib/onboarding-standing";
import { DISCIPLINE_CONFIG, FOCUS_DISCIPLINE_IDS, YEAR_CONFIG, SEMESTER_CONFIG } from "@/lib/constants";
import { getPlanningAnchor } from "@/lib/academic-calendar";
import { WhereIsMySheet } from "@/components/record/where-is-my-sheet";
import type { CourseWithSchedule } from "@/lib/plan-generator";
import type { CompletedCourse } from "./step-history";
import { heNoun, heNounF } from "@/lib/he-count";
import { sheetSemesterLabel } from "@/lib/sheet-semester-label";

// ─────────────────────────────────────────────────────────────────────────
// #11 + #26 — the FIRST question of onboarding.
//
// Before this step existed, every registrant was marched through "build your
// year-1 semester-א׳ timetable". For the majority — students already 1, 2 or 3
// years in — that is a screen full of courses they finished long ago, and a
// whole timetable to hand-edit before the app knows a thing about them.
//
// So we ask one question up front, and for a returning student we read the
// official grade sheet instead of making them type. The scan is AI-backed and
// can fail or misread, so this screen is built to degrade honestly:
//   · A failed scan SAYS it failed and hands over to the manual path.
//   · Nothing is written here. The seed goes to the review step, which the
//     student can edit, and the single save still happens at the very end.
//   · Every number shown is counted from the sheet or the catalog — never
//     estimated, never rounded up.
// ─────────────────────────────────────────────────────────────────────────

export type StandingChoice = "fresh" | "returning";

export interface StandingResult {
  choice: StandingChoice;
  /** Present only when a scan succeeded AND the student confirmed it. */
  year?: number;
  semester?: "FALL" | "SPRING";
  englishLevel?: string | null;
  completedSeed?: Record<string, CompletedCourse>;
  /** True when the seed came from a real sheet — downstream must then stop
   *  pre-filling mandatory courses by assumption (the sheet is the truth). */
  fromSheet?: boolean;
}

interface StepStandingProps {
  allCourses: CourseWithSchedule[];
  isLoadingCourses: boolean;
  onDone: (result: StandingResult) => void;
  onBack: () => void;
}

type ScanState =
  | { kind: "idle" }
  | { kind: "scanning" }
  | { kind: "failed"; message: string }
  | { kind: "done"; summary: StandingSummary };

export function StepStanding({ allCourses, isLoadingCourses, onDone, onBack }: StepStandingProps) {
  const isHe = useLocale() === "he";
  const [mode, setMode] = useState<"ask" | "upload">("ask");
  const [scan, setScan] = useState<ScanState>({ kind: "idle" });
  const [englishLevel, setEnglishLevel] = useState<string | null>(null);
  /** #5 — the scanner compares the grades it read against the ממוצע משוקלל
   *  printed on the sheet. The API has always returned that check; this screen
   *  used to drop it on the floor, so the one signal that a grade went missing
   *  never reached the student reviewing the scan. */
  const [averageMismatch, setAverageMismatch] = useState<{ computed: number; printed: number } | null>(null);
  // 14.8 — what the scan actually did, so "it didn't pick up my grade" stops
  // being undiagnosable. Collapsed by default; nobody has to read it.
  const [diagnostics, setDiagnostics] = useState<ScanDiagnostics | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const upcomingSemester = useMemo(() => getPlanningAnchor().semester, []);

  const handleFile = useCallback(
    async (file: File) => {
      setScan({ kind: "scanning" });
      setAverageMismatch(null);
      try {
        const { b64, mime } = await fileToBase64(file);
        if (b64.length > 5_000_000) {
          setScan({
            kind: "failed",
            message: isHe
              ? "הקובץ גדול מדי. צלמו את טבלת הציונים עצמה, או הורידו את הגיליון כ-PDF."
              : "The file is too large. Photograph the grades table itself, or download the sheet as a PDF.",
          });
          return;
        }
        const res = await fetch("/api/ai/scan-grades", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: b64, mimeType: mime }),
        });
        const payload = (await res.json()) as {
          rows?: (ExtractedRow & { uncertain?: boolean; otherGrade?: number | null })[];
          englishLevel?: string | null;
          averageMismatch?: { computed: number; printed: number } | null;
          diagnostics?: ScanDiagnostics | null;
          error?: string;
        };
        if (!res.ok) {
          setScan({
            kind: "failed",
            message:
              payload.error ??
              (isHe ? "הסריקה לא הצליחה." : "The scan didn't work."),
          });
          return;
        }
        const rows = payload.rows ?? [];
        if (rows.length === 0) {
          setScan({
            kind: "failed",
            message: isHe
              ? "לא הצלחנו לקרוא שורות קורס מהקובץ הזה."
              : "We couldn't read any course rows from this file.",
          });
          return;
        }
        const matched = matchExtractedToCatalog(rows, allCourses);
        const summary = summarizeStanding({
          rows,
          catalog: allCourses,
          matches: matched.map((m) => m.course),
          upcomingSemester,
        });
        setEnglishLevel(payload.englishLevel ?? null);
        setAverageMismatch(payload.averageMismatch ?? null);
        setDiagnostics(payload.diagnostics ?? null);
        setScan({ kind: "done", summary });
      } catch {
        setScan({
          kind: "failed",
          message: isHe
            ? "משהו נכשל בדרך לסורק. ייתכן שזו בעיית רשת רגעית."
            : "Something failed on the way to the scanner. It may be a passing network issue.",
        });
      } finally {
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    [allCourses, isHe, upcomingSemester],
  );

  // ── #5/#7 (13.8) — the review is EDITABLE, and it happens here, once ──
  //
  // The edit is applied to the summary this screen is holding, and the summary
  // is then RE-AGGREGATED from its rows. That matters: `confirmScan` below
  // seeds the whole degree from `summary.completed`, so a correction that lived
  // in some side state would be displayed and then thrown away on confirm —
  // which is exactly the bug being fixed.
  const editRow = useCallback(
    (index: number, edit: StandingRowEdit) => {
      setScan((s) => {
        if (s.kind !== "done") return s;
        const current = s.summary.rows[index];
        if (!current) return s;
        const revised = reviseStandingRow(current, edit);
        if (revised === current) return s; // out-of-range input — nothing changes
        const rows = [...s.summary.rows];
        rows[index] = revised;
        return { kind: "done", summary: aggregateStanding(rows, allCourses, upcomingSemester) };
      });
    },
    [allCourses, upcomingSemester],
  );

  /** A course the scan missed entirely — the capability the history step used
   *  to own. `course` null = a real course outside the PPE catalog. */
  const addRow = useCallback(
    (course: CourseWithSchedule | null, name: string) => {
      setScan((s) => {
        if (s.kind !== "done") return s;
        const row = manualStandingRow(course, name);
        if (s.summary.rows.some((r) => r.key === row.key)) return s; // already listed
        const rows = [...s.summary.rows, row];
        return { kind: "done", summary: aggregateStanding(rows, allCourses, upcomingSemester) };
      });
    },
    [allCourses, upcomingSemester],
  );

  const confirmScan = useCallback(
    (summary: StandingSummary) => {
      const placement = summary.placement;
      if (!placement) {
        // No basis for a year → send them to the manual path rather than guess.
        onDone({ choice: "returning" });
        return;
      }
      onDone({
        choice: "returning",
        year: placement.year,
        semester: placement.semester,
        englishLevel,
        completedSeed: buildCompletedSeed(summary, placement) as Record<string, CompletedCourse>,
        fromSheet: true,
      });
    },
    [onDone, englishLevel],
  );

  // ── The question ──────────────────────────────────────────────────────
  if (mode === "ask") {
    return (
      <div className="flex flex-col items-center">
        <div className="animate-stagger-1 text-center">
          <h2 className="font-display text-2xl font-bold text-foreground/90">
            {isHe ? "לפני שנתחיל — איפה אתם בתואר?" : "Before we start — where are you in the degree?"}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-foreground/60">
            {isHe
              ? "התשובה קובעת מה נבנה יחד. סטודנטים שכבר למדו לא צריכים לבנות מערכת של שנה א׳ מחדש."
              : "Your answer decides what we build together. If you've already studied, you shouldn't have to rebuild a first-year timetable."}
          </p>
        </div>

        <div className="mt-8 grid w-full max-w-2xl gap-3 sm:grid-cols-2">
          {/* Returning — the path this whole step exists for. */}
          <button
            type="button"
            onClick={() => setMode("upload")}
            className="animate-stagger-2 flex flex-col items-start gap-2 rounded-2xl border-2 border-accent-brand/40 bg-accent-brand/[0.06] p-5 text-start transition-all hover:border-accent-brand/60 hover:bg-accent-brand/10"
          >
            <span className="flex size-10 items-center justify-center rounded-xl bg-accent-brand/12 text-accent-brand">
              <ScanLine className="size-5" />
            </span>
            <span className="font-display text-base font-bold text-foreground/90">
              {isHe ? "כבר יש לכם ש״ס" : "I already have credits"}
            </span>
            <span className="text-sm leading-relaxed text-foreground/60">
              {isHe
                ? "העלו את גיליון הציונים ופכמון יקרא ממנו מה כבר עשיתם, מה נכשל, איפה אתם באנגלית וכמה ש״ס נצברו — ויתחיל מהנקודה שלכם."
                : "Upload your grade sheet and we'll read what you've done, what you failed, your English status and the credits you've earned — then start from where you actually are."}
            </span>
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-accent-brand/6 px-2.5 py-1 text-[11px] font-semibold text-accent-brand">
              {isHe ? "הדרך המהירה" : "The fast path"}
            </span>
          </button>

          {/* Fresh */}
          <button
            type="button"
            onClick={() => onDone({ choice: "fresh" })}
            className="animate-stagger-2 flex flex-col items-start gap-2 rounded-2xl border-2 border-border bg-card p-5 text-start transition-all hover:border-foreground/30"
          >
            <span className="flex size-10 items-center justify-center rounded-xl bg-foreground/8 text-foreground/70">
              <GraduationCap className="size-5" />
            </span>
            <span className="font-display text-base font-bold text-foreground/90">
              {isHe ? "מתחילים את התואר עכשיו" : "I'm starting the degree now"}
            </span>
            <span className="text-sm leading-relaxed text-foreground/60">
              {isHe
                ? "שנה א׳, בלי קורסים קודמים. נבנה יחד את המערכת של הסמסטר הראשון שלכם."
                : "Year 1, no previous courses. We'll build your first semester's timetable together."}
            </span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => onDone({ choice: "returning" })}
          className="animate-stagger-3 mt-5 inline-flex items-center gap-1.5 text-sm text-foreground/60 underline-offset-4 transition-colors hover:text-foreground/70 hover:underline"
        >
          <PenLine className="size-3.5" />
          {isHe
            ? "כבר למדתם, אבל הגיליון לא זמין עכשיו — נמלא ידנית"
            : "I've studied, but I don't have the sheet now — I'll fill it in manually"}
        </button>

        <button
          type="button"
          onClick={onBack}
          className="mt-6 rounded-lg px-4 py-2 text-sm text-foreground/70 transition-colors hover:bg-foreground/5 hover:text-foreground/90"
        >
          {isHe ? "חזרה" : "Back"}
        </button>
      </div>
    );
  }

  // ── Upload + result ───────────────────────────────────────────────────
  return (
    <div className="flex w-full flex-col items-center">
      <div className="animate-stagger-1 text-center">
        <h2 className="font-display text-2xl font-bold text-foreground/90">
          {scan.kind === "done"
            ? isHe
              ? "זה מה שקראנו מהגיליון"
              : "Here's what we read from your sheet"
            : isHe
              ? "העלו את גיליון הציונים"
              : "Upload your grade sheet"}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-foreground/60">
          {scan.kind === "done"
            ? isHe
              ? "זו הפעם היחידה שתעברו על הגיליון — תקנו כאן כל שורה שנקראה לא נכון, והוסיפו קורס שפספסנו. שום דבר לא נשמר עד סוף ההרשמה."
              : "This is the one pass over your sheet — fix any row we misread right here, and add a course we missed. Nothing is saved until signup ends."
            : isHe
              ? "אישור קורסים וציונים מהאוניברסיטה — כקובץ PDF או כצילום ברור של הטבלה."
              : "Your official course-and-grades confirmation — as a PDF, or a clear photo of the table."}
        </p>
      </div>

      <div className="mt-6 w-full max-w-2xl space-y-4">
        {scan.kind !== "done" && (
          <div className="rounded-2xl border border-border bg-card/50 p-5">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={scan.kind === "scanning" || isLoadingCourses}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent-brand px-6 py-3.5 text-sm font-bold text-accent-brand-fg transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {scan.kind === "scanning" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ScanLine className="size-4" />
              )}
              {scan.kind === "scanning"
                ? isHe
                  ? "קוראים את הגיליון…"
                  : "Reading the sheet…"
                : isHe
                  ? "בחרו קובץ וסרקו"
                  : "Choose a file and scan"}
            </button>
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
            {scan.kind === "scanning" && (
              <p className="mt-3 text-center text-xs text-foreground/60">
                {isHe
                  ? "אנחנו קוראים את הטבלה פעמיים ומשווים בין הקריאות, כדי שציון לא ינחת על הקורס הלא נכון. זה לוקח כמה שניות."
                  : "We read the table twice and compare the readings, so a grade never lands on the wrong course. It takes a few seconds."}
              </p>
            )}
            <div className="mt-3">
              <WhereIsMySheet />
            </div>
          </div>
        )}

        {/* Honest failure — never a silent dead end. */}
        {scan.kind === "failed" && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-4">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-amber" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground/85">
                  {isHe ? "הסריקה לא הצליחה" : "The scan didn't succeed"}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-foreground/60">{scan.message}</p>
                <p className="mt-2 text-xs text-foreground/60">
                  {isHe
                    ? "לא המצאנו כלום במקום. אפשר לנסות קובץ אחר, או להמשיך ולסמן ידנית — זה לוקח יותר זמן אבל מגיע לאותה תוצאה."
                    : "We invented nothing in its place. Try another file, or continue and mark your courses manually — slower, same result."}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setScan({ kind: "idle" })}
                    className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background transition-transform hover:scale-[1.02]"
                  >
                    {isHe ? "לנסות קובץ אחר" : "Try another file"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDone({ choice: "returning" })}
                    className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground/70 transition-colors hover:border-foreground/30"
                  >
                    {isHe ? "להמשיך ולמלא ידנית" : "Continue manually"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {scan.kind === "done" && (
          <StandingSummaryCard
            summary={scan.summary}
            englishLevel={englishLevel}
            averageMismatch={averageMismatch}
            isHe={isHe}
            allCourses={allCourses}
            onEditRow={editRow}
            onAddRow={addRow}
            onConfirm={() => confirmScan(scan.summary)}
            onRedo={() => setScan({ kind: "idle" })}
            onManual={() => onDone({ choice: "returning" })}
          />
        )}

        {/* The gap banner sits ABOVE the collapsed diagnostics on purpose: a
            missing course is not a diagnostic, it is the student's decision to
            make before they confirm. */}
        {scan.kind === "done" && diagnostics && (
          <>
            <ScanGapBanner
              d={diagnostics}
              isHe={isHe}
              courseNameFor={(code) =>
                allCourses.find((c) => c.code === code)?.nameHe ?? null
              }
            />
            <ScanDiagnosticsPanel d={diagnostics} isHe={isHe} />
          </>
        )}
      </div>

      {scan.kind !== "done" && (
        <button
          type="button"
          onClick={() => (scan.kind === "scanning" ? undefined : setMode("ask"))}
          disabled={scan.kind === "scanning"}
          className="mt-6 rounded-lg px-4 py-2 text-sm text-foreground/70 transition-colors hover:bg-foreground/5 hover:text-foreground/90 disabled:opacity-40"
        >
          {isHe ? "חזרה" : "Back"}
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// The standing summary — #26's real payoff. Every line here is a COUNT of
// something on the sheet or in the catalog. No estimate, no projection.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Hebrew doesn't say "1 קורסים". These counts are read out loud in sentences,
 * so a count of one gets the singular noun and no numeral — otherwise the
 * summary reads like a machine, which is precisely the broken-Hebrew class of
 * defect the copy rules exist to stop.
 */
function countPhrase(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural;
}

function StandingSummaryCard({
  summary,
  englishLevel,
  averageMismatch,
  isHe,
  allCourses,
  onEditRow,
  onAddRow,
  onConfirm,
  onRedo,
  onManual,
}: {
  summary: StandingSummary;
  englishLevel: string | null;
  averageMismatch: { computed: number; printed: number } | null;
  isHe: boolean;
  allCourses: CourseWithSchedule[];
  onEditRow: (index: number, edit: StandingRowEdit) => void;
  onAddRow: (course: CourseWithSchedule | null, name: string) => void;
  onConfirm: () => void;
  onRedo: () => void;
  onManual: () => void;
}) {
  // One open editor at a time: the course picker lists the whole PPE catalog,
  // and rendering it inside every row would make a 40-row sheet crawl.
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    const already = new Set(summary.rows.map((r) => r.key));
    return allCourses
      .filter((c) => !already.has(c.code))
      .filter((c) => `${c.code} ${c.nameHe ?? ""} ${c.nameEn ?? ""}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [search, allCourses, summary.rows]);

  // #2b — the sheet is printed in semester blocks, so the review is read in
  // them too. Every row keeps its index in the flat list, so the per-row
  // controls (tick, grade, ש״ס, re-match) are untouched by the grouping.
  const semesterGroups = useMemo(() => groupRowsBySemester(summary.rows), [summary.rows]);

  const p = summary.placement;
  const yearLabel = p
    ? isHe
      ? YEAR_CONFIG[p.year as 1 | 2 | 3]?.nameHe
      : YEAR_CONFIG[p.year as 1 | 2 | 3]?.nameEn
    : null;
  const semLabel = p
    ? isHe
      ? SEMESTER_CONFIG[p.semester]?.nameHe
      : SEMESTER_CONFIG[p.semester]?.nameEn
    : null;

  // Focus areas the student already has credits in — ordered, so the strongest
  // one is first. Purely a count of completed catalog courses.
  const focusRows = FOCUS_DISCIPLINE_IDS.map((id) => ({
    id,
    credits: summary.creditsByDiscipline[id] ?? 0,
    cfg: DISCIPLINE_CONFIG[id],
  }))
    .filter((r) => r.credits > 0)
    .sort((a, b) => b.credits - a.credits);

  return (
    <div className="space-y-4">
      {/* Headline standing */}
      <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.05] p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/12 text-status-green">
            <Check className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-base font-bold text-foreground/90">
              {isHe
                ? countPhrase(
                    summary.completed.length,
                    "קראנו קורס אחד שהושלם",
                    `קראנו ${heNoun(summary.completed.length, "קורס", "קורסים")} שהושלמו`,
                  )
                : `We read ${summary.completed.length} completed course${summary.completed.length === 1 ? "" : "s"}`}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-foreground/60">
              <Bidi
                text={
                  isHe
                    ? `${summary.creditsEarned} ש״ס נצברו · ${summary.mandatoryDone} מתוך ${summary.mandatoryTotal} קורסי חובה · ${summary.electiveCredits} ש״ס בחירה`
                    : `${summary.creditsEarned} credits earned · ${summary.mandatoryDone} of ${summary.mandatoryTotal} mandatory courses · ${summary.electiveCredits} elective credits`
                }
              />
            </p>
          </div>
        </div>

        {/* Where this puts them — the whole point of #11. */}
        {p && (
          <div className="mt-4 rounded-xl border border-border bg-card/60 p-3.5">
            <p className="text-sm font-semibold text-foreground/85">
              {isHe
                ? `לפי זה אתם ב${yearLabel} — ונבנה יחד את ${semLabel}`
                : `That puts you in ${yearLabel} — and we'll build ${semLabel} together`}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-foreground/60">
              {/* Ariel, 21.8: "אני לא אוהב את המטא טקסט הזה. המשתמש לא צריך
                  לדעת את התהליכים מאחורי הקלעים ברוב המקרים".
                  He is right. "הסקנו את זה מכותרות-הסמסטר שבגיליון" describes
                  OUR procedure, not his situation — it is the app narrating its
                  own plumbing. What he needs to know is what we concluded and
                  how to fix it if we got it wrong. The one case worth
                  explaining is the GAP, because there the conclusion is
                  genuinely uncertain and he has to check it. */}
              {p.basis === "sheet" && p.lastSheetSemester ? (
                <Bidi
                  text={
                    isHe
                      ? `הסמסטר האחרון שמופיע בגיליון שלכם הוא ${formatSheetSemester(p.lastSheetSemester) ?? ""}.`
                      : `The last semester on your sheet is ${formatSheetSemester(p.lastSheetSemester, false) ?? ""}.`
                  }
                />
              ) : p.basis === "gap" ? (
                <Bidi
                  text={
                    isHe
                      ? `יש רווח בין הסמסטר האחרון בגיליון (${formatSheetSemester(p.lastSheetSemester) ?? ""}) לסמסטר הקרוב — אולי סמסטר שלא למדתם בו. שווה לוודא שהשנה נכונה, ואפשר לתקן במסך הבא.`
                      : `There's a gap between the last semester on your sheet (${formatSheetSemester(p.lastSheetSemester, false) ?? ""}) and the upcoming one — perhaps a semester you sat out. Worth checking the year is right; you can correct it on the next screen.`
                  }
                />
              ) : (
                <>
                  {isHe
                    ? "בגיליון לא היו כותרות-סמסטר שיכולנו לקרוא, אז הסקנו את השנה מכמות הש״ס. זו הערכה — תקנו אותה במסך הבא אם היא לא מדויקת."
                    : "The sheet had no semester headers we could read, so we inferred the year from the credit count. That's an estimate — correct it on the next screen if it's off."}
                </>
              )}
            </p>
          </div>
        )}

        {!p && (
          <p className="mt-3 text-sm text-foreground/60">
            {isHe
              ? "לא הצלחנו להסיק מהגיליון באיזו שנה אתם. תבחרו אותה בעצמכם במסך הבא."
              : "We couldn't tell which year you're in from the sheet. You'll pick it yourself on the next screen."}
          </p>
        )}
      </div>

      {/* #5/#2a — the sheet prints its own weighted average. When what we read
          doesn't add up to it, a grade was misread or missed — which is exactly
          how a passed course ends up here with no grade. Say it out loud. */}
      {averageMismatch && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-4">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-amber" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground/85">
                {isHe
                  ? "יש פער מול הממוצע שמודפס בגיליון"
                  : "There's a gap against the average printed on your sheet"}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-foreground/60">
                <Bidi
                  text={
                    isHe
                      ? `בגיליון מודפס ממוצע ${averageMismatch.printed}, ומהציונים שקראנו יוצא ${averageMismatch.computed}. סביר שציון אחד נקרא לא נכון, או שקורס שכבר קיבל ציון נקרא כאילו אין לו — עברו על השורות למטה ותקנו את מה שצריך.`
                      : `Your sheet prints an average of ${averageMismatch.printed}, and the grades we read give ${averageMismatch.computed}. A grade was probably misread, or a graded course was read as if it had none — go over the rows below and fix what needs fixing.`
                  }
                />
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Focus-area standing */}
      {focusRows.length > 0 && (
        <div className="rounded-2xl border border-border bg-card/50 p-4">
          <p className="text-sm font-semibold text-foreground/80">
            {isHe ? "ש״ס שכבר צברתם בכל תחום" : "Credits you've earned per area"}
          </p>
          <p className="mt-0.5 text-xs text-foreground/60">
            {isHe
              ? "כולל קורסים שנספרים לכמה תחומים. תחום המיקוד עצמו נבחר במסך הבא."
              : "Includes courses that count toward several areas. You'll pick your focus area on the next screen."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {focusRows.map((r) => (
              <span
                key={r.id}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold",
                  r.cfg?.badgeClass ?? "bg-foreground/8 text-foreground/70",
                )}
              >
                {isHe ? r.cfg?.nameHe : r.cfg?.nameEn}
                <bdi dir="ltr" className="font-mono">
                  {r.credits}
                </bdi>
                {isHe ? "ש״ס" : "cr."}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Everything the scan found that is NOT a completion. Shown, never hidden,
          and explicitly NOT written as completed. */}
      {(summary.failed.length > 0 ||
        summary.inProgress.length > 0 ||
        summary.unclear.length > 0 ||
        summary.exempt.length > 0 ||
        summary.uncertain.length > 0 ||
        englishLevel) && (
        <div className="rounded-2xl border border-border bg-card/50 p-4">
          <p className="text-sm font-semibold text-foreground/80">
            {isHe ? "דברים נוספים שקראנו" : "Other things we read"}
          </p>
          <ul className="mt-2 space-y-2 text-sm text-foreground/60">
            {englishLevel && (
              <li className="flex items-start gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-foreground/25" />
                <span>
                  {isHe
                    ? "רמת האנגלית מודפסת בגיליון — נעדכן אותה בפרופיל שלכם, והיא גוברת על ציון אמירם."
                    : "Your English level is printed on the sheet — we'll set it on your profile, and it overrides the AMIRANT score."}
                </span>
              </li>
            )}
            {summary.inProgress.length > 0 && (
              <li className="flex items-start gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-foreground/25" />
                <span>
                  <Bidi
                    text={
                      isHe
                        ? summary.inProgress.length === 1
                          ? "קורס אחד מופיע בגיליון בלי ציון (***), ולכן הוא לא נרשם כהושלם. אם כבר קיבלתם בו ציון — הזינו אותו ברשימה למטה והוא ייחשב כהושלם."
                          : `${summary.inProgress.length === 1 ? "קורס אחד מופיע" : `${summary.inProgress.length} קורסים מופיעים`} בגיליון בלי ציון (***), ולכן הם לא נרשמים כהושלמו. אם כבר קיבלתם ציון באחד מהם — הזינו אותו ברשימה למטה והוא ייחשב כהושלם.`
                        : `${summary.inProgress.length} appear on the sheet with no grade (***), so they aren't recorded as completed. If one of them is already graded, enter the grade in the list below and it will count.`
                    }
                  />
                </span>
              </li>
            )}
            {summary.unclear.length > 0 && (
              // A row we could not read a verdict from is NOT the same as a row
              // the sheet says is still being studied. Saying "בלימוד" for it
              // would be asserting something the document never said.
              <li className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-status-amber" />
                <span>
                  <Bidi
                    text={
                      isHe
                        ? summary.unclear.length === 1
                          ? "שורה אחת הגיעה בלי ציון ובלי סימן מעבר, אז לא קבענו לה שום מצב. היא לא נספרת — הזינו את הציון ברשימה למטה, או הסירו את הסימון שלה."
                          : `${heNounF(summary.unclear.length, "שורה", "שורות")} הגיעו בלי ציון ובלי סימן מעבר, אז לא קבענו להן שום מצב. הן לא נספרות — הזינו את הציונים ברשימה למטה, או הסירו את הסימון שלהן.`
                        : summary.unclear.length === 1
                          ? "One row came back with no grade and no pass mark, so we decided nothing about it. It counts for nothing — enter its grade in the list below, or un-tick it."
                          : `${summary.unclear.length} rows came back with no grade and no pass mark, so we decided nothing about them. They count for nothing — enter their grades in the list below, or un-tick them.`
                    }
                  />
                </span>
              </li>
            )}
            {summary.failed.length > 0 && (
              <li className="flex items-start gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-500/60" />
                <span>
                  <Bidi
                    text={
                      isHe
                        ? summary.failed.length === 1
                          ? 'קורס אחד לא עבר את סף המעבר — לא נרשם כהושלם. אפשר להוסיף אותו אחרי ההרשמה במסך "התיק".'
                          : `${heNoun(summary.failed.length, "קורס", "קורסים")} לא עברו את סף המעבר — לא נרשמים כהושלמו. אפשר להוסיף אותם אחרי ההרשמה במסך "התיק".`
                        : `${summary.failed.length} didn't reach the pass bar — not recorded as completed. You can add them after signup in the record screen.`
                    }
                  />
                </span>
              </li>
            )}
            {summary.exempt.length > 0 && (
              <li className="flex items-start gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-foreground/25" />
                <span>
                  <Bidi
                    text={
                      isHe
                        ? summary.exempt.length === 1
                          ? "קורס פטור אחד — פטור לא נספר בממוצע, ולכן לא נרשם כאן."
                          : `${summary.exempt.length} קורסי פטור — פטור לא נספר בממוצע, ולכן הם לא נרשמים כאן.`
                        : `${summary.exempt.length} exempt — exemptions don't count toward the average, so they aren't recorded here.`
                    }
                  />
                </span>
              </li>
            )}
            {summary.offCatalogCompleted > 0 && (
              <li className="flex items-start gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-foreground/25" />
                <span>
                  <Bidi
                    text={
                      isHe
                        ? summary.offCatalogCompleted === 1
                          ? "קורס אחד שאינו ברשימת פכ״מ — שמרנו אותו בשמו מהגיליון."
                          : `${heNoun(summary.offCatalogCompleted, "קורס", "קורסים")} שאינם ברשימת פכ״מ — שמרנו אותם בשמם מהגיליון.`
                        : `${summary.offCatalogCompleted} outside the PPE list — kept under the name printed on your sheet.`
                    }
                  />
                </span>
              </li>
            )}
            {summary.uncertain.length > 0 && (
              <li className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-status-amber" />
                <span>
                  <Bidi
                    text={
                      isHe
                        ? summary.uncertain.length === 1
                          ? 'שורה אחת יצאה שונה בין שתי הקריאות שלנו. היא מסומנת "לבדיקה" ברשימה למטה — השוו לגיליון ותקנו שם.'
                          : `${heNounF(summary.uncertain.length, "שורה", "שורות")} יצאו שונה בין שתי הקריאות שלנו. הן מסומנות "לבדיקה" ברשימה למטה — השוו לגיליון ותקנו שם.`
                        : `${summary.uncertain.length} rows came out differently on our two reads. They're marked "Check" in the list below — compare them with your sheet and fix them there.`
                    }
                  />
                </span>
              </li>
            )}
          </ul>
        </div>
      )}

      {/* The courses themselves. This used to be a collapsed, read-only list
          with the real review two screens later (#7 — "זאת קצת כפילות"). It is
          now THE review: open by default, every row correctable in place, and
          the only pass the student makes over their sheet. */}
      <details open className="rounded-2xl border border-border bg-card/50 p-4">
        <summary className="cursor-pointer list-none text-sm font-semibold text-accent-brand underline-offset-2 hover:underline">
          {isHe
            ? countPhrase(
                summary.rows.length,
                "השורה שקראנו — אפשר לתקן",
                `${summary.rows.length} השורות שקראנו — אפשר לתקן כל אחת`,
              )
            : `${summary.rows.length} rows we read — every one is editable`}
        </summary>
        <p className="mt-1.5 text-xs leading-relaxed text-foreground/60">
          {isHe
            ? "הסירו סימון משורה שאינה שלכם, תקנו ציון שנקרא לא נכון, ושייכו שורה לקורס הנכון. סף מעבר 60, ובאנגלית 70."
            : "Un-tick a row that isn't yours, fix a grade we misread, and point a row at the right course. The pass bar is 60, and 70 in English."}
        </p>
        {/* #2b — one block per semester header on the sheet, in the sheet's own
            order. A row the sheet didn't date gets its own honest block instead
            of being filed under the semester above it. */}
        <div className="mt-3 space-y-3.5">
        {semesterGroups.map((group) => (
        <section key={group.sheetSemester ?? "unknown"}>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-border/50 pb-1">
            <span className="text-xs font-bold text-foreground/75">
              {group.sheetSemester
                ? [
                    group.year ? (isHe ? YEAR_CONFIG[group.year as 1 | 2 | 3]?.nameHe : YEAR_CONFIG[group.year as 1 | 2 | 3]?.nameEn) : null,
                    group.semester
                      ? isHe
                        ? SEMESTER_CONFIG[group.semester]?.nameHe
                        : SEMESTER_CONFIG[group.semester]?.nameEn
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || (isHe ? "סמסטר" : "Semester")
                : isHe
                  ? "סמסטר לא ידוע"
                  : "Unknown semester"}
            </span>
            {/* אריאל, 3.9: *"מה זה ה-2025/2 הזה שיש אחרי סריקת הסילבוס?"*
                והוא שאל את זה כבר ב-21.8 על "1/2025", ואז נבנה
                `sheetSemesterLabel` והוחל על שורות הסורק. הכותרת הזאת נשארה
                מדפיסה את החתימה הגולמית, בפונט מונו ו-LTR — כלומר בדיוק
                נראית כמו מזהה מערכת שהקורא אמור להכיר. אותה שאלה, שתי
                תשובות, באותו מסך. החתימה נשארת ב-title כי היא מה שקושר את
                השורה לשורה בגיליון המודפס. */}
            {group.sheetSemester ? (
              (() => {
                const label = sheetSemesterLabel(group.sheetSemester, isHe ? "he" : "en");
                return label ? (
                  <span className="text-[11px] text-foreground/60" title={label.raw}>
                    {isHe ? "בגיליון: " : "on the sheet: "}
                    {label.text}
                  </span>
                ) : (
                  <span className="font-mono text-[11px] text-foreground/60">
                    {isHe ? "בגיליון: " : "on the sheet: "}
                    <Bidi text={group.sheetSemester} />
                  </span>
                );
              })()
            ) : (
              <span className="text-[11px] text-foreground/60">
                {isHe
                  ? "שורות שהגיליון לא הצמיד להן כותרת-סמסטר, וקורסים שהוספתם"
                  : "Rows the sheet gave no semester header, plus courses you added"}
              </span>
            )}
            <span className="ms-auto text-[11px] text-foreground/60">
              {isHe
                ? countPhrase(group.rows.length, "שורה אחת", `${heNounF(group.rows.length, "שורה", "שורות")}`)
                : `${group.rows.length} ${group.rows.length === 1 ? "row" : "rows"}`}
            </span>
          </div>
          <ul className="mt-1.5 space-y-1.5">
          {group.rows.map(({ row: r, index: i }) => {
            const included = !r.excluded;
            return (
              <li
                key={`${r.key}-${i}`}
                className={cn(
                  "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-2.5 py-2 text-xs",
                  included ? "border-border/50 bg-background/40" : "border-dashed border-border/50 bg-background/20 opacity-60",
                )}
              >
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={included}
                  aria-label={isHe ? `כללו את ${r.name}` : `Include ${r.name}`}
                  onClick={() => onEditRow(i, { excluded: included })}
                  className={cn(
                    "flex size-4.5 shrink-0 items-center justify-center rounded border transition-colors",
                    included ? "border-emerald-500 bg-emerald-500 text-white" : "border-foreground/25",
                  )}
                >
                  {included && <Check className="size-3" />}
                </button>
                <span
                  className={cn(
                    "min-w-0 flex-1 basis-48 truncate font-medium text-foreground/80",
                    !included && "line-through",
                  )}
                >
                  {r.name}
                </span>
                {r.grade != null && (
                  <bdi dir="ltr" className="font-mono text-foreground/60">
                    {r.grade}
                  </bdi>
                )}
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-medium",
                    r.status === "COMPLETED"
                      ? "bg-emerald-500/10 text-status-green"
                      : r.status === "FAILED"
                        ? "bg-amber-500/10 text-status-amber"
                        : "bg-foreground/8 text-foreground/70",
                  )}
                >
                  {r.status === "COMPLETED"
                    ? isHe
                      ? "הושלם"
                      : "Completed"
                    : r.status === "FAILED"
                      ? isHe
                        ? "לא עבר"
                        : "Not passed"
                      : r.status === "EXEMPT"
                        ? isHe
                          ? "פטור"
                          : "Exempt"
                        : r.status === "IN_PROGRESS"
                          ? isHe
                            ? "בלימוד"
                            : "In progress"
                          : isHe
                            ? "לא ברור"
                            : "Unclear"}
                </span>
                {r.uncertain && (
                  <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-status-amber">
                    {isHe ? "לבדיקה" : "Check"}
                  </span>
                )}
                {r.manual && (
                  // Never let a course the STUDENT typed look like something we
                  // read off their official document.
                  <span className="rounded-full bg-accent-brand/6 px-2 py-0.5 text-[11px] font-medium text-accent-brand">
                    {isHe ? "הוספתם" : "You added"}
                  </span>
                )}
                {/* #2a — one of our two reads DID see a number here and the
                    other didn't, so we asserted nothing. Show both readings and
                    let the student settle it with one tap, instead of burying
                    the number we already have. */}
                {included && r.grade == null && r.otherGrade != null && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] text-status-amber">
                    {isHe ? "באחת הקריאות יצא" : "One read gave"}
                    <bdi dir="ltr" className="font-mono font-bold">
                      {r.otherGrade}
                    </bdi>
                    <button
                      type="button"
                      onClick={() => onEditRow(i, { grade: r.otherGrade })}
                      className="rounded font-semibold underline underline-offset-2 hover:text-status-amber"
                    >
                      {isHe ? "זה הציון" : "That's the grade"}
                    </button>
                  </span>
                )}
                {/* A course the sheet shows with no grade is the one row a
                    student is most likely to need to correct (Ariel's לוגיקה).
                    A named button beats hunting for the generic pencil. */}
                {included &&
                  r.grade == null &&
                  r.otherGrade == null &&
                  (r.status === "IN_PROGRESS" || r.status === "UNREADABLE") && (
                    <button
                      type="button"
                      onClick={() => setEditingRow(i)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/35 px-2 py-0.5 text-[11px] font-semibold text-status-green transition-colors hover:bg-emerald-500/10"
                    >
                      <PenLine className="size-3" />
                      {isHe ? "להזין ציון" : "Enter a grade"}
                    </button>
                  )}
                <button
                  type="button"
                  onClick={() => setEditingRow((cur) => (cur === i ? null : i))}
                  aria-expanded={editingRow === i}
                  aria-controls={`standing-edit-${i}`}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold transition-colors",
                    editingRow === i
                      ? "bg-accent-brand/15 text-accent-brand"
                      : "text-foreground/70 hover:bg-foreground/5 hover:text-foreground/70",
                  )}
                >
                  <PenLine className="size-3" />
                  {isHe ? "תיקון" : "Fix"}
                </button>

                {editingRow === i && (
                  <div
                    id={`standing-edit-${i}`}
                    className="mt-1 w-full space-y-2 rounded-lg border border-accent-brand/25 bg-accent-brand/[0.04] p-2.5"
                  >
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="flex flex-col gap-1">
                        {/* No "0–100" in the Hebrew label: a digit-dash-digit
                            range inside an RTL line renders reversed. The range
                            is stated below with a Hebrew word between the two
                            numbers, so their order survives. */}
                        <label
                          htmlFor={`standing-grade-${i}`}
                          className="text-[11px] font-semibold text-foreground/60"
                        >
                          {isHe ? "ציון" : "Grade (0-100)"}
                        </label>
                        <input
                          id={`standing-grade-${i}`}
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
                              onEditRow(i, { grade: null });
                              return;
                            }
                            const n = Number(raw);
                            // Out of range is rejected, never clamped — a clamp
                            // would invent a grade the sheet doesn't show.
                            if (!Number.isFinite(n)) return;
                            onEditRow(i, { grade: n });
                          }}
                          className="w-20 rounded-md border border-border bg-background px-2 py-1.5 text-center font-mono text-sm text-foreground focus:border-accent-brand focus:outline-none focus:ring-1 focus:ring-accent-brand/40"
                        />
                      </div>

                      {/* ש״ס are stored on the row only for a course outside the
                          PPE catalog — a catalog course takes its ש״ס from the
                          catalog, so editing them there would change nothing. */}
                      {!r.inCatalog && (
                        <div className="flex flex-col gap-1">
                          <label
                            htmlFor={`standing-credits-${i}`}
                            className="text-[11px] font-semibold text-foreground/60"
                          >
                            {isHe ? "ש״ס" : "Credits"}
                          </label>
                          <input
                            id={`standing-credits-${i}`}
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
                                onEditRow(i, { credits: null });
                                return;
                              }
                              const n = Number(raw);
                              if (!Number.isFinite(n)) return;
                              onEditRow(i, { credits: n });
                            }}
                            className="w-20 rounded-md border border-border bg-background px-2 py-1.5 text-center font-mono text-sm text-foreground focus:border-accent-brand focus:outline-none focus:ring-1 focus:ring-accent-brand/40"
                          />
                        </div>
                      )}

                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <label
                          htmlFor={`standing-course-${i}`}
                          className="text-[11px] font-semibold text-foreground/60"
                        >
                          {isHe ? "איזה קורס זה באמת" : "Which course this really is"}
                        </label>
                        <select
                          id={`standing-course-${i}`}
                          value={r.inCatalog ? r.key : ""}
                          onChange={(e) => {
                            const code = e.target.value;
                            onEditRow(i, {
                              course: code
                                ? (allCourses.find((c) => c.code === code) ?? null)
                                : null,
                            });
                          }}
                          className="w-full min-w-40 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:border-accent-brand focus:outline-none focus:ring-1 focus:ring-accent-brand/40"
                        >
                          <option value="">
                            {isHe ? "לא ברשימת פכ״מ — לשמור בשם מהגיליון" : "Outside the PPE list — keep the sheet's name"}
                          </option>
                          {allCourses.map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.nameHe} · {c.code}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <p className="text-[11px] leading-relaxed text-foreground/60">
                      {isHe
                        ? "ציון תקין הוא 0 עד 100. מה שתתקנו כאן הוא מה שייכנס לתואר שלכם; שורה שאינה שלכם — הסירו את הסימון שלה."
                        : "A valid grade is 0 to 100. What you fix here is what goes into your degree; a row that isn't yours — just un-tick it."}
                    </p>
                  </div>
                )}
              </li>
            );
          })}
          </ul>
        </section>
        ))}
        </div>

        {/* #7 — "add a course we missed" moved here from the history step, which
            a scanned student no longer sees. Dropping it would have cost a real
            capability: a course the scan skipped could never be recorded. */}
        <div className="mt-3 border-t border-border/40 pt-3">
          <p className="text-xs font-semibold text-foreground/70">
            {isHe ? "פספסנו קורס שעשיתם? הוסיפו אותו" : "Did we miss a course you took? Add it"}
          </p>
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-foreground/60" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={isHe ? "חיפוש קורס להוספה" : "Search for a course to add"}
              placeholder={isHe ? "שם הקורס או מספרו" : "Course name or code"}
              className="w-full rounded-lg border border-border bg-card py-2 ps-9 pe-3 text-sm text-foreground placeholder:text-foreground/60 focus:border-foreground/30 focus:outline-none"
            />
          </div>
          {searchResults.length > 0 && (
            <div className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border bg-card p-1">
              {searchResults.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => {
                    onAddRow(c, c.nameHe);
                    setSearch("");
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-start transition-colors hover:bg-foreground/5"
                >
                  <Plus className="size-3.5 shrink-0 text-status-green" />
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground/80">
                    {isHe ? c.nameHe : (c.nameEn ?? c.nameHe)}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-foreground/60">
                    <bdi dir="ltr">{c.credits}</bdi> {isHe ? "ש״ס" : "cr."}
                  </span>
                </button>
              ))}
            </div>
          )}
          {search.trim().length >= 2 && searchResults.length === 0 && (
            <button
              type="button"
              onClick={() => {
                onAddRow(null, search.trim());
                setSearch("");
              }}
              className="mt-2 flex w-full items-center gap-2 rounded-lg border border-dashed border-accent-brand/40 bg-accent-brand/[0.04] px-3 py-2 text-start text-sm font-medium text-accent-brand transition-colors hover:bg-accent-brand/10"
            >
              <Plus className="size-4 shrink-0" />
              {isHe
                ? `הוסיפו "${search.trim()}" — קורס שאינו ברשימת פכ״מ`
                : `Add "${search.trim()}" — a course outside the PPE list`}
            </button>
          )}
        </div>
      </details>

      {/* #3 — the two escape hatches used to be bare text links sitting on one
          line with nothing between them, so they read as a single broken
          sentence under the primary action. They are real, separated controls
          now: same weight as each other, visibly lighter than "נכון". */}
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={onConfirm}
          className="w-full rounded-xl bg-foreground px-6 py-3.5 text-sm font-bold text-background transition-transform hover:scale-[1.01] press-scale"
        >
          {isHe ? "נכון — המשיכו מכאן" : "That's right — continue from here"}
        </button>
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={onRedo}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground/70 transition-colors hover:border-foreground/30 hover:bg-foreground/[0.03] hover:text-foreground/90"
          >
            <ScanLine className="size-4 shrink-0" />
            {isHe ? "לסרוק קובץ אחר" : "Scan a different file"}
          </button>
          <button
            type="button"
            onClick={onManual}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground/70 transition-colors hover:border-foreground/30 hover:bg-foreground/[0.03] hover:text-foreground/90"
          >
            <PenLine className="size-4 shrink-0" />
            {isHe ? "לא מדויק? נמלא ידנית" : "Not accurate? We'll fill it in manually"}
          </button>
        </div>
      </div>
    </div>
  );
}
