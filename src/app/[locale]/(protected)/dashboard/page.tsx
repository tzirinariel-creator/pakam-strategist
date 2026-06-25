import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import { DashboardContent } from "./dashboard-content";

function DashboardFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-16 w-16 animate-spin rounded-full border-4 border-foreground/10 border-t-foreground/50" />
        <p className="text-sm text-foreground/40 animate-pulse">
          {/* Fallback shown before hydration — locale not available in Suspense fallback */}
        </p>
      </div>
    </div>
  );
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <Suspense fallback={<DashboardFallback />}>
      <DashboardContent />
    </Suspense>
  );
}
