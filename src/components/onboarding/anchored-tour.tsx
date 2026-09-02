"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { usePersona } from "@/components/persona/use-persona";
import { personaLabels, withAdvisorName } from "@/lib/persona";

/**
 * Anchored product tour — a spotlight that points at the REAL UI element it's
 * describing (not a generic centered modal). Each step targets a `data-tour`
 * attribute on the page; the tour scrolls it into view, cuts a highlight around
 * it (via a big spread box-shadow), and floats a tooltip beside it. Steps whose
 * target is missing fall back to a centered card.
 */

/**
 * Vertical placement of the tour card — pure, so it can be tested (#16).
 *
 * The bug it replaces: the card was positioned with `bottom: vh - rect.top + …`
 * whenever it sat ABOVE its target, with no viewport clamp. For a TALL target
 * whose top is near the top of the screen (the very first dashboard step),
 * placeBelow is false because the target's bottom is far down, while rect.top
 * is small — so `bottom` resolved to nearly the full viewport height and the
 * card was pushed off the top edge. Ariel saw its footer and none of its text.
 *
 * Prefer whichever side genuinely fits, then force the result back inside the
 * viewport. The card can end up overlapping its target on a cramped screen —
 * that is strictly better than being invisible.
 */
export function computeTipTop(o: {
  rectTop: number;
  rectBottom: number;
  tipH: number;
  vh: number;
  pad: number;
  margin?: number;
}): number {
  const margin = o.margin ?? 12;
  const below = o.rectBottom + o.pad + 8;
  const above = o.rectTop - o.pad - 8 - o.tipH;
  const fitsBelow = below + o.tipH + margin <= o.vh;
  const fitsAbove = above >= margin;
  const preferred = fitsBelow ? below : fitsAbove ? above : below;
  // Math.max LAST so a card taller than the viewport still starts on-screen.
  return Math.max(margin, Math.min(preferred, o.vh - o.tipH - margin));
}

export const TOUR_DONE_KEY = "pakamon-tour-done";

export interface Step {
  selector: string | null; // null → centered card
  conditional?: boolean; // skip if its target element isn't on the page (e.g. the miluim bar for a student who never served)
  titleHe: string;
  titleEn: string;
  bodyHe: string;
  bodyEn: string;
}

// Order follows the page top-to-bottom (status → week → recommendations) so the
// spotlight never jumps; the conditional miluim bar comes near the end.
/**
 * #17 (13.8) — guidance ON the planner, where it is actually needed.
 *
 * Ariel: "יש סיור רק אחרי התכנון - אבל בשלב התכנון אנשים לא מבינים מה הם עושים
 * וזה שלב מורכב". He is right, and it was backwards: the only tour ran on the
 * dashboard, gated on the student ALREADY having a plan, so it explained an app
 * they had finished configuring and said nothing about the one screen they
 * could not read. These steps run in place, the first time a student reaches
 * the planner.
 *
 * Four steps, not eleven. This fires mid-task, so it has to be over fast.
 */
export const PLANNER_STEPS: Step[] = [
  {
    selector: '[data-tour="planner-pool"]',
    titleHe: "כאן בוחרים את הקורסים",
    titleEn: "Pick your courses here",
    bodyHe: "קורסי החובה כבר מסומנים. הוסיפו קורסי בחירה בלחיצה — אפשר לחפש לפי שם או מספר.",
    bodyEn: "Mandatory courses are already ticked. Tap to add electives — search by name or code.",
  },
  {
    selector: '[data-tour="planner-timetable"]',
    titleHe: "וכאן רואים מיד איך זה יושב בשבוע",
    titleEn: "And see instantly how the week looks",
    bodyHe: "כל קורס שתוסיפו מופיע כאן על הלוח באותו רגע — כך רואים חורים ארוכים, ימים עמוסים ויום פנוי.",
    bodyEn: "Every course you add lands on the grid immediately — so you can see long gaps, heavy days, and a free day.",
  },
  {
    selector: '[data-tour="planner-groups"]',
    titleHe: "לקורס עם כמה קבוצות — אתם בוחרים",
    titleEn: "Several groups? You choose",
    // Rewritten with the group rail (13.8). It used to teach "ריחוף על קבוצה" —
    // hover — which was removed from the group path on purpose: on a trackpad a
    // tap fires focus and click together, so previewing and committing happened
    // in the same instant. The tour must not teach a gesture the screen no
    // longer has, and the honest thing to name here is the default state,
    // which is what actually confused Ariel.
    bodyHe: "לכל הרצאה או תרגיל עם כמה קבוצות תמצאו כאן את כולן — עם השעות, החדר והמרצה. עד שתבחרו, בחרנו בשבילכם קבוצה זמנית; היא מסומנת בקו מקווקו בלוח.",
    bodyEn: "Every lecture or TA session with several groups is listed here — times, room and lecturer. Until you choose, we hold a temporary group for you; it's the dashed block on the grid.",
  },
  {
    selector: '[data-tour="planner-insights"]',
    titleHe: "והמספרים שחשובים",
    titleEn: "The numbers that matter",
    bodyHe: "ש״ס בסמסטר, שעות בשבוע, וכמה חפיפות יש לכם. חפיפה מסומנת באדום גם על הלוח — עם שם הקורס שמתנגש.",
    bodyEn: "Credits, weekly hours, and how many clashes you have. A clash is flagged red on the grid too — naming the course it collides with.",
  },
];

