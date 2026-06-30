"use client";

import { useState } from "react";
import { Gavel, ChevronDown, AlertTriangle, Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Bidding explainer — mechanics + a pre-bid safety checklist for TAU's
 * course-registration auction (מכרז). Verified facts only, ZERO invented point
 * predictions (the total point quota isn't published, so we never guess it).
 * See docs/דומיין-עומק.md.
 */
export function BiddingExplainer({ isHe }: { isHe: boolean }) {
  const [open, setOpen] = useState(false);

  const mechanics: string[] = isHe
    ? [
        "מכרז, לא כל-הקודם-זוכה: המציע הגבוה ביותר זוכה בקורס. מתי הקלדת את ההעדפות — לא משנה.",
        "2 מקצים. בכל מקצה מקבלים את כל הנקודות מחדש.",
        "מינימום 5 נקודות לקורס. סך הנקודות מתפרסם רק במסך הבידינג עצמו.",
        "הרצאה + תרגיל = יחידה אחת. הנקודות הולכות לשילוב המועדף בלבד.",
        "שוויון בסף הקובע → הגרלה אקראית של המחשב.",
        "ביטול בין מקצים מחזיר את נקודות הקורס לשימוש במקצה הבא.",
        "פכ\"מ פטור מדרישות-קדם — הן עצה לסדר, לא חסם לרישום.",
      ]
    : [
        "It's an auction, not first-come: the highest bidder wins. When you typed your preferences doesn't matter.",
        "2 rounds. Every round your full point quota resets.",
        "Minimum 5 points per course. The total quota appears only on the bidding screen itself.",
        "Lecture + tutorial are one unit. Points go to your single preferred combination.",
        "A tie at the cutoff is broken by a random computer draw.",
        "Cancelling between rounds refunds that course's points for the next round.",
        "PPE is exempt from prerequisites — they're ordering advice, not a registration gate.",
      ];

  return (
    <div className="data-card overflow-hidden p-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-4 text-start transition-colors hover:bg-foreground/[0.02]"
      >
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.06] text-foreground/60">
          <Gavel className="size-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground/85">
            {isHe ? "איך עובד הבידינג?" : "How bidding works"}
          </p>
          <p className="text-xs text-foreground/50">
            {isHe
              ? "המנגנון + צ'קליסט בטיחות לפני מכרז"
              : "The mechanics + a pre-bid safety checklist"}
          </p>
        </div>
        <ChevronDown
          className={cn("size-4 shrink-0 text-foreground/40 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="space-y-3 border-t border-border/50 p-4">
          {/* The single biggest trap, highlighted */}
          <div className="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/[0.06] p-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
            <p className="text-xs leading-relaxed text-foreground/75">
              <span className="font-semibold">
                {isHe ? "המלכודת הגדולה: " : "The big trap: "}
              </span>
              {isHe
                ? "רישום לקורס שחופף בזמן (אפילו חלקית) לקורס שכבר התקבלת אליו — מבטל אוטומטית את הקודם. הבקשה האחרונה מנצחת. בדוק התנגשויות לפני שאתה מגיש."
                : "Registering for a course that overlaps in time (even partially) with one you already got — auto-cancels the earlier one. Last request wins. Check for clashes before you bid."}
            </p>
          </div>

          <ul className="space-y-1.5">
            {mechanics.map((m, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-foreground/70">
                <Check className="mt-0.5 size-3.5 shrink-0 text-foreground/40" />
                <span className="leading-snug">{m}</span>
              </li>
            ))}
          </ul>

          <p className="text-[10px] leading-tight text-foreground/40">
            {isHe
              ? "מנגנון יציב. איננו מנחשים כמה נקודות צריך לקורס — זה משתנה כל סמסטר ולא מתפרסם מראש."
              : "Stable mechanism. We don't guess how many points a course needs — it changes each semester and isn't published in advance."}
          </p>
        </div>
      )}
    </div>
  );
}
