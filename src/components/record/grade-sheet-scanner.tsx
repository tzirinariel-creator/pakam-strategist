"use client";

import { useMemo, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { ScanLine, Loader2, Check, AlertTriangle, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/trpc/react";
import {
  matchExtractedToCourses,
  type MatchedRow,
  type UserCourseLite,
} from "@/lib/grade-sheet";
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
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [applying, setApplying] = useState(false);

  const utils = api.useUtils();
  const planQuery = api.plan.getUserPlan.useQuery();
  const updateMutation = api.plan.updateCourse.useMutation();

  const userCourses = useMemo<UserCourseLite[]>(
    () =>
      (planQuery.data?.courses ?? []).map((uc) => ({
        userCourseId: uc.id,
        courseCode: uc.course.code,
        nameHe: uc.course.nameHe,
        currentGrade: uc.grade ?? null,
        status: uc.status,
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
      const data = (await res.json()) as { rows?: unknown[]; error?: string };
      if (!res.ok) {
        toast.error(data.error ?? (isHe ? "הסריקה נכשלה" : "Scan failed"));
        return;
      }
      const matched = matchExtractedToCourses(
        (data.rows ?? []) as Parameters<typeof matchExtractedToCourses>[0],
        userCourses,
      );
      setRows(matched);
      // Pre-check ONLY high-confidence, unambiguous matches. A fuzzy (substring)
      // or ambiguous (retake / colliding) match is left UNCHECKED so a wrong
      // course can never be overwritten by the default one-click apply.
      setChecked(new Set(matched.map((r, i) => (r.autoApplySafe ? i : -1)).filter((i) => i >= 0)));
    } catch {
      toast.error(isHe ? "הסריקה נכשלה — נסו שוב" : "Scan failed — try again");
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
    for (const i of checked) {
      const r = rows[i];
      if (!r?.match || r.grade == null) continue;
      try {
        await updateMutation.mutateAsync({
          userCourseId: r.match.userCourseId,
          grade: r.grade,
          status: r.grade >= 60 ? "COMPLETED" : "FAILED",
        });
        ok++;
      } catch (e) {
        failed++;
        if (failed === 1) {
          toast.error((e as { message?: string })?.message ?? (isHe ? "עדכון נכשל" : "Update failed"));
        }
      }
    }
    setApplying(false);
    if (ok > 0) {
      toast.success(isHe ? `עודכנו ${ok} ציונים מהגיליון` : `Updated ${ok} grades from the sheet`);
      setRows(null);
      invalidatePlanData(utils);
    }
  };

  return (
    <div className="data-card p-4">
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
              ? "מעלים צילום/PDF מהידיעון — ואנחנו ממלאים את הציונים. שום דבר לא נשמר בלי אישור שלך."
              : "Upload a photo/PDF from Yedion — we fill in the grades. Nothing is saved without your approval."}
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
          {scanning ? (isHe ? "קורא את הגיליון…" : "Reading…") : isHe ? "העלה וסרוק" : "Upload & scan"}
        </button>
      </div>

      {/* Review table — the student approves each row explicitly */}
      {rows && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-foreground/70">
              {isHe ? `נמצאו ${rows.length} שורות — סמנו מה לעדכן:` : `Found ${rows.length} rows — pick what to apply:`}
            </p>
            <button type="button" onClick={() => setRows(null)} aria-label={isHe ? "סגור" : "Close"} className="rounded-md p-1 text-foreground/30 hover:text-foreground/60">
              <X className="size-4" />
            </button>
          </div>
          <ul className="space-y-1.5">
            {rows.map((r, i) => {
              const applicable = !!r.match && r.grade != null;
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
                  ) : r.match ? (
                    r.changesGrade ? (
                      r.autoApplySafe ? (
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
                    ) : (
                      <span className="rounded bg-foreground/5 px-1.5 py-px text-[10px] text-foreground/45">
                        {isHe ? "כבר מעודכן" : "Already current"}
                      </span>
                    )
                  ) : (
                    <span className="flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-px text-[10px] font-semibold text-amber-600">
                      <AlertTriangle className="size-2.5" />
                      {isHe ? "לא נמצא בתוכנית — עדכנו ידנית" : "Not in your plan — update manually"}
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
