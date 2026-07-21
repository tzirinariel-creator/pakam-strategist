"use client";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

// -----------------------------------------------------------------------
// Quick Action Card — locale-aware
// -----------------------------------------------------------------------

export function QuickActionCard({
  icon: Icon,
  label,
  href,
  color,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href: string;
  color: string;
  description?: string;
}) {
  return (
    <Link
      href={href}
      className="data-card data-card-interactive group flex items-center gap-3 p-4 transition-all press-scale"
    >
      <div className={cn("rounded-lg p-2.5 transition-transform group-hover:scale-110", color)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1">
        <span className="text-sm font-medium text-foreground/80 block">{label}</span>
        {description && (
          <span className="text-xs text-foreground/40">{description}</span>
        )}
      </div>
    </Link>
  );
}
