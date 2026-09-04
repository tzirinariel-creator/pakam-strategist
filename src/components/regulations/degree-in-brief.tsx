"use client";

import { GraduationCap } from "lucide-react";
import { Bidi } from "@/lib/bidi";
import { heNoun } from "@/lib/he-count";
import { CREDIT_REQUIREMENTS, SEMINAR_REQUIREMENTS } from "@/lib/constants";
import { getActiveProgram } from "@/lib/programs/registry";
import { YEAR_CONFIG } from "@/lib/constants";

// =========================================================================
// M33 — "הסבר כללי על דרישות התואר, בצורה פשוטה ומותאמת אישית"
// =========================================================================
// אריאל: *"למה שבכניסה לדרישות התואר לא יהיה הסבר כללי על דרישות התואר
// בצורה פשוטה ומותאמת אישית?"*
//
// ההערה סומנה 🟡 עם ההסבר "נוסף הסבר בראש המסך". פתחתי את המסך החי ב-4.9
// ולא היה שם הסבר: המסך נפתח על **מונים** — "12/27 דרישות הושלמו · 2
// אזהרה · 0 הפרות". זה לוח מחוונים למי שכבר יודע מה הדרישות. אריאל ביקש
// את מה שמסביר אותן. ההערה הוחזרה לפתוחה ונכתבה מחדש.
//
// כל מספר כאן נגזר מאותם קבועים שהמנוע עצמו נועל עליהם — לא הוקלד.
// 103 + 12 + 35 = 150, ואומת.
export function DegreeInBrief({
  currentYear,
  earnedCredits,
}: {
  currentYear: number;
  /** ש״ס שכבר נצברו — אותו שדה בדיוק שדף הבית מציג, לא חישוב שני. */
  earnedCredits: number;
}) {
  const R = CREDIT_REQUIREMENTS;
  const disciplines = getActiveProgram()
    .disciplines.filter((d) => d.id !== "GENERAL" && d.id !== "LAW" && d.id !== "PPE_CORE")
    .map((d) => d.nameHe);
  const left = Math.max(0, R.TOTAL - earnedCredits);
  const yearLabel = YEAR_CONFIG[currentYear as keyof typeof YEAR_CONFIG]?.nameHe ?? `שנה ${currentYear}`;

  const parts: { credits: number; title: string; body: string }[] = [
    {
      credits: R.MANDATORY_OFFICIAL,
      title: "חובה",
      body: "הקורסים שכל סטודנט בפכ״מ לומד. אין בהם בחירה, והם קובעים את רוב המערכת בשנתיים הראשונות.",
    },
    {
      credits: R.SEMINAR_TOTAL,
      title: "סמינרים",
      body: `${heNoun(SEMINAR_REQUIREMENTS.PAPERS, "עבודה סמינריונית", "עבודות סמינריוניות")} ו${heNoun(SEMINAR_REQUIREMENTS.REFERATS, "רפרט", "רפרטים")}. נכתבים בעיקר בשנה ג׳.`,
    },
    {
      credits: R.ELECTIVE_TOTAL,
      title: "בחירה",
      body: "אתם בוחרים מהקטלוג. כאן נבנה תחום המיקוד, וכאן יש הכי הרבה מרחב.",
    },
  ];

  return (
    <div className="data-card p-5">
      <div className="flex items-start gap-2.5">
        <GraduationCap className="mt-0.5 size-5 shrink-0 text-accent-brand" />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-base font-bold text-foreground/90">
            מה התואר הזה דורש, בקצרה
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-foreground/70">
            פכ״מ הוא <b><Bidi text={String(R.TOTAL)} /> ש״ס</b> בשלושה חוגים — {disciplines.join(", ")} —
            והם מתחלקים כך:
          </p>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {parts.map((part) => (
              <div key={part.title} className="rounded-lg border border-border/60 bg-foreground/[0.02] p-3">
                <p className="font-display text-lg font-bold text-foreground/85">
                  <Bidi text={String(part.credits)} />{" "}
                  <span className="text-xs font-medium text-foreground/60">ש״ס {part.title}</span>
                </p>
                <p className="mt-1 text-xs leading-relaxed text-foreground/60">{part.body}</p>
              </div>
            ))}
          </div>

          <p className="mt-3 text-sm leading-relaxed text-foreground/70">
            ושתי דרישות שחוצות את החלוקה הזאת:{" "}
            <b>תחום מיקוד</b> — לפחות <Bidi text={String(R.FOCUS_AREA_MIN)} /> ש״ס באחד החוגים,
            ו<b>{heNoun(R.ENGLISH_MIN_COURSES, "קורס תוכן באנגלית", "קורסי תוכן באנגלית")}</b> —
            אלה לא קורסי רמה, וגם מי שקיבל פטור מאנגלית עדיין חייב אותם.
          </p>

          {/* M49 — "זה לא מגיע ל-150 אפילו. אתה סגור על מה שכתוב כאן?"
              סטודנט שסופר את קורסי החובה בקטלוג יגיע ל-101, לא ל-103.
              ההפרש הוא קורס שטרם פורסם, וזה נאמר כאן במקום להשאיר אותו
              כפער שהוא יגלה לבד. */}
          {R.MANDATORY_UNPUBLISHED > 0 && (
            <p className="mt-2 text-xs leading-relaxed text-foreground/55">
              הערה קטנה על החובה: בקטלוג תמצאו כרגע{" "}
              <Bidi text={String(R.MANDATORY_TOTAL)} /> ש״ס חובה ולא{" "}
              <Bidi text={String(R.MANDATORY_OFFICIAL)} />. ההפרש —{" "}
              <Bidi text={String(R.MANDATORY_UNPUBLISHED)} /> ש״ס — הוא קורס פכ״מ שטרם פורסם.
              לא המצאנו לו מקום במערכת.
            </p>
          )}

          <div className="mt-3 border-t border-border/50 pt-3">
            <p className="text-sm leading-relaxed text-foreground/80">
              <b>אצלכם:</b> אתם ב{yearLabel}, עם <Bidi text={String(earnedCredits)} /> מתוך{" "}
              <Bidi text={String(R.TOTAL)} /> ש״ס.{" "}
              {left > 0 ? (
                <>נשארו <Bidi text={String(left)} /> ש״ס.</>
              ) : (
                <>השלמתם את מכסת הש״ס.</>
              )}
            </p>
            <p className="mt-1 text-xs text-foreground/55">
              המספרים מתקנון פכ״מ ומהקטלוג הפעיל. מה שלמטה הוא הבדיקה שלכם מולם, כלל אחר כלל.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
