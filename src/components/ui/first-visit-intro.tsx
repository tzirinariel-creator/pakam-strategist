"use client";

// =========================================================================
// First-visit introduction to a tab's headline capability.
//
// 13.8 (Ariel): "כשפעם ראשונה נכנסים לטאב כמו למשל של התכנון מבחנים — אנחנו
// חייבים להראות לו למשל איך זה יוצר לו טבלת אקסל צבעונית". The exam planner's
// best artifact (a three-sheet coloured .xlsx) is behind a share menu that only
// appears AFTER a plan exists, so a first-time visitor never learns it's there.
//
// RULES this component enforces so it can never become a nag:
//   • once per tab, per device — dismissing writes a flag and it never returns;
//   • the flag is read AFTER mount, so SSR and first client paint agree;
//   • the whole card is a plain dismissible block, not a modal or an overlay —
//     it never blocks the screen the student came for.
// Callers own the copy. Keep it factual: describe the artifact, not adjectives.
// =========================================================================

import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { useLocale } from "next-intl";
import { cn } from "@/lib/utils";

const KEY_PREFIX = "pk-intro-";

/** Has this tab's intro already been seen/dismissed on this device? */
export function hasSeenIntro(storageKey: string): boolean {
  try {
    return localStorage.getItem(KEY_PREFIX + storageKey) === "1";
  } catch {
    return false;
  }
}

export function FirstVisitIntro({
  storageKey,
  icon,
  title,
  body,
  preview,
  className,
}: {
  /** Stable per-tab key, e.g. "exam-planner-xlsx". */
  storageKey: string;
  icon: ReactNode;
  title: string;
  body: string;
  /** Optional small visual of what the student will get. */
  preview?: ReactNode;
  className?: string;
}) {
  const isHe = useLocale() === "he";
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(!hasSeenIntro(storageKey));
  }, [storageKey]);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(KEY_PREFIX + storageKey, "1");
    } catch {
      /* storage blocked — it just shows again next time; never breaks the page */
    }
  };

  return (
    <div className={cn("data-card flex flex-wrap items-start gap-3 border-border/60 p-4", className)}>
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.06] text-foreground/60">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground/85">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-foreground/60">{body}</p>
        {preview && <div className="mt-3">{preview}</div>}
        <button
          type="button"
          onClick={dismiss}
          className="mt-3 text-xs font-medium text-foreground/45 transition-colors hover:text-foreground/70"
        >
          {isHe ? "הבנתי" : "Got it"}
        </button>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label={isHe ? "סגור" : "Dismiss"}
        className="shrink-0 rounded-md p-1 text-foreground/25 transition-colors hover:text-foreground/60"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
