"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { ScanLine, Loader2, GraduationCap, AlertTriangle, Check, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { Bidi } from "@/lib/bidi";
import { fileToBase64, SCANNER_ACCEPT } from "@/lib/upload";
import { matchExtractedToCatalog } from "@/lib/grade-sheet";
import type { ExtractedRow } from "@/lib/grade-sheet";
import {
  summarizeStanding,
  buildCompletedSeed,
  type StandingSummary,
} from "@/lib/onboarding-standing";
import { DISCIPLINE_CONFIG, FOCUS_DISCIPLINE_IDS, YEAR_CONFIG, SEMESTER_CONFIG } from "@/lib/constants";
import { getPlanningAnchor } from "@/lib/academic-calendar";
import { WhereIsMySheet } from "@/components/record/where-is-my-sheet";
import type { CourseWithSchedule } from "@/lib/plan-generator";
import type { CompletedCourse } from "./step-history";

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
  const fileRef = useRef<HTMLInputElement>(null);

  const upcomingSemester = useMemo(() => getPlanningAnchor().semester, []);

  const handleFile = useCallback(
    async (file: File) => {
      setScan({ kind: "scanning" });
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
          rows?: (ExtractedRow & { uncertain?: boolean })[];
          englishLevel?: string | null;
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
          <p className="mx-auto mt-2 max-w-md text-foreground/50">
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
            <span className="text-sm leading-relaxed text-foreground/55">
              {isHe
                ? "העלו את גיליון הציונים ופכמון יקרא ממנו מה כבר עשיתם, מה נכשל, איפה אתם באנגלית וכמה ש״ס נצברו — ויתחיל מהנקודה שלכם."
                : "Upload your grade sheet and we'll read what you've done, what you failed, your English status and the credits you've earned — then start from where you actually are."}
            </span>
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-accent-brand/12 px-2.5 py-1 text-[11px] font-semibold text-accent-brand">
              {isHe ? "הדרך המהירה" : "The fast path"}
            </span>
          </button>

          {/* Fresh */}
          <button
            type="button"
            onClick={() => onDone({ choice: "fresh" })}
            className="animate-stagger-2 flex flex-col items-start gap-2 rounded-2xl border-2 border-border bg-card p-5 text-start transition-all hover:border-foreground/30"
          >
            <span className="flex size-10 items-center justify-center rounded-xl bg-foreground/8 text-foreground/60">
              <GraduationCap className="size-5" />
            </span>
            <span className="font-display text-base font-bold text-foreground/90">
              {isHe ? "מתחילים את התואר עכשיו" : "I'm starting the degree now"}
            </span>
            <span className="text-sm leading-relaxed text-foreground/55">
              {isHe
                ? "שנה א׳, בלי קורסים קודמים. נבנה יחד את המערכת של הסמסטר הראשון שלכם."
                : "Year 1, no previous courses. We'll build your first semester's timetable together."}
            </span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => onDone({ choice: "returning" })}
          className="animate-stagger-3 mt-5 inline-flex items-center gap-1.5 text-sm text-foreground/45 underline-offset-4 transition-colors hover:text-foreground/70 hover:underline"
        >
          <PenLine className="size-3.5" />
          {isHe
            ? "כבר למדתם, אבל הגיליון לא זמין עכשיו — נמלא ידנית"
            : "I've studied, but I don't have the sheet now — I'll fill it in manually"}
        </button>

        <button
          type="button"
          onClick={onBack}
          className="mt-6 rounded-lg px-4 py-2 text-sm text-foreground/40 transition-colors hover:bg-foreground/5 hover:text-foreground/60"
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
        <p className="mx-auto mt-2 max-w-md text-foreground/50">
          {scan.kind === "done"
            ? isHe
              ? "עברו על הסיכום ואשרו. שום דבר עוד לא נשמר — במסך הבא תוכלו לתקן קורס-קורס."
              : "Check the summary and confirm. Nothing is saved yet — you can correct it course by course on the next screen."
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
              <p className="mt-3 text-center text-xs text-foreground/45">
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
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground/85">
                  {isHe ? "הסריקה לא הצליחה" : "The scan didn't succeed"}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-foreground/60">{scan.message}</p>
                <p className="mt-2 text-xs text-foreground/45">
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
            isHe={isHe}
            onConfirm={() => confirmScan(scan.summary)}
            onRedo={() => setScan({ kind: "idle" })}
            onManual={() => onDone({ choice: "returning" })}
          />
        )}
      </div>

      {scan.kind !== "done" && (
        <button
          type="button"
          onClick={() => (scan.kind === "scanning" ? undefined : setMode("ask"))}
          disabled={scan.kind === "scanning"}
          className="mt-6 rounded-lg px-4 py-2 text-sm text-foreground/40 transition-colors hover:bg-foreground/5 hover:text-foreground/60 disabled:opacity-40"
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

function StandingSummaryCard({
  summary,
  englishLevel,
  isHe,
  onConfirm,
  onRedo,
  onManual,
}: {
  summary: StandingSummary;
  englishLevel: string | null;
  isHe: boolean;
  onConfirm: () => void;
  onRedo: () => void;
  onManual: () => void;
}) {
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
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-500">
            <Check className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-base font-bold text-foreground/90">
              {isHe
                ? `קראנו ${summary.completed.length} קורסים שהושלמו`
                : `We read ${summary.completed.length} completed courses`}
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
            <p className="mt-1 text-xs leading-relaxed text-foreground/50">
              {p.basis === "sheet" && p.lastSheetSemester ? (
                <Bidi
                  text={
                    isHe
                      ? `הסקנו את זה מכותרות-הסמסטר שבגיליון עצמו; האחרונה שקראנו היא ${p.lastSheetSemester}.`
                      : `We derived this from the semester headers printed on the sheet; the last one we read is ${p.lastSheetSemester}.`
                  }
                />
              ) : p.basis === "gap" ? (
                <Bidi
                  text={
                    isHe
                      ? `בגיליון יש כותרות-סמסטר, אבל הסמסטר הקרוב לא בא מיד אחרי האחרון שקראנו (${p.lastSheetSemester ?? ""}). ייתכן שהיה סמסטר שלא למדתם בו. בדקו את השנה ותקנו במסך הבא אם צריך.`
                      : `The sheet has semester headers, but the upcoming semester doesn't directly follow the last one we read (${p.lastSheetSemester ?? ""}). You may have sat a semester out. Check the year and correct it on the next screen if needed.`
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

      {/* Focus-area standing */}
      {focusRows.length > 0 && (
        <div className="rounded-2xl border border-border bg-card/50 p-4">
          <p className="text-sm font-semibold text-foreground/80">
            {isHe ? "ש״ס שכבר צברתם בכל תחום" : "Credits you've earned per area"}
          </p>
          <p className="mt-0.5 text-xs text-foreground/45">
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
                  r.cfg?.badgeClass ?? "bg-foreground/8 text-foreground/60",
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
                        ? `${summary.inProgress.length} קורסים עדיין בלימוד (מסומנים בגיליון בלי ציון) — לא נרשמים כהושלמו.`
                        : `${summary.inProgress.length} courses are still in progress (no grade on the sheet) — not recorded as completed.`
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
                        ? `${summary.failed.length} קורסים לא עברו את סף המעבר — לא נרשמים כהושלמו. אפשר להוסיף אותם אחרי ההרשמה במסך "התיק".`
                        : `${summary.failed.length} courses didn't reach the pass bar — not recorded as completed. You can add them after signup in the record screen.`
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
                        ? `${summary.exempt.length} קורסי פטור — לא נספרים בממוצע, ולכן לא נרשמים כאן.`
                        : `${summary.exempt.length} exempt courses — they don't count toward the average, so they aren't recorded here.`
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
                        ? `${summary.offCatalogCompleted} קורסים שאינם ברשימת פכ״מ — שמרנו אותם בשמם מהגיליון.`
                        : `${summary.offCatalogCompleted} courses outside the PPE list — kept under the name printed on your sheet.`
                    }
                  />
                </span>
              </li>
            )}
            {summary.uncertain.length > 0 && (
              <li className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                <span>
                  <Bidi
                    text={
                      isHe
                        ? `${summary.uncertain.length} שורות שקראנו פעמיים וקיבלנו תוצאה שונה. בדקו אותן במסך הבא מול הגיליון שלכם.`
                        : `${summary.uncertain.length} rows came out differently on our two reads. Check them against your sheet on the next screen.`
                    }
                  />
                </span>
              </li>
            )}
          </ul>
        </div>
      )}

      {/* The courses themselves — the student must be able to SEE what we read
          before agreeing to it. */}
      <details className="rounded-2xl border border-border bg-card/50 p-4">
        <summary className="cursor-pointer list-none text-sm font-semibold text-accent-brand underline-offset-2 hover:underline">
          {isHe
            ? `להציג את כל ${summary.rows.length} השורות שקראנו`
            : `Show all ${summary.rows.length} rows we read`}
        </summary>
        <ul className="mt-3 space-y-1.5">
          {summary.rows.map((r, i) => (
            <li
              key={`${r.key}-${i}`}
              className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border/50 bg-background/40 px-2.5 py-2 text-xs"
            >
              <span className="min-w-0 flex-1 truncate font-medium text-foreground/80">{r.name}</span>
              {r.grade != null && (
                <bdi dir="ltr" className="font-mono text-foreground/60">
                  {r.grade}
                </bdi>
              )}
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-medium",
                  r.status === "COMPLETED"
                    ? "bg-emerald-500/10 text-emerald-500"
                    : r.status === "FAILED"
                      ? "bg-amber-500/10 text-amber-500"
                      : "bg-foreground/8 text-foreground/50",
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
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-500">
                  {isHe ? "לבדיקה" : "Check"}
                </span>
              )}
            </li>
          ))}
        </ul>
      </details>

      <div className="flex flex-col gap-2.5">
        <button
          type="button"
          onClick={onConfirm}
          className="w-full rounded-xl bg-foreground px-6 py-3.5 text-sm font-bold text-background transition-transform hover:scale-[1.01] press-scale"
        >
          {isHe ? "נכון — המשיכו מכאן" : "That's right — continue from here"}
        </button>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
          <button
            type="button"
            onClick={onRedo}
            className="text-sm text-foreground/45 underline-offset-4 transition-colors hover:text-foreground/70 hover:underline"
          >
            {isHe ? "לסרוק קובץ אחר" : "Scan a different file"}
          </button>
          <button
            type="button"
            onClick={onManual}
            className="text-sm text-foreground/45 underline-offset-4 transition-colors hover:text-foreground/70 hover:underline"
          >
            {isHe ? "לא מדויק — נמלא ידנית" : "Not accurate — I'll fill it in manually"}
          </button>
        </div>
      </div>
    </div>
  );
}
