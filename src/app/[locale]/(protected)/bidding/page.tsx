import { setRequestLocale } from "next-intl/server";
import { BiddingContent } from "./bidding-content";

export default async function BiddingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <BiddingContent />;
}
