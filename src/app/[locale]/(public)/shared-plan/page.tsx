import { Suspense } from "react";
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { TRPCReactProvider } from "@/lib/trpc/react";
import { decodePlan } from "@/lib/plan-share";
import { SharedPlanContent } from "./shared-plan-content";
import { ThemedLoader } from "@/components/ui/themed-loader";

// PUBLIC page (the viral loop): a friend with the link sees the plan without
// an account. It lives outside AppProviders, so tRPC is provided locally.

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ d?: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const { d } = await searchParams;
  const isHe = locale === "he";
  const plan = d ? decodePlan(d) : null;
  const title = plan
    ? isHe
      ? "תוכנית תואר בפכ״מ — פכמון"
      : "A PPE degree plan — Pakamon"
    : "Pakamon | פכמון";
  const description = isHe
    ? "תוכנית תואר מלאה בפכ״מ — לצפייה, ולהעתקה לתכנון שלך."
    : "A full PPE degree plan — view it, then copy it into your own planner.";
  return {
    title,
    description,
    // Share links are person-to-person — they must not end up in Google.
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SharedPlanPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <TRPCReactProvider>
      <Suspense fallback={<ThemedLoader />}>
        <SharedPlanContent />
      </Suspense>
    </TRPCReactProvider>
  );
}
