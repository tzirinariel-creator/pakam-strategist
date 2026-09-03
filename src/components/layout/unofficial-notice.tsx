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

  // text-xs ולא text-[10px]: `קו-עיצובי.md` קובע ש"משפט שלם לעולם לא מתחת
  // ל-12px", ומנמק בדיוק את המקרה הזה — "כנות בגופן 9px היא לא כנות".
  // זו אזהרת הכנות המרכזית של המוצר, והיא הופיעה בכל מסך בגופן שנועד
  // לתוויות של מילה בודדת.
  if (variant === "compact") {
    return (
      <p className="px-2 text-xs leading-snug text-foreground/60">
        {isHe
          // 21.8 — the first version said "תמיד לאמת מול הידיעון והמזכירות",
          // which is an instruction manual talking, not a person. Same content,
          // said the way you'd say it to a friend.
          ? "בניתי את פכמון כסטודנט — זה לא אתר רשמי של האוניברסיטה, אז שווה להציץ בידיעון לפני החלטות גדולות."
          : "I built Pakamon as a student — it isn't an official university site, so it's worth a look at the ידיעון before any big decision."}
      </p>
    );
  }

  return (
    <div className="flex items-start gap-2 rounded-xl border border-border/60 bg-foreground/[0.02] p-3">
      <Info className="mt-0.5 size-4 shrink-0 text-foreground/60" />
      <div className="text-xs leading-relaxed text-foreground/60">
        <p className="font-semibold text-foreground/75">
          {isHe ? "פכמון הוא לא אתר של האוניברסיטה" : "Pakamon is not a university site"}
        </p>
        <p className="mt-1">
          {isHe
            ? "פכמון נבנה על ידי סטודנט, ומבוסס על הידיעון — אבל הוא לא האתר של האוניברסיטה ולא בא במקומו. קורסים, שעות ומועדי בחינה משתנים במהלך השנה, ולפעמים אנחנו לא מעודכנים."
            : "Pakamon was built by a student, based on the ידיעון — but it isn't the university's site and doesn't stand in for it. Courses, hours and exam dates change during the year, and sometimes we're behind."}
        </p>
        <p className="mt-1">
          {isHe
            ? "אז לפני שנרשמים, מבטלים או מגישים משהו — שווה לבדוק בידיעון או לשאול במזכירות. הם המקור."
            : "So before you register, withdraw or submit anything — check the ידיעון or ask the secretariat. They're the source."}
        </p>
      </div>
    </div>
  );
}
