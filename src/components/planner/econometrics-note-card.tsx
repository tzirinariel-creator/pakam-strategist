"use client";

// -----------------------------------------------------------------------
// The econometrics note, in the planner where the decision is made
// -----------------------------------------------------------------------
// Ariel, 22.8: "לא התייחסת במתכנן לסיפור של האקונומטריקה היישומית וחבל."
//
// It was on the graduation screen, which you reach after planning. Moved to
// where a course still gets added or not.
//
// Deliberately NOT an alert. The secretariat's rule binds only students
// continuing to advanced economics or an economics master's, and dressing a
// conditional rule as a warning would push most of the cohort into a course
// they do not need — which is the same failure as hiding it from the ones who
// do. It states who it applies to, and carries its source.

import { useLocale } from "next-intl";
import { GraduationCap } from "lucide-react";
import { econometricsNote, type EconometricsPlanRow } from "@/lib/econometrics-note";
import { ECONOMETRICS_GATE } from "@/lib/future-plans";
import { Bidi } from "@/lib/bidi";

export function EconometricsNoteCard({
  rows,
  currentYear,
}: {
  rows: EconometricsPlanRow[];
  currentYear: number;
}) {
  const isHe = useLocale() === "he";
  const note = econometricsNote(rows, currentYear);
  if (!note) return null;

  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-4">
      <div className="flex items-start gap-2.5">
        <GraduationCap className="mt-0.5 size-4 shrink-0 text-foreground/45" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-foreground/85">
            {isHe
              ? "ממשיכים לכלכלה מתקדמת או לתואר שני בכלכלה?"
              : "Heading for advanced economics, or an economics master's?"}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-foreground/65">
            {isHe ? ECONOMETRICS_GATE.he : ECONOMETRICS_GATE.en}
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-foreground/50">
            {isHe ? (
              <>
                הקורס אינו בתכנית שלכם כרגע, ואתם בשנה <Bidi text={note.currentYear} /> — עוד אפשר
                להוסיף אותו. אם אתם לא מתכננים להמשיך לשם, אין צורך.
              </>
            ) : (
              <>
                It is not in your plan right now, and you are in year {note.currentYear} — there is
                still room to add it. If you are not continuing there, you do not need it.
              </>
            )}
          </p>
          <p className="mt-1.5 text-[11px] text-foreground/40">
            {isHe ? ECONOMETRICS_GATE.sourceHe : ECONOMETRICS_GATE.sourceEn}
          </p>
        </div>
      </div>
    </div>
  );
}
