"use client";

import { heNoun } from "@/lib/he-count";
import { useState, useRef } from "react";
import { Loader2, Check, Shield } from "lucide-react";
import { toast } from "sonner";
import { advisorError } from "@/lib/advisor-toast";
import { Bidi } from "@/lib/bidi";
import { fileToBase64, SCANNER_ACCEPT } from "@/lib/upload";
import { useScanProgress } from "@/hooks/use-scan-progress";
import { REASSURE_AFTER_S } from "@/lib/scan-progress";
import type { Form3010Summary } from "@/lib/form-3010";
import { hebrewAcademicYear } from "@/lib/sheet-semester-label";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------
// M2 — Form 3010 uploader (extraction → explicit per-semester approval)
// ---------------------------------------------------------------

export function Form3010Uploader({
  isHe,
  existing,
  pending,
  startYear,
  onApply,
  onApplyAll,
  onSetStartYear,
}: {
  isHe: boolean;
  existing: Array<{ academicYear: number; semester: string; daysServed: number }>;
  pending: boolean;
  /** Degree-start academic year as the CALLER knows it (#7/#37) — onboarding
   *  has it in wizard state before the profile row exists. The server prefers
   *  the stored anchor; this only covers that window. */
  startYear?: number | null;
  /**
   * Correct the degree-start anchor from here. Supplied by callers that can
   * write it; without it the panel still explains the mismatch, it just cannot
   * offer the one-click fix.
   */
  onSetStartYear?: (startYear: number) => void;
  onApply: (academicYear: number, semester: "FALL" | "SPRING", days: number) => void;
  /** Batch apply — lets the parent snapshot BEFORE the whole import and offer
   *  ONE undo for all of it (the last irreversible bulk-write, 12.7 #26). */
  onApplyAll?: (items: Array<{ academicYear: number; semester: "FALL" | "SPRING"; days: number }>) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  // A scan that is working and a scan that has died look identical behind one
  // static spinner, so the stage and the clock are both on screen (#9/#10).
  const scan = useScanProgress(isHe, "form");
  const { scanning, elapsed } = scan;
  const [summary, setSummary] = useState<Form3010Summary | null>(null);
  /** הסורק מושבת אצלנו (503/412) — פותח את המילוי הידני ומסביר למה. */
  const [scannerDown, setScannerDown] = useState(false);
  const [edited, setEdited] = useState<Record<string, number>>({});

  // The two years this panel must be able to name when it refuses to import
  // anything: what we believe, and what the form actually shows.
  const earliestPreDegreeYear =
    summary && (summary.preDegree?.length ?? 0) > 0
      ? Math.min(...summary.preDegree.map((p) => p.academicYear))
      : null;
  const startYearLabel =
    summary?.startYear != null ? hebrewAcademicYear(summary.startYear) : null;
  const earliestPreDegreeLabel =
    earliestPreDegreeYear != null ? hebrewAcademicYear(earliestPreDegreeYear) : null;

  const handleFile = async (file: File) => {
    scan.start();
    setSummary(null);
    try {
      const { b64, mime } = await fileToBase64(file);
      scan.setStage("upload");
      if (b64.length > 5_000_000) {
        toast.error(isHe ? "הקובץ גדול מדי — צלמו את העמוד עצמו (עד ~3.5MB)." : "File too large — photograph the page (max ~3.5MB).");
        return;
      }
      const res = await fetch("/api/ai/scan-3010", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: b64, mimeType: mime, startYear: startYear ?? null }),
      });
      scan.setStage("read");
      const data = (await res.json()) as { summary?: Form3010Summary; error?: string };
      if (!res.ok || !data.summary) {
        // אריאל, 3.9: *"טוב לא עובד הסורק אבל למה הוא לא נותן לי למלא ידנית?
        // אם אני סטודנט שנה ג׳ ועשיתי מילואים ב-3 או 4 סמסטרים? זה צריך
        // לאפשר לי את זה."*
        //
        // 503 אומר שהסורק **אצלנו** מושבת, לא שהצילום שלו רע. לומר לסטודנט
        // "צלמו תמונה חדה יותר" זה לשלוח אותו לצלם שוב ושוב משהו שלא ייקרא
        // בשום מצב — וזו בדיוק ההודעה שהוא קיבל. המילוי הידני קיים מתחת
        // לכפתור הזה; ברגע כזה הוא צריך להיאמר בקול.
        setScannerDown(res.status === 503 || res.status === 412);
        advisorError(
          res.status === 503 || res.status === 412
            ? isHe
              ? "הסורק שלנו לא זמין כרגע — זה אצלנו, לא בצילום שלכם. אפשר למלא את הימים ידנית למטה, וזה שווה ערך לגמרי."
              : "Our scanner is down right now — that's on us, not your photo. You can enter the days by hand below; it counts exactly the same."
            : (data.error ?? (isHe ? "הסריקה לא הצליחה — נסו שוב או צלמו תמונה חדה יותר." : "The scan didn't work — try again or take a sharper photo.")),
        );
        return;
      }
      setScannerDown(false);
      setSummary(data.summary);
      setEdited({});
    } catch {
      advisorError(isHe ? "הסריקה לא הצליחה — נסו שוב. הנתונים שלכם לא נגעו." : "The scan didn't work — try again. Your data is untouched.");
    } finally {
      scan.stop();
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="rounded-xl border border-border/60 bg-foreground/[0.02] p-4">
      {/* הודעה מתמשכת, לא טוסט. טוסט נעלם, והסטודנט נשאר עם כפתור שנכשל
          ובלי לדעת שיש דרך אחרת שעובדת בדיוק אותו דבר. */}
      {scannerDown && (
        <div
          role="status"
          className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/[0.07] p-3 text-xs leading-relaxed text-foreground/75"
        >
          <b className="font-semibold">
            {isHe ? "הסורק שלנו לא זמין כרגע" : "Our scanner is down right now"}
          </b>{" "}
          {isHe
            ? "וזה אצלנו — לא בצילום שלכם, אז אין טעם לצלם שוב. מלאו את מספר הימים ידנית למטה: זה נספר בדיוק אותו דבר, ואת שאר הסמסטרים אפשר להוסיף בעמוד המילואים."
            : "That's on our side, not your photo — no point re-shooting. Enter the number of days by hand below: it counts exactly the same, and the other semesters can be added on the reserve-duty page."}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground/75">
            {isHe ? "יש לכם טופס 3010? נמלא את הימים בשבילכם" : "Have a Form 3010? We'll fill the days for you"}
          </p>
          <p className="text-xs text-foreground/60">
            {isHe
              ? "מעלים את האישור הרשמי — אנחנו מחלצים את תקופות השירות ומציעים חלוקה לסמסטרים. שום דבר לא נשמר בלי אישור שלכם."
              : "Upload the official confirmation — we extract the service periods and suggest a per-semester split. Nothing is saved without your approval."}
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
        <Button type="button" variant="outline" disabled={scanning} onClick={() => fileRef.current?.click()} className="gap-1.5">
          {scanning ? <Loader2 className="size-4 animate-spin" /> : <Shield className="size-4" />}
          {scanning ? scan.label : isHe ? "העלו טופס 3010" : "Upload Form 3010"}
        </Button>
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

      {summary && (
        <div className="mt-3 space-y-2">
          {/* #7/#37 — the form covers a whole reserve career; only the part
              that overlaps the degree is offered. When we don't know when the
              degree started we say so instead of quietly importing everything. */}
          {summary.startYear == null && (
            <p className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-[11px] leading-relaxed text-status-amber">
              {isHe
                ? "אנחנו לא יודעים מתי התחלתם את התואר, אז לא סיננו כלום — הרשימה כוללת את כל השירות שבטופס. אשרו רק סמסטרים שבהם כבר למדתם (שירות שקדם לתואר לא מזכה בהטבות), או קבעו שנת פתיחה בהגדרות ונסננו לבד."
                : "We don't know when your degree started, so nothing was filtered — the list covers every period on the form. Approve only semesters you actually studied in (pre-degree service grants no benefits), or set your start year in settings and we'll filter it for you."}
            </p>
          )}
          {summary.suggestions.length > 1 && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                const items = summary.suggestions.map((s) => ({
                  academicYear: s.academicYear,
                  semester: s.semester,
                  days: edited[`${s.academicYear}-${s.semester}`] ?? Math.round(s.days),
                }));
                if (onApplyAll) onApplyAll(items);
                else for (const it of items) onApply(it.academicYear, it.semester, it.days);
              }}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent-brand px-3 py-2 text-xs font-semibold text-accent-brand-fg transition-colors hover:bg-accent-brand-hover disabled:opacity-50"
            >
              <Check className="size-3.5" />
              {isHe
                ? `אישור והחלה של הכול (${heNoun(summary.suggestions.length, "סמסטר", "סמסטרים")})`
                : `Apply all (${summary.suggestions.length} semesters)`}
            </button>
          )}
          {summary.suggestions.length === 0 && (
            (summary.preDegree?.length ?? 0) > 0 ? (
              // Ariel, 21.8: "משהו נשבר בקורא של הטופס 3010". Nothing was
              // broken in the reader — it read his form correctly and then hit
              // this branch, which said "there is nothing to import" and
              // stopped. He had declared "שנה א׳" while his grade sheet showed
              // a full year already done, so the degree was anchored a year
              // late and ALL his service fell before it.
              //
              // The old copy named neither the anchor it used nor a way to
              // change it, so the only recoverable move was the one he found:
              // delete the account and start again. A dead end that hides the
              // number it is reasoning from is worse than an error.
              <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2.5">
                <p className="text-[11px] font-semibold leading-relaxed text-status-amber">
                  {isHe
                    ? `כל השירות שבטופס קדם לתחילת התואר, אז אין מה לייבא.`
                    : "All service on the form predates the start of your degree, so there is nothing to import."}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-foreground/60">
                  {isHe ? (
                    <>
                      אנחנו מניחים שהתואר שלכם התחיל ב־
                      <b>{startYearLabel ?? "—"}</b>, והשירות המוקדם ביותר בטופס הוא מ־
                      <b>{earliestPreDegreeLabel ?? "—"}</b>.{" "}
                      {onSetStartYear
                        ? "אם התחלתם ללמוד קודם — עדכנו כאן ונחשב מחדש."
                        : "אם התחלתם ללמוד קודם, עדכנו את שנת הפתיחה בהגדרות ונחשב מחדש."}
                    </>
                  ) : (
                    <>
                      We are assuming your degree began in <b>{startYearLabel ?? "—"}</b>, and the
                      earliest service on the form is from <b>{earliestPreDegreeLabel ?? "—"}</b>.{" "}
                      {onSetStartYear
                        ? "If you started earlier, correct it here and we'll recalculate."
                        : "If you started earlier, set your start year in settings and we'll recalculate."}
                    </>
                  )}
                </p>
                {onSetStartYear && earliestPreDegreeYear != null && (
                  <button
                    type="button"
                    onClick={() => onSetStartYear(earliestPreDegreeYear)}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-background px-2.5 py-1.5 text-[11px] font-semibold text-status-amber transition-colors hover:bg-amber-500/10"
                  >
                    <Check className="size-3" />
                    {isHe
                      ? `התחלתי ב־${earliestPreDegreeLabel} — עדכנו וחשבו מחדש`
                      : `I started in ${earliestPreDegreeLabel} — update and recalculate`}
                  </button>
                )}
              </div>
            ) : (
              <p className="text-xs text-foreground/60">
                {isHe
                  ? "לא נמצאו תקופות בטווח הלוחות המוכרים — אפשר להזין ידנית למטה."
                  : "No periods within the known calendars — enter manually below."}
              </p>
            )
          )}
          {summary.suggestions.map((s) => {
            const key = `${s.academicYear}-${s.semester}`;
            const days = edited[key] ?? Math.round(s.days);
            const current = existing.find((r) => r.academicYear === s.academicYear && r.semester === s.semester);
            return (
              <div key={key} className="flex flex-wrap items-center gap-2 rounded-lg border border-border/50 p-2 text-xs">
                <span className="min-w-0 flex-1 text-foreground/75">
                  <Bidi text={isHe ? `${s.labelHe} · ${s.semester === "FALL" ? "סמסטר א׳" : "סמסטר ב׳"}` : `${s.academicYear} · ${s.semester === "FALL" ? "Fall" : "Spring"}`} />
                  <span className="text-foreground/60">
                    {" "}({s.periodCount} {isHe ? "תקופות" : "periods"})
                  </span>
                </span>
                <input
                  type="number"
                  min={0}
                  max={366}
                  value={days}
                  aria-label={isHe ? `ימי שירות ל${s.labelHe}` : `Service days for ${s.labelHe}`}
                  onChange={(e) => setEdited((prev) => ({ ...prev, [key]: Math.max(0, Math.min(366, parseInt(e.target.value, 10) || 0)) }))}
                  className="w-16 rounded-md border border-border bg-card px-2 py-1 text-center font-mono"
                  dir="ltr"
                />
                {current && current.daysServed !== days && (
                  <span className="rounded bg-amber-500/10 px-1.5 py-px text-[10px] font-semibold text-status-amber">
                    {isHe ? <>רשום כרגע <bdi dir="ltr">{current.daysServed}</bdi> — יוחלף</> : `Recorded ${current.daysServed} — will replace`}
                  </span>
                )}
                <Button type="button" size="sm" disabled={pending} onClick={() => onApply(s.academicYear, s.semester, days)} className="h-7 px-2.5 text-xs">
                  {isHe ? "החילו לסמסטר" : "Apply"}
                </Button>
              </div>
            );
          })}
          {(summary.preDegree?.length ?? 0) > 0 && (
            // #7/#37 — shown, never offered: the student sees that we READ these
            // rows and deliberately kept them out of the degree.
            <details className="rounded-lg border border-border/40 bg-foreground/[0.02] p-2.5">
              <summary className="cursor-pointer text-[11px] font-medium text-foreground/60">
                <Bidi
                  text={
                    isHe
                      ? `${heNoun(summary.preDegree.length, "סמסטר", "סמסטרים")} בטופס קדמו לתחילת התואר — לא ייובאו`
                      : `${summary.preDegree.length} semester(s) on the form predate your degree — not imported`
                  }
                />
              </summary>
              <ul className="mt-2 space-y-1 text-[11px] text-foreground/60">
                {summary.preDegree.map((s) => (
                  <li key={`pre-${s.academicYear}-${s.semester}`}>
                    <Bidi
                      text={
                        isHe
                          ? `${s.labelHe} · ${s.semester === "FALL" ? "סמסטר א׳" : "סמסטר ב׳"} — ${heNoun(Math.round(s.days), "יום", "ימים")}`
                          : `${s.academicYear} · ${s.semester === "FALL" ? "Fall" : "Spring"} — ${Math.round(s.days)} days`
                      }
                    />
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[10px] leading-relaxed text-foreground/60">
                {isHe
                  ? "הטופס מכסה את כל שירות המילואים שלכם, וההטבות מחושבות רק על התואר. אם שנת הפתיחה של התואר שגויה — תקנו אותה בהגדרות והעלו את הטופס שוב."
                  : "The form covers your entire reserve service; the benefits only cover the degree. If your degree start year is wrong, fix it in settings and upload the form again."}
              </p>
            </details>
          )}
          {summary.unmapped.length > 0 && (
            // #21 (12.7) — the old one-line dump of 14 periods was unreadable.
            // Collapsed by default; opens to a proper table, oldest first.
            <details className="rounded-lg border border-border/40 bg-foreground/[0.02] p-2.5">
              <summary className="cursor-pointer text-[11px] font-medium text-foreground/60">
                {isHe
                  ? `עוד ${summary.unmapped.length} תקופות שירות שלא שויכו לסמסטר — לפירוט`
                  : `${summary.unmapped.length} more service period(s) not assigned to a semester — details`}
              </summary>
              <table className="mt-2 w-full text-[11px]">
                <thead>
                  <tr className="text-foreground/60">
                    <th className="pb-1 pe-3 text-start font-medium">{isHe ? "מתאריך" : "From"}</th>
                    <th className="pb-1 pe-3 text-start font-medium">{isHe ? "עד תאריך" : "To"}</th>
                    <th className="pb-1 text-start font-medium">{isHe ? "ימים" : "Days"}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...summary.unmapped]
                    // DD/MM/YYYY sorts wrong as a raw string (by day-of-month) —
                    // key on YYYYMMDD so the periods are truly chronological (#45).
                    .sort((a, b) => {
                      const key = (d: string) => {
                        const [dd, mm, yy] = d.split("/");
                        return `${yy ?? ""}${mm ?? ""}${dd ?? ""}`;
                      };
                      return key(a.startDate).localeCompare(key(b.startDate));
                    })
                    .map((p) => (
                      <tr key={`${p.startDate}-${p.endDate}`} className="border-t border-border/30 text-foreground/60">
                        <td className="py-1 pe-3"><bdi dir="ltr">{p.startDate}</bdi></td>
                        <td className="py-1 pe-3"><bdi dir="ltr">{p.endDate}</bdi></td>
                        <td className="py-1 font-mono"><bdi dir="ltr">{p.days}</bdi></td>
                      </tr>
                    ))}
                </tbody>
              </table>
              <p className="mt-1.5 text-[10px] leading-relaxed text-foreground/60">
                {isHe
                  ? "לא הצלחנו לשייך את התקופות האלה לסמסטר — לוחות-הזמנים שבאפליקציה מתחילים בתשפ״ד. אם שירתם בזמן הלימודים לפני כן, הזינו את הימים ידנית לסמסטר המתאים והם ייספרו. שירות שקדם לתואר לא מזכה בהטבות."
                  : "We couldn't assign these periods to a semester — the app's calendars start at 2023-24. If you served during earlier study semesters, enter those days manually for the right semester and they'll count. Service from before the degree doesn't grant benefits."}
              </p>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
