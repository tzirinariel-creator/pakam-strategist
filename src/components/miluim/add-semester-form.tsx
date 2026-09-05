"use client";

import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { miluimYearOptions, getCurrentAcademicYear } from "@/lib/miluim";
import { hebrewYearLabel } from "@/lib/academic-calendar";

/**
 * The one control for "I served in semester X of year Y, this many days".
 *
 * =========================================================================
 * 5.9 — אריאל: *"אם אני סטודנט שנה ג׳ ועשיתי מילואים בשנה א׳ ובשנה ב׳ —
 * אין לי אפשרות להכניס ידנית את התאריכים. תסדר את זה."*
 * =========================================================================
 * המסך שהוא היה בו הוא **אשף ההרשמה**, ושם שאלת המילואים היחידה הייתה
 * "עשיתם מילואים בסמסטר הזה?" — סמסטר אחד, ההווה. סטודנט שנה ג׳ עם שירות
 * בשנה א׳ ובשנה ב׳ יכול היה רק להעלות טופס 3010, ואם אין לו טופס ביד (או
 * שהסורק לא זמין) לא הייתה שום דלת אחרת. הקבוצה שלו נקבעת לפי הסמסטר,
 * והזכאויות נצברות לכל התואר — כלומר בדיוק המידע שאין דרך להזין.
 *
 * הפקד הזה חי גם ב-/miluim (שם הוא היה מאז 14.7) וגם באשף, כדי שהדלת
 * תהיה פתוחה במקום שבו הסטודנט בפועל מספר על עצמו בפעם הראשונה.
 *
 * הטופס אינו יודע לשמור — הוא מדווח החוצה דרך `onAdd`, כך ששני המסכים
 * שומרים דרך אותה `user.upsertMiluimSemester` עם התנהגויות ה-undo/ה-toast
 * שכל אחד מהם צריך.
 */
export function AddMiluimSemesterForm({
  startYear,
  isHe,
  pending,
  onAdd,
  compact = false,
}: {
  /** The degree-start anchor — bounds the year list from below. */
  startYear: number | null | undefined;
  isHe: boolean;
  pending: boolean;
  onAdd: (
    academicYear: number,
    semester: "FALL" | "SPRING",
    daysServed: number,
    isCombat: boolean,
  ) => void;
  /** Denser padding for the onboarding card. */
  compact?: boolean;
}) {
  const yearOptions = miluimYearOptions(startYear);
  const [year, setYear] = useState<number>(
    yearOptions[yearOptions.length - 1] ?? getCurrentAcademicYear(),
  );
  const [semester, setSemester] = useState<"FALL" | "SPRING">("FALL");
  const [days, setDays] = useState<string>("");
  const [isCombat, setIsCombat] = useState(false);

  const submit = () => {
    const n = Number(days);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error(
        isHe ? "כמה ימים שירתם באותו סמסטר?" : "How many days did you serve?",
      );
      return;
    }
    onAdd(year, semester, Math.min(365, Math.round(n)), isCombat);
    setDays("");
  };

  return (
    <div
      className={`flex flex-wrap items-end gap-2 rounded-lg border border-border/40 bg-foreground/[0.02] ${compact ? "p-2" : "p-2.5"}`}
    >
      <label className="flex flex-col gap-1 text-[11px] text-foreground/60">
        {isHe ? "שנה" : "Year"}
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          aria-label={isHe ? "שנת השירות" : "Service year"}
          className="rounded-md border border-border/60 bg-card px-2 py-1.5 text-xs text-foreground/80 focus:outline-none"
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {isHe ? hebrewYearLabel(y) : `${y}/${y + 1}`}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-[11px] text-foreground/60">
        {isHe ? "סמסטר" : "Semester"}
        <select
          value={semester}
          onChange={(e) => setSemester(e.target.value as "FALL" | "SPRING")}
          aria-label={isHe ? "סמסטר השירות" : "Service semester"}
          className="rounded-md border border-border/60 bg-card px-2 py-1.5 text-xs text-foreground/80 focus:outline-none"
        >
          <option value="FALL">{isHe ? "א׳" : "Fall"}</option>
          <option value="SPRING">{isHe ? "ב׳" : "Spring"}</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-[11px] text-foreground/60">
        {isHe ? "ימי שירות" : "Days"}
        <input
          type="number"
          min={1}
          max={365}
          value={days}
          onChange={(e) => setDays(e.target.value)}
          placeholder="0"
          aria-label={isHe ? "ימי שירות בסמסטר" : "Days served that semester"}
          className="w-20 rounded-md border border-border/60 bg-card px-2 py-1.5 text-center font-mono text-xs tabular-nums text-foreground/80 focus:outline-none"
        />
      </label>
      <label className="flex items-center gap-1.5 pb-1.5 text-[11px] text-foreground/60">
        <input
          type="checkbox"
          checked={isCombat}
          onChange={(e) => setIsCombat(e.target.checked)}
          className="size-3.5 accent-current"
        />
        {isHe ? "תפקיד לחימה" : "Combat"}
      </label>
      <button
        type="button"
        disabled={pending}
        onClick={submit}
        className="inline-flex min-h-[32px] items-center gap-1 rounded-md bg-foreground/10 px-2.5 py-1.5 text-xs font-medium text-foreground/75 transition-colors hover:bg-foreground/15 disabled:opacity-50"
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Plus className="size-3.5" />
        )}
        {isHe ? "הוסיפו סמסטר" : "Add semester"}
      </button>
    </div>
  );
}
