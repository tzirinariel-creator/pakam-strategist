import { setRequestLocale } from "next-intl/server";
import { GuideContent } from "./guide-content";

export default async function GuidePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <GuideContent />;
}
