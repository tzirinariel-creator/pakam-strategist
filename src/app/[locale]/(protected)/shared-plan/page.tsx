import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import { SharedPlanContent } from "./shared-plan-content";
import { ThemedLoader } from "@/components/ui/themed-loader";

export default async function SharedPlanPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <Suspense fallback={<ThemedLoader />}>
      <SharedPlanContent />
    </Suspense>
  );
}
