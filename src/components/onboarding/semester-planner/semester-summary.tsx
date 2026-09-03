"use client";

import { useTranslations, useLocale } from "next-intl";
import { CheckCircle, Calendar, Feather, Gauge, Weight, Flame, Plus, Pencil, Loader2, Users } from "lucide-react";
import { isBiddingRelevant } from "@/lib/bidding-calendar";
import { cn } from "@/lib/utils";
import { Bidi } from "@/lib/bidi";
import { calculateHonestLoad, type HonestLoadLabel } from "@/lib/workload-calculator";
import { SEMESTER_CONFIG, YEAR_CONFIG, CREDIT_REQUIREMENTS } from "@/lib/constants";
import type { CourseWithSchedule } from "@/lib/plan-generator";
import { heNoun } from "@/lib/he-count";

// P3′ — the summary speaks the HONEST load language (worst real pain), not a
// magic 0-100 level. Same vocabulary as the insights bar.
const LEVEL_ICONS: Record<HonestLoadLabel, React.ComponentType<{ className?: string }>> = {
  light: Feather,
  hours: Gauge,
  credits: Weight,
  examCrunch: Flame,
};

const LEVEL_LABELS_HE: Record<HonestLoadLabel, string> = {
  light: "עומס קל",
  hours: "שבוע עמוס שעות",
  credits: "עומס ש״ס",
  examCrunch: "מבחנים צפופים",
};

const LEVEL_LABELS_EN: Record<HonestLoadLabel, string> = {
  light: "Light load",
  hours: "Heavy contact week",
  credits: "Credit-heavy",
  examCrunch: "Exams packed",
};

const LEVEL_COLORS: Record<HonestLoadLabel, string> = {
  light: "text-status-green",
  hours: "text-status-amber",
  credits: "text-status-amber",
  examCrunch: "text-status-red",
};

interface SemesterSummaryProps {
  year: number;
  semester: "FALL" | "SPRING";
  courses: CourseWithSchedule[];
  totalCredits: number;
  hasMoreSemesters: boolean;
  onPlanNext: () => void;
  onFinish: () => void;
  /** Return to editing THIS semester (lossless) — "I forgot something" (#28). */
  onBack: () => void;
  /** Persisting the plan to the server (standalone edit). Drives the finish
   *  button's "saving…" state so the slow prod DB save feels responsive and the
   *  user doesn't double-submit or wonder whether it took (#18). Onboarding
   *  omits it — there the "finish" just advances a step, no async save. */
  isSaving?: boolean;
  /** P4 (note 35): this summary opened AUTOMATICALLY because the semester is
   *  mandatory-heavy — the copy presents a READY recommended timetable to
   *  confirm, not a "you finished building" congratulation. */
  autoRecommended?: boolean;
  /** How many session types are still on the app's DEFAULT group — i.e. what
   *  the student has NOT decided. Derived from their actual picks, so it hits
   *  zero and the nudge disappears once the work is done. (It used to be the
   *  catalog's multi-group course count, which no amount of picking could ever
   *  satisfy: you could choose every group and still be told "בחרו את שלכם".) */
  unchosenGroupCount?: number;
  /** 18:19 (#6) — when the declared semester has already ENDED, group choice
   *  is moot (you're just marking what you took) — suppress the nudge. */
  semesterOver?: boolean;
}

