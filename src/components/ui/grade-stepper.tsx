"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

// =========================================================================
// בורר ציון — שדה מספר עם ± , במקום מחוון גרירה
// =========================================================================
// אריאל, M37/N12, ואמר את זה יותר מפעם אחת:
//   *"המחשבונים המוזרים האלו — הם עדכניים? הכרחיים? לא מבין מהם כלום"*
//   *"הסקאלה והמחשבון המוזרים בתכנון הציון נראים מיושנים ושבורים.
//     אמרתי 900 פעם"*
//
// שלוש בעיות במחוון הגרירה, וכולן נעלמות עם שדה:
//
// 1. **אי־אפשר לכוון בו מספר מדויק.** סטודנט ששואל "מה יקרה אם אקבל 88"
//    צריך לגרור עד ש-88 יופיע בתווית. שדה מספר עונה על השאלה ישירות.
// 2. **בעברית הוא נגרר לכיוון הלא־אינטואיטיבי.** זו T11, אחת משתי
//    "החלטות הבעלים" שנשארו פתוחות בנוגע ל-RTL של המחוון. שדה מספר
//    פשוט לא נושא את השאלה הזאת — אין לו כיוון.
// 3. **הוא לא נגיש במגע.** ידית של 20px מתחת לרצפת 24px של WCAG 2.5.8.
//    כפתורי ± כאן הם 32px.
//
// המחשבון עצמו נשאר — הוא עונה על שאלה אמיתית ומחושב מהנתונים של
// הסטודנט. רק הפקד הוחלף.
export function GradeStepper({
  value,
  onChange,
  min,
  max = 100,
  step = 1,
  label,
  ariaLabel,
  className,
}: {
  value: number;
  onChange: (n: number) => void;
  min: number;
  max?: number;
  step?: number;
  /** נקרא מעל השדה. */
  label?: React.ReactNode;
  ariaLabel: string;
  className?: string;
}) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  const set = (n: number) => { if (Number.isFinite(n)) onChange(clamp(n)); };

  return (
    <div className={cn("block", className)}>
      {label && (
        <span className="mb-1 block text-[11px] font-medium text-foreground/60">{label}</span>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => set(value - step)}
          disabled={value <= min}
          aria-label={`${ariaLabel} — פחות`}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-foreground/15 bg-card text-foreground/70 transition-colors hover:border-foreground/30 hover:text-foreground disabled:opacity-35 disabled:hover:border-foreground/15"
        >
          <Minus className="size-4" />
        </button>
        {/* dir=ltr על המספר בלבד — המספר תמיד נקרא משמאל לימין, והמסגרת
            סביבו נשארת בכיוון הדף. bdi מונע מהספרות לגרור את מה שלידן. */}
        <input
          type="number"
          inputMode="numeric"
          value={value}
          min={min}
          max={max}
          step={step}
          aria-label={ariaLabel}
          onChange={(e) => set(Number(e.target.value))}
          onBlur={(e) => set(Number(e.target.value))}
          dir="ltr"
          className="h-9 w-20 rounded-lg border border-foreground/15 bg-background text-center font-display tabular text-base font-semibold text-foreground/85 outline-none transition-colors focus:border-accent-brand/60"
        />
        <button
          type="button"
          onClick={() => set(value + step)}
          disabled={value >= max}
          aria-label={`${ariaLabel} — יותר`}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-foreground/15 bg-card text-foreground/70 transition-colors hover:border-foreground/30 hover:text-foreground disabled:opacity-35 disabled:hover:border-foreground/15"
        >
          <Plus className="size-4" />
        </button>
        <span className="text-[11px] text-foreground/50">
          {min}–{max}
        </span>
      </div>
    </div>
  );
}
