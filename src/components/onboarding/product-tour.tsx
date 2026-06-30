"use client";

import { useCallback, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import {
  GraduationCap,
  CalendarDays,
  FolderOpen,
  Scale,
  LayoutGrid,
  ChevronRight,
  ChevronLeft,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * Product Tour — a tasteful, fully-skippable first-run walkthrough.
 *
 * A centered modal carousel (NOT anchored coach-marks) — far more robust in
 * RTL and across breakpoints. Built on Radix Dialog so we get focus-trapping,
 * `aria-modal`, labelling, and Escape-to-close for free.
 *
 * Shown once, the first time a brand-new student lands on the dashboard
 * (gated by the parent on the `pakamon-tour-done` localStorage key). Can be
 * re-opened anytime via the small "סיור" button in the dashboard header.
 */

export const TOUR_DONE_KEY = "pakamon-tour-done";

const STEP_ICONS = [GraduationCap, LayoutGrid, CalendarDays, FolderOpen, Scale] as const;

// Each step maps to a key under `tour.steps.*` in the message files.
const STEP_KEYS = ["welcome", "planner", "schedule", "record", "regulations"] as const;

export function ProductTour({
  open,
  onClose,
}: {
  open: boolean;
  /** Called when the tour is completed, skipped, or dismissed. */
  onClose: () => void;
}) {
  const t = useTranslations("tour");
  const isHe = useLocale() === "he";
  const [step, setStep] = useState(0);

  const total = STEP_KEYS.length;
  const isFirst = step === 0;
  const isLast = step === total - 1;

  // Direction-aware chevrons: in RTL "next" points left, "back" points right.
  const NextChevron = isHe ? ChevronLeft : ChevronRight;
  const BackChevron = isHe ? ChevronRight : ChevronLeft;

  const goNext = useCallback(() => {
    setStep((s) => Math.min(s + 1, total - 1));
  }, [total]);

  const goBack = useCallback(() => {
    setStep((s) => Math.max(s - 1, 0));
  }, []);

  // Radix calls onOpenChange(false) on Escape, overlay click, or close button.
  // Reset to the first step on close so the next open always starts fresh —
  // avoids a setState-in-effect and keeps the component fully controlled.
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        setStep(0);
        onClose();
      }
    },
    [onClose]
  );

  // `step` is always clamped to [0, total), so these are defined; the `?? [0]`
  // fallbacks satisfy noUncheckedIndexedAccess without runtime impact.
  const stepKey = STEP_KEYS[step] ?? STEP_KEYS[0];
  const StepIcon = STEP_ICONS[step] ?? STEP_ICONS[0];

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content
          aria-label={t("title")}
          // NOTE: do NOT use the `.data-card` class here. It's an unlayered CSS
          // rule (`position: relative; overflow: hidden`) and in Tailwind v4
          // unlayered styles beat layered utilities — so `.data-card` silently
          // overrode `fixed`, dropping the modal into normal flow thousands of
          // pixels down the page (it "opened" but was never on screen). We
          // replicate the card look with utilities so `fixed` actually applies.
          className={cn(
            "fixed top-1/2 start-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rtl:translate-x-1/2",
            "rounded-2xl border border-border bg-card p-0 shadow-xl outline-none",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
            "data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95"
          )}
        >
          {/* Skip / close — always visible */}
          <DialogPrimitive.Close
            aria-label={t("skip")}
            className="absolute end-3 top-3 z-10 flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-foreground/40 transition-colors hover:bg-foreground/5 hover:text-foreground/70"
          >
            {t("skip")}
            <X className="size-3.5" />
          </DialogPrimitive.Close>

          <div className="flex flex-col items-center gap-4 px-7 pb-6 pt-10 text-center">
            {/* Icon */}
            <div className="flex size-14 items-center justify-center rounded-2xl bg-accent-brand-muted text-accent-brand">
              <StepIcon className="size-7" />
            </div>

            {/* Title + body — keyed so each step animates in */}
            <div key={stepKey} className="animate-fade-in flex flex-col gap-2">
              <DialogPrimitive.Title className="font-display text-xl font-bold text-foreground/90">
                {t(`steps.${stepKey}.title`)}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-sm leading-relaxed text-foreground/55">
                {t(`steps.${stepKey}.body`)}
              </DialogPrimitive.Description>
            </div>

            {/* Step indicator (dots) — clickable for direct navigation */}
            <div
              className="mt-1 flex items-center justify-center gap-2"
              role="tablist"
              aria-label={t("stepOf", { current: step + 1, total })}
            >
              {STEP_KEYS.map((k, i) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={i === step}
                  aria-label={t("goToStep", { num: i + 1 })}
                  onClick={() => setStep(i)}
                  className={cn(
                    "h-2 rounded-full transition-all duration-300",
                    i === step
                      ? "w-6 bg-accent-brand"
                      : "w-2 bg-foreground/15 hover:bg-foreground/30"
                  )}
                />
              ))}
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between gap-2 border-t border-border/60 px-5 py-4">
            {/* Back (hidden on first step but keeps layout stable) */}
            <button
              type="button"
              onClick={goBack}
              className={cn(
                "flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-foreground/55 transition-colors hover:bg-foreground/5 hover:text-foreground/80",
                isFirst && "pointer-events-none opacity-0"
              )}
              aria-hidden={isFirst}
              tabIndex={isFirst ? -1 : 0}
            >
              <BackChevron className="size-4" />
              {t("back")}
            </button>

            <span className="font-mono text-xs tabular text-foreground/40">
              {t("stepOf", { current: step + 1, total })}
            </span>

            {isLast ? (
              <button
                type="button"
                onClick={() => handleOpenChange(false)}
                className="flex items-center gap-1 rounded-lg bg-accent-brand px-5 py-2 text-sm font-semibold text-accent-brand-fg shadow-sm transition-all hover:bg-accent-brand-hover press-scale"
              >
                {t("finish")}
              </button>
            ) : (
              <button
                type="button"
                onClick={goNext}
                className="flex items-center gap-1 rounded-lg bg-accent-brand px-5 py-2 text-sm font-semibold text-accent-brand-fg shadow-sm transition-all hover:bg-accent-brand-hover press-scale"
              >
                {t("next")}
                <NextChevron className="size-4" />
              </button>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * Small, unobtrusive "re-open the tour" button — drop into the dashboard header.
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