export function SemesterSummary({
  year,
  semester,
  courses,
  totalCredits,
  hasMoreSemesters,
  onPlanNext,
  onFinish,
  onBack,
  isSaving = false,
  autoRecommended = false,
  unchosenGroupCount = 0,
  semesterOver = false,
}: SemesterSummaryProps) {
  const t = useTranslations("onboarding");
  const locale = useLocale();
  const isHe = locale === "he";

  // Three verifiable facts (P3′): contact hours from the actual grid sessions
  // (the caller passes semester+group-filtered courses), ש״ס, exam density.
  const honest = calculateHonestLoad(
    courses.map((c) => ({
      credits: c.credits,
      // sessionType/groupCode are passed so the de-duplication inside
      // calculateHonestLoad can tell a genuine second meeting from a duplicate
      // catalog row — without them this card announced "8 שעות שבועיות" over a
      // timetable rendering 6 for the same courses (#13.8).
      sessions: (c.scheduleSessions ?? []).map((s) => ({
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
        sessionType: s.sessionType,
        groupCode: s.groupCode ?? null,
      })),
      examDate: c.examDateA ?? null,
    }))
  );

  const semesterCredits = courses.reduce((s, c) => s + c.credits, 0);
  const yearLabel = isHe
    ? YEAR_CONFIG[year as 1 | 2 | 3]?.nameHe
    : YEAR_CONFIG[year as 1 | 2 | 3]?.nameEn;
  const semLabel = isHe
    ? SEMESTER_CONFIG[semester]?.nameHe
    : SEMESTER_CONFIG[semester]?.nameEn;
  const levelLabel = isHe ? LEVEL_LABELS_HE[honest.label] : LEVEL_LABELS_EN[honest.label];
  const IconComponent = LEVEL_ICONS[honest.label] ?? Feather;

  return (
    <div className="animate-fade-in w-full max-w-md mx-auto">
      <div className="data-card space-y-5 p-6 text-center">
        {/* Success icon */}
        <div className="flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-400/10">
            <CheckCircle className="h-7 w-7 text-status-green" />
          </div>
        </div>

        <div>
          <h3 className="text-lg font-bold text-foreground/90">
            {autoRecommended
              ? (isHe ? "המערכת המומלצת מוכנה" : "Your recommended timetable is ready")
              : t("semesterDone")}
          </h3>
          <p className="mt-1 text-sm text-foreground/60">
            {yearLabel} · {semLabel}
          </p>
          {autoRecommended && (
            <p className="mt-1.5 text-xs text-foreground/60">
              {isHe
                ? "רוב הסמסטר הזה חובה, אז הרכבנו אותו בשבילכם — אפשר לאשר, או לחזור לעריכה ולשנות."
                : "Most of this semester is mandatory, so we assembled it for you — confirm, or go back and tweak."}
            </p>
          )}
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-foreground/5 p-3">
            <div className="font-mono text-xl font-bold text-foreground/80">{courses.length}</div>
            <div className="text-[10px] text-foreground/60">{t("courses")}</div>
          </div>
          <div className="rounded-lg bg-foreground/5 p-3">
            <div className="font-mono text-xl font-bold text-foreground/80">{semesterCredits}</div>
            <div className="text-[10px] text-foreground/60">{t("nz")}</div>
          </div>
          <div
            className="rounded-lg bg-foreground/5 p-3"
            title={
              isHe
                ? `${honest.weeklyHours} שעות לימוד בשבוע · ${honest.credits} ש״ס${honest.tightestExamGapDays != null ? ` · מרווח מבחנים צפוף ביותר ${heNoun(honest.tightestExamGapDays, "יום", "ימים")}` : ""}`
                : `${honest.weeklyHours} weekly contact hours · ${honest.credits} cr.${honest.tightestExamGapDays != null ? ` · tightest exam gap ${honest.tightestExamGapDays} days` : ""}`
            }
          >
            <div className={cn("flex items-center justify-center gap-1", LEVEL_COLORS[honest.label])}>
              <IconComponent className="size-5" />
              <span className="font-mono text-xl font-bold">{honest.weeklyHours}</span>
            </div>
            <div className="text-[10px] text-foreground/60">
              {isHe ? "שעות לימוד בשבוע" : "weekly class hours"}
            </div>
          </div>
        </div>

        {/* #6 (12.7) — the load verdict, in a sentence a beginner understands
            instead of a cryptic "ש׳ מגע · מבחנים צפופים" chip. */}
        {honest.label !== "light" && (
          <p className={cn("text-xs leading-relaxed", LEVEL_COLORS[honest.label])}>
            {isHe
              ? honest.label === "examCrunch"
                ? `שימו לב: המבחנים בסמסטר הזה יוצאים קרובים זה לזה${honest.tightestExamGapDays != null ? ` (המרווח הצפוף ביותר — ${heNoun(honest.tightestExamGapDays, "יום", "ימים")})` : ""}. שווה לתכנן את הלמידה מראש — יש לנו כלי בדיוק לזה.`
                : honest.label === "hours"
                  ? `זה שבוע עמוס בשעות (${honest.weeklyHours} שעות-לימוד) — לגמרי אפשרי, רק ודאו שאין יום בלתי-אפשרי.`
                  : `הסמסטר כבד בש״ס — נורמלי לפכ״מ, אבל טוב לדעת את זה מראש.`
              : levelLabel}
          </p>
        )}

        {/* B1 (audit launch-blocker) — the actual courses being confirmed.
            Blind approval on a 3-number card was the worst first-run moment;
            now the beginner sees exactly what "the recommended timetable" is. */}
        {courses.length > 0 && (
          <div className="space-y-1.5 rounded-lg border border-border/50 bg-foreground/[0.02] p-3 text-start">
            <p className="text-[11px] font-medium text-foreground/60">
              {isHe ? "הקורסים בסמסטר הזה:" : "Courses this semester:"}
            </p>
            <ul className="space-y-1">
              {courses.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 flex-1 text-balance text-foreground/75">
                    {isHe ? c.nameHe : (c.nameEn ?? c.nameHe)}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-foreground/60">
                    {c.credits} {isHe ? "ש״ס" : "cr."}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Total progress */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-foreground/60">{t("creditsPlannedSoFar")}</span>
            <span className="font-mono font-medium text-foreground/70" dir="ltr">
              {totalCredits}/{CREDIT_REQUIREMENTS.TOTAL}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-foreground/10">
            <div
              className="progress-gradient h-full rounded-full transition-all duration-700"
              style={{ width: `${Math.min((totalCredits / 150) * 100, 100)}%` }}
            />
          </div>
        </div>

        {/* Group choice is a real decision, not a footnote. This says what is
            actually true — how many session types are still showing the app's
            DEFAULT group rather than the student's pick — and points at the
            grid beside it, which is now interactive (it wasn't: the sentence
            asked for something the surface it named could not do). It
            disappears the moment the last group is chosen. */}
        {unchosenGroupCount > 0 && !semesterOver && (
          <div className="space-y-2 rounded-xl border-2 border-amber-500/40 bg-amber-500/[0.06] px-4 py-3 text-start">
            <p className="flex items-start gap-2 text-xs font-semibold leading-relaxed text-status-amber">
              <Users className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {isHe ? (
                  <>
                    {unchosenGroupCount === 1
                      ? "קבוצה אחת עדיין בברירת מחדל"
                      : <><Bidi text={unchosenGroupCount} /> קבוצות עדיין בברירת מחדל</>}
                    {" — המערכת מציגה בינתיים את הקבוצה הראשונה."}
                  </>
                ) : (
                  `${unchosenGroupCount} group${unchosenGroupCount === 1 ? "" : "s"} still on our default — showing the first group meanwhile.`
                )}
              </span>
            </p>
            <p className="text-[11px] leading-relaxed text-foreground/60">
              {isHe
                ? "הקישו על הבלוק במערכת השעות שלצד כדי לבחור קבוצה — הבחירה נשמרת מיד."
                : "Tap a block on the timetable beside this card to choose a group — it saves immediately."}
            </p>
            {/* היה כאן קישור טקסט של 17px, "או חזרה לעריכה מלאה", שקורא
                בדיוק ל-onBack כמו הכפתור "הוספה ועריכה של קורסים" למטה.
                שני פקדים לאותה פעולה, ואחד מהם קטן מכדי להיראות — וזה
                מה שאריאל חיפש ולא מצא. נשאר פקד אחד. */}
          </div>
        )}

        {/* =========================================
            סדר הכפתורים — מדדתי אותו כשעברתי כמשתמש
            =========================================
            שלב ג׳, 4.9: נרשמתי כסטודנט שנה א׳, הגעתי לכאן, ומדדתי מה גדול
            ומה קטן:

              תכננו סמסטר נוסף      373×48  מלא וכהה   ← הראשי
              סיום ושמירה           373×48  מסגרת
              הוספה ועריכה של קורסים 373×38  מסגרת
              או חזרה לעריכה מלאה    103×17  קישור טקסט

            כלומר הכפתור הרם ביותר שולח סטודנט לתכנן **סמסטר אחר** לפני
            שהוא שמר משהו, והשמירה עצמה חלשה ממנו. זה בדיוק הסידור שאיפשר
            את "תכננתי את הקורסים וזה נמחק": ההנדלר תוקן, ההיררכיה נשארה.

            ואריאל: *"לא היה לי מובן מאליו בכלל למצוא את הכפתור של העריכה
            המלאה בגלל שצריך ללחוץ על עוד כפתור אחרי המסך הראשוני."* הוא
            צדק פעמיים — היו כאן **שני** פקדים לאותה פעולה, ואחד מהם 17px.

            עכשיו: שמירה היא הראשי תמיד. סמסטר נוסף הוא משני. ולעריכה יש
            פקד אחד. */}
        <div className="flex flex-col gap-2.5 pt-2">
          <button
            onClick={onFinish}
            disabled={isSaving}
            aria-busy={isSaving}
            className="flex items-center justify-center gap-2 rounded-xl bg-foreground px-6 py-3 font-bold text-background shadow-sm transition-all hover:scale-[1.02] press-scale disabled:cursor-wait disabled:opacity-80"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("savingPlan")}
              </>
            ) : (
              t("finishPlanning")
            )}
          </button>

          {/* גיל, משתמשת אמיתית, 24.8: "נגיד איפה מוסיפים קורסים למערכת" ·
              "זה לא נותן קורסים שזמינים להוסיף" · "חייב את זה כדי לסדר את
              המערכת שעות, כי זה כאילו חובה".
              זו הדלת היחידה לבריכת הקורסים מהמסך הזה. */}
          <button
            onClick={onBack}
            disabled={isSaving}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-border/70 px-6 py-2.5 text-sm font-semibold text-foreground/75 transition-colors hover:border-foreground/30 hover:text-foreground disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            {isHe ? "הוספה ועריכה של קורסים" : "Add or edit courses"}
          </button>

          {/* ================================================================
              האשף הוביל לכאן, ומסך הבידינג נוזף על מה שיוצא מכאן
              ================================================================
              4.9 — האשף מתכנן סמסטר אחד, והכפתור הראשי הוא "סיום ושמירה".
              רוב הסטודנטים יסיימו עם סמסטר א׳ בלבד, ואז יגיעו למסך הבידינג
              — שהאשף עצמו שולח אליהם — ויקבלו התראה כתומה: *"אחד הסמסטרים
              ריק. הבידינג מגיש את שני הסמסטרים יחד."* האפליקציה מובילה
              אותך למקום ואז אומרת לך שטעית שהגעת אליו.

              המשפט הזה כבר קיים באפליקציה בשני מקומות, פשוט לא במסך שבו
              ההחלטה נופלת. וסטודנט שנה א׳ בכלל לא רואה את הלוח שנושא אותו,
              כי סמסטר חובה-כבד פותח אותו ישר על הסיכום.

              **לא הפכתי את היררכיית הכפתורים.** ההערה שלמעלה מתעדת שהסידור
              ההפוך הוא בדיוק מה שגרם למחיקת התכנון של אריאל ב-2.9. מה
              שחסר כאן הוא המידע, לא כפתור אחר.

              מוצג רק כשהמקצה באמת קרוב — אותה שאלה, אותה פונקציה משותפת
              שדף הבית והלוח שואלים דרכה. */}
          {hasMoreSemesters && isBiddingRelevant() && (
            <p className="max-w-sm text-center text-xs leading-relaxed text-foreground/55">
              {isHe
                ? "הבידינג מגיש את שני הסמסטרים יחד — סמסטר שלא הגשתם עליו בקשה נסגר, ומה שנשאר בו במקצה השני הוא מה שאחרים לא רצו."
                : "Bidding submits both semesters at once — a semester you didn't bid on closes, and what's left in it at the second round is what nobody else wanted."}
            </p>
          )}

          {hasMoreSemesters && (
            <button
              onClick={onPlanNext}
              disabled={isSaving}
              className="flex items-center justify-center gap-2 rounded-xl border border-border/70 px-6 py-2.5 text-sm font-semibold text-foreground/75 transition-colors hover:border-foreground/30 hover:text-foreground disabled:opacity-50"
            >
              <Calendar className="h-4 w-4" />
              {t("planNextSemester")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
