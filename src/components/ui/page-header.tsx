import { cn } from "@/lib/utils";

/**
 * THE page header — one hand draws every screen (קו-עיצובי.md pattern #1,
 * extracted from the exam-planner, the canonical example): an indigo-muted icon
 * chip, a font-display title at ONE size, a quiet subtitle, and actions at the
 * inline end. No per-page variations (text-3xl here, /90 there).
 */
export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "animate-stagger-1 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-brand-muted text-accent-brand">
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold text-foreground/85">{title}</h1>
          {subtitle && <p className="text-sm text-foreground/60">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
