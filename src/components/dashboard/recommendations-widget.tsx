"use client";

import {
  CalendarClock,
  TrendingDown,
  TrendingUp,
  Languages,
  Target,
  FileText,
  Scale,
  GraduationCap,
  Sparkles,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Bidi } from "@/lib/bidi";
import { cn } from "@/lib/utils";
import type {
  Recommendation,
  RecommendationIcon,
  RecommendationSeverity,
} from "@/lib/recommendations-engine";

const ICON_MAP: Record<RecommendationIcon, React.ComponentType<{ className?: string }>> = {
  calendarClock: CalendarClock,
  trendingDown: TrendingDown,
  trendingUp: TrendingUp,
  languages: Languages,
  target: Target,
  fileText: FileText,
  scale: Scale,
  graduationCap: GraduationCap,
};

// Per-severity accent styling. Kept deliberately calm — critical is the only
// one that really shouts.
const SEVERITY_STYLE: Record<
  RecommendationSeverity,
  { ring: string; iconWrap: string; icon: string }
> = {
  critical: {
    ring: "border-red-400/30 bg-red-400/[0.04]",
    iconWrap: "bg-red-400/10",
    icon: "text-red-400",
  },
  warning: {
    ring: "border-amber-400/25 bg-amber-400/[0.03]",
    iconWrap: "bg-amber-400/10",
    icon: "text-amber-400",
  },
  info: {
    ring: "border-foreground/10 bg-foreground/[0.02]",
    iconWrap: "bg-foreground/[0.06]",
    icon: "text-foreground/60",
  },
  success: {
    ring: "border-emerald-400/25 bg-emerald-400/[0.03]",
    iconWrap: "bg-emerald-400/10",
    icon: "text-emerald-400",
  },
};

export function RecommendationsWidget({
  recommendations,
  isHe,
}: {
  recommendations: Recommendation[];
  isHe: boolean;
}) {
  if (recommendations.length === 0) return null;
  const Arrow = isHe ? ArrowLeft : ArrowRight;

  return (
    <div className="data-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-accent-brand" />
        <h3 className="font-display text-base font-bold text-foreground/90">
          {isHe ? "המלצות חכמות" : "Smart recommendations"}
        </h3>
        <span className="ms-auto rounded-full bg-foreground/[0.06] px-2 py-0.5 text-xs font-medium text-foreground/60">
          {recommendations.length}
        </span>
      </div>

      <div className="space-y-2.5">
        {recommendations.map((rec) => {
          const Icon = ICON_MAP[rec.icon];
          const s = SEVERITY_STYLE[rec.severity];
          return (
            <Link
              key={rec.id}
              href={rec.href}
              className={cn(
                "group flex items-start gap-3 rounded-xl border p-3.5 transition-all hover:border-foreground/25 hover:shadow-sm",
                s.ring
              )}
            >
              <div
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-lg",
                  s.iconWrap
                )}
              >
                <Icon className={cn("size-4.5", s.icon)} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground/85">
                  <Bidi text={isHe ? rec.titleHe : rec.titleEn} />
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-foreground/55">
                  <Bidi text={isHe ? rec.bodyHe : rec.bodyEn} />
                </p>
                <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-foreground/60 transition-colors group-hover:text-foreground/85">
                  {isHe ? rec.ctaHe : rec.ctaEn}
                  <Arrow className="size-3 transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
