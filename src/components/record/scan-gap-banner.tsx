import { AlertTriangle } from "lucide-react";
import { Bidi } from "@/lib/bidi";
import type { ScanDiagnostics } from "@/lib/grade-sheet";

// =========================================================================
// "הסריקה פספסה קורסים" — the banner Ariel needed and did not have
// =========================================================================
// He scanned the same sheet twice, days apart. Both times דוגרי (93) and
// משבר האקלים (94) never arrived, and אסטרטגיה and the English course arrived
// with their grades stripped. Both times the screen looked like a clean
// success, because a row the model never returns leaves nothing behind to
// notice. He only found out by checking his ש״ס total by hand — twice.
//
// The census (see grade-sheet.ts) asks a deliberately easier question and
// tells us which codes are missing. This says so OUT LOUD, above the fold,
// before the student confirms anything. It is not in the collapsed diagnostics
// panel on purpose: a collapsed disclosure is something you find only if you
// already suspect the bug.
//
// It never fills anything in. It names what is missing and hands the decision
// to the student — the iron rule is that we do not invent a grade, not that we
// stay quiet about one we may have lost.
export function ScanGapBanner({
  d,
  isHe,
  courseNameFor,
}: {
  d: ScanDiagnostics;
  isHe: boolean;
  /** Catalog name for a code, when we have one — a code alone is unreadable. */
  courseNameFor?: (code: string) => string | null;
}) {
  const missing = d.missingRows ?? [];
  const lostGrades = d.missingGrades ?? [];
  if (missing.length === 0 && lostGrades.length === 0) return null;

  const label = (code: string) => {
    const name = courseNameFor?.(code);
    return name ? `${name}` : code;
  };

  return (
    <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
      <p className="flex items-start gap-2 font-semibold text-amber-800 dark:text-amber-300">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        {isHe
          ? "בגיליון יש שורות שהקריאה לא החזירה"
          : "The sheet has rows the read didn't return"}
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-foreground/70">
        {isHe
          ? "ספרנו את מספרי הקורסים בגיליון והשווינו למה שנקרא. אלה לא הגיעו — הוסיפו אותם ידנית למטה, ואל תאשרו לפני שהרשימה נכונה."
          : "We counted the course numbers on the sheet and compared them with what was read. These didn't arrive — add them by hand below, and don't confirm until the list is right."}
      </p>

      {missing.length > 0 && (
        <div className="mt-2.5">
          <p className="text-xs font-medium text-foreground/60">
            {isHe ? "קורסים שחסרים לגמרי:" : "Courses missing entirely:"}
          </p>
          <ul className="mt-1 space-y-1">
            {missing.map((m) => (
              <li key={m.courseCode} className="flex items-baseline gap-2 text-xs text-foreground/80">
                <span className="font-mono text-foreground/50"><Bidi text={m.courseCode} /></span>
                <span>{label(m.courseCode)}</span>
                {m.grade != null && (
                  <span className="font-mono font-semibold">
                    {isHe ? "ציון " : "grade "}<Bidi text={m.grade} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {lostGrades.length > 0 && (
        <div className="mt-2.5">
          <p className="text-xs font-medium text-foreground/60">
            {isHe ? "קורסים שהגיעו בלי הציון שמודפס בגיליון:" : "Courses that arrived without the grade printed on the sheet:"}
          </p>
          <ul className="mt-1 space-y-1">
            {lostGrades.map((m) => (
              <li key={m.courseCode} className="flex items-baseline gap-2 text-xs text-foreground/80">
                <span className="font-mono text-foreground/50"><Bidi text={m.courseCode} /></span>
                <span>{label(m.courseCode)}</span>
                <span className="font-mono font-semibold">
                  {isHe ? "בגיליון: " : "on the sheet: "}<Bidi text={m.censusGrade} />
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] leading-relaxed text-foreground/50">
            {isHe
              ? "לא מילאנו את הציון בשבילכם בכוונה — קריאה שנייה היא לא הוכחה. השוו לגיליון ותקנו בשורה עצמה."
              : "We deliberately did not fill the grade in for you — a second read is not proof. Check it against your sheet and fix it on the row itself."}
          </p>
        </div>
      )}
    </div>
  );
}
