"use client";

import { ErrorBoundaryFallback } from "@/components/shared/error-boundary";

/**
 * Group-level error boundary for all protected routes. Catches render-time
 * throws in routes without their own error.tsx (e.g. the AI mentor and admin
 * sync pages) so users get the themed recovery card instead of the bare default.
 */
export default function ProtectedRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorBoundaryFallback error={error} reset={reset} />;
}
