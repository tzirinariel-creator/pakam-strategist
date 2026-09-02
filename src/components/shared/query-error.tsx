"use client";

// =========================================================================
// The two missing halves of "a screen that fails honestly" (OPS audit).
// =========================================================================
// 1. QueryErrorState — the card a screen shows when a tRPC query FAILED.
//    The dominant defect found in the pre-launch audit was not a blank area,
//    it was error-shaped-as-empty: eight screens told the student "you have no
//    courses / no contributions / no plans" when the fetch had simply failed.
//    An empty state is a fact about the student; an error state is a fact about
//    us. Saying the first when the second is true is a lie the student acts on
//    (and on /planner/semester, acts on DESTRUCTIVELY — see that file).
//
// 2. QuietBoundary — a render boundary for NON-ESSENTIAL widgets (the tour, a
//    nudge, a teaser). A crash inside one of these must not take the route down
//    with it: a React #310 in the anchored tour blanked the whole planner and
//    took an in-progress, unsaved board with it. On error this renders NOTHING
//    — the student loses the tour, not the screen.
//
// Strings are inline he/en (the established pattern in lineage/planner) so this
// needs no new message keys and cannot break the he/en parity test.

import { Component, type ReactNode } from "react";
import { useLocale } from "next-intl";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

export function QueryErrorState({
  onRetry,
  className,
  /** Optional one-line hint about WHAT failed to load ("הקטלוג", "the catalog"). */
  what,
}: {
  onRetry?: () => void;
  className?: string;
  what?: string;
}) {
  const isHe = useLocale() === "he";

  return (
    <div
      role="alert"
      className={cn(
        "flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center",
        className,
      )}
    >
      <AlertTriangle className="size-7 text-destructive" aria-hidden="true" />
      <p className="font-semibold text-foreground/85">
        {isHe ? "לא הצלחנו לטעון את הנתונים" : "We couldn't load your data"}
      </p>
      <p className="max-w-sm text-sm leading-relaxed text-foreground/60">
        {isHe
          ? `זו תקלה אצלנו, לא אצלכם${what ? ` (${what})` : ""} — שום דבר לא נמחק. נסו שוב בעוד רגע.`
          : `This is a problem on our side${what ? ` (${what})` : ""}, not yours — nothing was deleted. Try again in a moment.`}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground/70 transition-colors hover:border-foreground/30 hover:text-foreground/90"
        >
          <RotateCcw className="size-4" aria-hidden="true" />
          {isHe ? "נסו שוב" : "Try again"}
        </button>
      )}
    </div>
  );
}

interface QuietBoundaryState {
  hasError: boolean;
}

/**
 * Renders `children`; on a render-time throw renders `null` (or `fallback`).
 * For decoration only — never wrap a surface that holds the student's data,
 * because a silent disappearance would then hide real information.
 */
export class QuietBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode; label?: string },
  QuietBoundaryState
> {
  state: QuietBoundaryState = { hasError: false };

  static getDerivedStateFromError(): QuietBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    // The only breadcrumb a solo maintainer gets today is the Vercel/browser
    // console, so make it greppable.
    console.error(`[QuietBoundary${this.props.label ? `:${this.props.label}` : ""}]`, error);
  }

  render() {
    if (this.state.hasError) return this.props.fallback ?? null;
    return this.props.children;
  }
}
