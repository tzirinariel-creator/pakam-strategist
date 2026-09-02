"use client";

import {
  X,
  CalendarClock, TrendingDown, TrendingUp, Languages, Target, FileText, Scale, GraduationCap, ArrowLeft,
} from "lucide-react";
import type { Recommendation, RecommendationIcon } from "@/lib/recommendations-engine";
import { cn } from "@/lib/utils";
import { Link } from "@/i18n/navigation";

// Recommendation icon → Lucide (mirrors the dashboard widget's map).
const REC_ICON: Record<RecommendationIcon, React.ComponentType<{ className?: string }>> = {
  calendarClock: CalendarClock,
  trendingDown: TrendingDown,
  trendingUp: TrendingUp,
  languages: Languages,
  target: Target,
  fileText: FileText,
  scale: Scale,
  graduationCap: GraduationCap,
};

/**
 * The King's proactive nudge — ONE pressing gap, delivered plainly, then silence.
 * A restrained inset card (not a toast, not a popup), severity-tinted, with an
 * "act on it" link and a bare dismiss. Only ever shown in the empty state when
 * the student opened the King themselves.
 */
export function ProactiveNudgeCard({
  rec,
  isHe,
  onAct,
  onDismiss,
}: {
  rec: Recommendation;
  isHe: boolean;
  onAct: () => void;
  onDismiss: () => void;
}) {
  const Icon = REC_ICON[rec.icon] ?? Target;
  const critical = rec.severity === "critical";
  return (
    <div
      className={cn(
        "relative rounded-xl border p-3",
        critical ? "border-red-400/40 bg-red-400/[0.06]" : "border-amber-400/40 bg-amber-400/[0.06]",
      )}
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label={isHe ? "הבנתי, אל תזכיר שוב היום" : "Got it, don't remind me today"}
        className="absolute end-2 top-2 rounded-md p-1 text-foreground/60 transition-colors hover:text-foreground/90"
      >
        <X className="size-3.5" />
      </button>
      <div className="flex items-start gap-2.5 pe-5">
        <Icon className={cn("mt-0.5 size-4 shrink-0", critical ? "text-status-red" : "text-status-amber")} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-foreground/85">{isHe ? rec.titleHe : rec.titleEn}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-foreground/60">{isHe ? rec.bodyHe : rec.bodyEn}</p>
          <Link
            href={rec.href}
            onClick={onAct}
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-accent-brand transition-colors hover:underline"
          >
            {isHe ? rec.ctaHe : rec.ctaEn}
            <ArrowLeft className="size-3 ltr:rotate-180" />
          </Link>
        </div>
      </div>
    </div>
  );
}
