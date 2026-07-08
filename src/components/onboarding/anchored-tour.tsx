"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useLocale } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * Anchored product tour — a spotlight that points at the REAL UI element it's
 * describing (not a generic centered modal). Each step targets a `data-tour`
 * attribute on the page; the tour scrolls it into view, cuts a highlight around
 * it (via a big spread box-shadow), and floats a tooltip beside it. Steps whose
 * target is missing fall back to a centered card.
 */

export const TOUR_DONE_KEY = "pakamon-tour-done";

interface Step {
  selector: string | null; // null → centered card
  titleHe: string;
  titleEn: string;
  bodyHe: string;
  bodyEn: string;
}

const STEPS: Step[] = [
  {
    selector: '[data-tour="status"]',
    titleHe: "המצב שלך, במקום אחד",
    titleEn: "Your status, in one place",
    bodyHe: "כאן רואים כמה ש״ס נשארו, באיזה תחום, ומה הממוצע — מבט-על על כל התואר.",
    bodyEn: "See how many credits remain, by category, plus your average — the whole degree at a glance.",
  },
  {
    selector: '[data-tour="recommendations"]',
    titleHe: "מה כדאי עכשיו",
    titleEn: "Smart recommendations",
    bodyHe: "כאן אני מציע לך צעדים אמיתיים לפי הנתונים שלך — מועד ב׳, דרישות חסרות ועוד.",
    bodyEn: "Real next steps based on your data — Moed B, missing requirements, and more.",
  },
  {
    selector: '[data-tour="miluim"]',
    titleHe: "ההטבות שלך במילואים",
    titleEn: "Your miluim benefits",
    bodyHe: "אם שירתת — הפס הזה תמיד מראה את הקבוצה וההטבות שלך. לחיצה פותחת את כל הפירוט.",
    bodyEn: "If you served, this bar always shows your group + benefits. Tap it for the full list.",
  },
  {
    selector: '[data-tour="week"]',
    titleHe: "השבוע שלך",
    titleEn: "Your week",
    bodyHe: "השיעורים של היום והמבחנים הקרובים — במבט אחד. \"כל הבחינות\" פותח את לוח-הבחינות המלא.",
    bodyEn: "Today's classes and your next exams at a glance. \"All exams\" opens the full board.",
  },
  {
    selector: null,
    titleHe: "זהו, את/ה מוכן/ה",
    titleEn: "You're all set",
    bodyHe: "תתחיל/י מהמתכנן או מתכנון המבחנים — ואם תרצה/י, העוזר עונה על כל שאלה.",
    bodyEn: "Start from the planner or exam planner — and the assistant answers any question.",
  },
];

const PAD = 8;

export function AnchoredTour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const isHe = useLocale() === "he";
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
    if (!el) {
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

  const next = () => (isLast ? close() : setStep((s) => s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  if (!open || !mounted) return null;

  const NextChevron = isHe ? ChevronLeft : ChevronRight;
  const BackChevron = isHe ? ChevronRight : ChevronLeft;

  // Tooltip placement: below the target if there's room, else above; centered
  // when there's no target.
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const placeBelow = rect ? rect.bottom + 180 < vh : true;

  const tooltip = (
    <div
      className={cn(
        "fixed z-[101] w-[min(92vw,360px)] rounded-2xl border border-border bg-card p-4 shadow-xl",
        !rect && "start-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rtl:translate-x-1/2"
      )}
      style={
        rect
          ? {
              insetInlineStart: Math.max(12, Math.min(rect.left, (typeof window !== "undefined" ? window.innerWidth : 400) - 372)),
              top: placeBelow ? rect.bottom + PAD + 8 : undefined,
              bottom: placeBelow ? undefined : vh - rect.top + PAD + 8,
            }
          : undefined
      }
    >
      <button
        type="button"
        onClick={close}
        aria-label={isHe ? "דלג" : "Skip"}
        className="absolute end-2 top-2 rounded-md p-1 text-foreground/40 transition-colors hover:bg-foreground/5 hover:text-foreground/70"
      >
        <X className="size-4" />
      </button>
      <h3 className="font-display text-base font-bold text-foreground/90">{isHe ? current.titleHe : current.titleEn}</h3>
      <p className="mt-1 text-sm leading-relaxed text-foreground/60">{isHe ? current.bodyHe : current.bodyEn}</p>
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
          {STEPS.map((_, i) => (
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