const DASHBOARD_STEPS: Step[] = [
  {
    selector: '[data-tour="status"]',
    titleHe: "המצב שלכם, במקום אחד",
    titleEn: "Your status, in one place",
    bodyHe: "כאן רואים כמה ש״ס נשארו, באיזה תחום, ומה הממוצע — מבט-על על כל התואר.",
    bodyEn: "See how many credits remain, by category, plus your average — the whole degree at a glance.",
  },
  {
    selector: '[data-tour="week"]',
    titleHe: "השבוע שלי",
    titleEn: "My week",
    bodyHe: "השיעורים של היום והמבחנים הקרובים — במבט אחד. \"כל הבחינות\" פותח את לוח-הבחינות המלא.",
    bodyEn: "Today's classes and your next exams at a glance. \"All exams\" opens the full board.",
  },
  {
    selector: '[data-tour="recommendations"]',
    titleHe: "מה כדאי עכשיו",
    titleEn: "What to do now",
    bodyHe: "{advisor} מציף כאן צעדים אמיתיים מהנתונים שלכם — מועד ב׳, דרישות חסרות ועוד.",
    bodyEn: "{advisor} surfaces real next steps from your data — Moed B, missing requirements, and more.",
  },
  {
    selector: '[data-tour="miluim"]',
    conditional: true,
    titleHe: "ההטבות שלכם במילואים",
    titleEn: "Your miluim benefits",
    bodyHe: "אם שירתתם — הפס הזה תמיד מראה את הקבוצה וההטבות שלכם. לחיצה פותחת את כל הפירוט.",
    bodyEn: "If you served, this bar always shows your group + benefits. Tap it for the full list.",
  },
  // ── #17/#36 — the rest of the app ──────────────────────────────────────
  // The tour stopped at the home screen, so a new user finished it without
  // ever learning that the other screens exist or how they connect ("מסך אחרי
  // מסך משתמש חדש פשוט לא יבין… ולא יבין את המעבר בין מסכים ופיצ׳רים").
  // These four steps walk the navigation tier by tier and name the LOOP each
  // tier belongs to, not just the buttons. All are conditional: on a phone the
  // sidebar isn't rendered, so they're skipped in favour of the mobile step.
  {
    selector: '[data-tour="nav-group-0"]',
    conditional: true,
    titleHe: "הלולאה המרכזית — איפה אני, מה לתכנן, ומה מותר",
    titleEn: "The main loop — where I am, what to plan, what's allowed",
    bodyHe:
      "ארבעת אלה עובדים יחד: המסך הזה מראה איפה אתם עומדים, ״תכנון התואר״ הוא המקום שבונים בו את המערכת והסמסטרים הבאים, ״בידינג״ מוציא מהתוכנית הזו רשימה מוכנה להגשה, ו״דרישות התואר״ בודק שמה שבניתם עומד בכללים.",
    bodyEn:
      "These four work together: this screen shows where you stand, \"Planner\" is where you build your timetable and coming semesters, \"Bidding\" turns that plan into a list ready to submit, and \"Requirements\" checks it against the degree rules.",
  },
  {
    selector: '[data-tour="nav-group-1"]',
    conditional: true,
    titleHe: "התיק האקדמי — מה כבר עשיתם, ולאן זה מוביל",
    titleEn: "Your academic file — what you've done, and where it leads",
    bodyHe:
      "ב״תיק״ סורקים את גיליון הציונים בסוף כל סמסטר, והציונים מתעדכנים בכל האפליקציה בבת אחת. ״ציון גמר״ מראה מה הציון הסופי מרכיב ואיפה עוד אפשר לשפר.",
    bodyEn:
      "In \"Record\" you scan your grade sheet at each semester's end and the grades update everywhere at once. \"Final score\" shows what the graduation score is made of and where you can still improve it.",
  },
  {
    selector: '[data-tour="nav-group-2"]',
    conditional: true,
    titleHe: "הזמן — תקופת מבחנים ולוח שנה",
    titleEn: "Time — exam season and the calendar",
    bodyHe:
      "״תכנון מבחנים״ פורש את מועדי א׳ ו-ב׳ של הסמסטר שלכם ועוזר להחליט; ״לוח שנה״ מסנכרן את השיעורים והמבחנים ליומן שאתם כבר משתמשים בו.",
    bodyEn:
      "\"Exam planner\" lays out your semester's Moed A and Moed B sittings and helps you decide; \"Calendar\" syncs your classes and exams to the calendar you already use.",
  },
  {
    selector: '[data-tour="nav-group-3"]',
    conditional: true,
    titleHe: "לא לבד — הידע של המחזור",
    titleEn: "Not alone — your cohort's knowledge",
    bodyHe:
      "״קטלוג קורסים״ הוא כל הקורסים עם מה שסטודנטים כתבו עליהם; ״השושלת״ מראה מי היה לפניכם ומי בא אחריכם, ומשם נכנסים לתיק המחזור ולחונכות; ״מדריך מתחיל״ מסביר את התואר מאפס. את מה שתכתבו כאן יקראו אלה שיבואו אחריכם.",
    bodyEn:
      "\"Catalog\" is every course with what students wrote about it; \"Lineage\" shows who came before you and who comes next, and opens the cohort file and mentoring from there; \"Guide\" explains the degree from scratch. What you write here is read by whoever comes next.",
  },
  {
    // Phone layout: the sidebar isn't rendered at all, and everything past the
    // four bottom-bar tabs hides behind "עוד". Without this step a phone user
    // finishes the tour having seen four screens out of eleven.
    selector: '[data-tour="nav-more"]',
    conditional: true,
    titleHe: "כל השאר נמצא כאן",
    titleEn: "Everything else lives here",
    bodyHe:
      "בטלפון הסרגל התחתון מחזיק את ארבעת המסכים היומיומיים. ״עוד״ פותח את כל היתר — התיק והציונים, תכנון המבחנים, הקטלוג, המחזור והמדריך.",
    bodyEn:
      "On a phone the bottom bar holds the four everyday screens. \"More\" opens all the rest — your record and grades, the exam planner, the catalog, your cohort and the guide.",
  },
  {
    // #13/#14/#26 — the single highest-leverage "meet the King" moment: spotlight
    // the floating FAB, name him, and teach that he's interactive (you can COMMAND
    // him) and always present. Without this, a user finishes the whole tour and
    // never learns the King is a chattable person who can add/complete a course.
    selector: '[data-tour="king"]',
    titleHe: "וזה {advisor} — היועץ האישי שלכם",
    titleEn: "And this is {advisor} — your advisor",
    bodyHe: 'לחיצה כאן פותחת שיחה. אפשר גם פשוט להגיד לו "סיימתי מיקרו עם 88" או "תוסיף לי סטטיסטיקה" — והוא יעשה את זה בשבילכם. הוא כאן, בכל מסך.',
    bodyEn: 'Tap here to chat. You can even tell him "I finished Micro with 88" or "add Statistics for me" — and he\'ll do it. He\'s here, on every screen.',
  },
  {
    selector: null,
    titleHe: "זהו, אתם מוכנים",
    titleEn: "You're all set",
    bodyHe: "תתחילו מהמתכנן או מתכנון המבחנים. בסוף כל סמסטר — סורקים את גיליון-הציונים ב״תיק״ והכול מתעדכן. ו{advisor} עונה על כל שאלה — בכל מסך.",
    bodyEn: "Start from the planner or exam planner. At each semester's end, scan your grade sheet in \"Record\" and everything updates. And {advisor} answers any question — on every screen.",
  },
];

