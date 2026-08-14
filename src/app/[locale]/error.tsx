"use client";

import { ErrorBoundaryFallback } from "@/components/shared/error-boundary";

/**
 * Locale-level error boundary — the safety net for the (auth) and (public)
 * route groups, which had none. A render throw on /login, /signup, /shared-plan
 * or any legal page used to fall all the way through to app/global-error.tsx,
 * which replaces the entire document (its own <html>/<body>, no theme, no
 * providers). /login is the single page every user must pass through, so that
 * was the worst place to lose the shell.
 *
 * This renders INSIDE [locale]/layout.tsx, so next-intl's provider is present
 * and the themed card + retry work normally. The (protected) group keeps its
 * own nested error.tsx files, which take priority over this one.
 */
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorBoundaryFallback error={error} reset={reset} />;
}
