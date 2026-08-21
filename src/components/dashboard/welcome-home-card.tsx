"use client";

import { ArrowRight, ArrowLeft, BookOpen, Check, Pencil, Scale, Target, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { usePersonalAddress } from "@/components/personal/use-personal-address";
import { gettingStartedProgress, type GettingStartedInput } from "@/lib/getting-started";

// -----------------------------------------------------------------------
// Welcome Home Card — the first-week checklist, ticked from real data
// -----------------------------------------------------------------------
// This used to be three links that never changed. It told someone with forty
// grades on file to "add your past grades", with the same emphasis as on day
// one — a list that can never be completed, which is a nag rather than a
// checklist.
//
// Every step now reflects something true about the account (see
// src/lib/getting-started.ts). A done step is struck through and ticked; the
// next undone one is the only one highlighted, so there is one obvious thing
// to do rather than four competing calls to action. When all four are done the
// card says so and stops asking.

export function WelcomeHomeCard({
  t,
  isHe,
  onDismiss,
  progressInput,
}: {
  t: (key: string, values?: Record<string, string | number>) => string;
  isHe: boolean;
  onDismiss: () => void;
  /** Real account state. Without it the card cannot honestly tick anything. */
  progressInput: GettingStartedInput;
}) {
  const Arrow = isHe ? ArrowLeft : ArrowRight;
  const { greetName, g: pg } = usePersonalAddress();
  const { steps, done, total, complete } = gettingStartedProgress(progressInput);

  const COPY: Record<
    string,
    { icon: React.ComponentType<{ className?: string }>; he: string; heDone: string; en: string }
  > = {
    plan: {
      icon: BookOpen,
      he: pg("בנה את תוכנית התואר", "בני את תוכנית התואר", "בנו את תוכנית התואר"),
      heDone: "תוכנית התואר בנויה",
      en: "Build your degree plan",
    },
    record: {
      icon: Pencil,
      he: pg("הוסף ציונים מהעבר", "הוסיפי ציונים מהעבר", "הוסיפו ציונים מהעבר"),
      heDone: "הציונים מהעבר בפנים",
      en: "Add your past grades",
    },
    focus: {
      icon: Target,
      he: pg("בחר תחום מיקוד", "בחרי תחום מיקוד", "בחרו תחום מיקוד"),
      heDone: "תחום המיקוד נבחר",
      en: "Choose a focus area",
    },
    regulations: {
      icon: Scale,
      he: "בדקו שאתם עומדים בתקנון",
      heDone: "התקנון נבדק",
      en: "Check you meet the regulations",
    },
  };

  return (
    <div className="data-card relative overflow-hidden p-6">
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t("welcomeDismiss")}
        className="absolute end-3 top-3 rounded-md p-1 text-foreground/25 transition-colors hover:text-foreground/60"
      >
        <X className="size-4" />
      </button>

      <h2 className="font-display text-xl font-bold text-foreground/90">
        {greetName ? `${greetName}, ` : ""}
        {complete
          ? isHe ? "הכול מוכן" : "You're all set"
          : t("welcomeHomeTitle")}
      </h2>
      <p className="mt-1 text-sm text-foreground/55">
        {complete
          ? isHe
            ? "כל מה שצריך כדי שפכמון יעבוד עליכם נמצא בפנים. אפשר לסגור את הכרטיס הזה."
            : "Everything Pakamon needs is in place. You can close this card."
          : t("welcomeHomeSubtitle")}
      </p>

      {/* Progress: a plain count, and a bar that reflects it. No points, no
          streaks — the reward for filling in your degree is an accurate
          degree. */}
      <div className="mt-4 flex items-center gap-3">
        <div
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/10"
          role="progressbar"
          aria-valuenow={done}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-label={isHe ? "התקדמות בצעדים הראשונים" : "Getting started progress"}
        >
          <div
            className="h-full rounded-full bg-accent-brand transition-[width] duration-500"
            style={{ width: `${(done / total) * 100}%` }}
          />
        </div>
        <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground/50">
          {done}/{total}
        </span>
      </div>

      <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
        {steps.map((step) => {
          const copy = COPY[step.id]!;
          const Icon = step.done ? Check : copy.icon;
          const label = isHe ? (step.done ? copy.heDone : copy.he) : copy.en;

          return (
            <Link
              key={step.id}
              href={step.href}
              className={
                step.done
                  ? "group flex items-center gap-3 rounded-xl border border-transparent bg-foreground/[0.02] p-3.5 transition-all hover:bg-foreground/[0.04]"
                  : "group flex items-center gap-3 rounded-xl border border-foreground/10 bg-foreground/[0.02] p-3.5 transition-all hover:border-foreground/25 hover:bg-foreground/[0.04]"
              }
            >
              <div
                className={
                  step.done
                    ? "flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-brand/15 text-accent-brand"
                    : "flex size-9 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.06] text-foreground/60"
                }
              >
                <Icon className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <span
                  className={
                    step.done
                      ? "block text-sm font-medium text-foreground/40 line-through decoration-foreground/20"
                      : "block text-sm font-medium text-foreground/80"
                  }
                >
                  {label}
                </span>
              </div>
              {!step.done && (
                <Arrow className="size-3.5 shrink-0 text-foreground/30 transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
