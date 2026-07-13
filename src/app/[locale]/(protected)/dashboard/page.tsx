import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import { DashboardContent } from "./dashboard-content";
import { ThemedLoader } from "@/components/ui/themed-loader";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // The dashboard is the FIRST screen a brand-new account lands on, so its
  // loading state must be the branded crown loader (with a real reassuring
  // caption) — not a bare grey spinner with an empty label, which read as "a
  // colour square on white" (#6/#9). The locale provider sits above this
  // boundary, so ThemedLoader's useLocale() resolves correctly here.
  return (
    <Suspense fallback={<ThemedLoader variant="page" className="min-h-[60vh]" />}>
      <DashboardContent />
    </Suspense>
  );
}
