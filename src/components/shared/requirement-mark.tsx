"use client";

import { useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import {
  requirementOf,
  requirementLabel,
  type RequirementInput,
} from "@/lib/course-requirement";

// =========================================
// חובה / בחירה — הסימון שאורי חיפש ולא מצא
// =========================================
// שיקול העיצוב, ולמה לא עוד תג צבעוני. שורת הקורס כבר נושאת תג תחום צבעוני
// (כלכלה / פילוסופיה / מדע המדינה), ציון, ולפעמים אזהרת ידיעון. גיל אמרה
// על האפליקציה "בתחושה שלה זה יחסית עמוס, בכותרות וכו". צבע רביעי היה מוסיף
// רעש בדיוק במקום שבו צריך שקט.
//
// לכן ההיררכיה היא במשקל, לא בגוון:
//   חובה  — מסגרת דקה, טקסט בצבע הטקסט הרגיל. נקרא כמו אילוץ.
//   בחירה — טקסט מעומעם בלבד, בלי מסגרת. נקרא כמו הערה.
// שתיהן מוצגות, כי "אין תווית" הוא מידע עמום: הסטודנט לא יודע אם הקורס בחירה
// או שפשוט לא ידוע לנו. קורס שהסטודנט הוסיף בעצמו מחזיר null ואינו מקבל
// תווית — שם באמת אין לנו תשובה, ויש לו כבר תווית משלו.

export function RequirementMark({
  course,
  className,
}: {
  course: RequirementInput | null | undefined;
  className?: string;
}) {
  const isHe = useLocale() === "he";
  const req = requirementOf(course);
  const label = requirementLabel(req, isHe);
  if (!label) return null;

  const strong = req === "MANDATORY" || req === "SEMINAR";

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full text-[10px] leading-none",
        strong
          ? "border border-foreground/25 px-1.5 py-0.5 font-medium text-foreground/80"
          : "px-0.5 py-0.5 text-muted-foreground",
        className,
      )}
    >
      {label}
    </span>
  );
}
