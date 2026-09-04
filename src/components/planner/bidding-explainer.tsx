"use client";

import { useState } from "react";
import {
  Gavel,
  ChevronDown,
  AlertTriangle,
  Check,
  ListOrdered,
  Trophy,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AskAdvisorButton } from "@/components/ui/ask-advisor-button";

/**
 * Bidding explainer — the TAU course-registration auction (מכרז), made concrete.
 * Instead of an abstract bullet list, it walks the student through the mechanism
 * in three steps, SHOWS the overlap trap ("last request wins") as a worked
 * mini-timetable, and ends with a tick-off pre-bid checklist. Verified facts
 * only, ZERO invented point predictions (the quota isn't published — we never
 * guess it). See docs/דומיין-עומק.md.
 */
export function BiddingExplainer({ isHe }: { isHe: boolean }) {
  const [open, setOpen] = useState(false);

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
          {/* Even while collapsed, name the #1 trap so it isn't missed. */}
          <p className="text-xs text-foreground/60">
            {isHe
              ? "בידינג ב-2 מקצים · חפיפות נפתרות לפי הניקוד"
              : "A 2-round auction · the trap: last request wins"}
          </p>
        </div>
        <ChevronDown
          className={cn("size-4 shrink-0 text-foreground/60 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="space-y-4 border-t border-border/50 p-4">
          <Steps isHe={isHe} />
          <RegistrationCadence isHe={isHe} />
          <OverlapTrap isHe={isHe} />
          <Checklist isHe={isHe} />

          <AskAdvisorButton
            promptHe="איך כדאי לי לתעדף בקשות בבידינג? מה הטעויות הנפוצות שכדאי להימנע מהן?"
            promptEn="How should I prioritize my bidding requests? What common mistakes should I avoid?"
            labelHe="שאל את {advisor} על אסטרטגיית בידינג"
            labelEn="Ask {advisor} about bidding strategy"
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent-brand/6 px-2.5 py-1.5 text-xs font-medium text-accent-brand transition-colors hover:bg-accent-brand/20"
            iconClassName="size-3.5"
          />

          <p className="text-xs leading-tight text-foreground/60">
            {isHe
              ? "מנגנון יציב. אנחנו לא מנחשים כמה נקודות צריך לקורס — זה משתנה כל סמסטר ולא מתפרסם מראש."
              : "Stable mechanism. We don't guess how many points a course needs — it changes each semester and isn't published in advance."}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Step 1-2-3: how the auction actually runs ────────────────────────

function Steps({ isHe }: { isHe: boolean }) {
  const steps = isHe
    ? [
        { icon: ListOrdered, title: "מדרגים העדפות", body: "בוחרים קורסים ומקצים לכל אחד נקודות (מינ׳ 5). מתי הקלדת — לא משנה." },
        { icon: Trophy, title: "בידינג: הגבוה זוכה", body: "המציע הכי גבוה על קורס זוכה במקום. ואם יש שוויון בדיוק על הסף? המחשב מגריל." },
        { icon: RefreshCw, title: "2 מקצים, איפוס", body: "בכל מקצה מקבלים את כל הנקודות מחדש. ביטול בין מקצים מחזיר נקודות." },
      ]
    : [
        { icon: ListOrdered, title: "Rank your picks", body: "Pick courses and assign points to each (min 5). When you typed doesn't matter." },
        { icon: Trophy, title: "Auction: top bid wins", body: "The highest bidder for a course wins the seat. A tie at the cutoff → a draw." },
        { icon: RefreshCw, title: "2 rounds, reset", body: "Every round your full quota resets. Cancelling between rounds refunds points." },
      ];

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {steps.map((s, i) => {
        const Icon = s.icon;
        return (
          <div key={i} className="relative rounded-xl border border-border/50 bg-foreground/[0.02] p-3">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-brand/6 text-[11px] font-bold text-accent-brand">{i + 1}</span>
              <Icon className="size-4 text-foreground/60" />
            </div>
            <p className="text-xs font-bold text-foreground/80">{s.title}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-foreground/60">{s.body}</p>
          </div>
        );
      })}
    </div>
  );
}

// ── The overlap trap, shown as a worked mini-timetable ───────────────

function OverlapTrap({ isHe }: { isHe: boolean }) {
  // Mini time axis 08:00–14:00 (6h). Two blocks that partly overlap. Positioned
  // on an LTR track (time reads left→right in a schedule) so the geometry is
  // unambiguous in both locales; labels are localized.
  const AXIS_START = 8;
  const AXIS_HOURS = 6;
  const pct = (h: number) => ((h - AXIS_START) / AXIS_HOURS) * 100;
  const held = { start: 10, end: 12 };
  const bid = { start: 11, end: 13 };

  return (
    <div className="rounded-xl border border-amber-400/30 bg-amber-400/[0.06] p-3">
      <div className="mb-2 flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-amber" />
        <p className="text-xs font-bold text-foreground/80">
          {isHe ? "חפיפת שעות — מה באמת קורה" : "Time clashes — what actually happens"}
        </p>
      </div>

      {/* Worked example: two courses that overlap on the same day */}
      <div dir="ltr" className="space-y-1.5">
        {/* held course */}
        <div className="relative h-7 rounded-md bg-foreground/[0.04]">
          <div
            className="absolute inset-y-0 flex items-center justify-center rounded-md bg-emerald-500/20 text-[11px] font-semibold text-status-green ring-1 ring-emerald-500/40"
            style={{ insetInlineStart: `${pct(held.start)}%`, width: `${pct(held.end) - pct(held.start)}%` }}
          >
            <bdi>{isHe ? "קורס א׳ ✓" : "Course A ✓"}</bdi>
          </div>
        </div>
        {/* new bid course */}
        <div className="relative h-7 rounded-md bg-foreground/[0.04]">
          <div
            className="absolute inset-y-0 flex items-center justify-center rounded-md bg-amber-500/25 text-[11px] font-semibold text-status-amber ring-1 ring-amber-500/50"
            style={{ insetInlineStart: `${pct(bid.start)}%`, width: `${pct(bid.end) - pct(bid.start)}%` }}
          >
            <bdi>{isHe ? "קורס ב׳ ⚠" : "Course B ⚠"}</bdi>
          </div>
          {/* overlap marker */}
          <div
            className="absolute inset-y-0 rounded-md border-x border-red-500/50 bg-red-500/10"
            style={{ insetInlineStart: `${pct(bid.start)}%`, width: `${pct(held.end) - pct(bid.start)}%` }}
          />
        </div>
        {/* axis ticks */}
        <div className="flex justify-between px-0.5 text-[10px] font-mono text-foreground/60">
          <span>08:00</span><span>10:00</span><span>12:00</span><span>14:00</span>
        </div>
      </div>

      <p className="mt-2 text-[11px] leading-snug text-foreground/70">
        {isHe
          ? "שימו לב: אם אתם כבר רשומים לקורס אחד, ובקשה חדשה שלכם תתקבל לקורס שחופף לו אפילו בשעה אחת — הרישום הקודם יבוטל אוטומטית ותישארו רק עם החדש. לכן בודקים חפיפות לפני שמגישים."
          : "You already hold A. Bidding for B, which overlaps it (even by an hour) → A is auto-cancelled and you keep only B. Check for clashes before you bid."}
      </p>
    </div>
  );
}

// ── Tick-off pre-bid checklist ───────────────────────────────────────

function Checklist({ isHe }: { isHe: boolean }) {
  const items = isHe
    ? [
        "בדקתי שאין חפיפות זמן בין הקורסים שאני רוצה",
        "הקצבתי לפחות 5 נקודות לכל קורס",
        "זכרתי: הרצאה + תרגיל = יחידה אחת",
        "זכרתי: הנקודות מתאפסות בין המקצים",
        "פכ״מ פטור מדרישות-קדם — לא חוסם רישום",
      ]
    : [
        "Checked there are no time clashes between the courses I want",
        "Allotted at least 5 points to each course",
        "Remembered: lecture + tutorial are one unit",
        "Remembered: points reset between the two rounds",
        "PPE is exempt from prerequisites — not a registration gate",
      ];
  const [done, setDone] = useState<boolean[]>(() => items.map(() => false));

  return (
    <div>
      <p className="mb-2 text-xs font-bold text-foreground/70">
        {isHe ? "צ׳קליסט לפני הבידינג" : "Pre-bid checklist"}
      </p>
      <ul className="space-y-1">
        {items.map((m, i) => (
          <li key={i}>
            <button
              type="button"
              role="checkbox"
              aria-checked={done[i]}
              onClick={() => setDone((d) => d.map((v, j) => (j === i ? !v : v)))}
              className="flex w-full items-start gap-2 rounded-md p-1 text-start transition-colors hover:bg-foreground/[0.03]"
            >
              <span
                aria-hidden
                className={cn(
                  "mt-px flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                  done[i] ? "border-emerald-400 bg-emerald-400 text-white" : "border-foreground/25",
                )}
              >
                {done[i] && <Check className="size-3" />}
              </span>
              <span className={cn("text-[11px] leading-snug", done[i] ? "text-foreground/60 line-through" : "text-foreground/70")}>{m}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}


/**
 * ANNUAL OR PER-SEMESTER? — the question the app used to answer by assuming.
 *
 * `getBiddingTarget` computes "the next teaching semester", which quietly
 * assumes everyone re-registers every semester. Ariel asked which it actually
 * is, and the answer from TAU's own pages is that the question has no single
 * answer:
 *
 *   "הרישום בחלק מהחוגים הוא סמסטריאלי ובחלק מהחוגים הוא שנתי"
 *     — social-sciences.tau.ac.il/bidding
 *   "נרשמים בתחילת השנה לקורסים שמתקיימים בשני הסמסטרים: א + ב,
 *    למעט בבית הספר לכלכלה בו נרשמים לפני כל סמסטר"
 *     — social-sciences.tau.ac.il/biddingsite/rishum-faq
 *
 * That matters specifically for פכ״מ, which is a joint degree: the philosophy
 * (0618) and political-science (1031) courses follow the annual rule, and the
 * economics courses (1011 — בית הספר לכלכלה) follow the per-semester one. So a
 * PPE student is genuinely in BOTH regimes at once.
 *
 * The iron rule says we don't state a fact without a source, and we don't
 * invent one. So this states exactly what the university states, quotes where
 * it came from, and tells the student the one thing they should verify for
 * their own courses. It does not guess on their behalf.
 */
function RegistrationCadence({ isHe }: { isHe: boolean }) {
  return (
    <div className="rounded-xl border border-border/50 bg-foreground/[0.02] p-3">
      <p className="text-xs font-semibold text-foreground/80">
        {isHe ? "שנתי או סמסטריאלי? — תלוי בחוג" : "Annual or per-semester? It depends on the department"}
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-foreground/60">
        {isHe
          ? "באוניברסיטה כתוב במפורש שהרישום בחלק מהחוגים סמסטריאלי ובחלק שנתי. ברוב החוגים נרשמים בתחילת השנה לקורסים של שני הסמסטרים יחד — אבל בבית הספר לכלכלה נרשמים מחדש לפני כל סמסטר."
          : "The university states plainly that registration is per-semester in some departments and annual in others. In most, you register at the start of the year for both semesters together — but the School of Economics registers again before each semester."}
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-foreground/60">
        {isHe
          ? "פכ״מ הוא תואר משולב, אז זה נוגע לכם משני הצדדים: קורסי הפילוסופיה ומדע המדינה בדרך כלל שנתיים, וקורסי הכלכלה סמסטריאליים. אנחנו לא מנחשים בשבילכם — שווה לוודא מול המזכירות מה חל על הקורסים שלכם השנה."
          : "PPE is a joint degree, so both apply to you: philosophy and political-science courses are usually annual, economics courses per-semester. We won't guess for you — worth confirming with the secretariat which applies to your courses this year."}
      </p>
      {/* ==================================================================
          ייחוס מקור שגוי — נמצא 5.9 באימות ההערות מול המסך
          ==================================================================
          השורה הזאת אמרה **"הפקולטה למדעי החברה"**, ומסך הציר שלצידה
          (`bidding-timeline`) אמר **"הפקולטה למדעי הרוח"** — שני מסכים
          באותה אפליקציה שמייחסים את אותו מידע לשתי פקולטות שונות.

          מי צודק, לפי המקורות ולא לפי הזיכרון:
          · ההערה ב-`bidding-calendar.ts`, שנכתבה כשאריאל מסר את הקבצים,
            מונה את המקור: *"הנחיות לרישום בבידינג תשפז.doc — **Faculty
            of Humanities**"*.
          · תמונת הידיעון האמיתית (`0651100701.html`): *"**הפקולטה למדעי
            הרוח** ע״ש לסטר וסאלי אנטין — תכנית בפילוסופיה, כלכלה ומדע
            המדינה (פכ״מ)"*.
          · גיליונות הציונים האמיתיים: *"אופן לימוד: חד-חוגי **בפקולטה
            למדעי הרוח**"*.

          כלומר פכ״מ מנוהל במדעי הרוח, ומסמך ההנחיות שממנו נלקחו התאריכים
          הוא שלה. עיקרון 1 של הפרויקט הוא שמקור מתויג נכון — וייחוס
          שקרי על המסך שמסביר את הבידינג, שלושה ימים לפני המקצה, הוא
          בדיוק סוג הטעות שאסור לה לקרות. */}
      <p className="mt-2 text-[11px] leading-tight text-foreground/60">
        {isHe
          ? "מקור: ההנחיות הרשמיות לרישום בבידינג תשפ״ז של הפקולטה למדעי הרוח, אוניברסיטת תל אביב."
          : "Source: the official תשפ״ז bidding registration guidelines, TAU Faculty of Humanities."}
      </p>
    </div>
  );
}
