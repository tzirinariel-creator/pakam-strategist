"use client";

import { ErrorBoundaryFallback } from "@/components/shared/error-boundary";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorBoundaryFallback error={error} reset={reset} />;
}
