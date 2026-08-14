import { Bidi } from "@/lib/bidi";
import type { ScanDiagnostics } from "@/lib/grade-sheet";

// =========================================================================
// What the scan actually saw (14.8)
// =========================================================================
// Ariel uploaded his real sheet and courses he already has grades for came
// back "בלימוד". We could not answer him, because the model's raw output is
// never stored: "the photo was unreadable there" and "our code lost it" look
// identical from outside. This panel is the smallest honest fix — it reports
// the SHAPE of the read, so a student can tell us which of the two happened.
// Closed by default; it is a diagnostic, not part of the flow.
export function ScanDiagnosticsPanel({ d, isHe }: { d: ScanDiagnostics; isHe: boolean }) {
  const rows: { label: string; value: string }[] = isHe
    ? [
        {
          label: "הסמסטרים שהקובץ כיסה",
          value: d.semesters.length > 0 ? d.semesters.join(", ") : "לא זוהו",
        },
        { label: "שורות שנקראו בקריאה הראשונה", value: String(d.firstReadRows) },
        {
          label: "שורות בקריאת האימות",
          value: d.verifyFailed
            ? "האימות לא רץ"
            : d.verifyReadRows === null
              ? "לא רץ"
              : String(d.verifyReadRows),
        },
        { label: "קורסים עם ציון", value: String(d.withGrade) },
        { label: "קורסים בלי ציון (בלימוד)", value: String(d.withoutGrade) },
        { label: "שורות ששתי הקריאות לא הסכימו עליהן", value: String(d.disputed) },
      ]
    : [
        {
          label: "Semesters the file covered",
          value: d.semesters.length > 0 ? d.semesters.join(", ") : "none detected",
        },
        { label: "Rows in the first read", value: String(d.firstReadRows) },
        {
          label: "Rows in the verification read",
          value: d.verifyFailed
            ? "verification did not run"
            : d.verifyReadRows === null
              ? "did not run"
              : String(d.verifyReadRows),
        },
        { label: "Courses with a grade", value: String(d.withGrade) },
        { label: "Courses with no grade (in progress)", value: String(d.withoutGrade) },
        { label: "Rows the two reads disagreed on", value: String(d.disputed) },
      ];

  return (
    <details className="mt-4 rounded-xl border border-border/70 bg-card/50 px-4 py-3 text-sm">
      <summary className="cursor-pointer select-none font-medium text-foreground/70">
        {isHe ? "מה הסורק קרא בפועל" : "What the scanner actually read"}
      </summary>
      <p className="mt-2 text-xs leading-relaxed text-foreground/60">
        {isHe
          ? "אם חסר לכם קורס שיש לכם בו ציון — התחילו מהשורה הראשונה: אם הסמסטר שבו למדתם אותו לא מופיע שם, העמוד ההוא של הגיליון פשוט לא הגיע אלינו. העלו את ה-PDF המלא במקום צילום של עמוד אחד."
          : "If a course you have a grade for is missing, start with the first row: if the semester you took it in isn't listed, that page of the sheet never reached us. Upload the full PDF instead of a photo of one page."}
      </p>
      <dl className="mt-3 space-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-4">
            <dt className="text-foreground/70">{r.label}</dt>
            <dd className="font-mono text-foreground tabular-nums">
              <Bidi text={r.value} />
            </dd>
          </div>
        ))}
      </dl>
      {d.verifyFailed && (
        <p className="mt-3 text-xs leading-relaxed text-alert-amber">
          {isHe
            ? "הקריאה השנייה (זו שמאמתת את הראשונה) לא הצליחה הפעם, אז מה שאתם רואים מבוסס על קריאה אחת בלבד. שווה לעבור על השורות בעין."
            : "The second, verifying read failed this time, so what you see comes from a single read. Worth checking the rows by eye."}
        </p>
      )}
    </details>
  );
}