const PAD = 8;

/** Laid out and visible at THIS viewport — not merely present in the DOM. */
function isRendered(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

export function AnchoredTour({
  open,
  onClose,
  steps,
}: {
  open: boolean;
  onClose: () => void;
  /** #17 (13.8) — the tour used to be hard-wired to the dashboard STEPS, so the
   *  ONE screen a new student cannot read (the planner) had no guidance at all,
   *  while the tour explained an app they had already finished configuring.
   *  Passing a step set lets the same spotlight machinery run in-place on the
   *  planner. Defaults to the dashboard tour. */
  steps?: Step[];
}) {
  const STEPS = steps ?? DASHBOARD_STEPS;
  const isHe = useLocale() === "he";
  // #27 — a Referent user must never be told about "המלך". Steps write the
  // {advisor} token; the chosen advisor's name is substituted at render.
  const { persona } = usePersona();
  const advisorName = personaLabels(persona, isHe).short;
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const total = STEPS.length;
  const current = STEPS[Math.min(step, total - 1)]!;
  const isLast = step === total - 1;

  // Reset to step 0 whenever the tour (re)opens.
  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  // Locate + track the current target.
  useLayoutEffect(() => {
    if (!open) return;
    if (!current.selector) {
      setRect(null);
      return;
    }
    const el = document.querySelector(current.selector) as HTMLElement | null;
    // A target that exists but isn't laid out (the desktop sidebar under
    // `hidden md:block` on a phone) has a 0×0 rect. Spotlighting it would cut a
    // pinhole in the corner of the screen, so treat it as no target at all.
    if (!el || !isRendered(el)) {
      setRect(null);
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const measure = () => setRect(el.getBoundingClientRect());
    const t = setTimeout(measure, 320);
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, step, current.selector]);

  const close = useCallback(() => {
    if (typeof window !== "undefined") localStorage.setItem(TOUR_DONE_KEY, "true");
    onClose();
  }, [onClose]);

  // A conditional step (e.g. miluim for a non-server, or the desktop nav on a
  // phone) is skipped so the spotlight never lands on a target that isn't there
  // — or on one that exists in the DOM but is display:none at this viewport.
  const isPresent = (i: number) => {
    const s = STEPS[i]!;
    if (!s.conditional) return true;
    if (!s.selector || typeof document === "undefined") return false;
    const el = document.querySelector(s.selector) as HTMLElement | null;
    return !!el && isRendered(el);
  };
  const next = () => {
    if (isLast) return close();
    let i = step + 1;
    while (i < total - 1 && !isPresent(i)) i++;
    setStep(i);
  };
  const back = () => {
    let i = step - 1;
    while (i > 0 && !isPresent(i)) i--;
    setStep(Math.max(0, i));
  };

  // These MUST sit above the `if (!open) return null` below. Placing them with
  // the placement math (after the guard) meant React ran 5 hooks while the tour
  // was closed and 7 once it opened — error #310, "rendered more hooks than
  // during the previous render", which crashed the whole planner the instant
  // the tour tried to appear. Hooks run unconditionally; only the RENDER is
  // conditional.
  const tipRef = useRef<HTMLDivElement | null>(null);
  const [tipH, setTipH] = useState(180);
  useLayoutEffect(() => {
    if (!open) return;
    const h = tipRef.current?.getBoundingClientRect().height;
    if (h && Math.abs(h - tipH) > 1) setTipH(h);
  });

  if (!open || !mounted) return null;

  const NextChevron = isHe ? ChevronLeft : ChevronRight;
  const BackChevron = isHe ? ChevronRight : ChevronLeft;

  // Tooltip placement: below the target if there's room, else above; centered
  // when there's no target.
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const vw = typeof window !== "undefined" ? window.innerWidth : 400;
  const placeBelow = rect ? rect.bottom + 180 < vh : true;
  // Horizontal placement, in PHYSICAL pixels. It used to be written to
  // `inset-inline-start` while being computed from `rect.left` — a physical
  // measurement fed into a logical property. Under RTL that mirrors the value,
  // so a tooltip for a target on the right edge (the sidebar) was thrown to the
  // far LEFT of the screen, describing something the user couldn't see next to
  // it. Physical `left`, clamped into the viewport, is correct in both
  // directions.
  const tipWidth = Math.min(vw * 0.92, 360);
  const tipLeft = rect
    ? Math.max(12, Math.min(rect.left, vw - tipWidth - 12))
    : 0;

  // #16 (13.8) — "תסתכל בסיור איך חלון ההסבר למעלה ולא נוח לראות מה כתוב".
  //
  // The card was positioned with `bottom: vh - rect.top + …` whenever it went
  // ABOVE its target, and nothing clamped it to the viewport. For a TALL target
  // whose top sits near the top of the screen — "המצב שלי", the very first step
  // — placeBelow is false because the target's bottom is far down, while
  // rect.top is small, so `bottom` resolves to nearly the full viewport height
  // and the card is pushed off the top edge. Ariel saw its footer and none of
  // its text.
  //
  // Now the vertical position is computed as a single clamped `top`. The card's
  // real height is measured (it varies with the length of each step's copy), we
  // prefer whichever side genuinely fits, and the result is always forced back
  // inside the viewport — so it can be badly placed, but never invisible.
  const tipTop = rect
    ? computeTipTop({ rectTop: rect.top, rectBottom: rect.bottom, tipH, vh, pad: PAD })
    : undefined;

  const tooltip = (
    <div
      ref={tipRef}
      className={cn(
        "fixed z-[101] max-h-[calc(100dvh-24px)] w-[min(92vw,360px)] overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-xl",
        !rect && "start-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rtl:translate-x-1/2"
      )}
      style={rect ? { left: tipLeft, top: tipTop } : undefined}
    >
      <button
        type="button"
        onClick={close}
        aria-label={isHe ? "דלגו" : "Skip"}
        className="absolute end-2 top-2 rounded-md p-1 text-foreground/40 transition-colors hover:bg-foreground/5 hover:text-foreground/70"
      >
        <X className="size-4" />
      </button>
      <h3 className="font-display text-base font-bold text-foreground/90">
        {withAdvisorName(isHe ? current.titleHe : current.titleEn, advisorName)}
      </h3>
      <p className="mt-1 text-sm leading-relaxed text-foreground/60">
        {withAdvisorName(isHe ? current.bodyHe : current.bodyEn, advisorName)}
      </p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={back}
          className={cn("flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm text-foreground/55 hover:bg-foreground/5", step === 0 && "pointer-events-none opacity-0")}
        >
          <BackChevron className="size-4" />
          {isHe ? "חזרה" : "Back"}
        </button>
        <div className="flex items-center gap-1.5">
          {STEPS.map((_, i) => i).filter(isPresent).map((i) => (
            <span key={i} className={cn("h-1.5 rounded-full transition-all", i === step ? "w-5 bg-accent-brand" : "w-1.5 bg-foreground/15")} />
          ))}
        </div>
        <button
          type="button"
          onClick={next}
          className="flex items-center gap-1 rounded-lg bg-accent-brand px-4 py-1.5 text-sm font-semibold text-accent-brand-fg transition-colors hover:bg-accent-brand-hover"
        >
          {isLast ? (isHe ? "סיום" : "Done") : isHe ? "הבא" : "Next"}
          {!isLast && <NextChevron className="size-4" />}
        </button>
      </div>
    </div>
  );

  return createPortal(
    <>
      {/* Spotlight: a transparent highlight box whose huge spread shadow darkens
          everything else. No target → a plain dark overlay. */}
      {rect ? (
        <div
          className="pointer-events-none fixed z-[100] rounded-xl transition-all duration-300"
          style={{
            left: rect.left - PAD,
            top: rect.top - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
          }}
        />
      ) : (
        <div className="fixed inset-0 z-[100] bg-black/55" onClick={close} />
      )}
      {tooltip}
    </>,
    document.body
  );
}

/**
 * Small, unobtrusive "re-open the tour" button — drop into the dashboard header.
 * Migrated here from the retired product-tour.tsx so the whole tour lives in one
 * file (and TOUR_DONE_KEY has a single source of truth).
 */
export function TourReopenButton({ onClick }: { onClick: () => void }) {
  const t = useTranslations("tour");
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t("reopenAria")}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-card/40 px-2.5 py-1.5 text-xs font-medium text-foreground/55 transition-colors hover:border-foreground/25 hover:bg-foreground/5 hover:text-foreground/80"
    >
      <span
        aria-hidden
        className="flex size-4 items-center justify-center rounded-full border border-current text-[10px] font-bold leading-none"
      >
        ?
      </span>
      {t("reopen")}
    </button>
  );
}
