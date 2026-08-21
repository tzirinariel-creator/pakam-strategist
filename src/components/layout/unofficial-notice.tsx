"use client";

// =========================================================================
// "זו לא אפליקציה רשמית" — said plainly, where it matters
// =========================================================================
// Ariel, 21.8: "בכל מקרה תכין אזהרה כזאת - שזאת לא אפליקציה רשמית ושחשוב
// לוודא מול הידיעון את הדברים".
//
// He is right and it is overdue. Pakamon reads the ידיעון, but it is a
// student's project, the catalog can go stale mid-year, and a student who
// plans a degree on it deserves to know that before they rely on it — not
// after something goes wrong. The app already refuses to invent a grade or a
// date; this is the same honesty at the level of the whole product.
//
// Two shapes, because two situations:
//   `compact`  — one quiet line, for chrome that is always on screen.
//   `full`     — a bordered notice for the screens that decide things:
//                track check, the planner, the graduation calculator.
// Neither is dismissible. A disclaimer you can dismiss is decoration.
import { useLocale } from "next-intl";
import { Info } from "lucide-react";

export function UnofficialNotice({ variant = "full" }: { variant?: "compact" | "full" }) {
  const isHe = useLocale() === "he";

  if (variant === "compact") {
    return (
      <p className="px-2 text-[10px] leading-tight text-foreground/30">
        {isHe
          ? "פכמון הוא כלי עזר של סטודנטים — לא אתר רשמי של האוניברסיטה. תמיד לאמת מול הידיעון והמזכירות."
          : "Pakamon is a student-built helper — not an official university site. Always verify against the ידיעון and the secretariat."}
      </p>
    );
  }

  return (
    <div className="flex items-start gap-2 rounded-xl border border-border/60 bg-foreground/[0.02] p-3">
      <Info className="mt-0.5 size-4 shrink-0 text-foreground/40" />
      <div className="text-xs leading-relaxed text-foreground/60">
        <p className="font-semibold text-foreground/75">
          {isHe ? "פכמון הוא כלי עזר, לא מקור רשמי" : "Pakamon is a helper, not an official source"}
        </p>
        <p className="mt-1">
          {isHe
            ? "האפליקציה נבנתה על ידי סטודנט ומבוססת על הידיעון, אבל היא לא אתר רשמי של אוניברסיטת תל אביב ולא מחליפה אותו. קורסים, שעות, מועדי בחינה ודרישות משתנים במהלך השנה."
            : "This app was built by a student and is based on the ידיעון, but it is not an official Tel Aviv University site and does not replace one. Courses, hours, exam dates and requirements change during the year."}
        </p>
        <p className="mt-1">
          {isHe
            ? "לפני כל החלטה שמשפיעה על התואר — רישום, ביטול, הגשה — אמתו מול הידיעון הרשמי ומול המזכירות."
            : "Before any decision that affects your degree — registering, withdrawing, submitting — verify against the official ידיעון and the secretariat."}
        </p>
      </div>
    </div>
  );
}
