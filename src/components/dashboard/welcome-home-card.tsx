"use client";

import { ArrowRight, ArrowLeft, Calendar, Pencil, Scale, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { usePersonalAddress } from "@/components/personal/use-personal-address";

// -----------------------------------------------------------------------
// Welcome Home Card — friendly first-time guidance, dismissible
// -----------------------------------------------------------------------

export function WelcomeHomeCard({
  t,
  isHe,
  onDismiss,
}: {
  t: (key: string, values?: Record<string, string | number>) => string;
  isHe: boolean;
  onDismiss: () => void;
}) {
  const Arrow = isHe ? ArrowLeft : ArrowRight;
  const { greetName, g: pg } = usePersonalAddress();
  const steps: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { href: "/calendar", label: isHe ? pg("בדוק את מערכת השעות שלך", "בדקי את מערכת השעות שלך", "בדוק/י את מערכת השעות שלך") : t("welcomeStepSchedule"), icon: Calendar },
    { href: "/record", label: isHe ? pg("הוסף ציונים וקורסים מהעבר", "הוסיפי ציונים וקורסים מהעבר", "הוסף/י ציונים וקורסים מהעבר") : t("welcomeStepRecord"), icon: Pencil },
    { href: "/regulations", label: isHe ? pg("בדוק שאתה עומד בתקנון", "בדקי שאת עומדת בתקנון", "בדוק/י שאת/ה עומד/ת בתקנון") : t("welcomeStepRegulations"), icon: Scale },
  ];

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
        {greetName ? `${greetName}, ` : ""}{t("welcomeHomeTitle")}
      </h2>
      <p className="mt-1 text-sm text-foreground/55">
        {t("welcomeHomeSubtitle")}
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {steps.map(({ href, label, icon: Icon }, i) => (
          <Link
            key={href}
            href={href}
            className="group flex items-center gap-3 rounded-xl border border-foreground/10 bg-foreground/[0.02] p-3.5 transition-all hover:border-foreground/25 hover:bg-foreground/[0.04]"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.06] text-foreground/60">
              <Icon className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block text-[11px] font-medium text-foreground/35">
                {t("welcomeStepLabel", { num: i + 1 })}
              </span>
              <span className="block text-sm font-medium text-foreground/80">
                {label}
              </span>
            </div>
            <Arrow className="size-3.5 shrink-0 text-foreground/30 transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
          </Link>
        ))}
      </div>
    </div>
  );
}
