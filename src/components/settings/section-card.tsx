"use client";

import { cn } from "@/lib/utils";

// ---------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------

export function SectionCard({
  icon: Icon,
  title,
  description,
  children,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div
      className={cn(
        "data-card flex flex-col gap-5 p-6",
        danger && "border-destructive/30 hover:border-destructive/50"
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full",
            danger ? "bg-destructive/10" : "bg-foreground/10"
          )}
        >
          <Icon
            className={cn(
              "size-5",
              danger ? "text-destructive" : "text-foreground/80"
            )}
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <h2
            className={cn(
              "font-display text-lg font-bold",
              danger ? "text-destructive" : "text-foreground/80"
            )}
          >
            {title}
          </h2>
          <p className="text-sm text-foreground/60">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}
