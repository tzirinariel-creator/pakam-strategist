"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryFallbackProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export function ErrorBoundaryFallback({
  error,
  reset,
}: ErrorBoundaryFallbackProps) {
  const t = useTranslations("common");

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-6 px-4">
      <div className="flex size-16 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="size-8 text-destructive" />
      </div>

      <div className="text-center">
        <h2 className="mb-2 font-bold text-xl text-foreground">
          {t("error")}
        </h2>
        {/* The same English fallback lived here too. `t("error")` above is
            already localized; this line under it was not. */}
        <p className="max-w-md text-sm text-muted-foreground">
          {error.message || t("errorRetry")}
        </p>
        {error.digest && (
          <p className="mt-1 font-data text-xs text-muted-foreground">
            {error.digest}
          </p>
        )}
      </div>

      <Button onClick={reset} variant="outline" className="gap-2">
        <RotateCcw className="size-4" />
        {t("retry")}
      </Button>
    </div>
  );
}
