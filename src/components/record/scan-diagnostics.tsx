import { Bidi } from "@/lib/bidi";
import { heNoun, heNounF } from "@/lib/he-count";
import { sheetSemesterLabel } from "@/lib/sheet-semester-label";
import type { ScanDiagnostics } from "@/lib/grade-sheet";

// =========================================================================
// "חסר לכם קורס?" — the panel, rewritten to be for a student
// =========================================================================
// Built on 14.8 to answer a real question: Ariel uploaded his sheet and
// courses he had grades for came back "בלימוד", and we could not tell him
// whether the photo was unreadable there or our code lost the row. Reporting
// the SHAPE of the read made that answerable, and that part was right.
//
// What was wrong was who it was written for. Ariel, 21.8: "לא מבין למה החלק
// הזה חשוב ואיך ולמה הוא מופיע". It opened with a paragraph of instructions
// and then six rows of telemetry — "שורות בקריאה הראשונה: 20", "שורות בקריאת
// האימות: 20", "שורות ששתי הקריאות לא הסכימו עליהן: 0" — which is a log line
// with a Hebrew label on it. A student reading "20 / 20 / 0" learns nothing,
// because those numbers only mean anything to someone who knows there are two
// reads and why.
//
// So it now leads with the ANSWER in a sentence — which semesters the file
// covered and what was found — and keeps the mechanics for the only case where
// they matter: when the two reads disagreed, or the verifying read did not run.
// A number that cannot change what the reader does is not information.
//
// It is also named for the reason someone opens it. Nobody wonders "what did
// the scanner read"; they wonder "where is my course".
export function ScanDiagnosticsPanel({ d, isHe }: { d: ScanDiagnostics; isHe: boolean }) {
  // Semesters, said the way the student's own sheet says them, not as "2025/1".
  const semesterText =
    d.semesters.length > 0
      ? d.semesters
          .map((s) => sheetSemesterLabel(s, isHe ? "he" : "en")?.text ?? s)
          .join(isHe ? " · " : ", ")
      : null;

  // The mechanics are only worth showing when they indicate something. A clean
  // read has nothing to add beyond the sentence above it.
  const somethingOff = d.disputed > 0 || d.verifyFailed;

  return (
    <details className="mt-4 rounded-xl border border-border/70 bg-card/50 px-4 py-3 text-sm">
      <summary className="cursor-pointer select-none font-medium text-foreground/70">
        {isHe ? "חסר לכם קורס מהגיליון?" : "Missing a course from your sheet?"}
      </summary>

      {/* What we read, as a sentence. */}
      <p className="mt-2.5 text-xs leading-relaxed text-foreground/70">
        {isHe ? (
          <>
            קראנו {heNoun(d.firstReadRows, "שורה", "שורות")} מהקובץ
            {semesterText ? <>, מ־{semesterText}</> : null}:{" "}
            {/* heNoun מחזיר את המספר בתוך המחרוזת, אז <Bidi text={n}/> לפניו
                הדפיס אותו פעמיים: "7 7 קורסים עם ציון". וההצמדה השנייה הייתה
                גרועה יותר — heNoun עם יחיד ורבים זהים ייצר "שעדיין בלימוד אחד"
                כשהיה קורס אחד. זה המסך הראשון שסטודנט חדש רואה אחרי שהעלה
                גיליון ציונים. */}
            <Bidi text={heNoun(d.withGrade, "קורס עם ציון", "קורסים עם ציון")} />
            {d.withoutGrade > 0 && (
              <>
                {" "}ועוד{" "}
                {d.withoutGrade === 1 ? (
                  "אחד שעדיין בלימוד"
                ) : (
                  <>
                    <Bidi text={d.withoutGrade} /> שעדיין בלימוד
                  </>
                )}
              </>
            )}
            .
          </>
        ) : (
          <>
            We read {d.firstReadRows} row{d.firstReadRows === 1 ? "" : "s"} from the file
            {semesterText ? `, covering ${semesterText}` : ""}: {d.withGrade} with a grade
            {d.withoutGrade > 0 ? `, and ${d.withoutGrade} still in progress` : ""}.
          </>
        )}
      </p>

      {/* The only advice that changes what the reader does. */}
      <p className="mt-2 text-xs leading-relaxed text-foreground/60">
        {isHe
          ? semesterText
            ? `אם הקורס שחסר לכם נלמד בסמסטר שלא מופיע למעלה, העמוד הזה של הגיליון לא הגיע אלינו — העלו את ה-PDF המלא במקום צילום של עמוד אחד. אם הסמסטר כן מופיע, סמנו את הקורס ידנית ברשימה למטה.`
            : "לא זיהינו סמסטרים בקובץ, אז ייתכן שהעמוד לא נקרא במלואו. שווה להעלות את ה-PDF המלא."
          : semesterText
            ? "If the missing course was taken in a semester not listed above, that page never reached us — upload the full PDF rather than a photo of one page. If the semester IS listed, tick the course manually in the list below."
            : "We couldn't identify any semesters in the file, so the page may not have been read in full. Worth uploading the complete PDF."}
      </p>

      {somethingOff && (
        <div className="mt-3 rounded-lg border border-alert-amber/30 bg-alert-amber/[0.06] p-2.5">
          <p className="text-xs leading-relaxed text-foreground/70">
            {isHe ? (
              d.verifyFailed ? (
                "קראנו את הגיליון פעמיים כדי להצליב, והקריאה השנייה לא הצליחה הפעם — אז מה שלמעלה מבוסס על קריאה אחת. שווה לעבור על השורות בעין."
              ) : (
                <>
                  קראנו את הגיליון פעמיים, ובשתי הקריאות היו{" "}
                  {/* heNounF ולא heNoun — "שורה" נקבה, והיחיד יצא "שורה
                      שלא הסכימו עליה אחד". */}
                  <Bidi text={heNounF(d.disputed, "שורה שלא הסכימו עליה", "שורות שלא הסכימו עליהן")} /> — כדאי
                  לבדוק אותן ידנית לפני שמאשרים.
                </>
              )
            ) : d.verifyFailed ? (
              "We read the sheet twice to cross-check, and the second read failed this time — so the above comes from a single read. Worth checking the rows by eye."
            ) : (
              <>
                We read the sheet twice, and the two reads disagreed on {d.disputed} row
                {d.disputed === 1 ? "" : "s"} — worth checking those by hand before applying.
              </>
            )}
          </p>
        </div>
      )}
    </details>
  );
}
