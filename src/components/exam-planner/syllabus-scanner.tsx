"use client";

import { useRef, useState } from "react";
import { useLocale } from "next-intl";
import { FileScan, Loader2, Check, X, GraduationCap, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/trpc/react";
import { fileToBase64, SCANNER_ACCEPT } from "@/lib/upload";
import { syllabusDateToLocalNoon, type SyllabusExtraction } from "@/lib/syllabus-scan";
import { cn } from "@/lib/utils";

/**
 * Syllabus scanner — upload a course syllabus (photo/PDF); Gemini extracts the
 * DATED items (exam sittings, assignment deadlines); the student approves each
 * row and they become PERSONAL StudyTasks via the existing studyTask.create
 * mutation (demo-guarded there). Never writes to the shared course catalog.
 */
export function SyllabusScanner() {
  const isHe = useLocale() === "he";
  const fileRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<SyllabusExtraction | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [applying, setApplying] = useState(false);

  const utils = api.useUtils();
  const createMutation = api.studyTask.create.useMutation();

  const handleFile = async (file: File) => {
    setScanning(true);
    setResult(null);
    try {
      const { b64, mime } = await fileToBase64(file);
      if (b64.length > 5_000_000) {
        // Heavy PDFs exceed the server cap; guide to a photo instead. (audit #11)
        toast.error(
          isHe
            ? "הקובץ גדול מדי — צלמו את קטע לוח-הזמנים במקום PDF כבד (עד ~3.5MB)."
            : "File too large — photograph the schedule section instead of a heavy PDF (max ~3.5MB).",
        );
        return;
      }
      const res = await fetch("/api/ai/scan-syllabus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: b64, mimeType: mime }),
      });
      const data = (await res.json()) as SyllabusExtraction & { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? (isHe ? "הסריקה נכשלה" : "Scan failed"));
        return;
      }
      setResult(data);
      setChecked(new Set(data.items.map((_, i) => i)));
    } catch {
      toast.error(isHe ? "הסריקה נכשלה — נסו שוב" : "Scan failed — try again");
    } finally {
      setScanning(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const applySelected = async () => {
    if (!result) return;
    setApplying(true);
    let ok = 0;
    let failed = 0;
    let skipped = 0;

    // Re-scanning the same syllabus would otherwise create a second copy of
    // every task. Build a set of the existing tasks (title + day) and skip any
    // row that already exists. Degrade to no-dedup if the list can't be read.
    const dayKey = (d: Date | string) => {
      const x = new Date(d);
      return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
    };
    const existing = new Set<string>();
    try {
      const res = await utils.studyTask.list.fetch(undefined);
      for (const t of res?.tasks ?? []) {
        existing.add(`${t.title}|${dayKey(t.startDate)}`);
      }
    } catch {
      /* no cached/fetchable list — proceed without dedup */
    }

    for (const i of checked) {
      const item = result.items[i];
      if (!item) continue;
      const when = syllabusDateToLocalNoon(item.date);
      const prefix = result.courseName ? `${result.courseName} — ` : "";
      const moedSuffix = item.kind === "exam" && item.moed ? ` (מועד ${item.moed === "B" ? "ב׳" : "א׳"})` : "";
      const title = `${prefix}${item.title}${moedSuffix}`.slice(0, 200);
      if (existing.has(`${title}|${dayKey(when)}`)) {
        skipped++;
        continue;
      }
      try {
        await createMutation.mutateAsync({
          title,
          startDate: when,
          endDate: when,
          taskType: item.kind === "exam" ? "exam" : "assignment",
        });
        existing.add(`${title}|${dayKey(when)}`); // guard against dupes within one batch too
        ok++;
      } catch (e) {
        failed++;
        if (failed === 1) {
          toast.error((e as { message?: string })?.message ?? (isHe ? "יצירת משימה נכשלה" : "Task creation failed"));
        }
      }
    }
    setApplying(false);
    if (ok > 0) {
      const skipNote = skipped > 0 ? (isHe ? ` (${skipped} כבר היו קיימים)` : ` (${skipped} already existed)`) : "";
      toast.success(
        (isHe ? `נוספו ${ok} תאריכים מהסילבוס ללוח שלך` : `Added ${ok} syllabus dates to your plan`) + skipNote,
      );
      setResult(null);
      void utils.studyTask.list.invalidate();
    } else if (skipped > 0 && failed === 0) {
      toast.message(isHe ? "כל התאריכים כבר קיימים בלוח" : "All these dates are already on your plan");
      setResult(null);
    }
  };

  return (
    <div className="data-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-brand/10 text-accent-brand">
          <FileScan className="size-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground/85">
            {isHe ? "סריקת סילבוס" : "Scan a syllabus"}
          </p>
          <p className="text-xs text-foreground/50">
            {isHe
              ? "מעלים צילום/PDF של הסילבוס — בחינות והגשות נכנסות ללוח. כלום לא נשמר בלי אישור שלך."
              : "Upload a syllabus photo/PDF — exams and deadlines land on your plan. Nothing saved without your approval."}
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
          disabled={scanning}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent-brand px-3 py-2 text-sm font-semibold text-accent-brand-fg transition-colors hover:bg-accent-brand-hover disabled:opacity-40"
        >
          {scanning ? <Loader2 className="size-4 animate-spin" /> : <FileScan className="size-4" />}
          {scanning ? (isHe ? "קורא את הסילבוס…" : "Reading…") : isHe ? "העלה וסרוק" : "Upload & scan"}
        </button>
      </div>

      {result && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-foreground/70">
              {isHe
                ? `${result.courseName ? `"${result.courseName}" — ` : ""}נמצאו ${result.items.length} תאריכים. סמנו מה להוסיף:`
                : `${result.courseName ? `"${result.courseName}" — ` : ""}found ${result.items.length} dates. Pick what to add:`}
            </p>
            <button type="button" onClick={() => setResult(null)} aria-label={isHe ? "סגור" : "Close"} className="rounded-md p-1 text-foreground/30 hover:text-foreground/60">
              <X className="size-4" />
            </button>
          </div>
          <ul className="space-y-1.5">
            {result.items.map((item, i) => {
              const Icon = item.kind === "exam" ? GraduationCap : BookOpen;
              return (
                <li key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-border/50 p-2 text-xs">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={checked.has(i)}
                    aria-label={isHe ? `הוסף ליומן: ${item.title}` : `Add to calendar: ${item.title}`}
                    onClick={() =>
                      setChecked((s) => {
                        const n = new Set(s);
                        if (n.has(i)) n.delete(i);
                        else n.add(i);
                        return n;
                      })
                    }
                    className={cn(
                      "flex size-4.5 shrink-0 items-center justify-center rounded border transition-colors",
                      checked.has(i) ? "border-emerald-400 bg-emerald-400 text-white" : "border-foreground/25",
                    )}
                  >
                    {checked.has(i) && <Check className="size-3" />}
                  </button>
                  <Icon className="size-3.5 shrink-0 text-foreground/40" />
                  <span className="min-w-0 flex-1 truncate text-foreground/80">
                    {item.title}
                    {item.kind === "exam" && item.moed && (
                      <span className="ms-1 text-foreground/45">{isHe ? `מועד ${item.moed === "B" ? "ב׳" : "א׳"}` : `Moed ${item.moed}`}</span>
                    )}
                  </span>
                  <span className="font-mono tabular-nums text-foreground/60" dir="ltr">
                    {item.date}
                  </span>
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
            {isHe ? `הוסף ${checked.size} תאריכים ללוח` : `Add ${checked.size} to my plan`}
          </button>
        </div>
      )}
    </div>
  );
}
