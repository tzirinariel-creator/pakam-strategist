import { setRequestLocale } from "next-intl/server";
import { RegulationsContent } from "./regulations-content";

export default async function RegulationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <RegulationsContent />;
}
